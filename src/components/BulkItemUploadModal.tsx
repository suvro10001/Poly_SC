import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Item, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  Clipboard,
  Layers,
  Sparkles,
  Search,
  Check,
  FileText
} from 'lucide-react';
import { categorizeCableItem, getAllCategories, getCategoryNumbers, saveCustomCategory } from '../utils/categoryHelper';
import { matchesFlexibleSearch, groupItemsByCategoryOrder, getCategorySerialRank } from '../utils/searchHelper';
import { defaultItems } from '../data/defaultData';
import { syncSpecialItemRatesWithBaseItems } from '../utils/stockHelper';
import { buildDeterministicItemId, syncActiveSnapshotWithCatalogItems } from '../utils/priceCircularHelper';
import {
  detectAndParseItemSheetRows,
  DetectedItemColumns,
  expandSheetVerticalCategoryMerges,
  selectWorkbookSheetsForImport,
  WorkbookSheetOption
} from '../utils/xlsxItemHelper';
import { unrecordDeletedIdsLocally, unrecordDeletedEntityIds, isGloballyDeletedId } from '../utils/deletedTracker';
import { safeSetStorageItem, idbSaveFailoverData } from '../utils/indexedDbStorage';

function normalizeItemMatchName(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isGenericCatalogCategory(cat?: string): boolean {
  const c = normalizeItemMatchName(cat);
  return !c || c === 'single core wires' || c === 'general';
}

function findMatchingCatalogItem(
  catalog: Iterable<Item>,
  name: string,
  category?: string,
  code?: string,
  hasExplicitCategory?: boolean
): Item | undefined {
  const cleanName = normalizeItemMatchName(name);
  const cleanCat = normalizeItemMatchName(category);
  const cleanCode = normalizeItemMatchName(code);
  const list = Array.from(catalog);
  if (!cleanName) return undefined;

  // 1. Exact Normalized Name + Category match
  if (cleanCat) {
    const exactMatch = list.find(
      (it) =>
        normalizeItemMatchName(it.name) === cleanName &&
        normalizeItemMatchName(it.category) === cleanCat
    );
    if (exactMatch) return exactMatch;
  }

  // 2. Code + Normalized Name match
  if (cleanCode) {
    const codeMatch = list.find((it) => {
      if (!it.code || normalizeItemMatchName(it.code) !== cleanCode) return false;
      return normalizeItemMatchName(it.name) === cleanName;
    });
    if (codeMatch) return codeMatch;
  }

  // 3. Normalized Name match (trim whitespace, collapse multiple internal spaces, ignore case)
  const nameMatches = list.filter((it) => normalizeItemMatchName(it.name) === cleanName);
  if (nameMatches.length === 0) return undefined;
  if (nameMatches.length === 1) return nameMatches[0];

  // If multiple items share the same normalized name, prefer generic or matching category/code
  if (cleanCat) {
    const catPreferred = nameMatches.find((it) => normalizeItemMatchName(it.category) === cleanCat);
    if (catPreferred) return catPreferred;
  }
  if (!hasExplicitCategory || isGenericCatalogCategory(cleanCat)) {
    return nameMatches[0];
  }
  return nameMatches.find((it) => isGenericCatalogCategory(it.category)) || nameMatches[0];
}

interface BulkItemUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  branches?: BranchLocation[];
  onSyncCloud?: (updatedItems?: Item[]) => void;
  onSuccess?: (addedCount: number, updatedCount: number) => void;
  targetCategory?: string;
  isSpecialItemMode?: boolean;
}

interface ParsedUploadRow {
  serial?: number | string;
  code?: string;
  name: string;
  category?: string;
  sizeSpec?: string;
  unit: string;
  rate: number;
  openingStock: number;
  minStockAlert?: number;
  remarks?: string;
  // Diff metadata
  rowIndex?: number;
  action: 'add' | 'update' | 'unchanged' | 'invalid';
  existingItem?: Item;
  validationError?: string;
  rateDiff?: number;
  hasExplicitStock?: boolean;
  hasExplicitCategory?: boolean;
  hasExplicitUnit?: boolean;
}

export const BulkItemUploadModal: React.FC<BulkItemUploadModalProps> = ({
  isOpen,
  onClose,
  items,
  setItems,
  branches = defaultBranches,
  onSyncCloud,
  onSuccess,
  targetCategory,
  isSpecialItemMode = false
}) => {
  const effectiveBranches = branches && branches.length > 0 ? branches : defaultBranches;
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [uploadMode, setUploadMode] = useState<'merge' | 'rates_only' | 'new_only'>('merge');
  const [isDragging, setIsDragging] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedUploadRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'matched' | 'new' | 'unchanged'>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<Array<{ rowLabel: string; problem: string; fix: string; severity: 'warning' | 'error' }>>([]);
  const [allWorkbookSheets, setAllWorkbookSheets] = useState<WorkbookSheetOption[]>([]);
  const [selectedSheetKey, setSelectedSheetKey] = useState<string>('');
  const [loadedSheets, setLoadedSheets] = useState<Array<{ sheetName: string; rows: any[][] }>>([]);
  const [sheetHeaderLabels, setSheetHeaderLabels] = useState<string[]>([]);
  const [detectedCols, setDetectedCols] = useState<DetectedItemColumns | null>(null);
  const [colOverrides, setColOverrides] = useState<Partial<DetectedItemColumns>>({});
  const [manualMatches, setManualMatches] = useState<Record<number, string>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scope item matching strictly to the target tab (Master Items vs Special Items)
  const existingCatalog = useMemo(
    () =>
      (Array.isArray(items) ? items : []).filter((it) =>
        isSpecialItemMode ? Boolean(it?.isSpecialItem) : Boolean(it && !it.isSpecialItem)
      ),
    [items, isSpecialItemMode]
  );

  // Reset transient upload state whenever the modal closes so switching Master <-> Special tabs starts clean
  useEffect(() => {
    if (!isOpen) {
      setFileName('');
      setPasteText('');
      setParsedRows([]);
      setUploadDiagnostics([]);
      setAllWorkbookSheets([]);
      setSelectedSheetKey('');
      setLoadedSheets([]);
      setSheetHeaderLabels([]);
      setDetectedCols(null);
      setColOverrides({});
      setManualMatches({});
      setPreviewSearch('');
      setPreviewFilter('all');
    }
  }, [isOpen]);

  // Transform raw sheet data into verified ParsedUploadRow objects (takes ALL item names and reports any problems + fixes)
  const processRawSheets = (
    sheets: Array<{ sheetName: string; rows: any[][] }>,
    overrides: Partial<DetectedItemColumns> = {}
  ) => {
    const diagnostics: Array<{ rowLabel: string; problem: string; fix: string; severity: 'warning' | 'error' }> = [];

    if (!sheets || sheets.length === 0 || sheets.every((s) => !s.rows || s.rows.length === 0)) {
      setParsedRows([]);
      setDetectedCols(null);
      setSheetHeaderLabels([]);
      setManualMatches({});
      setUploadDiagnostics([
        {
          rowLabel: 'Empty Worksheet / Input',
          problem: '0 valid item rows were found in the uploaded file or pasted text.',
          fix: 'Ensure the worksheet contains an Item Name column (Item Name, Name, Product, Particulars, Description, or Cable Size) and at least one item row, then upload again.',
          severity: 'error'
        }
      ]);
      return;
    }

    setManualMatches({});
    const parsed: ParsedUploadRow[] = [];
    const seenCompositeInUpload = new Map<string, string>();
    const seenItemNameInUpload = new Map<string, number>();
    const matchedCatalogIdsInUpload = new Set<string>();
    let primaryDetectedCols: DetectedItemColumns | null = null;
    let primaryHeaderLabels: string[] = [];

    for (const { sheetName, rows } of sheets) {
      if (!rows || rows.length === 0) continue;

      const {
        columns,
        headerLabels,
        rows: detectedRows,
        issues: sheetIssues
      } = detectAndParseItemSheetRows(rows, sheetName, overrides);

      if (!primaryDetectedCols && (detectedRows.length > 0 || headerLabels.length > 0)) {
        primaryDetectedCols = columns;
        primaryHeaderLabels = headerLabels;
      }

      sheetIssues.forEach((iss) => {
        const prefix = sheets.length > 1 ? `${iss.sheetName} • Row ${iss.rowNumber}` : `Row ${iss.rowNumber}`;
        diagnostics.push({
          rowLabel: iss.itemName && !iss.itemName.startsWith('Row ') ? `${prefix} ("${iss.itemName}")` : prefix,
          problem: iss.problem,
          fix: iss.howToFix,
          severity: iss.severity
        });
      });

      for (const rItem of detectedRows) {
        const rowRef = sheets.length > 1 ? `${sheetName} • Row ${rItem.excelRowNumber}` : `Row ${rItem.excelRowNumber}`;
        const rawCode = rItem.code;
        const rawSpec = rItem.sizeSpec;
        const rawCat = rItem.category;
        const rawUnit = rItem.unit;
        const rawCleanName = rItem.name.trim().replace(/\s+/g, ' ');
        const cleanKey = normalizeItemMatchName(rawCleanName);

        // Disambiguate duplicate item names inside the same upload file
        let finalItemName = rawCleanName;
        const isRepeatedNameInUpload = seenItemNameInUpload.has(cleanKey);
        if (isRepeatedNameInUpload) {
          const count = seenItemNameInUpload.get(cleanKey) || 1;
          const catSuffix = rawCat ? ` (${rawCat})` : '';
          if (catSuffix && !finalItemName.toLowerCase().includes(rawCat.toLowerCase())) {
            finalItemName = `${finalItemName}${catSuffix}`;
          } else if (rawSpec && !finalItemName.toLowerCase().includes(rawSpec.toLowerCase())) {
            finalItemName = `${finalItemName} (${rawSpec})`;
          } else {
            finalItemName = `${finalItemName} #${count + 1}`;
          }
          seenItemNameInUpload.set(cleanKey, count + 1);

          diagnostics.push({
            rowLabel: `${rowRef} ("${rItem.name}")`,
            problem: `"${rItem.name}" is repeated in upload. Appended category to preserve as separate product "${finalItemName}".`,
            fix: `Imported as "${finalItemName}".`,
            severity: 'warning'
          });
        } else {
          seenItemNameInUpload.set(cleanKey, 1);
        }

        const compositeKey = `${cleanKey}|${rawCat.toLowerCase()}|${rawSpec.toLowerCase()}`;
        seenCompositeInUpload.set(compositeKey, rowRef);

        const availableCatalog = existingCatalog.filter((it) => !matchedCatalogIdsInUpload.has(it.id));
        let existing = findMatchingCatalogItem(
          availableCatalog,
          finalItemName,
          rawCat,
          rawCode,
          rItem.hasExplicitCategory
        );
        if (!existing && isRepeatedNameInUpload && rawCat) {
          existing = availableCatalog.find(
            (it) =>
              normalizeItemMatchName(it.name) === cleanKey &&
              normalizeItemMatchName(it.category) === normalizeItemMatchName(rawCat)
          );
        }
        if (existing) {
          matchedCatalogIdsInUpload.add(existing.id);
        }

        let action: 'add' | 'update' | 'unchanged' | 'invalid' = 'add';
        let rateDiff: number | undefined = undefined;
        const effectiveCategory =
          targetCategory ||
          (rItem.hasExplicitCategory
            ? rawCat
            : existing?.category || rawCat || categorizeCableItem(rItem.name, rawSpec));
        const defaultUnitFallback = isSpecialItemMode ? 'Bobin' : 'Coils';
        const effectiveUnit = rItem.hasExplicitUnit
          ? rawUnit
          : existing?.unit || rItem.unit || defaultUnitFallback;

        if (existing) {
          const existingRate = Number(existing.rate) || 0;
          const newRate = rItem.hasExplicitRate || rItem.rate > 0 ? rItem.rate : existingRate;
          rateDiff = newRate - existingRate;

          if (
            rateDiff !== 0 ||
            (rItem.hasExplicitStock && rItem.openingStock !== existing.openingStock) ||
            (rItem.hasExplicitCategory && effectiveCategory && effectiveCategory !== existing.category) ||
            (targetCategory && effectiveCategory !== existing.category) ||
            (rItem.hasExplicitUnit && effectiveUnit && effectiveUnit !== existing.unit) ||
            (rawSpec && rawSpec !== (existing.sizeSpec || '')) ||
            (rawCode && rawCode !== (existing.code || ''))
          ) {
            action = 'update';
          } else {
            action = 'unchanged';
          }
        } else {
          action = 'add';
        }

        parsed.push({
          rowIndex: parsed.length,
          serial: rItem.serial,
          code: rawCode || existing?.code || `PC-${100 + items.length + parsed.length + 1}`,
          name: finalItemName,
          category: targetCategory || effectiveCategory || 'Single Core Wires',
          sizeSpec: rawSpec || existing?.sizeSpec || '',
          unit: effectiveUnit,
          rate: rItem.hasExplicitRate || rItem.rate > 0 ? rItem.rate : existing?.rate || 0,
          openingStock: rItem.hasExplicitStock ? rItem.openingStock : existing?.openingStock || 0,
          minStockAlert: rItem.minStockAlert,
          hasExplicitStock: rItem.hasExplicitStock,
          hasExplicitCategory: rItem.hasExplicitCategory,
          hasExplicitUnit: rItem.hasExplicitUnit,
          remarks: rItem.remarks || existing?.remarks,
          action,
          existingItem: existing,
          rateDiff
        });
      }
    }

    if (parsed.length === 0 && !diagnostics.some((d) => d.severity === 'error')) {
      diagnostics.push({
        rowLabel: 'No Valid Rows / Unrecognized Columns',
        problem: '0 valid item rows were found in the uploaded spreadsheet.',
        fix: 'Ensure your sheet has a recognizable Item Name column (Item Name, Name, Product, Particulars, Description, or Cable Size) and a Price/Rate column (Price, Rate, Unit Price, MRP, TP, DP, New Price, or Amount).',
        severity: 'error'
      });
    }

    setDetectedCols(primaryDetectedCols);
    setSheetHeaderLabels(primaryHeaderLabels);
    setParsedRows(parsed);
    setUploadDiagnostics(diagnostics);
  };

  const handleOverrideColumn = (field: keyof DetectedItemColumns, colIndex: number) => {
    const nextOverrides: Partial<DetectedItemColumns> = {
      ...colOverrides,
      [field]: colIndex
    };
    setColOverrides(nextOverrides);
    if (loadedSheets.length > 0) {
      processRawSheets(loadedSheets, nextOverrides);
    }
  };

  const handleSwitchWorksheet = (selectionKey: string) => {
    setSelectedSheetKey(selectionKey);
    setColOverrides({});
    const targetSheets =
      selectionKey === '__ALL__'
        ? allWorkbookSheets.map((s) => ({ sheetName: s.sheetName, rows: s.rows }))
        : allWorkbookSheets
            .filter((s) => s.sheetName === selectionKey)
            .map((s) => ({ sheetName: s.sheetName, rows: s.rows }));
    setLoadedSheets(targetSheets);
    processRawSheets(targetSheets, {});
  };

  // Handle file drop & selection with automatic preferred worksheet detection
  const handleFileChange = async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setUploadDiagnostics([]);
    setColOverrides({});
    setPreviewFilter('all');

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      const buffer = await file.arrayBuffer();

      if (isCsv) {
        const text = new TextDecoder('utf-8').decode(buffer);
        const rows = parseDelimitedText(text);
        const sheets = [{ sheetName: 'CSV', rows }];
        setAllWorkbookSheets([]);
        setSelectedSheetKey('CSV');
        setLoadedSheets(sheets);
        processRawSheets(sheets, {});
      } else {
        const wb = XLSX.read(buffer, { type: 'array' });
        const { nonEmptySheets, recommendedSelection } = selectWorkbookSheetsForImport(wb, {
          isSpecialItemMode
        });

        if (nonEmptySheets.length === 0) {
          setAllWorkbookSheets([]);
          setSelectedSheetKey('');
          setLoadedSheets([]);
          processRawSheets([], {});
          return;
        }

        setAllWorkbookSheets(nonEmptySheets);
        setSelectedSheetKey(recommendedSelection);

        const activeSheets =
          recommendedSelection === '__ALL__'
            ? nonEmptySheets.map((s) => ({ sheetName: s.sheetName, rows: s.rows }))
            : nonEmptySheets
                .filter((s) => s.sheetName === recommendedSelection)
                .map((s) => ({ sheetName: s.sheetName, rows: s.rows }));

        setLoadedSheets(activeSheets);
        processRawSheets(activeSheets, {});
      }
    } catch (err: any) {
      setParsedRows([]);
      setLoadedSheets([]);
      setAllWorkbookSheets([]);
      setSelectedSheetKey('');
      setUploadDiagnostics([
        {
          rowLabel: file.name,
          problem: `Could not read file "${file.name}" (${err?.message || 'Unsupported or corrupted file format'}).`,
          fix: 'Open the file in Microsoft Excel or Google Sheets, save it as ".xlsx", ".xls", or ".csv", and upload again.',
          severity: 'error'
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse CSV/TSV or copy-pasted text from Excel (handles UTF-8 BOM, empty cells, quotes, multiline quoted cells, and semicolon/tab/comma delimiters)
  const parseDelimitedText = (text: string): any[][] => {
    const cleanText = String(text || '').replace(/^\uFEFF/, '');
    if (!cleanText.trim()) return [];

    const firstNonEmptyLine = cleanText.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
    const delimiter = firstNonEmptyLine.includes('\t')
      ? '\t'
      : !firstNonEmptyLine.includes(',') && firstNonEmptyLine.includes(';')
        ? ';'
        : ',';

    if (delimiter === '\t') {
      return cleanText
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((line) => line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, '')));
    }

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      if (inQuotes) {
        if (ch === '"') {
          if (cleanText[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += ch;
        }
      } else if (ch === '"' && currentCell.trim() === '') {
        currentCell = '';
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r') {
        if (cleanText[i + 1] === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const handleParsePastedText = () => {
    if (!pasteText.trim()) {
      setUploadDiagnostics([
        {
          rowLabel: 'Empty Paste Box',
          problem: 'No Excel text was entered in the paste area.',
          fix: 'Copy cells directly from Excel (Ctrl+C), paste them into the text box (Ctrl+V), and click Parse.',
          severity: 'error'
        }
      ]);
      return;
    }
    setIsProcessing(true);
    setColOverrides({});
    setAllWorkbookSheets([]);
    setSelectedSheetKey('Pasted Data');
    try {
      const rows = parseDelimitedText(pasteText);
      setFileName(`Pasted Text (${rows.length} lines)`);
      const sheets = [{ sheetName: 'Pasted Data', rows }];
      setLoadedSheets(sheets);
      processRawSheets(sheets, {});
    } finally {
      setIsProcessing(false);
    }
  };

  // Download official sample Excel template
  const handleDownloadTemplate = (format: 'xlsx' | 'csv' | 'price_only') => {
    if (format === 'price_only') {
      const priceOnlyHeaders = [
        'Item Code',
        'Item Description / Name',
        'Category',
        'Current Rate (Tk)',
        'New Rate / Update Price (Tk)',
        'Effective Date',
        'Remarks'
      ];
      const todayDate = new Date().toISOString().split('T')[0];
      const priceOnlyData = [
        priceOnlyHeaders,
        ...(items.length > 0
          ? items.map((it) => [
              it.code || '',
              it.name,
              it.category || 'Single Core Wires',
              it.rate,
              it.rate, // Pre-filled so user can just change updated prices
              todayDate,
              it.sizeSpec ? `Spec: ${it.sizeSpec}` : ''
            ])
          : [
              ['PC-101', '1.0 RM BYA FR', 'BYA (Without RE)', 2450, 2450, todayDate, ''],
              ['PC-102', '1.5 RM BYA FR', 'BYA (Without RE)', 3620, 3620, todayDate, ''],
              ['PC-103', '2.5 RM BYA FR', 'BYA (Without RE)', 5890, 5890, todayDate, '']
            ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(priceOnlyData);
      ws['!cols'] = [
        { wch: 14 },
        { wch: 36 },
        { wch: 22 },
        { wch: 18 },
        { wch: 24 },
        { wch: 16 },
        { wch: 20 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Price_Update');
      XLSX.writeFile(wb, `PolyCables_Price_Update_Template_${todayDate}.xlsx`);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const categoryName = targetCategory || 'Single Core Wires';

    const sampleHeaders = [
      'Item Code',
      'Item Name / Description',
      'Category',
      'Size / Specification',
      'Unit',
      'Price / Rate (Tk)',
      'Opening Stock',
      'Remarks'
    ];

    const sampleData = targetCategory
      ? [
          sampleHeaders,
          ['PC-101', `1.0 RM ${targetCategory}`, targetCategory, '1x1.0 rm', 'Coils', 2450, 150, 'Standard coil'],
          ['PC-102', `1.5 RM ${targetCategory}`, targetCategory, '1x1.5 rm', 'Coils', 3620, 200, 'Single Core FR Wire'],
          ['PC-103', `2.5 RM ${targetCategory}`, targetCategory, '1x2.5 rm', 'Coils', 5890, 120, 'Premium House Wiring'],
          ['PC-104', `4.0 RM ${targetCategory}`, targetCategory, '1x4.0 rm', 'Coils', 9240, 80, 'Heavy Duty Wiring'],
          ['PC-105', `6.0 RM ${targetCategory}`, targetCategory, '1x6.0 rm', 'Coils', 13800, 50, 'Main Distribution Cable']
        ]
      : [
          sampleHeaders,
          ['PC-101', '1.0 RM BYA FR', 'BYA (Without RE)', '1x1.0 rm', 'Coils', 2450, 150, 'Standard coil (90m)'],
          ['PC-102', '1.5 RM BYA FR', 'BYA (Without RE)', '1x1.5 rm', 'Coils', 3620, 200, 'Single Core FR Wire'],
          ['PC-103', '2.5 RM BYA FR', 'BYA (Without RE)', '1x2.5 rm', 'Coils', 5890, 120, 'Premium House Wiring'],
          ['PC-104', '4.0 RM BYA FR', 'BYA (Without RE)', '1x4.0 rm', 'Coils', 9240, 80, 'Heavy Duty Wiring'],
          ['PC-105', 'Flexible Cable 1x1.5 RM', 'Flexible Cable- 01 Core', '1x1.5 rm', 'Coils', 4150, 60, 'Flexible Single Core'],
          ['PC-106', 'Flexible Cable 1x2.5 RM', 'Flexible Cable- 01 Core', '1x2.5 rm', 'Coils', 6800, 50, 'Flexible Single Core'],
          ['PC-107', '1.0 RE BYA Single Strand', 'Single Core Wires', '1.0 re (1-w)', 'Coils', 2150, 90, 'Round Solid (RE) No Color Form'],
          ['PC-108', '2 Core Flat Twin 2x1.5 RM', '2 Core Flat Twin (F/T)', '2x1.5 rm', 'Coils', 7850, 40, 'Multi-core non-color cable'],
          ['PC-109', 'Arial Cable 1x16 Alu', 'Arial / Overhead Wires', '1x16 rm', 'Meters', 45, 500, 'Aerial Cable (Meters)']
        ];

    const filePrefix = targetCategory
      ? `PolyCables_${targetCategory.replace(/[^a-zA-Z0-9]/g, '_')}_Upload_Template_${todayStr}`
      : `PolyCables_Item_Price_Template_${todayStr}`;

    if (format === 'csv') {
      const csvContent = sampleData.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filePrefix}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.aoa_to_sheet(sampleData);
      // Auto column widths
      ws['!cols'] = [
        { wch: 12 },
        { wch: 32 },
        { wch: 25 },
        { wch: 20 },
        { wch: 10 },
        { wch: 18 },
        { wch: 15 },
        { wch: 30 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, targetCategory ? 'Category_Items' : 'Items_and_Prices');
      XLSX.writeFile(wb, `${filePrefix}.xlsx`);
    }
  };

  const resolvedParsedRows = useMemo(() => {
    return parsedRows.map((r) => {
      const idx = r.rowIndex;
      const manualId = idx !== undefined ? manualMatches[idx] : undefined;
      if (r.action === 'add' && manualId) {
        const matched = existingCatalog.find((it) => it.id === manualId);
        if (matched) {
          const existingRate = Number(matched.rate) || 0;
          const nextRate = r.rate > 0 ? r.rate : existingRate;
          const resolvedUnit = r.hasExplicitUnit ? r.unit : matched.unit || (isSpecialItemMode ? 'Bobin' : 'Coils');
          return {
            ...r,
            unit: resolvedUnit,
            action: 'update' as const,
            existingItem: matched,
            rateDiff: nextRate - existingRate,
            isUnmatchedOrigin: true,
            isManualMatch: true
          };
        }
      }
      return {
        ...r,
        isUnmatchedOrigin: r.action === 'add',
        isManualMatch: false
      };
    });
  }, [parsedRows, manualMatches, existingCatalog, isSpecialItemMode]);

  // Filtered rows split clearly into Matched Updates vs New Items Ready to Create
  const displayRows = useMemo(() => {
    const filtered = resolvedParsedRows.filter((r) => {
      if (previewFilter === 'matched' && !(r.action === 'update' || r.action === 'unchanged')) return false;
      if (previewFilter === 'new' && !(r.isUnmatchedOrigin && !r.isManualMatch)) return false;
      if (previewFilter === 'unchanged' && r.action !== 'unchanged') return false;
      if (previewSearch.trim()) {
        const q = previewSearch.trim();
        return (
          matchesFlexibleSearch(
            `${r.name} ${r.category || ''} ${r.sizeSpec || ''} ${r.existingItem?.name || ''}`,
            q,
            `${r.code || ''} ${r.existingItem?.category || ''}`
          )
        );
      }
      return true;
    });
    if (previewSearch.trim()) {
      return [...filtered].sort((a, b) => {
        const rankA = getCategorySerialRank(a.category || a.existingItem?.category, categoryOrder);
        const rankB = getCategorySerialRank(b.category || b.existingItem?.category, categoryOrder);
        if (rankA !== rankB) return rankA - rankB;
        return (a.rowIndex || 0) - (b.rowIndex || 0);
      });
    }
    return filtered;
  }, [resolvedParsedRows, previewFilter, previewSearch, categoryOrder]);

  const matchedDisplayRows = useMemo(
    () => displayRows.filter((r) => r.action === 'update' || r.action === 'unchanged'),
    [displayRows]
  );

  const newItemsDisplayRows = useMemo(
    () => displayRows.filter((r) => r.action === 'add'),
    [displayRows]
  );

  // Statistics
  const stats = useMemo(() => {
    const total = resolvedParsedRows.length;
    const add = resolvedParsedRows.filter((r) => r.action === 'add').length;
    const update = resolvedParsedRows.filter((r) => r.action === 'update').length;
    const unchanged = resolvedParsedRows.filter((r) => r.action === 'unchanged').length;
    const newTotal = resolvedParsedRows.filter((r) => r.isUnmatchedOrigin && !r.isManualMatch).length;
    const invalid = resolvedParsedRows.filter((r) => r.action === 'invalid').length;
    return { total, add, update, unchanged, newTotal, invalid };
  }, [resolvedParsedRows]);

  const actionableCount = useMemo(() => {
    if (uploadMode === 'rates_only') return stats.update;
    if (uploadMode === 'new_only') return stats.add;
    return stats.add + stats.update;
  }, [uploadMode, stats]);

  // Apply Bulk Upload to Application State & Persist Synchronously (never inside React 18 batched updater!)
  const handleApplyUpload = () => {
    if (resolvedParsedRows.length === 0) return;

    let finalAddedCount = 0;
    let finalUpdatedCount = 0;
    const importedAndUpdatedIds: string[] = [];

    const finalMap = new Map<string, Item>();
    (Array.isArray(items) ? items : []).forEach((it) => {
      if (it && it.id) finalMap.set(it.id, it);
    });

    resolvedParsedRows.forEach((row) => {
      if (row.action === 'invalid') return;

      if (row.category && row.category.trim()) {
        saveCustomCategory(row.category.trim());
      }

      let effectiveRowName = row.name.trim().replace(/\s+/g, ' ');
      const manualId = row.rowIndex !== undefined ? manualMatches[row.rowIndex] : undefined;
      const existingFromTab =
        (manualId ? finalMap.get(manualId) : undefined) ||
        (row.existingItem?.id ? finalMap.get(row.existingItem.id) : undefined) ||
        findMatchingCatalogItem(
          Array.from(finalMap.values()).filter((it) =>
            isSpecialItemMode ? Boolean(it.isSpecialItem) : Boolean(!it.isSpecialItem)
          ),
          effectiveRowName,
          row.category,
          row.code,
          row.hasExplicitCategory
        );

      if (existingFromTab) {
        if (uploadMode === 'new_only') return;

        const newRate = row.rate > 0 ? row.rate : existingFromTab.rate;
        const isRateChanged = newRate !== existingFromTab.rate;
        const todayDate = new Date().toISOString().slice(0, 10);

        const primaryAllSalesCentersStatus: Record<string, boolean> = {};
        effectiveBranches.forEach((b) => {
          primaryAllSalesCentersStatus[b.id] = true;
          primaryAllSalesCentersStatus[b.name] = true;
        });

        const isItemSpecial = Boolean(isSpecialItemMode || existingFromTab.isSpecialItem);

        const updatedItem: Item = {
          ...existingFromTab,
          isSpecialItem: isItemSpecial,
          rate: newRate,
          openingStock: row.hasExplicitStock ? row.openingStock : existingFromTab.openingStock,
          unit: row.hasExplicitUnit ? row.unit : existingFromTab.unit || (isItemSpecial ? 'Bobin' : 'Coils'),
          category: targetCategory || (row.hasExplicitCategory ? row.category : existingFromTab.category) || existingFromTab.category,
          sizeSpec: row.sizeSpec || existingFromTab.sizeSpec,
          code: row.code || existingFromTab.code,
          remarks: row.remarks || existingFromTab.remarks,
          isActive: true,
          branchActiveStatus:
            existingFromTab.branchActiveStatus && Object.keys(existingFromTab.branchActiveStatus).length > 0
              ? existingFromTab.branchActiveStatus
              : primaryAllSalesCentersStatus,
          effectiveDate: isRateChanged ? todayDate : existingFromTab.effectiveDate,
          updatedAt: Date.now(),
          priceHistory: isRateChanged
            ? [
                {
                  effectiveDate: todayDate,
                  rate: newRate,
                  updatedAt: new Date().toISOString(),
                  notes: `Bulk Upload: ৳${existingFromTab.rate} -> ৳${newRate}`
                },
                ...(existingFromTab.priceHistory || []).filter((h) => h.effectiveDate !== todayDate)
              ]
            : existingFromTab.priceHistory
        };
        finalMap.set(existingFromTab.id, updatedItem);
        importedAndUpdatedIds.push(existingFromTab.id);
        if (row.action === 'update' || isRateChanged) {
          finalUpdatedCount++;
        }
      } else {
        if (uploadMode === 'rates_only') return;

        // Disambiguate if another category item already has exact same name inside target tab
        const tabScopedValues = Array.from(finalMap.values()).filter((it) =>
          isSpecialItemMode ? Boolean(it.isSpecialItem) : Boolean(!it.isSpecialItem)
        );
        const sameNameDiffCat = tabScopedValues.find(
          (it) =>
            normalizeItemMatchName(it.name) === normalizeItemMatchName(effectiveRowName) &&
            row.category &&
            normalizeItemMatchName(it.category) !== normalizeItemMatchName(row.category)
        );
        if (sameNameDiffCat && row.category) {
          const catSuffix = ` (${row.category})`;
          if (!effectiveRowName.toLowerCase().includes(row.category.toLowerCase())) {
            effectiveRowName = `${effectiveRowName}${catSuffix}`;
          }
        }

        const primaryAllSalesCentersStatus: Record<string, boolean> = {};
        effectiveBranches.forEach((b) => {
          primaryAllSalesCentersStatus[b.id] = true;
          primaryAllSalesCentersStatus[b.name] = true;
        });

        const isItemSpecial = Boolean(isSpecialItemMode);

        const itemSerial = row.serial !== undefined ? row.serial : finalMap.size + 1;
        const catTarget = targetCategory || row.category || 'Single Core Wires';
        const detId = buildDeterministicItemId(
          `${isItemSpecial ? 'sp-' : ''}${row.code || ''}`,
          effectiveRowName,
          catTarget
        );
        const newId = finalMap.has(detId) ? `${detId}-${finalAddedCount + 1}` : detId;
        const newItem: Item = {
          id: newId,
          code: row.code || `PC-${100 + finalMap.size + 1}`,
          name: effectiveRowName,
          isSpecialItem: isItemSpecial,
          rate: row.rate,
          unit: row.unit || (isItemSpecial ? 'Bobin' : 'Coils'),
          category: catTarget,
          sizeSpec: row.sizeSpec || '',
          openingStock: row.openingStock || 0,
          remarks: row.remarks || '',
          serial: itemSerial,
          serialNo: itemSerial,
          order: typeof itemSerial === 'number' ? itemSerial : finalMap.size + 1,
          isActive: true,
          branchActiveStatus: primaryAllSalesCentersStatus,
          effectiveDate: new Date().toISOString().slice(0, 10),
          updatedAt: Date.now()
        };
        finalMap.set(newId, newItem);
        importedAndUpdatedIds.push(newId);
        finalAddedCount++;
      }
    });

    // Ensure existing permanent special items never vanish upon Excel upload (unless deleted/trashed)
    const localDeletedSpecialIds = new Set<string>();
    try {
      const sDel = localStorage.getItem('polycables_deleted_item_ids');
      if (sDel) {
        const p = JSON.parse(sDel);
        if (Array.isArray(p)) p.forEach((id: string) => localDeletedSpecialIds.add(String(id)));
      }
      const sTrash = localStorage.getItem('polycables_trashed_items');
      if (sTrash) {
        const p = JSON.parse(sTrash);
        if (Array.isArray(p)) {
          p.forEach((t: any) => {
            if (t?.id) localDeletedSpecialIds.add(String(t.id));
            if (t?.data?.id) localDeletedSpecialIds.add(String(t.data.id));
          });
        }
      }
    } catch {}

    const isDeletedOrTrashedSpecial = (si: Item) =>
      !si ||
      !si.id ||
      isGloballyDeletedId(si.id) ||
      localDeletedSpecialIds.has(String(si.id)) ||
      (si.code ? isGloballyDeletedId(si.code) || localDeletedSpecialIds.has(String(si.code)) : false);

    const specialMap = new Map<string, Item>();
    defaultItems
      .filter((i) => i.isSpecialItem && !isDeletedOrTrashedSpecial(i))
      .forEach((si) => specialMap.set(si.id, si));
    try {
      const savedPerm =
        localStorage.getItem('polycables_permanent_special_items') ||
        localStorage.getItem('polycables_special_items');
      if (savedPerm) {
        const list = JSON.parse(savedPerm);
        if (Array.isArray(list)) {
          list.forEach((si: Item) => {
            if (!isDeletedOrTrashedSpecial(si)) {
              specialMap.set(si.id, { ...si, isSpecialItem: true });
            }
          });
        }
      }
    } catch {}

    (Array.isArray(items) ? items : []).forEach((i) => {
      if (i?.isSpecialItem && !isDeletedOrTrashedSpecial(i)) specialMap.set(i.id, i);
    });

    specialMap.forEach((si, siId) => {
      if (!finalMap.has(siId)) {
        const cleanSiName = normalizeItemMatchName(si.name);
        const existingInFinal = Array.from(finalMap.values()).find(
          (it) => it.isSpecialItem && normalizeItemMatchName(it.name) === cleanSiName
        );
        if (!existingInFinal) {
          finalMap.set(siId, { ...si, isSpecialItem: true });
        }
      } else {
        finalMap.get(siId)!.isSpecialItem = true;
      }
    });

    const rawList = Array.from(finalMap.values());
    const syncedNextList = syncSpecialItemRatesWithBaseItems(rawList);

    const activeIds = syncedNextList.map((i) => i.id).filter(Boolean);
    const activeCodes = syncedNextList.map((i) => i.code).filter(Boolean);
    const allRestored = Array.from(new Set([...activeIds, ...activeCodes]));

    try {
      if (syncedNextList.length > 0) {
        localStorage.removeItem('polycables_items_cleared');
        unrecordDeletedIdsLocally(allRestored);
        unrecordDeletedEntityIds(allRestored);
        try {
          const savedDel = localStorage.getItem('polycables_deleted_item_ids');
          if (savedDel) {
            const delArr = JSON.parse(savedDel);
            if (Array.isArray(delArr)) {
              const activeSet = new Set(activeIds);
              safeSetStorageItem(
                'polycables_deleted_item_ids',
                JSON.stringify(delArr.filter((id: string) => !activeSet.has(id)))
              );
            }
          }
        } catch {}
      }
      safeSetStorageItem('polycables_items', JSON.stringify(syncedNextList), syncedNextList);
      const specialList = syncedNextList.filter((i) => i.isSpecialItem);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
      idbSaveFailoverData('polycables_items', syncedNextList).catch(() => {});
      idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      idbSaveFailoverData('polycables_permanent_special_items', specialList).catch(() => {});
    } catch (err) {
      console.error('Storage write warning:', err);
    }

    // Sync active price snapshot BEFORE/WITH state update so Sheet2ItemManager displays new & updated items immediately
    const syncedSnapshots = syncActiveSnapshotWithCatalogItems(syncedNextList, {
      includeItemIds: importedAndUpdatedIds
    });

    setItems(syncedNextList);

    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: syncedNextList } }));
    } catch {}

    const refreshedCats = getAllCategories();
    const categoryNumbers = getCategoryNumbers();
    let customCategories: string[] = [];
    let deletedCategories: string[] = [];
    try {
      const cc = localStorage.getItem('polycables_custom_categories');
      if (cc) {
        const parsed = JSON.parse(cc);
        if (Array.isArray(parsed)) customCategories = parsed;
      }
      const dc = localStorage.getItem('polycables_deleted_categories');
      if (dc) {
        const parsed = JSON.parse(dc);
        if (Array.isArray(parsed)) deletedCategories = parsed;
      }
    } catch {}

    const itemsVer = Date.now();
    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined,
        items: syncedNextList,
        specialItems: syncedNextList.filter((it) => it.isSpecialItem),
        itemsVersion: itemsVer,
        itemsCleared: false,
        orderedCategories: refreshedCats,
        customCategories,
        deletedCategories,
        categoryNumbers,
        restoredEntityIds: allRestored
      })
    }).catch((err) => console.warn('[BulkUpload /api/items sync notice]:', err));

    if (syncedSnapshots) {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined,
          patch: {
            priceSnapshots: syncedSnapshots,
            price_snapshots: syncedSnapshots,
            _replacePriceSnapshots: true
          }
        })
      }).catch(() => {});
    }

    if (onSyncCloud) {
      onSyncCloud(syncedNextList);
    }

    if (onSuccess) {
      onSuccess(finalAddedCount, finalUpdatedCount);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-5xl w-full border border-cyan-400/35 overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Header */}
        <div className="bg-[#0c2638]/90 border-b border-cyan-500/25 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/15 text-cyan-300 rounded-xl border border-cyan-400/30">
              <Upload className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-wide text-white">
                  {targetCategory ? `Single Category Excel Import: ${targetCategory}` : 'Bulk Upload Items & Prices'}
                </h3>
                <span className="text-[10px] uppercase font-extrabold bg-cyan-500/20 text-cyan-200 px-2.5 py-0.5 rounded-full border border-cyan-400/35 tracking-wider">
                  {targetCategory ? `Target: ${targetCategory}` : 'Supports All 14 Modules'}
                </span>
              </div>
              <p className="text-xs text-cyan-200/80 mt-0.5">
                {targetCategory
                  ? `All items imported from this Excel sheet will be added/updated directly under category "${targetCategory}".`
                  : 'Import, update price lists, opening stocks, and catalog specifications across billing, delivery, requisitions, ledger, and reporting.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 14 Modules Integrated Banner */}
        <div className="bg-[#071824]/90 px-4 py-2 text-slate-300 text-[11px] flex items-center justify-between border-b border-cyan-500/20 shrink-0 overflow-x-auto">
          <div className="flex items-center space-x-2 shrink-0">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-white">Instant Multi-Module Sync:</span>
          </div>
          <div className="flex items-center space-x-2 text-[10.5px] text-slate-300 overflow-x-auto whitespace-nowrap pl-2">
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">1. Sales Bill</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">2. Office Bill</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">3. Challan</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">4. Requisition</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">5. Approved Pipeline</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">6. Color Exchange</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">7. Returns</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">8. Master Catalog</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">9. Special Items</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">10. Customer Ledger</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">11. Audit Reports</span>
            <span className="bg-[#0b2334] border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-semibold">12-14. Expense & Admin</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs font-sans">
          {/* Method Selector & Template Download */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b2334]/80 p-3 rounded-xl border border-cyan-500/25">
            {/* Tabs */}
            <div className="flex items-center space-x-1 bg-[#061520] p-1 rounded-lg border border-cyan-500/25 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'file'
                    ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-[#0b2334]'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Upload Excel / CSV File</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-[#0b2334]'
                }`}
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Copy & Paste Data</span>
              </button>
            </div>

            {/* Template Buttons */}
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              <span className="text-[11px] font-bold text-cyan-200/80">Sample Templates:</span>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('xlsx')}
                className="px-2.5 py-1 bg-[#081b28] border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 rounded-md font-bold text-[11px] text-slate-200 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                title="Download full catalog Excel (.xlsx) file template"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>Full Catalog (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('price_only')}
                className="px-2.5 py-1 bg-[#081b28] border border-cyan-500/30 hover:border-amber-400 hover:text-amber-200 rounded-md font-bold text-[11px] text-slate-200 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                title="Download quick price update Excel template with current items pre-filled"
              >
                <Download className="w-3 h-3 text-amber-400" />
                <span>Price Update (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('csv')}
                className="px-2.5 py-1 bg-[#081b28] border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 rounded-md font-bold text-[11px] text-slate-200 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                title="Download formatted CSV file template"
              >
                <Download className="w-3 h-3 text-cyan-300" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Tab 1: File Dropzone */}
          {activeTab === 'file' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileChange(file);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-500/15 scale-[0.99]'
                  : 'border-cyan-500/35 hover:border-cyan-400 bg-[#071824]/70 hover:bg-cyan-500/[0.08]'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleFileChange(file);
                }}
                className="hidden"
              />
              <div className="max-w-md mx-auto space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-white">
                  {fileName ? (
                    <span className="text-emerald-300 font-extrabold flex items-center justify-center gap-1.5">
                      <FileCheckIcon className="w-4 h-4 text-emerald-400" /> Loaded: {fileName}
                    </span>
                  ) : (
                    'Click to browse or drag and drop your spreadsheet here'
                  )}
                </div>
                <p className="text-xs text-slate-300">
                  Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
                </p>
                <p className="text-[11px] text-cyan-200 font-semibold bg-cyan-500/15 border border-cyan-400/25 py-1 px-2.5 rounded inline-block">
                  Auto-detects Item Name, Rates, Size Specs, Categories & Units automatically.
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: Direct Paste Area */}
          {activeTab === 'paste' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-cyan-200">
                Paste Tabular Data directly from Excel or Google Sheets:
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={`Example:\nItem Code\tItem Description\tCategory\tUnit\tPrice\nPC-101\t1.0 RM BYA FR\tBYA (Without RE)\tCoils\t2450\nPC-102\t1.5 RM BYA FR\tBYA (Without RE)\tCoils\t3620`}
                className="w-full p-3 font-mono text-xs border border-cyan-500/30 rounded-xl bg-[#061520] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-slate-300">
                  You can copy cells directly in Excel and press <kbd className="px-1 py-0.5 bg-[#0c2638] border border-cyan-500/30 rounded font-mono font-bold text-cyan-200">Ctrl+V</kbd> here.
                </span>
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-black text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse Copied Cells</span>
                </button>
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-cyan-500/15 border border-cyan-400/40 rounded-xl text-cyan-200 text-xs font-bold">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-300 shrink-0" />
              <span>Parsing spreadsheet rows and matching against {isSpecialItemMode ? 'Special Items' : 'Master Items'}...</span>
            </div>
          )}

          {/* Worksheet Selector (shown when workbook contains multiple non-empty sheets) */}
          {allWorkbookSheets.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#0b2334]/85 border border-cyan-500/30 rounded-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wide">
                  Detected Worksheet ({allWorkbookSheets.length} Non-Empty):
                </span>
                <select
                  value={selectedSheetKey}
                  onChange={(e) => handleSwitchWorksheet(e.target.value)}
                  className="px-2.5 py-1 bg-[#061520] border border-cyan-400/40 rounded-lg text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
                >
                  {allWorkbookSheets.map((s) => (
                    <option key={s.sheetName} value={s.sheetName}>
                      {s.sheetName} ({s.parsedRowCount} rows)
                    </option>
                  ))}
                  <option value="__ALL__">All Non-Empty Worksheets Combined</option>
                </select>
              </div>
              <span className="text-[11px] text-slate-300">
                Matching against <strong className="text-cyan-200">{isSpecialItemMode ? 'Special Items' : 'Master Items'}</strong> ({existingCatalog.length} catalog items)
              </span>
            </div>
          )}

          {/* Auto-Detected Column Mapping Bar (available even when 0 rows auto-parsed so non-standard headers can be mapped manually) */}
          {detectedCols && sheetHeaderLabels.length > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-extrabold text-cyan-200 uppercase tracking-wide">
                  Detected Excel Columns (Auto-Identified — Change Any Column If Needed)
                </span>
                {Object.keys(colOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setColOverrides({});
                      if (loadedSheets.length > 0) processRawSheets(loadedSheets, {});
                    }}
                    className="text-[11px] font-bold text-cyan-300 hover:text-white underline cursor-pointer"
                  >
                    Reset to Auto-Detect
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {(
                  [
                    { field: 'name' as const, label: 'Item Name', emptyLabel: '— Not Mapped —' },
                    { field: 'category' as const, label: 'Category', emptyLabel: 'Auto-Categorize' },
                    { field: 'rate' as const, label: 'Price / Rate', emptyLabel: '— No Price Col —' },
                    { field: 'unit' as const, label: 'Unit', emptyLabel: isSpecialItemMode ? 'Default (Bobin)' : 'Default (Coils)' },
                    { field: 'code' as const, label: 'Item Code', emptyLabel: 'Auto (PC-...)' },
                    { field: 'spec' as const, label: 'Size / Spec', emptyLabel: '— None —' },
                    { field: 'opening' as const, label: 'Opening Stock', emptyLabel: '— None —' }
                  ] as const
                ).map(({ field, label, emptyLabel }) => (
                  <div key={field} className="space-y-0.5">
                    <label className="block text-[10px] font-bold text-cyan-200/80">{label}</label>
                    <select
                      value={detectedCols[field] ?? -1}
                      onChange={(e) => handleOverrideColumn(field, parseInt(e.target.value, 10))}
                      className="w-full px-1.5 py-1 bg-[#061520] border border-cyan-500/30 rounded-md text-[11px] font-semibold text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    >
                      <option value={-1}>{emptyLabel}</option>
                      {sheetHeaderLabels.map((hdr, idx) => (
                        <option key={idx} value={idx}>
                          {hdr}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Configuration & Diff Review */}
          {parsedRows.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Summary Stats & Mode */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25">
                  <div className="text-[10px] font-bold text-cyan-200/80 uppercase tracking-wide">Total Items Parsed</div>
                  <div className="text-xl font-black text-white font-mono mt-0.5">{stats.total}</div>
                </div>
                <div className="bg-amber-500/15 p-2.5 rounded-xl border border-amber-400/30">
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">Matched Updates</div>
                  <div className="text-xl font-black text-amber-200 font-mono mt-0.5">{stats.update}</div>
                </div>
                <div className="bg-emerald-500/15 p-2.5 rounded-xl border border-emerald-400/30">
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide">New Items to Create</div>
                  <div className="text-xl font-black text-emerald-200 font-mono mt-0.5">
                    +{stats.add}
                  </div>
                </div>
                <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/20">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Unchanged Matches</div>
                  <div className="text-xl font-black text-slate-200 font-mono mt-0.5">{stats.unchanged}</div>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#0b2334]/90 border border-cyan-500/25 text-white rounded-xl">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-cyan-200">Import Mode:</span>
                  <div className="inline-flex rounded-lg border border-cyan-500/30 p-0.5 bg-[#061520]">
                    <button
                      type="button"
                      onClick={() => setUploadMode('merge')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        uploadMode === 'merge' ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Smart Merge (Add &amp; Update)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('rates_only')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        uploadMode === 'rates_only' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Update Matched Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('new_only')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        uploadMode === 'new_only' ? 'bg-emerald-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Create New Items Only
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-200 font-medium">
                  {uploadMode === 'merge' && '✓ Direct bulk ready: updates matched prices and creates all new items automatically.'}
                  {uploadMode === 'rates_only' && '✓ Only updates matched existing items; leaves catalog count unchanged.'}
                  {uploadMode === 'new_only' && '✓ Only creates newly discovered items; leaves existing items untouched.'}
                </div>
              </div>

              {/* Preview Filter & Search Bar */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      previewFilter === 'all'
                        ? 'bg-[#0e2d42] text-cyan-200 border-cyan-400/60'
                        : 'bg-[#081b28] text-slate-300 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    All ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('matched')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      previewFilter === 'matched'
                        ? 'bg-amber-500/30 text-amber-200 border-amber-400/60'
                        : 'bg-[#081b28] text-amber-300 border-amber-400/30 hover:bg-amber-500/15'
                    }`}
                  >
                    Matched Updates ({stats.update + stats.unchanged})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('new')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      previewFilter === 'new'
                        ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/60'
                        : 'bg-[#081b28] text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/15'
                    }`}
                  >
                    New Items ({stats.newTotal})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('unchanged')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                      previewFilter === 'unchanged'
                        ? 'bg-[#0e2d42] text-white border-cyan-400/50'
                        : 'bg-[#081b28] text-slate-300 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Unchanged ({stats.unchanged})
                  </button>
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-cyan-400" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Search in preview..."
                    className="w-full pl-8 pr-3 py-1 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                </div>
              </div>

              {/* Missing Price / Rate Column Validation Alert */}
              {detectedCols && detectedCols.rate === -1 && (
                <div className="bg-rose-500/15 border border-rose-400/40 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-rose-200">
                      Missing Required Price / Rate Column
                    </div>
                    <div className="text-slate-200 text-[11px]">
                      No Price / Rate column was detected in this sheet. Select your price column in the <strong>Price / Rate</strong> dropdown above to preview and apply price updates.
                    </div>
                  </div>
                </div>
              )}

              {/* Import Diagnostics */}
              {uploadDiagnostics.length > 0 && (
                <div
                  className={`rounded-xl p-3.5 space-y-2 border ${
                    uploadDiagnostics.some((d) => d.severity === 'error')
                      ? 'bg-rose-500/10 border-rose-400/35'
                      : 'bg-amber-500/10 border-amber-400/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex items-center gap-2 font-bold text-xs ${
                        uploadDiagnostics.some((d) => d.severity === 'error') ? 'text-rose-200' : 'text-amber-200'
                      }`}
                    >
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 ${
                          uploadDiagnostics.some((d) => d.severity === 'error') ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      />
                      <span>
                        Excel Import Diagnostics ({uploadDiagnostics.length} notice{uploadDiagnostics.length > 1 ? 's' : ''})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadDiagnostics([])}
                      className="text-amber-300 hover:text-white text-[11px] font-bold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                    {uploadDiagnostics.map((d, i) => (
                      <div key={i} className="bg-[#071824]/90 border border-amber-400/25 rounded-lg p-2 text-[11px] space-y-0.5">
                        <div className="font-bold text-white">{d.rowLabel}</div>
                        <div className="text-rose-300">
                          <strong>Notice:</strong> {d.problem}
                        </div>
                        <div className="text-emerald-300">
                          <strong>Resolution:</strong> {d.fix}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 1: Matched Updates */}
              {matchedDisplayRows.length > 0 && (
                <div className="border border-amber-400/35 bg-[#071824]/75 rounded-xl overflow-hidden">
                  <div className="bg-amber-500/15 px-3 py-2 border-b border-amber-400/25 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-xs font-extrabold text-amber-200 uppercase tracking-wide">
                        Matched Updates ({matchedDisplayRows.length})
                      </span>
                      <span className="text-[10px] text-slate-300">
                        Matched to existing {isSpecialItemMode ? 'Special Items' : 'Master Items'} via normalized name
                      </span>
                      {uploadMode === 'new_only' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-200 border border-amber-400/30">
                          Skipped in "Create New Items Only" mode
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#0c2638] text-cyan-200 font-bold sticky top-0 border-b border-cyan-500/30 uppercase text-[10px] z-10">
                        <tr>
                          <th className="p-2 w-10 text-center">SL</th>
                          <th className="p-2">Imported / Matched Item</th>
                          <th className="p-2">Category</th>
                          <th className="p-2 text-center w-16">Unit</th>
                          <th className="p-2 text-right">Current Price</th>
                          <th className="p-2 text-right">Upload Price</th>
                          <th className="p-2 text-center w-40">Match Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 font-medium text-slate-200">
                        {matchedDisplayRows.map((row, idx) => (
                          <tr key={row.rowIndex ?? idx} className="hover:bg-cyan-500/[0.06]">
                            <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-white">{row.name}</div>
                              {row.isManualMatch && row.existingItem && (
                                <div className="text-[10px] text-cyan-300">
                                  Mapped to: {row.existingItem.name}
                                </div>
                              )}
                              {row.sizeSpec && <div className="text-[10px] text-slate-400">{row.sizeSpec}</div>}
                            </td>
                            <td className="p-2 text-slate-300">
                              <span className="bg-[#0b2334] border border-cyan-500/20 text-cyan-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                {row.category}
                              </span>
                            </td>
                            <td className="p-2 text-center text-slate-200">{row.unit}</td>
                            <td className="p-2 text-right font-mono text-slate-400">
                              {row.existingItem ? `৳${(row.existingItem.rate ?? 0).toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-white">
                              ৳{(row.rate ?? 0).toLocaleString('en-IN')}
                              {row.rateDiff !== undefined && row.rateDiff !== 0 && (
                                <span
                                  className={`ml-1 text-[10px] font-semibold ${
                                    row.rateDiff > 0 ? 'text-emerald-300' : 'text-rose-300'
                                  }`}
                                >
                                  ({row.rateDiff > 0 ? `+৳${row.rateDiff}` : `-৳${Math.abs(row.rateDiff)}`})
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center space-y-1">
                              {row.action === 'update' ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/35">
                                  {row.isManualMatch ? '⚡ Mapped Update' : '⚡ Matched Update'}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0b2334] text-slate-300 border border-cyan-500/20">
                                  Unchanged
                                </span>
                              )}
                              {row.isManualMatch && row.rowIndex !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualMatches((prev) => {
                                      const next = { ...prev };
                                      delete next[row.rowIndex!];
                                      return next;
                                    });
                                  }}
                                  className="block mx-auto text-[10px] text-cyan-300 hover:text-white underline cursor-pointer"
                                >
                                  Unmap
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Section 2: New Items Ready to Create (Auto-Ingested directly into active catalog) */}
              {newItemsDisplayRows.length > 0 && (
                <div className="border border-emerald-400/35 bg-[#071824]/75 rounded-xl overflow-visible">
                  <div className="bg-emerald-500/15 px-3 py-2 border-b border-emerald-400/25 flex items-center justify-between gap-2 flex-wrap rounded-t-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Plus className="w-3.5 h-3.5 text-emerald-300" />
                      <span className="text-xs font-extrabold text-emerald-200 uppercase tracking-wide">
                        New Items Ready to Create ({newItemsDisplayRows.length})
                      </span>
                      <span className="text-[10px] text-emerald-100/80">
                        Automatically prepared for direct import into {isSpecialItemMode ? 'Special Items' : 'Master Items'}
                      </span>
                      {uploadMode === 'rates_only' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-200 border border-amber-400/30">
                          Excluded in "Update Matched Only" mode
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={newItemsDisplayRows.length > 5 ? 'max-h-72 overflow-y-auto' : 'overflow-visible pb-2'}>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#0c2638] text-cyan-200 font-bold sticky top-0 border-b border-cyan-500/30 uppercase text-[10px] z-10">
                        <tr>
                          <th className="p-2 w-10 text-center">SL</th>
                          <th className="p-2">Item Description</th>
                          <th className="p-2">Category</th>
                          <th className="p-2 text-center w-16">Unit</th>
                          <th className="p-2 text-right">Upload Price</th>
                          <th className="p-2 text-center w-64">Import Readiness (Optional Map)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 font-medium text-slate-200">
                        {newItemsDisplayRows.map((row, idx) => {
                          const rIdx = row.rowIndex!;
                          return (
                            <tr
                              key={rIdx}
                              className="transition-colors hover:bg-cyan-500/[0.06]"
                            >
                              <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-2">
                                <div className="font-bold text-white">
                                  {row.name}
                                </div>
                                {row.sizeSpec && <div className="text-[10px] text-slate-400">{row.sizeSpec}</div>}
                              </td>
                              <td className="p-2 text-slate-300">
                                <span className="bg-[#0b2334] border border-cyan-500/20 text-cyan-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                  {row.category}
                                </span>
                              </td>
                              <td className="p-2 text-center text-slate-200">{row.unit}</td>
                              <td className="p-2 text-right font-mono font-bold text-white">
                                ৳{(row.rate ?? 0).toLocaleString('en-IN')}
                              </td>
                              <td className="p-2">
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Ready (New Item)</span>
                                  </span>
                                  {existingCatalog.length > 0 && (
                                    <SearchableCatalogItemPicker
                                      catalog={existingCatalog}
                                      selectedId={manualMatches[rIdx] || ''}
                                      onSelect={(itemId) => {
                                        setManualMatches((prev) => {
                                          const next = { ...prev };
                                          if (!itemId) delete next[rIdx];
                                          else next[rIdx] = itemId;
                                          return next;
                                        });
                                      }}
                                    />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {displayRows.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-300 border border-cyan-500/20 rounded-xl bg-[#071824]/50">
                  No rows match the current filter or search query.
                </div>
              )}
            </div>
          )}

          {/* Diagnostics when parsedRows === 0 (e.g. 0 valid rows, unrecognized columns, or empty sheet) */}
          {parsedRows.length === 0 && uploadDiagnostics.length > 0 && (
            <div className="bg-rose-500/15 border border-rose-400/35 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-200 font-extrabold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Excel Import Validation Error — Zero Valid Rows / Unrecognized Columns</span>
              </div>
              <div className="space-y-2">
                {uploadDiagnostics.map((d, i) => (
                  <div key={i} className="bg-[#071824]/90 border border-rose-400/25 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="font-bold text-white">{d.rowLabel}</div>
                    <div className="text-rose-300">
                      <strong>Problem:</strong> {d.problem}
                    </div>
                    <div className="text-emerald-300 bg-emerald-500/10 p-1.5 rounded border border-emerald-400/25">
                      <strong>How to Fix:</strong> {d.fix}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#071824]/90 p-4 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-300">
            {parsedRows.length > 0 ? (
              actionableCount > 0 ? (
                <span>
                  Ready to process <strong className="text-cyan-300 font-bold">{actionableCount}</strong> direct import changes (
                  {stats.update} matched updates, {stats.add} new items).
                </span>
              ) : (
                <span className="text-emerald-300">
                  All {stats.unchanged} parsed items already match the current catalog rates and specifications.
                </span>
              )
            ) : (
              <span>Upload or paste a spreadsheet to preview items and price updates.</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#081b28] border border-cyan-500/30 hover:bg-[#0e2a3d] text-slate-200 font-bold rounded-xl transition-colors cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyUpload}
              disabled={parsedRows.length === 0 || actionableCount === 0}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-black rounded-xl transition-all cursor-pointer text-xs flex items-center space-x-1.5 shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Save ({actionableCount} Changes)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SearchableCatalogItemPickerProps {
  catalog: Item[];
  selectedId: string;
  onSelect: (itemId: string) => void;
}

const SearchableCatalogItemPicker: React.FC<SearchableCatalogItemPickerProps> = ({
  catalog,
  selectedId,
  onSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const selectedItem = useMemo(
    () => (selectedId ? catalog.find((it) => it.id === selectedId) : undefined),
    [catalog, selectedId]
  );

  const groupedFiltered = useMemo(() => {
    const q = query.trim();
    const matches = q
      ? catalog.filter((it) =>
          matchesFlexibleSearch(`${it.name || ''} ${it.category || ''} ${it.sizeSpec || ''}`, q, `${it.code || ''}`)
        )
      : catalog;
    const orderedSlice = groupItemsByCategoryOrder(matches, categoryOrder).orderedItems.slice(0, 80);
    return groupItemsByCategoryOrder(orderedSlice, categoryOrder);
  }, [catalog, query, categoryOrder]);
  const filtered = groupedFiltered.orderedItems;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-[230px]">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full px-2 py-1 text-[10.5px] bg-[#061520] hover:bg-[#0c2638] text-cyan-200 border border-cyan-500/35 rounded flex items-center justify-between gap-1 cursor-pointer truncate"
        title="Search and map to an existing catalog item"
      >
        <span className="truncate">
          {selectedItem ? `Mapped: ${selectedItem.name}` : 'Map to Existing Item...'}
        </span>
        <Search className="w-3 h-3 shrink-0 text-cyan-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-72 bg-[#091e2c] border border-cyan-400/50 rounded-xl shadow-[0_14px_40px_rgba(0,0,0,0.85)] z-50 p-2 space-y-1.5 text-left">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-2 text-cyan-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search existing item by name/code..."
              className="w-full pl-6 pr-6 py-1 text-[11px] bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/35 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-cyan-500/15">
            {filtered.length === 0 ? (
              <div className="p-2 text-[11px] text-slate-400 text-center">No matching catalog items</div>
            ) : (
              groupedFiltered.groups.map((grp) => (
                <div key={grp.category} className="pt-1">
                  <div className="px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-cyan-300 bg-[#061520] border border-cyan-500/25 rounded mb-0.5">
                    {grp.category} ({grp.items.length})
                  </div>
                  {grp.items.map(({ item: it }) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onSelect(it.id);
                        setIsOpen(false);
                        setQuery('');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-cyan-500/20 rounded text-[11px] transition-colors cursor-pointer"
                    >
                      <div className="font-bold text-white truncate">{it.name}</div>
                      <div className="text-[10px] text-cyan-200/80 flex items-center justify-between gap-2">
                        <span className="truncate">{it.category} • {it.unit}</span>
                        <span className="font-mono shrink-0">৳{(it.rate ?? 0).toLocaleString('en-IN')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="pt-1 border-t border-cyan-500/20 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 text-[10px] text-slate-300 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FileCheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
