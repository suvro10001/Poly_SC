import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { StoredBill, BillLineItem, Salesperson, BranchLocation, Party, AuthUser, Item } from '../types';
import { defaultBranches } from '../data/defaultData';
import { SearchableItemSelector, SelectableCatalogOption } from './SearchableItemSelector';
import {
  getUserBranch,
  isSuperAdminOrAgm,
  getBranchAddressDetails,
  cleanBranchName,
  billMatchesBranch,
  getUserLoginFilters,
  isUnwantedSalesCenter,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin,
  findPartyForBill,
  normalizeBranchId
} from '../utils/branchAccess';
import {
  Search, FolderOpen, FolderArchive, Trash2, Printer, Edit2, Eye, X, ArrowLeft, Calendar,
  User, UserCheck, RotateCcw, DollarSign, FileText, Download, Clock, Layers, FileCheck, CheckCircle2,
  RefreshCw, Upload, Loader2, Mail, Filter, FilterX, ArrowUpDown, ChevronDown,
  ChevronUp, CalendarRange, Sparkles, AlertCircle, Check, Sliders, FileSpreadsheet,
  FileEdit, Building, Building2, Boxes
} from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO, getTodayISO, getTodayDDMMYY } from '../utils/dateUtils';
import { matchesFlexibleSearch, sortItemsCategorySerialWise } from '../utils/searchHelper';
import { formatDisplayUnit } from '../utils/stockHelper';
import { readFileAsDataUrl, compressImageIfNeeded, downloadDataUrl } from '../utils/fileUploadHelper';
import { EmailSenderModal } from './EmailSenderModal';
import { PrinterAutoConfigModal } from './PrinterAutoConfigModal';
import { BillPrintPreviewModal } from './BillPrintPreviewModal';
import { ItemWiseQuantityReportModal } from './ItemWiseQuantityReportModal';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import { triggerAutoConfiguredPrint, printHtmlViaIframe } from '../utils/printerAutoConfig';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { formatAdminBillNo } from '../utils/salesCenterHelper';
import { parseDocumentWithAI } from '../utils/aiDocumentImport';
import { matchImportedItemWithStored } from '../utils/itemMatcher';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { StandardPeriodPreset, calculatePeriodDates } from '../utils/standardPeriodHelper';

type SortColumn = 'date' | 'partyName' | 'address' | 'billNo' | 'receivedCopy' | 'amount';

interface StoredBillsDirectoryProps {
  storedBills: StoredBill[];
  isCloudLoading?: boolean;
  items?: Item[];
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  parties?: Party[];
  currentUser?: AuthUser | null;
  focusedBillId?: string | null;
  onLoadBill: (bill: StoredBill) => void;
  onDeleteBill: (id: string) => void;
  onUpdateReceivedCopy?: (billId: string, receivedCopy?: string, receivedCopyName?: string, receivedCopyDate?: string) => void;
  onExportAllBills: () => void;
  onClearAllBills?: () => void;
  onRemoveDuplicates?: () => void;
  onUpdateSalesman?: (billId: string, salesmanCode?: string, salesmanName?: string) => void;
  onUpdateStoredBillsLineItems?: (billLineUpdates: Record<string, BillLineItem[]>) => void;
  onImportBill?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const StoredBillsDirectory: React.FC<StoredBillsDirectoryProps> = ({
  storedBills,
  isCloudLoading = false,
  items = [],
  salespersons = [],
  branches = [],
  parties = [],
  currentUser,
  focusedBillId,
  onLoadBill,
  onDeleteBill,
  onUpdateReceivedCopy,
  onExportAllBills,
  onClearAllBills,
  onRemoveDuplicates,
  onUpdateSalesman,
  onUpdateStoredBillsLineItems,
  onImportBill,
  onBack,
  onClose
}) => {
  const directFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingFile, setIsImportingFile] = useState(false);

  const handleImportBillClick = () => {
    if (directFileInputRef.current) {
      directFileInputRef.current.click();
    } else if (onImportBill) {
      onImportBill();
    }
  };

  const handleDirectFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      e.target.value = '';
    } catch {}

    const nameLow = file.name.toLowerCase();
    const isJson = nameLow.endsWith('.json');

    try {
      setIsImportingFile(true);
      let parsedBill: StoredBill | null = null;

      if (isJson) {
        const text = await file.text();
        const json = JSON.parse(text);
        const raw = json.bill || json.data?.storedBills?.[0] || json.storedBills?.[0] || json;
        if (raw && (raw.header || raw.lines)) {
          const lns = raw.lines || [];
          const sub = lns.reduce((s: number, l: any) => s + (l.amount || 0), 0);
          const disc = Math.round(sub * ((raw.header?.discountPercent || 0) / 100));
          const grand = sub - disc;
          parsedBill = {
            id: raw.id || `bill-imp-${Date.now()}`,
            savedAt: raw.savedAt || new Date().toISOString(),
            company: raw.company || ({} as any),
            header: {
              billNo: raw.header?.billNo || '01',
              date: raw.header?.date || getTodayISO(),
              partyName: raw.header?.partyName || '',
              address: raw.header?.address || '',
              phone: raw.header?.phone || '',
              salesmanCode: raw.header?.salesmanCode || '',
              orderNumber: raw.header?.orderNumber || '',
              challanNo: raw.header?.challanNo || '',
              refNo: raw.header?.refNo || '',
              discountPercent: raw.header?.discountPercent || 0,
              isOfficeBill: Boolean(raw.isOfficeBill || raw.header?.isOfficeBill)
            },
            lines: lns,
            subtotal: sub,
            discountAmount: disc,
            grandTotal: grand,
            inWords: '',
            isOfficeBill: Boolean(raw.isOfficeBill || raw.header?.isOfficeBill)
          };
        }
      } else {
        showToast('Extracting bill using AI...');
        let catalogItems = items;
        if (!catalogItems || catalogItems.length === 0) {
          try {
            const cached = localStorage.getItem('polycables_items');
            if (cached) catalogItems = JSON.parse(cached);
          } catch {}
        }

        const aiRes = await parseDocumentWithAI(file, {
          mode: 'bill',
          knownParties: parties,
          knownItems: catalogItems || []
        });

        const aiData = aiRes.data;
        if (!aiData || !Array.isArray(aiData.lines) || aiData.lines.length === 0) {
          showToast(aiRes.error || 'Could not detect items in the uploaded bill file.');
          return;
        }

        const lns = aiData.lines
          .map((ln, idx) => {
            const rawDesc = String(ln.itemDescription || ln.itemName || '').trim();
            if (!rawDesc) return null;
            const qty = Number(ln.coilQty || ln.quantity || ln.qty || 1) || 1;
            const rawRate = Number(ln.rate || 0) || 0;
            const rawAmt = Number(ln.amount || 0) || 0;

            const matchRes = matchImportedItemWithStored(
              rawDesc,
              rawRate,
              qty,
              catalogItems || [],
              ln.unit,
              rawAmt
            );
            const matched = matchRes.matchedStoredItem || matchRes.suggestedStoredItem;
            const finalDesc = matchRes.shouldUseStoredName ? matchRes.finalItemDescription : rawDesc;
            const finalRate = rawRate > 0 ? rawRate : (matchRes.finalRate || matched?.rate || 0);
            const finalQty = matchRes.importedQty || qty;
            const finalAmt = rawAmt > 0 ? rawAmt : Math.round(finalQty * finalRate * 100) / 100;

            return {
              id: `line-${Date.now()}-${idx}`,
              slNo: idx + 1,
              itemId: matched?.id || '',
              itemCode: matched?.code || ln.itemCode || '',
              itemDescription: finalDesc,
              itemName: finalDesc,
              sizeSpec: matchRes.finalSizeSpec || matched?.sizeSpec || ln.sizeSpec || '',
              coilQty: finalQty,
              unit: ln.unit || matchRes.finalUnit || matched?.unit || 'Coils',
              rate: finalRate,
              amount: finalAmt,
              ...(matched?.isSpecialItem ? { isSpecialItem: true, baseItemId: matched.baseItemId, stockMultiplier: matched.stockMultiplier } : {}),
              ...(((Number(ln.red) || 0) > 0 || (Number(ln.black) || 0) > 0 || (Number(ln.yellow) || 0) > 0 || (Number(ln.green) || 0) > 0 || (Number(ln.blue) || 0) > 0 || (Number(ln.others) || 0) > 0)
                ? {
                    colors: {
                      red: Number(ln.red) || 0,
                      black: Number(ln.black) || 0,
                      yellow: Number(ln.yellow) || 0,
                      green: Number(ln.green) || 0,
                      blue: Number(ln.blue) || 0,
                      others: Number(ln.others) || 0
                    }
                  }
                : {})
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (lns.length === 0) {
          showToast('No valid bill items found in document.');
          return;
        }

        const sub = lns.reduce((s, l) => s + (l.amount || 0), 0);
        const discPct = Number(aiData.discountPercent || 0) || 0;
        const disc =
          typeof aiData.discountAmount === 'number' && aiData.discountAmount > 0
            ? Math.round(aiData.discountAmount)
            : Math.round(sub * (discPct / 100));
        const grand = Math.max(0, sub - disc);

        const rawParty = String(aiData.partyName || '').trim();
        const matchedParty = rawParty
          ? parties.find((p) => {
              const pName = (p.name || '').trim().toLowerCase();
              const q = rawParty.toLowerCase();
              return pName === q || pName.includes(q) || q.includes(pName);
            })
          : undefined;

        const resolvedSpCode = String(aiData.salesmanCode || '').trim() || matchedParty?.salesmanCode || '';
        const matchedSp = resolvedSpCode
          ? salespersons.find(
              (s) =>
                (s.code || '').trim().toLowerCase() === resolvedSpCode.toLowerCase() ||
                (s.name || '').trim().toLowerCase() === resolvedSpCode.toLowerCase()
            )
          : undefined;

        const userBr = getUserBranch(currentUser, salespersons, branches);
        const resolvedBranchId =
          matchedParty?.branchId ||
          (selectedBranch !== 'ALL' && selectedBranch !== 'all' ? selectedBranch : '') ||
          (userBr.branchId && userBr.branchId !== 'ALL' ? userBr.branchId : '');
        const resolvedBranchObj = resolvedBranchId ? branches.find((b) => b.id === resolvedBranchId) : undefined;
        const resolvedBranchName =
          resolvedBranchObj?.name || matchedParty?.branchName || (userBr.branchName && !userBr.branchName.toLowerCase().includes('all') ? userBr.branchName : '');

        const formattedImpDate = aiData.date ? (formatDateDDMMYY(aiData.date) || aiData.date) : getTodayDDMMYY();
        const formattedImpChallanDate = aiData.challanDate ? (formatDateDDMMYY(aiData.challanDate) || aiData.challanDate) : formattedImpDate;
        const calculatedCoils = lns.reduce((s, l) => {
          const q = Number(l.coilQty) || 0;
          const u = String(l.unit || '').toLowerCase();
          return s + (u.includes('meter') || u === 'mtr' || u === 'm' ? q / 100 : q);
        }, 0);

        parsedBill = {
          id: `bill-imp-${Date.now()}`,
          savedAt: new Date().toISOString(),
          company: {} as any,
          branchId: resolvedBranchId || undefined,
          branchName: resolvedBranchName || undefined,
          header: {
            billNo: aiData.billNo || '01',
            date: formattedImpDate,
            orderDate: formattedImpDate,
            challanDate: formattedImpChallanDate,
            partyName: matchedParty?.name || rawParty || 'Customer',
            address: String(aiData.address || '').trim() || matchedParty?.address || '',
            phone: String(aiData.phone || '').trim() || matchedParty?.phone || '',
            salesmanCode: matchedSp?.code || resolvedSpCode,
            salespersonName: matchedSp?.name || matchedParty?.salespersonName || '',
            orderNumber: String(aiData.orderNumber || '').trim(),
            challanNo: String(aiData.challanNo || '').trim(),
            refNo: String(aiData.refNo || '').trim(),
            discountPercent: discPct,
            ...(discPct === 0 && disc > 0 ? { discountAmount: disc } : {}),
            ...(resolvedBranchId ? { branchId: resolvedBranchId, branchName: resolvedBranchName } : {}),
            isOfficeBill: false
          },
          lines: lns,
          subtotal: sub,
          discountAmount: disc,
          grandTotal: grand,
          totalCoils: calculatedCoils,
          inWords: '',
          isOfficeBill: false
        };
      }

      if (parsedBill) {
        onLoadBill(parsedBill);
      } else {
        showToast('Could not parse uploaded bill file.');
      }
    } catch (err: any) {
      console.error('Direct file parse failed:', err);
      showToast(err?.message || 'Failed to import bill file.');
    } finally {
      setIsImportingFile(false);
    }
  };

  const rawBranchesList = useMemo(() => (branches && branches.length > 0 ? branches : defaultBranches), [branches]);
  const effectiveBranches = useMemo(
    () => filterBranchesForUser(rawBranchesList, currentUser, salespersons),
    [rawBranchesList, currentUser, salespersons]
  );
  const isGlobalBillAdmin = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);
  const isSuperOrAccounts = isGlobalBillAdmin || isAnyAdmin(currentUser);

  const uniqueBranchOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; name: string }> = [];
    effectiveBranches.forEach((b) => {
      if (isUnwantedSalesCenter(b)) return;
      let displayName = cleanBranchName(b.name);
      if (b.id === 'branch-main' || b.type === 'head_office') {
        displayName = 'CORPORATE OFFICE';
      }
      if (isUnwantedSalesCenter(displayName)) return;
      const key = displayName.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ id: b.id, name: displayName });
      }
    });

    // Only global Super Admin & Accounts Admin append historical branch labels not in catalog
    if (isGlobalBillAdmin) {
      (storedBills || []).forEach((b) => {
        const bBranch = b?.branchName || b?.header?.branchName || (b?.header as any)?.salesCenter;
        if (bBranch && typeof bBranch === 'string') {
          const cleanName = cleanBranchName(bBranch);
          if (isUnwantedSalesCenter(cleanName)) return;
          const key = cleanName.toLowerCase().trim();
          if (key && !seen.has(key) && key !== 'all' && !key.startsWith('all sales')) {
            seen.add(key);
            list.push({ id: cleanName, name: cleanName });
          }
        }
      });
    }

    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [effectiveBranches, storedBills, isGlobalBillAdmin]);

  const salesCentersCount = useMemo(() => {
    return uniqueBranchOptions.length;
  }, [uniqueBranchOptions]);
  const userBranchInfo = useMemo(() => getUserBranch(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);
  const userLoginFilters = useMemo(() => getUserLoginFilters(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);

  const currentBillsUserKey = useMemo(
    () => `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`,
    [currentUser?.username, currentUser?.salespersonCode, currentUser?.branchId, currentUser?.role]
  );

  const initialSavedFilters = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('polycables_stored_bills_filters') || localStorage.getItem('polycables_stored_bills_filters');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.filterVersion === 2 &&
          (!parsed.userKey || parsed.userKey === currentBillsUserKey)
        ) {
          return parsed;
        }
      }
    } catch {}
    return {} as Record<string, any>;
  }, [currentBillsUserKey]);

  const initialPeriodPreset = useMemo<StandardPeriodPreset>(() => {
    const p = initialSavedFilters.datePreset;
    if (p === 'this_month' || p === 'last_month' || p === 'this_year' || p === 'last_year' || p === 'all' || p === 'custom') {
      return p;
    }
    return 'all';
  }, [initialSavedFilters]);

  const [search, setSearch] = useState<string>(() => initialSavedFilters.search ?? '');
  const [filterCopyStatus, setFilterCopyStatus] = useState<'all' | 'regular' | 'office' | 'draft' | 'with_copy' | 'pending_copy'>(() => initialSavedFilters.filterCopyStatus || 'all');
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (initialSavedFilters.selectedBranch !== undefined) return initialSavedFilters.selectedBranch;
    const init = getUserLoginFilters(currentUser, salespersons, branches.length > 0 ? branches : defaultBranches);
    return init.branchId || 'all';
  });
  const [datePreset, setDatePreset] = useState<StandardPeriodPreset>(initialPeriodPreset);
  const [startDate, setStartDate] = useState<string>(() => {
    if (initialPeriodPreset === 'all') return '';
    if (initialPeriodPreset !== 'custom') {
      const range = calculatePeriodDates(initialPeriodPreset);
      return parseDateToISO(range.startDate) || '';
    }
    if (typeof initialSavedFilters.startDate === 'string') return initialSavedFilters.startDate;
    return '';
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (initialPeriodPreset === 'all') return '';
    if (initialPeriodPreset !== 'custom') {
      const range = calculatePeriodDates(initialPeriodPreset);
      return parseDateToISO(range.endDate) || '';
    }
    if (typeof initialSavedFilters.endDate === 'string') return initialSavedFilters.endDate;
    return '';
  });
  const [fromDateText, setFromDateText] = useState<string>(() => {
    if (initialPeriodPreset === 'all') return '';
    if (initialPeriodPreset !== 'custom') {
      return calculatePeriodDates(initialPeriodPreset).startDate;
    }
    if (typeof initialSavedFilters.fromDateText === 'string') return initialSavedFilters.fromDateText;
    return '';
  });
  const [toDateText, setToDateText] = useState<string>(() => {
    if (initialPeriodPreset === 'all') return '';
    if (initialPeriodPreset !== 'custom') {
      return calculatePeriodDates(initialPeriodPreset).endDate;
    }
    if (typeof initialSavedFilters.toDateText === 'string') return initialSavedFilters.toDateText;
    return '';
  });
  const [selectedParty, setSelectedParty] = useState<string>(() => initialSavedFilters.selectedParty || 'all');
  const [partyFilterSearch, setPartyFilterSearch] = useState<string>(() => initialSavedFilters.partyFilterSearch || '');
  const [isPartyFilterOpen, setIsPartyFilterOpen] = useState(false);
  const [partyFilterHighlightIdx, setPartyFilterHighlightIdx] = useState(0);
  const [isShowingAllFilterParties, setIsShowingAllFilterParties] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>(() => {
    if (initialSavedFilters.selectedSalesperson !== undefined) return initialSavedFilters.selectedSalesperson;
    return 'all';
  });

  const lastBillsUserKeyRef = useRef<string>('');

  // Keep filters updated when currentUser changes or assigned branches change
  useEffect(() => {
    const userChanged = lastBillsUserKeyRef.current !== '' && lastBillsUserKeyRef.current !== currentBillsUserKey;
    lastBillsUserKeyRef.current = currentBillsUserKey;

    if (!isSuperOrAccounts && uniqueBranchOptions.length === 1) {
      setSelectedBranch(uniqueBranchOptions[0].id);
    } else if (userChanged) {
      setSelectedBranch(userLoginFilters.branchId || 'all');
    } else if (
      selectedBranch !== 'all' &&
      uniqueBranchOptions.length > 0 &&
      !uniqueBranchOptions.some(
        (o) =>
          o.id.toLowerCase() === selectedBranch.toLowerCase() ||
          normalizeBranchId(o.id) === normalizeBranchId(selectedBranch) ||
          cleanBranchName(o.name).toLowerCase() === cleanBranchName(selectedBranch).toLowerCase()
      )
    ) {
      setSelectedBranch(userLoginFilters.branchId || (isSuperOrAccounts ? 'all' : uniqueBranchOptions[0]?.id || 'all'));
    } else if (initialSavedFilters.selectedBranch === undefined && userLoginFilters.branchId) {
      setSelectedBranch(userLoginFilters.branchId);
    }

    if (userChanged) {
      setSelectedSalesperson('all');
      setSelectedParty('all');
      setPartyFilterSearch('');
    }
  }, [currentUser, currentBillsUserKey, userLoginFilters.branchId, isSuperOrAccounts, uniqueBranchOptions]);

  const [sortColumn, setSortColumn] = useState<SortColumn>(() => {
    try {
      const saved = localStorage.getItem('polycables_stored_bills_sort_col');
      if (saved && ['date', 'partyName', 'address', 'billNo', 'receivedCopy', 'amount'].includes(saved)) {
        return saved as SortColumn;
      }
    } catch {}
    return 'date';
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    try {
      const saved = localStorage.getItem('polycables_stored_bills_sort_dir');
      if (saved === 'asc' || saved === 'desc') {
        return saved;
      }
    } catch {}
    return 'desc';
  });
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isItemQtyReportOpen, setIsItemQtyReportOpen] = useState(false);
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(focusedBillId || null);

  // Check existing/previous stored bill line items against active Master Item Directory on entering Stored Bills
  const normalizeBillItemName = (raw?: string) =>
    String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const activeMasterItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).filter(
        (it) => it && it.isActive !== false && !it.isSpecialItem && Boolean((it.name || '').trim())
      ),
    [items]
  );

  const activeMasterSelectorOptions: SelectableCatalogOption[] = useMemo(
    () =>
      sortItemsCategorySerialWise(activeMasterItems).map((it) => ({
        id: it.id,
        code: it.code,
        name: it.name,
        category: it.category,
        unit: it.unit,
        rate: Number(it.rate) || 0,
        sourceLabel: 'Active Item Directory'
      })),
    [activeMasterItems]
  );

  interface UnmatchedBillItemGroup {
    normKey: string;
    rawName: string;
    lineCount: number;
    sampleRate: number;
    billRefs: Array<{ billId: string; billNo: string; date: string; partyName: string }>;
  }

  const [isBillItemMismatchModalOpen, setIsBillItemMismatchModalOpen] = useState(false);
  const [unmatchedBillItemGroups, setUnmatchedBillItemGroups] = useState<UnmatchedBillItemGroup[]>([]);
  const [billItemMappings, setBillItemMappings] = useState<Record<string, string>>({});
  const hasPromptedBillItemMismatchRef = useRef<boolean>(false);

  useEffect(() => {
    if (hasPromptedBillItemMismatchRef.current) return;
    if (!Array.isArray(storedBills) || storedBills.length === 0) return;
    if (activeMasterItems.length === 0) return;

    const activeNameSet = new Set(activeMasterItems.map((it) => normalizeBillItemName(it.name)));
    const groupMap = new Map<string, UnmatchedBillItemGroup>();

    storedBills.forEach((bill) => {
      const billLines = Array.isArray(bill.lines) ? bill.lines : [];
      billLines.forEach((ln) => {
        const rawName = String(ln?.itemDescription || ln?.itemName || '').trim();
        if (!rawName) return;
        const normKey = normalizeBillItemName(rawName);
        if (!normKey || activeNameSet.has(normKey)) return;

        let grp = groupMap.get(normKey);
        if (!grp) {
          grp = {
            normKey,
            rawName,
            lineCount: 0,
            sampleRate: Number(ln.rate) || 0,
            billRefs: []
          };
          groupMap.set(normKey, grp);
        }
        grp.lineCount += 1;
        if (!grp.billRefs.some((r) => r.billId === bill.id)) {
          grp.billRefs.push({
            billId: bill.id,
            billNo: bill.header?.billNo || bill.id,
            date: bill.header?.date || '',
            partyName: bill.header?.partyName || 'Unknown Party'
          });
        }
      });
    });

    hasPromptedBillItemMismatchRef.current = true;
    const groups = Array.from(groupMap.values()).sort((a, b) => b.lineCount - a.lineCount);
    if (groups.length > 0) {
      setUnmatchedBillItemGroups(groups);
      setBillItemMappings({});
      setIsBillItemMismatchModalOpen(true);
    }
  }, [storedBills, activeMasterItems]);

  const mappedBillItemGroupCount = useMemo(
    () =>
      unmatchedBillItemGroups.filter((g) => {
        const val = billItemMappings[g.normKey];
        return Boolean(val && val !== '__SKIP__' && activeMasterItems.some((it) => it.id === val));
      }).length,
    [unmatchedBillItemGroups, billItemMappings, activeMasterItems]
  );

  const handleApplyBillItemMappings = () => {
    const selectedByNormKey = new Map<string, Item>();
    unmatchedBillItemGroups.forEach((grp) => {
      const chosenId = billItemMappings[grp.normKey];
      if (!chosenId || chosenId === '__SKIP__') return;
      const target = activeMasterItems.find((it) => it.id === chosenId);
      if (target) selectedByNormKey.set(grp.normKey, target);
    });

    if (selectedByNormKey.size === 0) {
      setIsBillItemMismatchModalOpen(false);
      return;
    }

    const updatesByBillId: Record<string, BillLineItem[]> = {};
    let updatedLineCount = 0;

    storedBills.forEach((bill) => {
      const linesArr = Array.isArray(bill.lines) ? bill.lines : [];
      let billModified = false;
      const nextLines = linesArr.map((ln) => {
        const rawName = String(ln?.itemDescription || ln?.itemName || '').trim();
        const normKey = normalizeBillItemName(rawName);
        const mappedTarget = selectedByNormKey.get(normKey);
        if (!mappedTarget) return ln;

        billModified = true;
        updatedLineCount += 1;
        // Update item identity/name strictly while preserving historical rate, coilQty, amount, and bill totals
        return {
          ...ln,
          itemId: mappedTarget.id,
          itemCode: mappedTarget.code || ln.itemCode,
          itemDescription: mappedTarget.name,
          itemName: mappedTarget.name,
          sizeSpec: mappedTarget.sizeSpec || ln.sizeSpec,
          userConfirmed: true
        };
      });

      if (billModified) {
        updatesByBillId[bill.id] = nextLines;
      }
    });

    const affectedBillsCount = Object.keys(updatesByBillId).length;
    if (affectedBillsCount > 0 && onUpdateStoredBillsLineItems) {
      onUpdateStoredBillsLineItems(updatesByBillId);
      showToast(
        `Updated ${updatedLineCount} line item(s) across ${affectedBillsCount} bill(s) with historical prices & totals preserved.`
      );
    }

    setIsBillItemMismatchModalOpen(false);
  };

  // Pagination state (Default 'all' to show full page of stored bills)
  const [pageSize, setPageSize] = useState<number | 'all'>(() => {
    try {
      const saved = localStorage.getItem('polycables_stored_bills_page_size');
      if (saved === 'all') return 'all';
      if (saved) {
        const num = parseInt(saved, 10);
        if ([18, 36, 50, 100].includes(num)) return num;
      }
    } catch {}
    return 'all';
  });
  const [currentPage, setCurrentPage] = useState<number>(() => initialSavedFilters.currentPage || 1);

  // Save page size preference
  useEffect(() => {
    try {
      localStorage.setItem('polycables_stored_bills_page_size', String(pageSize));
    } catch {}
  }, [pageSize]);

  // Persist all active filter selections so returning from bill edit, cancel or save restores exact selections
  useEffect(() => {
    try {
      const filters = {
        filterVersion: 2,
        userKey: currentBillsUserKey,
        search,
        filterCopyStatus,
        selectedBranch,
        datePreset,
        startDate,
        endDate,
        fromDateText,
        toDateText,
        selectedParty,
        partyFilterSearch,
        selectedSalesperson,
        currentPage
      };
      sessionStorage.setItem('polycables_stored_bills_filters', JSON.stringify(filters));
      localStorage.setItem('polycables_stored_bills_filters', JSON.stringify(filters));
    } catch {}
  }, [
    currentBillsUserKey,
    search,
    filterCopyStatus,
    selectedBranch,
    datePreset,
    startDate,
    endDate,
    fromDateText,
    toDateText,
    selectedParty,
    partyFilterSearch,
    selectedSalesperson,
    currentPage
  ]);

  // Sync highlightedBillId with incoming focusedBillId prop
  useEffect(() => {
    if (focusedBillId) {
      setHighlightedBillId(focusedBillId);
    }
  }, [focusedBillId]);

  // Remember sort settings across sessions
  useEffect(() => {
    try {
      localStorage.setItem('polycables_stored_bills_sort_col', sortColumn);
    } catch {}
  }, [sortColumn]);

  useEffect(() => {
    try {
      localStorage.setItem('polycables_stored_bills_sort_dir', sortDirection);
    } catch {}
  }, [sortDirection]);

  // Global click/touch outside & Escape listener for party filter dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.stored-bills-party-filter-container')) {
        setIsPartyFilterOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPartyFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const [selectedBill, setSelectedBill] = useState<StoredBill | null>(null);

  const selectedBillBranch = useMemo(() => {
    if (!selectedBill) return defaultBranches[0];
    const bId = selectedBill.header?.branchId;
    const bName = selectedBill.header?.branchName;
    const allBranches = branches && branches.length > 0 ? branches : defaultBranches;
    return allBranches.find(b => b.id === bId) || (bName ? { id: bId || '', name: bName, type: 'showroom' as const, address: selectedBill.header?.address || selectedBill.company?.address || '', phone: selectedBill.company?.phone || '', email: selectedBill.company?.email || '' } : allBranches[0]);
  }, [selectedBill, branches]);

  const selectedBillBranchAddress = useMemo(() => {
    return getBranchAddressDetails(selectedBillBranch, selectedBill?.company?.phone, selectedBill?.company?.email);
  }, [selectedBillBranch, selectedBill]);
  const [billToPrint, setBillToPrint] = useState<StoredBill | null>(null);
  const [previewingBill, setPreviewingBill] = useState<StoredBill | null>(null);
  const [previewZoom, setPreviewZoom] = useState<'80%' | '100%' | '115%'>('100%');
  const [showPrinterAutoConfigModal, setShowPrinterAutoConfigModal] = useState(false);

  // Helper for dynamic font size auto-adjustment so Party Name & Address fit on one line
  const getDynamicPartyFontSize = (partyName: string | undefined, baseNum: number = 12) => {
    const name = (partyName || '').trim();
    if (!name) return `${baseNum}px`;
    const len = name.length;
    if (len <= 20) return `${baseNum}px`;
    if (len <= 28) return `${Math.max(10, baseNum - 1)}px`;
    if (len <= 36) return `${Math.max(9.5, baseNum - 2)}px`;
    if (len <= 45) return `${Math.max(8.5, baseNum - 3)}px`;
    return `${Math.max(8, baseNum - 4)}px`;
  };

  const getDynamicAddressFontSize = (address: string | undefined, baseNum: number = 12) => {
    const addr = (address || '').trim();
    if (!addr) return `${baseNum}px`;
    const len = addr.length;
    if (len <= 26) return `${baseNum}px`;
    if (len <= 38) return `${Math.max(10, baseNum - 1)}px`;
    if (len <= 50) return `${Math.max(9, baseNum - 2)}px`;
    return `${Math.max(8, baseNum - 3)}px`;
  };
  const [quickPrintMenuBillId, setQuickPrintMenuBillId] = useState<string | null>(null);
  const [quickPrintMenuAnchor, setQuickPrintMenuAnchor] = useState<{
    top: number;
    left: number;
    placement: 'bottom' | 'top';
    bill: StoredBill;
  } | null>(null);
  const [viewingReceivedCopyBill, setViewingReceivedCopyBill] = useState<StoredBill | null>(null);

  useEffect(() => {
    if (!quickPrintMenuBillId) {
      setQuickPrintMenuAnchor(null);
      return;
    }
    const handleClose = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('.quick-print-menu-container') || target.closest('[data-quick-print-portal="true"]'))) {
        return;
      }
      setQuickPrintMenuBillId(null);
    };
    const handleScrollOrResize = () => setQuickPrintMenuBillId(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickPrintMenuBillId(null);
    };
    document.addEventListener('mousedown', handleClose);
    document.addEventListener('touchstart', handleClose);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('touchstart', handleClose);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [quickPrintMenuBillId]);

  // Pad Header Mode: 'plain' (Pad with Logo), 'hide_logo' (Without Logo), 'hide_all' (Slip Pad / Hide All)
  const [padHeaderMode, setPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all'>(() => {
    try {
      const saved = localStorage.getItem('polycables_pad_header_mode');
      if (saved === 'plain' || saved === 'hide_logo' || saved === 'hide_all') {
        return saved;
      }
    } catch (e) {}
    return 'hide_logo';
  });

  useEffect(() => {
    try {
      localStorage.setItem('polycables_pad_header_mode', padHeaderMode);
    } catch (e) {}
  }, [padHeaderMode]);

  // Global print preview shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Auto-Fix Printer dialog: Alt+A
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowPrinterAutoConfigModal(true);
        return;
      }

      if (selectedBill) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedBill(null);
          return;
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
          e.preventDefault();
          const b = selectedBill;
          setSelectedBill(null);
          setBillToPrint(b);
          return;
        }
      }

      if (previewingBill) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPreviewingBill(null);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setBillToPrint(previewingBill);
          setTimeout(() => triggerAutoConfiguredPrint('bill'), 100);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewingBill, selectedBill]);

  // Close quick print menu when clicking/touching outside or pressing Escape
  useEffect(() => {
    const handleOutsideMenuClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.quick-print-menu-container')) {
        setQuickPrintMenuBillId(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickPrintMenuBillId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideMenuClick);
    document.addEventListener('touchstart', handleOutsideMenuClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMenuClick);
      document.removeEventListener('touchstart', handleOutsideMenuClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handlePrintStoredBill = (bill: StoredBill, mode?: 'plain' | 'hide_logo' | 'hide_all') => {
    if (mode) {
      setPadHeaderMode(mode);
      setBillToPrint(bill);
    } else {
      // Open Print Preview Modal with option selectors
      setBillToPrint(bill);
      setPreviewingBill(bill);
    }
  };
  const [receivedCopyZoom, setReceivedCopyZoom] = useState<'fit' | '100%' | '150%'>('fit');
  const [isProcessingCopyForId, setIsProcessingCopyForId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [emailModalBill, setEmailModalBill] = useState<StoredBill | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetUploadBillIdRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSortClick = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'partyName' || col === 'address' ? 'asc' : 'desc');
    }
  };

  const handleTriggerUpload = (billId: string) => {
    targetUploadBillIdRef.current = billId;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const billId = targetUploadBillIdRef.current;
    if (!file || !billId || !onUpdateReceivedCopy) return;

    try {
      setIsProcessingCopyForId(billId);
      const rawDataUrl = await readFileAsDataUrl(file);
      const optimizedDataUrl = await compressImageIfNeeded(rawDataUrl, 1600, 1600, 0.85);
      const nowIso = new Date().toISOString();

      onUpdateReceivedCopy(billId, optimizedDataUrl, file.name, nowIso);

      if (selectedBill && selectedBill.id === billId) {
        setSelectedBill({
          ...selectedBill,
          receivedCopy: optimizedDataUrl,
          receivedCopyName: file.name,
          receivedCopyDate: nowIso,
          header: {
            ...selectedBill.header,
            receivedCopy: optimizedDataUrl,
            receivedCopyName: file.name,
            receivedCopyDate: nowIso
          }
        });
      }

      if (viewingReceivedCopyBill && viewingReceivedCopyBill.id === billId) {
        setViewingReceivedCopyBill({
          ...viewingReceivedCopyBill,
          receivedCopy: optimizedDataUrl,
          receivedCopyName: file.name,
          receivedCopyDate: nowIso,
          header: {
            ...viewingReceivedCopyBill.header,
            receivedCopy: optimizedDataUrl,
            receivedCopyName: file.name,
            receivedCopyDate: nowIso
          }
        });
      }

      showToast('Received copy attached successfully!');
    } catch (err: any) {
      console.error('Error attaching received copy:', err);
      showToast(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessingCopyForId(null);
      targetUploadBillIdRef.current = null;
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveReceivedCopy = (billId: string) => {
    if (!onUpdateReceivedCopy) return;
    onUpdateReceivedCopy(billId, undefined, undefined, undefined);

    if (selectedBill && selectedBill.id === billId) {
      setSelectedBill({
        ...selectedBill,
        receivedCopy: undefined,
        receivedCopyName: undefined,
        receivedCopyDate: undefined,
        header: {
          ...selectedBill.header,
          receivedCopy: undefined,
          receivedCopyName: undefined,
          receivedCopyDate: undefined
        }
      });
    }

    if (viewingReceivedCopyBill && viewingReceivedCopyBill.id === billId) {
      setViewingReceivedCopyBill(null);
    }

    showToast('Received copy removed.');
  };

  // Distinct Parties List for Filter Dropdown
  const uniqueParties = useMemo(() => {
    const map = new Map<string, number>();
    const isAll = !selectedBranch || selectedBranch.toLowerCase() === 'all' || selectedBranch.toLowerCase() === 'all sales centers' || selectedBranch.toLowerCase().startsWith('all sales center');
    const branchBills = isAll
      ? storedBills
      : storedBills.filter((b) => billMatchesBranch(b, selectedBranch, effectiveBranches, salespersons, parties));

    branchBills.forEach((b) => {
      const name = (b.header.partyName || '').trim();
      if (name) {
        map.set(name, (map.get(name) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [storedBills, selectedBranch, effectiveBranches, salespersons, parties]);

  // Filtered Parties for the Dynamic Party Filter
  const filteredFilterParties = useMemo(() => {
    if (isShowingAllFilterParties || !partyFilterSearch.trim()) {
      return uniqueParties;
    }
    const q = partyFilterSearch.toLowerCase().trim();
    return uniqueParties.filter((p) => p.name.toLowerCase().includes(q));
  }, [uniqueParties, partyFilterSearch, isShowingAllFilterParties]);

  // Helper to resolve salesman full name from code or name
  const getSalespersonFullName = (codeOrName: string = '') => {
    if (!codeOrName) return '';
    const clean = codeOrName.trim().toLowerCase();
    const found = salespersons.find(
      (sp) =>
        (sp.code || '').trim().toLowerCase() === clean ||
        (sp.name || '').trim().toLowerCase() === clean ||
        (sp.id || '').trim().toLowerCase() === clean
    );
    return found ? found.name : codeOrName.trim();
  };

  // Distinct Salespersons List for Filter Dropdown - Show Full Name Only (Auto-filtered by Sales Center)
  // Only include registered salespersons belonging to the selected / allowed sales center
  const uniqueSalespersons = useMemo(() => {
    const nameMap = new Map<string, string>();
    const allowedSalespersons = filterSalespersonsByBranch(salespersons, selectedBranch, effectiveBranches, currentUser);

    allowedSalespersons.forEach((sp) => {
      if (sp.name) nameMap.set(sp.name, sp.name);
    });

    const isAll = !selectedBranch || selectedBranch.toLowerCase() === 'all' || selectedBranch.toLowerCase() === 'all sales centers' || selectedBranch.toLowerCase().startsWith('all sales center');
    const branchBills = isAll
      ? storedBills
      : storedBills.filter((b) => billMatchesBranch(b, selectedBranch, effectiveBranches, salespersons, parties));

    branchBills.forEach((b) => {
      const spRaw = (b.header.salesmanCode || (b as any).salesmanCode || b.header.salespersonName || (b as any).salespersonName || '').trim();
      if (!spRaw) return;
      const clean = spRaw.toLowerCase();
      const matched = allowedSalespersons.find(
        (sp) =>
          (sp.code || '').trim().toLowerCase() === clean ||
          (sp.name || '').trim().toLowerCase() === clean ||
          (sp.id || '').trim().toLowerCase() === clean
      );
      if (matched && matched.name && !nameMap.has(matched.name)) {
        nameMap.set(matched.name, matched.name);
      }
    });

    return Array.from(nameMap.values()).sort((a, b) => a.localeCompare(b));
  }, [storedBills, salespersons, selectedBranch, effectiveBranches, parties, currentUser]);

  // Remove / clear salesman name from a specific bill
  const handleRemoveBillSalesman = (billId: string) => {
    if (onUpdateSalesman) {
      onUpdateSalesman(billId, '', '');
    }
    if (selectedBill && selectedBill.id === billId) {
      setSelectedBill({
        ...selectedBill,
        header: {
          ...selectedBill.header,
          salesmanCode: '',
          salespersonName: ''
        }
      });
    }
  };

  // Auto-reset salesperson & party if not present in the current branch's lists
  useEffect(() => {
    if (
      selectedSalesperson !== 'all' &&
      !uniqueSalespersons.some((sp) => sp.toLowerCase() === selectedSalesperson.toLowerCase())
    ) {
      setSelectedSalesperson('all');
    }
  }, [uniqueSalespersons, selectedSalesperson]);

  useEffect(() => {
    if (
      selectedParty !== 'all' &&
      !uniqueParties.some((p) => p.name.toLowerCase() === selectedParty.toLowerCase())
    ) {
      setSelectedParty('all');
      setPartyFilterSearch('');
    }
  }, [uniqueParties, selectedParty]);

  // Date input handlers
  const handleFromDateInputChange = (val: string) => {
    setFromDateText(val);
    setDatePreset('custom');
    if (!val.trim()) {
      setStartDate('');
      return;
    }
    const iso = parseDateToISO(val);
    if (iso) {
      setStartDate(iso);
    }
  };

  const handleToDateInputChange = (val: string) => {
    setToDateText(val);
    setDatePreset('custom');
    if (!val.trim()) {
      setEndDate('');
      return;
    }
    const iso = parseDateToISO(val);
    if (iso) {
      setEndDate(iso);
    }
  };

  // Quick Date Preset Handler
  const handleDatePresetChange = (preset: StandardPeriodPreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setFromDateText('');
      setToDateText('');
      return;
    }
    if (preset === 'custom') {
      return;
    }
    const range = calculatePeriodDates(preset);
    setFromDateText(range.startDate);
    setToDateText(range.endDate);
    setStartDate(parseDateToISO(range.startDate) || '');
    setEndDate(parseDateToISO(range.endDate) || '');
  };

  // Reset All Filters
  const handleResetFilters = () => {
    setSearch('');
    setFilterCopyStatus('all');
    setSelectedBranch(!isSuperOrAccounts && uniqueBranchOptions.length === 1 ? uniqueBranchOptions[0].id : 'all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setFromDateText('');
    setToDateText('');
    setSelectedParty('all');
    setPartyFilterSearch('');
    setIsPartyFilterOpen(false);
    setIsShowingAllFilterParties(false);
    setSelectedSalesperson('all');
    setSortColumn('date');
    setSortDirection('desc');
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    filterCopyStatus !== 'all' ||
    selectedBranch !== 'all' ||
    datePreset !== 'all' ||
    startDate ||
    endDate ||
    fromDateText ||
    toDateText ||
    selectedParty !== 'all' ||
    selectedSalesperson !== 'all' ||
    sortColumn !== 'date' ||
    sortDirection !== 'desc'
  );

  const activeFiltersCount = [
    Boolean(search.trim()),
    filterCopyStatus !== 'all',
    selectedBranch !== 'all',
    datePreset !== 'all' || Boolean(startDate || endDate || fromDateText || toDateText),
    selectedParty !== 'all',
    selectedSalesperson !== 'all',
    sortColumn !== 'date' || sortDirection !== 'desc'
  ].filter(Boolean).length;

  const {
    countDraft,
    countShowroom,
    countOffice,
    countWithCopy,
    countPendingCopy,
    countAll,
    totalSalesAllTime
  } = useMemo(() => {
    let drafts = 0;
    let showroom = 0;
    let office = 0;
    let withCopy = 0;
    let pendingCopy = 0;
    let all = 0;
    let totalSales = 0;

    for (const b of storedBills) {
      if (!b) continue;
      totalSales += (b.grandTotal || 0);
      all++; // All 43 stored bills are counted in countAll
      const isDraft = Boolean(b.isDraft || b.header?.isDraft || b.status === 'draft');
      if (isDraft) {
        drafts++;
      } else {
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        if (isOffice) office++; else showroom++;
        const hasCopy = Boolean(b.receivedCopy || b.header?.receivedCopy);
        if (hasCopy) withCopy++; else pendingCopy++;
      }
    }

    return {
      countDraft: drafts,
      countShowroom: showroom,
      countOffice: office,
      countWithCopy: withCopy,
      countPendingCopy: pendingCopy,
      countAll: all,
      totalSalesAllTime: totalSales
    };
  }, [storedBills]);

  // Filter and Sort Bills
  const filteredBills = useMemo(() => {
    return storedBills
      .filter((b) => {
        if (!b) return false;
        const isDraft = Boolean(b.isDraft || b.header?.isDraft || b.status === 'draft');
        const hasCopy = Boolean(b.receivedCopy || b.header?.receivedCopy);
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);

        // 1. Copy / Draft / Bill Type Tab Filter
        if (filterCopyStatus === 'all') {
          // 'all' shows all bills unconditionally (including drafts with badge) so all 43 bills are visible
        } else if (filterCopyStatus === 'draft') {
          if (!isDraft) return false;
        } else {
          // If viewing specific sub-category (regular, office, with_copy, pending_copy), exclude draft bills
          if (isDraft) return false;

          if (filterCopyStatus === 'with_copy' && !hasCopy) return false;
          if (filterCopyStatus === 'pending_copy' && hasCopy) return false;
          if (filterCopyStatus === 'office' && !isOffice) return false;
          if (filterCopyStatus === 'regular' && isOffice) return false;
        }

        // 2. Sales Center (Branch) Filter
        const isAllBranch = !selectedBranch || selectedBranch.toLowerCase() === 'all' || selectedBranch.toLowerCase() === 'all sales centers' || selectedBranch.toLowerCase().startsWith('all sales center');
        if (!isAllBranch) {
          if (!billMatchesBranch(b, selectedBranch, effectiveBranches, salespersons, parties)) {
            return false;
          }
        }

        // 3. Party Filter
        if (selectedParty !== 'all' && String(b?.header?.partyName || '').trim().toLowerCase() !== selectedParty.toLowerCase()) {
          return false;
        }

        // 4. Salesperson Filter (Matches resolved full name, code, createdBy, or matched party)
        if (selectedSalesperson !== 'all') {
          const billSpCode = String(b?.header?.salesmanCode || (b as any)?.salesmanCode || '').trim();
          const billSpName = String(b?.header?.salespersonName || (b as any)?.salespersonName || '').trim();
          const billCreatedBy = String(b?.header?.createdBy || (b as any)?.createdBy || '').trim();
          const matchedParty = findPartyForBill(b, parties, salespersons, effectiveBranches);
          const partySpCode = String(matchedParty?.salesmanCode || '').trim();
          const partySpName = String(matchedParty?.salespersonName || '').trim();

          const targetSpLower = selectedSalesperson.toLowerCase();
          const candidates = [
            billSpCode ? getSalespersonFullName(billSpCode).toLowerCase() : '',
            billSpName ? getSalespersonFullName(billSpName).toLowerCase() : '',
            billSpCode.toLowerCase(),
            billSpName.toLowerCase(),
            billCreatedBy.toLowerCase(),
            partySpCode ? getSalespersonFullName(partySpCode).toLowerCase() : '',
            partySpName ? getSalespersonFullName(partySpName).toLowerCase() : ''
          ].filter(Boolean);

          if (!candidates.some((c) => c === targetSpLower || c.includes(targetSpLower))) {
            return false;
          }
        }

        // 5. Date Range Filter (Only active when period preset is not 'all')
        if (datePreset !== 'all' && (startDate || endDate)) {
          const billIso = parseDateToISO(b?.header?.date || (b as any).date || b?.savedAt);
          if (billIso) {
            if (startDate && billIso < startDate) return false;
            if (endDate && billIso > endDate) return false;
          }
        }

        // 5. Search Text Filter
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const pName = String(b?.header?.partyName || '').toLowerCase();
          const bNo = String(b?.header?.billNo || '').toLowerCase();
          const bDate = String(b?.header?.date || '').toLowerCase();
          const bAddr = String(b?.header?.address || '').toLowerCase();
          const rcName = String(b?.receivedCopyName || b?.header?.receivedCopyName || '').toLowerCase();
          const spCode = String(b?.header?.salesmanCode || '').toLowerCase();
          const ordNo = String(b?.header?.orderNumber || '').toLowerCase();
          const refNo = String(b?.header?.refNo || '').toLowerCase();
          const chNo = String(b?.header?.challanNo || '').toLowerCase();
          const brName = String(b?.branchName || b?.header?.branchName || (b?.header as any)?.salesCenter || '').toLowerCase();
          const matchItems = Array.isArray(b?.lines)
            ? b.lines.some((l) => matchesFlexibleSearch(l?.itemDescription || '', q))
            : false;

          const matches =
            pName.includes(q) ||
            bNo.includes(q) ||
            bDate.includes(q) ||
            bAddr.includes(q) ||
            rcName.includes(q) ||
            spCode.includes(q) ||
            ordNo.includes(q) ||
            refNo.includes(q) ||
            chNo.includes(q) ||
            brName.includes(q) ||
            matchItems;

          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortColumn === 'date') {
          const dateA = parseDateToISO(a?.header?.date) || a?.header?.date || '';
          const dateB = parseDateToISO(b?.header?.date) || b?.header?.date || '';
          cmp = dateA.localeCompare(dateB);
        } else if (sortColumn === 'partyName') {
          cmp = String(a?.header?.partyName || '').localeCompare(String(b?.header?.partyName || ''));
        } else if (sortColumn === 'address') {
          cmp = String(a?.header?.address || '').localeCompare(String(b?.header?.address || ''));
        } else if (sortColumn === 'billNo') {
          const numA = parseInt(String(a?.header?.billNo || '').replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(String(b?.header?.billNo || '').replace(/\D/g, ''), 10) || 0;
          cmp = numA - numB;
          if (cmp === 0) {
            cmp = String(a?.header?.billNo || '').localeCompare(String(b?.header?.billNo || ''));
          }
        } else if (sortColumn === 'receivedCopy') {
          const hasA = Boolean(a?.receivedCopy || a?.header?.receivedCopy) ? 1 : 0;
          const hasB = Boolean(b?.receivedCopy || b?.header?.receivedCopy) ? 1 : 0;
          cmp = hasA - hasB;
        } else if (sortColumn === 'amount') {
          cmp = (a?.grandTotal || 0) - (b?.grandTotal || 0);
        }

        return sortDirection === 'asc' ? cmp : -cmp;
      });
  }, [storedBills, filterCopyStatus, selectedBranch, effectiveBranches, parties, salespersons, selectedParty, selectedSalesperson, datePreset, startDate, endDate, search, sortColumn, sortDirection]);

  // Total pages calculation
  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    const size = typeof pageSize === 'number' ? pageSize : 18;
    return Math.max(1, Math.ceil(filteredBills.length / size));
  }, [filteredBills.length, pageSize]);

  // Ensure current page is within valid range
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Sliced paginated bills for current view (Default 18 per page)
  const paginatedBills = useMemo(() => {
    if (pageSize === 'all') return filteredBills;
    const size = typeof pageSize === 'number' ? pageSize : 18;
    const start = (currentPage - 1) * size;
    return filteredBills.slice(start, start + size);
  }, [filteredBills, currentPage, pageSize]);

  // When a bill is highlighted, switch to the page containing it
  useEffect(() => {
    if (highlightedBillId && pageSize !== 'all') {
      const idx = filteredBills.findIndex((b) => b.id === highlightedBillId);
      if (idx !== -1) {
        const size = typeof pageSize === 'number' ? pageSize : 18;
        const targetPage = Math.floor(idx / size) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [highlightedBillId, filteredBills, pageSize]);

  const { filteredTotalSales, filteredWithCopyCount } = useMemo(() => {
    let sales = 0;
    let withCopy = 0;
    for (const b of filteredBills) {
      sales += (b.grandTotal || 0);
      if (b.receivedCopy || b.header?.receivedCopy) withCopy++;
    }
    return { filteredTotalSales: sales, filteredWithCopyCount: withCopy };
  }, [filteredBills]);

  // Set focus to the target bill row without moving the page
  useEffect(() => {
    if (highlightedBillId) {
      const timer = setTimeout(() => {
        const rowEl = document.getElementById(`stored-bill-row-${highlightedBillId}`);
        if (rowEl) {
          rowEl.focus({ preventScroll: true });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [highlightedBillId]);

  return (
    <div className="font-sans w-full flex-1 flex flex-col">
      {/* ========================================================================= */}
      {/* MAIN DIRECTORY INTERACTIVE VIEW (Hidden completely on print) */}
      {/* ========================================================================= */}
      <div className="w-full flex-1 flex flex-col gap-1.5 no-print">
        {/* Hidden Global File Input for Received Copy Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl shadow-2xl border border-emerald-500 animate-in fade-in slide-in-from-top-3 flex items-center space-x-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Directory Header Bar (Unified across PC & Android) */}
        <div className="cyber-glass-card text-white px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-2.5 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-sm sm:text-base font-black tracking-tight text-cyan-200 px-1">
              Bill Directory
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 font-mono">
              {filteredBills.length} / {storedBills.length} Bills
            </span>
          </div>
          <input
            ref={directFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.jpeg,.jpg,.png,.webp,.bmp,.tiff,.json,image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleDirectFileSelected}
            className="hidden"
          />
        </div>

      {/* GLOBAL CONTROLS & FILTER BAR (IDENTICAL ON PC & ANDROID) */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl p-2.5 px-3 sm:px-3.5 rounded-2xl border border-cyan-500/25 shadow-lg flex flex-col space-y-2 text-xs text-white shrink-0 no-print">
        {/* Row 1: Core Dimension Filters & Item Report */}
        <div className="flex items-center gap-2 flex-wrap py-0.5 relative z-20">
          {/* Sales Center Filter */}
          <div className="w-full sm:w-auto sm:shrink-0">
            <SalesCenterSearchFilter
              value={selectedBranch}
              onChange={(newBranch) => {
                setSelectedBranch(newBranch);
                setSelectedSalesperson('all');
                setSelectedParty('all');
                setPartyFilterSearch('');
                setCurrentPage(1);
              }}
              options={uniqueBranchOptions.map((b) => ({ id: b.id, name: b.name, label: b.name }))}
              isLocked={!isSuperOrAccounts && uniqueBranchOptions.length <= 1}
              lockedReason={`Locked to assigned sales center`}
              includeAllOption={isSuperOrAccounts || uniqueBranchOptions.length > 1}
              allOptionLabel={
                isSuperOrAccounts
                  ? `All Sales Centers (${salesCentersCount})`
                  : `All Assigned Centers (${salesCentersCount})`
              }
              allOptionValue="all"
              label="Sales Center:"
              theme="dark"
              size="xs"
              widthClass="min-w-0 w-full sm:w-auto sm:min-w-[210px] sm:max-w-[300px]"
            />
          </div>

          {/* Bill Type & Copy Status */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 w-full sm:w-auto shrink-0 h-[34px]">
            <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Bill Type:</span>
            <select
              value={filterCopyStatus}
              onChange={(e) => {
                setFilterCopyStatus(e.target.value as any);
                setCurrentPage(1);
              }}
              className="flex-1 sm:flex-initial min-w-0 bg-transparent text-amber-300 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Bills ({countAll})</option>
              <option value="regular" className="bg-[#091e2c] text-white">Showroom Bills ({countShowroom})</option>
              <option value="office" className="bg-[#091e2c] text-white">Office Bills ({countOffice})</option>
              <option value="draft" className="bg-[#091e2c] text-white">Draft Bills ({countDraft})</option>
              <option value="with_copy" className="bg-[#091e2c] text-white">Received Copies ({countWithCopy})</option>
              <option value="pending_copy" className="bg-[#091e2c] text-white">Pending Copies ({countPendingCopy})</option>
            </select>
          </div>

          {/* Item Report Button */}
          <button
            type="button"
            onClick={() => setIsItemQtyReportOpen(true)}
            className="bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs px-2.5 py-1 h-[34px] rounded-xl font-bold flex items-center space-x-1.5 border border-indigo-400/50 cursor-pointer shadow-xs transition-colors shrink-0 relative z-30"
            title="Item-wise total quantity summary report"
          >
            <Boxes className="w-3.5 h-3.5 text-indigo-200" />
            <span>Item Report</span>
          </button>

          {/* Salesperson Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 flex-1 sm:flex-initial min-w-[160px] shrink-0 h-[34px]">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Salesman:</span>
            <select
              value={selectedSalesperson}
              onChange={(e) => {
                setSelectedSalesperson(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 sm:flex-initial min-w-0 bg-transparent text-cyan-100 font-bold text-xs sm:max-w-[190px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Salesmen</option>
              {uniqueSalespersons.map((fullName, fIdx) => (
                <option key={`${fullName}-${fIdx}`} value={fullName} className="bg-[#091e2c] text-white">
                  {fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Customer / Party Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 flex-1 sm:flex-initial min-w-[160px] shrink-0 h-[34px]">
            <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Party:</span>
            <select
              value={selectedParty}
              onChange={(e) => {
                setSelectedParty(e.target.value);
                setPartyFilterSearch(e.target.value === 'all' ? '' : e.target.value);
              }}
              className="flex-1 sm:flex-initial min-w-0 bg-transparent text-cyan-100 font-bold text-xs sm:max-w-[190px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Parties ({uniqueParties.length})</option>
              {uniqueParties.map((p, pIdx) => (
                <option key={`${p.name}-${pIdx}`} value={p.name} className="bg-[#091e2c] text-white">
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Period Presets, Custom Range, Search Box, Found Count & Reset */}
        <div className="pt-2 border-t border-cyan-500/20 flex items-center gap-2 flex-wrap">
          <StandardPeriodFilterBar
            period={datePreset}
            onSelectPeriod={handleDatePresetChange}
            customStartDate={fromDateText}
            customEndDate={toDateText}
            onCustomStartDateChange={handleFromDateInputChange}
            onCustomEndDateChange={handleToDateInputChange}
            theme="dark"
          />

          {/* Search Box with Clear Button on same line */}
          <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bills by party, bill #, address, items, salesman..."
              className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Found Count */}
          <div className="text-[11px] text-cyan-200 font-bold flex items-center space-x-1 shrink-0 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
            <span>{filteredBills.length} bills found</span>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Reset search and filters to default"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Stored Bills Table List View */}
      {isCloudLoading && storedBills.length === 0 ? (
        <div className="cyber-glass-card rounded-2xl p-8 text-center text-slate-300 space-y-2 flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <h3 className="text-sm font-bold text-white">Connecting to Live Cloud Database...</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Retrieving stored bills directly from Firestore Cloud for all users.
          </p>
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="cyber-glass-card rounded-2xl p-8 text-center text-slate-300 space-y-2 flex-1 flex flex-col items-center justify-center">
          <FolderOpen className="w-10 h-10 text-cyan-400/60" />
          <h3 className="text-sm font-bold text-white">No Stored Bills Found</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            {filterCopyStatus !== 'all'
              ? 'No bills match the selected Received Copy filter.'
              : 'Create an invoice in the Bill Generator and click "Save Bill" to store invoices here.'}
          </p>
        </div>
      ) : (
        <div className="cyber-glass-card rounded-2xl w-full flex-1 flex flex-col overflow-hidden">
          <div className="w-full flex-1 overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 font-bold uppercase tracking-wider text-[11px] select-none shadow-md">
                <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase tracking-wider text-[11px] select-none">
                  {/* Clickable Header: Date */}
                  <th
                    onClick={() => handleSortClick('date')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 w-28 cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Date"
                  >
                    <div className="flex items-center justify-between space-x-1">
                      <span>Date</span>
                      {sortColumn === 'date' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Clickable Header: Party Name */}
                  <th
                    onClick={() => handleSortClick('partyName')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Party Name"
                  >
                    <div className="flex items-center justify-between space-x-1">
                      <span>Party Name</span>
                      {sortColumn === 'partyName' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Clickable Header: Address */}
                  <th
                    onClick={() => handleSortClick('address')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Address"
                  >
                    <div className="flex items-center justify-between space-x-1">
                      <span>Address</span>
                      {sortColumn === 'address' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Clickable Header: Bill No */}
                  <th
                    onClick={() => handleSortClick('billNo')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 w-28 text-center cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Bill No"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>Bill No</span>
                      {sortColumn === 'billNo' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Clickable Header: Received Copy */}
                  <th
                    onClick={() => handleSortClick('receivedCopy')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 w-36 text-center cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Received Copy status"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span>Received Copy</span>
                      {sortColumn === 'receivedCopy' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Clickable Header: Amount */}
                  <th
                    onClick={() => handleSortClick('amount')}
                    className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 w-32 text-right cursor-pointer hover:bg-[#11334b] transition-colors shadow-xs"
                    title="Click to sort by Grand Total Amount"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Amount</span>
                      {sortColumn === 'amount' ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                      )}
                    </div>
                  </th>

                  {/* Actions Header */}
                  <th className="sticky top-0 z-30 bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 py-2.5 px-3 w-40 text-center whitespace-nowrap shadow-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 font-sans text-slate-200">
                {paginatedBills.map((bill) => {
                  const copyData = bill.receivedCopy || bill.header.receivedCopy;
                  const copyName = bill.receivedCopyName || bill.header.receivedCopyName;
                  const isProcessing = isProcessingCopyForId === bill.id;
                  const isHighlighted = highlightedBillId === bill.id;

                  return (
                    <tr
                      id={`stored-bill-row-${bill.id}`}
                      tabIndex={0}
                      key={bill.id}
                      className={`transition-all cursor-pointer group outline-none ${
                        isHighlighted
                          ? 'bg-cyan-500/20 ring-1 ring-cyan-400 shadow-md font-semibold text-white'
                          : 'hover:bg-cyan-500/[0.06]'
                      }`}
                      onClick={() => {
                        setSelectedBill(bill);
                        setHighlightedBillId(bill.id);
                      }}
                    >
                      {/* Date */}
                      <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className={`w-3.5 h-3.5 ${isHighlighted ? 'text-cyan-300' : 'text-cyan-400/60 group-hover:text-cyan-300'}`} />
                          <span>{formatDateDDMMYY(bill.header.date) || 'N/A'}</span>
                          {isHighlighted && (
                            <span className="ml-1 bg-cyan-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                              Active
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Party Name (Single Line with Salesman Code) */}
                      <td className="py-1.5 px-2.5 font-bold text-white max-w-[240px] whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 overflow-hidden">
                          <User className="w-3.5 h-3.5 text-cyan-400/60 shrink-0" />
                          <span className="truncate block" title={bill.header.partyName || 'Unnamed Party'}>
                            {bill.header.partyName || 'Unnamed Party'}
                          </span>
                          {(bill.header.salesmanCode || bill.header.salespersonName) && (
                            <span
                              className="text-[9.5px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.2 rounded shrink-0 ml-1"
                              title={`Sales Person: ${bill.header.salespersonName || ''} (${bill.header.salesmanCode || ''})`}
                            >
                              {bill.header.salesmanCode || bill.header.salespersonName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Address */}
                      <td className="py-1.5 px-2.5 text-slate-300 max-w-xs truncate">
                        {bill.header.address || '-'}
                      </td>

                      {/* Bill No & Badge */}
                      <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center space-x-1.5">
                          <span className="font-mono font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded border border-emerald-400/35 text-xs">
                            #{formatAdminBillNo(bill.header.billNo, bill.branchName || bill.header.branchName || bill.branchId || bill.header.branchId, Boolean(bill.isOfficeBill || bill.header?.isOfficeBill)) || 'N/A'}
                          </span>
                          {Boolean(bill.isDraft || bill.header?.isDraft || bill.status === 'draft') ? (
                            <span className="inline-flex items-center space-x-1 bg-amber-500/25 text-amber-200 border border-amber-400/50 font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-tight shadow-2xs" title="Draft Bill (Excluded from stock & reports)">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse"></span>
                              <span>Draft</span>
                            </span>
                          ) : !(bill.isOfficeBill || bill.header.isOfficeBill) ? (
                            <span className="inline-flex items-center space-x-1 bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-tight shadow-2xs" title="Showroom Sale Bill">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse"></span>
                              <span>Showroom</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 bg-purple-500/25 text-purple-200 border border-purple-400/50 font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-tight shadow-2xs" title="Office Sale Bill">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-300"></span>
                              <span>Office</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Received Copy Column (Upload sign only) */}
                      <td
                        className="py-1.5 px-2.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isProcessing ? (
                          <div className="inline-flex items-center space-x-1 text-teal-200 bg-teal-500/20 px-2 py-0.5 rounded-md text-[11px] font-bold border border-teal-400/40">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-300" />
                            <span>Processing...</span>
                          </div>
                        ) : copyData ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingReceivedCopyBill(bill);
                            }}
                            className="p-1.5 inline-flex items-center justify-center bg-teal-500/25 hover:bg-teal-500/40 text-teal-200 border border-teal-400/50 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:scale-105"
                            title={`Received copy attached: ${copyName || 'Attached Proof'}. Click to view / replace`}
                          >
                            <Upload className="w-4 h-4 text-teal-300" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerUpload(bill.id);
                            }}
                            className="p-1.5 inline-flex items-center justify-center bg-white/[0.04] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-dashed border-cyan-500/30 hover:border-teal-400 rounded-lg transition-all cursor-pointer shadow-2xs hover:scale-105"
                            title="Upload received copy"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-300 text-sm">
                        ৳{bill.grandTotal ? bill.grandTotal.toLocaleString('en-IN') : '0'}
                      </td>

                      {/* Actions: Cyber Teal Glass Action Group */}
                      <td
                        className="py-1.5 px-2.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1 bg-[#061824]/80 p-1 rounded-lg border border-cyan-500/25 shadow-2xs">
                          {/* View Sign */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBill(bill);
                            }}
                            className="p-1.5 bg-white/[0.06] hover:bg-white/[0.14] text-slate-200 rounded border border-white/15 transition-colors cursor-pointer"
                            title="View Bill Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Print Sign with Mode Options Dropdown */}
                          <div className="relative inline-flex items-center rounded border border-slate-800 quick-print-menu-container">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintStoredBill(bill);
                              }}
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-l transition-colors cursor-pointer"
                              title="Print Bill (Interactive Preview)"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (quickPrintMenuBillId === bill.id) {
                                  setQuickPrintMenuBillId(null);
                                  return;
                                }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const menuWidth = 256;
                                const spaceBelow = window.innerHeight - rect.bottom - 12;
                                const shouldFlip = spaceBelow < 180 && rect.top > spaceBelow;
                                const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
                                setQuickPrintMenuAnchor({
                                  top: shouldFlip ? rect.top - 6 : rect.bottom + 6,
                                  left,
                                  placement: shouldFlip ? 'top' : 'bottom',
                                  bill
                                });
                                setQuickPrintMenuBillId(bill.id);
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-r border-l border-slate-700 transition-colors cursor-pointer"
                              title="Choose print mode: Pad Logo / Without Logo / Slip Pad"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Email Sign */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmailModalBill(bill);
                            }}
                            className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 rounded border border-cyan-400/40 transition-colors cursor-pointer"
                            title="Email Invoice to Party"
                          >
                            <Mail className="w-3.5 h-3.5 text-cyan-300" />
                          </button>

                          {/* Edit Sign */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadBill(bill);
                            }}
                            className="p-1.5 bg-blue-500/20 hover:bg-blue-500/35 text-blue-200 rounded border border-blue-400/40 transition-colors cursor-pointer"
                            title="Edit Bill in Invoice Builder"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Sign */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBill(bill.id);
                            }}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 rounded border border-rose-400/40 transition-colors cursor-pointer"
                            title="Delete Bill from Directory"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          <div className="bg-[#071824]/90 border-t border-cyan-500/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 font-sans">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-300">
                Showing{' '}
                <span className="font-bold text-white">
                  {filteredBills.length === 0
                    ? 0
                    : pageSize === 'all'
                    ? 1
                    : (currentPage - 1) * (typeof pageSize === 'number' ? pageSize : 18) + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-white">
                  {pageSize === 'all'
                    ? filteredBills.length
                    : Math.min(currentPage * (typeof pageSize === 'number' ? pageSize : 18), filteredBills.length)}
                </span>{' '}
                of <span className="font-bold text-emerald-300">{filteredBills.length}</span> bills
              </span>

              {/* Per Page Selector */}
              <div className="flex items-center space-x-1.5 ml-3 pl-3 border-l border-cyan-500/25">
                <span className="text-slate-400 font-medium">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPageSize(val === 'all' ? 'all' : parseInt(val, 10));
                    setCurrentPage(1);
                  }}
                  className="bg-[#061520] border border-cyan-500/30 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  <option value={18}>18 bills</option>
                  <option value={36}>36 bills</option>
                  <option value={50}>50 bills</option>
                  <option value="all">All ({filteredBills.length})</option>
                </select>
              </div>
            </div>

            {/* Page Navigation Buttons */}
            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-200 transition-colors cursor-pointer"
                  title="First Page"
                >
                  « First
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-200 transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  ‹ Prev
                </button>

                {/* Page Number Pills */}
                <div className="flex items-center space-x-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <React.Fragment key={`page-${p}-${idx}`}>
                          {showEllipsis && <span className="px-1 text-slate-400 font-bold">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentPage === p
                                ? 'bg-cyan-500 text-slate-950 shadow-xs'
                                : 'bg-[#0b2334] border border-cyan-500/25 text-slate-200 hover:bg-[#11334b]'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-200 transition-colors cursor-pointer"
                  title="Next Page"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-200 transition-colors cursor-pointer"
                  title="Last Page"
                >
                  Last »
                </button>
              </div>
            )}
          </div>

          {/* Bottom Utility Action Buttons (Import, Clear All, Export) */}
          <div className="flex flex-wrap items-center justify-end gap-2 mt-2 no-print">
            <button
              type="button"
              onClick={handleImportBillClick}
              disabled={isImportingFile}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              title="Import bill from Excel, PDF, image, or JSON file"
            >
              {isImportingFile ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-slate-950 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-slate-950" />
                  <span>Import Bill</span>
                </>
              )}
            </button>

            {storedBills.length > 0 && onClearAllBills && (
              <button
                onClick={onClearAllBills}
                className="bg-rose-500/15 hover:bg-rose-500/30 text-rose-200 border border-rose-500/35 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Clear stored bills history"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear All</span>
              </button>
            )}

            {storedBills.length > 0 && (
              <button
                onClick={onExportAllBills}
                className="bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                title="Export all bills to Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export (.xlsx)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portaled Quick Print Mode Dropdown (never clipped inside horizontal scroll table on PC or Android) */}
      {quickPrintMenuBillId &&
        quickPrintMenuAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-quick-print-portal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: quickPrintMenuAnchor.top,
              left: quickPrintMenuAnchor.left,
              transform: quickPrintMenuAnchor.placement === 'top' ? 'translateY(-100%)' : undefined,
              zIndex: 9999
            }}
            className="w-64 max-w-[calc(100vw-1rem)] bg-slate-900 border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-1.5 space-y-1 text-left animate-in fade-in zoom-in-95 duration-100 no-print"
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
              <span>Choose Print Mode</span>
              <span className="text-amber-400">Bill #{quickPrintMenuAnchor.bill.header.billNo}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const target = quickPrintMenuAnchor.bill;
                setQuickPrintMenuBillId(null);
                handlePrintStoredBill(target, 'plain');
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">Pad Logo (Full Header)</div>
                <div className="text-[10px] text-slate-400 leading-tight">Prints full company logo, title & address</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                const target = quickPrintMenuAnchor.bill;
                setQuickPrintMenuBillId(null);
                handlePrintStoredBill(target, 'hide_logo');
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
            >
              <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200">Pad (Hide Logo)</div>
                <div className="text-[10px] text-slate-400 leading-tight">Hides company logo for pre-printed pad</div>
              </div>
            </button>
            <div className="border-t border-slate-800 pt-1">
              <button
                type="button"
                onClick={() => {
                  const target = quickPrintMenuAnchor.bill;
                  setQuickPrintMenuBillId(null);
                  handlePrintStoredBill(target);
                }}
                className="w-full text-center py-1.5 rounded-md bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <Eye className="w-3 h-3" />
                <span>Open Interactive Preview</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Bill Details Popup Modal Window */}
      {selectedBill && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans no-print">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 space-y-4 my-4 animate-in fade-in zoom-in duration-200 text-white max-h-[95vh] flex flex-col overflow-hidden">
            {/* Modal Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/25 pb-3 flex-none">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 text-xs px-2.5 py-0.5 rounded-lg font-mono font-bold">
                  Bill Details
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Invoice #{selectedBill.header.billNo || 'N/A'}
                </h3>
                <span className="text-xs text-slate-300 truncate max-w-[200px] sm:max-w-none">({selectedBill.header.partyName || 'Unknown Party'})</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBill;
                    setSelectedBill(null);
                    setBillToPrint(b);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-xl font-bold flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
                  title="Print this bill directly"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBill;
                    setSelectedBill(null);
                    setBillToPrint(b);
                    setPreviewingBill(b);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-xl font-bold flex items-center space-x-1 shadow-sm transition-colors cursor-pointer"
                  title="Open Print Preview for this bill"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Print Preview</span>
                </button>
                <button
                  onClick={() => setSelectedBill(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Bill Content Container */}
            <div className="flex-1 overflow-auto pr-1 space-y-4">
              {/* Authentic Standard Bill (7.2" × 10") Paper Sheet Preview - Rearranged to fit strictly on a single page */}
              <div 
                className="bg-white text-black shadow-2xl border-2 border-slate-300 rounded-sm font-sans mx-auto overflow-hidden text-xs print-paper-sheet p-3 sm:p-[0.32in] print:p-[0.32in]"
                style={{
                  width: '100%',
                  maxWidth: '7.2in',
                  minHeight: 'auto',
                  boxSizing: 'border-box'
                }}
              >
                <div className="relative flex flex-col justify-between h-full space-y-1 overflow-hidden">
                  <div className="relative z-10 space-y-1.5">
                    {/* Header Banner with Logo (Height: 2.1cm fixed) */}
                    <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
                      <div
                        style={{ height: '2.1cm' }}
                        className="flex items-center justify-center"
                      >
                        <PolyCablesLogo size="xl" showSubtitle={false} subtitleText="" />
                      </div>

                      {/* 3 Address Lines - fixed with exact font */}
                      <div className="space-y-0 pt-0.5 mt-0 pb-0 mb-0">
                        <p style={{ fontSize: '13px' }} className="font-bold text-[13px] leading-tight text-black madhupur-address-line">
                          {selectedBillBranchAddress.line1}
                        </p>
                        <p style={{ fontSize: '13px' }} className="font-semibold text-[13px] leading-tight text-black madhupur-address-line">
                          {selectedBillBranchAddress.line2}
                        </p>
                        <p style={{ fontSize: '13px' }} className="font-semibold text-[13px] leading-tight text-black madhupur-address-line">
                          {selectedBillBranchAddress.line3}
                        </p>
                      </div>

                      {selectedBill.header?.isOfficeBill && (
                        <div className="pt-0.5 pb-0.5">
                          <span className="inline-block bg-amber-100 text-amber-900 border border-amber-400 px-2.5 py-0.2 rounded-md text-[9.5px] font-extrabold tracking-wide uppercase">
                            ★ OFFICE BILL (FACTORY DIRECT SALES)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Gap between Header and Party Name line */}
                    <div className="h-2 w-full flex-none" aria-hidden="true" />

                    {/* Metadata Layout: 2-Column Side-by-Side */}
                    <div className="flex flex-col sm:flex-row print:flex-row items-start justify-between w-full text-black font-sans mt-0.5 mb-0.5 gap-2 text-xs">
                      {/* Left Side: Party Name (Row 1), Address (Row 2) */}
                      <div className="w-full sm:flex-1 min-w-0 space-y-0.5">
                        {/* Row 1: Party Name */}
                        <div className="flex items-center w-full min-h-[18px]">
                          <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Party Name</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span style={{ fontSize: getDynamicPartyFontSize(selectedBill.header?.partyName, 12), lineHeight: '1.2' }} className="font-bold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                            {selectedBill.header?.partyName || '\u00A0'}
                          </span>
                        </div>

                        {/* Row 2: Address */}
                        <div className="flex items-center w-full min-h-[18px]">
                          <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Address</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span style={{ fontSize: getDynamicAddressFontSize(selectedBill.header?.address, 12), lineHeight: '1.2' }} className="font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                            {selectedBill.header?.address || '\u00A0'}
                          </span>
                        </div>
                      </div>

                      {/* Right Side: Order No, Bill No, Challan No, Ref No, Salesman Code */}
                      <div className="w-full sm:w-[260px] print:w-[260px] flex-none space-y-0.5">
                        {/* Row 1: Order No & Date */}
                        <div className="flex items-center justify-start min-h-[18px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Order No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[80px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                            {selectedBill.header?.orderNumber || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[70px] flex-none text-center pb-0">
                            {formatDateDDMMYY(selectedBill.header?.orderDate || selectedBill.header?.date) || '\u00A0'}
                          </span>
                        </div>

                        {/* Row 2: Bill No & Date */}
                        <div className="flex items-center justify-start min-h-[18px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Bill No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[80px] flex-none truncate text-center border-b border-dotted border-black pb-0 font-bold">
                            {formatAdminBillNo(selectedBill.header?.billNo, selectedBill.branchName || selectedBill.header?.branchName || selectedBill.branchId || selectedBill.header?.branchId, Boolean(selectedBill.isOfficeBill || selectedBill.header?.isOfficeBill)) || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[70px] flex-none text-center pb-0">
                            {formatDateDDMMYY(selectedBill.header?.date) || '\u00A0'}
                          </span>
                        </div>

                        {/* Row 3: Challan No & Date */}
                        <div className="flex items-center justify-start min-h-[18px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Challan No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[80px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                            {selectedBill.header?.challanNo || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[70px] flex-none text-center pb-0">
                            {formatDateDDMMYY(selectedBill.header?.challanDate || selectedBill.header?.date) || '\u00A0'}
                          </span>
                        </div>

                        {/* Row 4: Ref No */}
                        <div className="flex items-center justify-start min-h-[18px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Ref. No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[178px] flex-none text-left pb-0">
                            {selectedBill.header?.refNo || '\u00A0'}
                          </span>
                        </div>

                        {/* Row 5: Salesman Code */}
                        <div className="flex items-center justify-start min-h-[18px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Salesman Code</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[178px] flex-none text-left pb-0 truncate">
                            {selectedBill.header?.salesmanCode || getSalespersonFullName(selectedBill.header?.salesmanCode) || '\u00A0'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Table Items matching standard bill format */}
                    <div className="border-2 border-black overflow-x-auto print:overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1">
                      <table className="w-full min-w-[540px] border-collapse text-left flex-1 text-xs">
                        <thead>
                          <tr className="bg-white text-black border-b-2 border-black font-bold text-center">
                            <th className="py-1 px-1 text-center w-10 border-r border-black font-bold whitespace-nowrap">Sl No.</th>
                            <th className="py-1 px-2 text-center border-r border-black font-bold whitespace-nowrap min-w-[240px]">Name Of Items</th>
                            <th className="py-1 px-1 text-center w-14 border-r border-black font-bold whitespace-nowrap">Quantity</th>
                            <th className="py-1 px-1 text-center w-12 border-r border-black font-bold whitespace-nowrap">Unit</th>
                            <th className="py-1 px-1 text-center w-20 border-r border-black font-bold whitespace-nowrap">Price/Unit</th>
                            <th className="py-1 px-2 text-center w-22 font-bold whitespace-nowrap">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-transparent">
                          {selectedBill.lines?.map((line, idx) => (
                            <tr key={line.id || idx} className="h-5.5 font-semibold text-xs">
                              <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{String(idx + 1).padStart(2, '0')}.</td>
                              <td style={{ lineHeight: '1.25' }} className="py-0.5 px-2 border-r border-black font-semibold whitespace-normal break-words leading-tight">{line.itemDescription || ''}</td>
                              <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{line.coilQty}</td>
                              <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{formatDisplayUnit(line.unit, line.coilQty)}</td>
                              <td className="py-0.5 px-1 text-right border-r border-black font-semibold">{line.rate ? line.rate.toLocaleString('en-IN') : '0'}</td>
                              <td className="py-0.5 px-2 text-right font-semibold">{line.amount ? `${line.amount.toLocaleString('en-IN')}/-` : '0/-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-black font-semibold text-xs">
                          <tr className="border-b border-black font-semibold">
                            <td colSpan={2} className="py-0.5 px-2 text-right border-r border-black font-semibold whitespace-nowrap">Total Coils =</td>
                            <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{selectedBill.totalCoils || 0}</td>
                            <td className="py-0.5 px-1 text-center border-r border-black font-semibold">Coils</td>
                            <td className="py-0.5 px-1 text-right border-r border-black font-semibold whitespace-nowrap">Subtotal =</td>
                            <td className="py-0.5 px-2 text-right font-semibold whitespace-nowrap">{selectedBill.subtotal ? `${selectedBill.subtotal.toLocaleString('en-IN')}/-` : '0/-'}</td>
                          </tr>
                          {(selectedBill.discountAmount || 0) > 0 && (
                            <tr className="border-b border-black font-semibold">
                              <td colSpan={5} className="py-0.5 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                                Sales Discount <span className="inline-block border border-slate-300 px-1 py-0.2 rounded bg-white font-semibold">{selectedBill.header?.discountPercent || 0}</span> % =
                              </td>
                              <td className="py-0.5 px-2 text-right font-semibold text-black whitespace-nowrap">
                                {(selectedBill.discountAmount || 0).toLocaleString('en-IN')}/-
                              </td>
                            </tr>
                          )}
                          <tr className="font-semibold">
                            <td colSpan={5} className="py-0.5 px-2 text-right border-r border-black font-black whitespace-nowrap">Total =</td>
                            <td className="py-0.5 px-2 text-right font-black whitespace-nowrap">{selectedBill.grandTotal ? `${selectedBill.grandTotal.toLocaleString('en-IN')}/-` : '0/-'}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* In Word Row */}
                    <div className="pt-1 text-black flex items-center space-x-2 flex-none text-xs">
                      <span className="font-semibold text-black">In Word:</span>
                      <span className="font-bold text-black">{selectedBill.inWords}</span>
                    </div>

                    {/* Clearance space: min 5 lines normally, 3 lines when many items */}
                    <div
                      className={`${
                        (selectedBill.lines?.length || 0) >= 10
                          ? 'min-h-[42px] h-[42px]'
                          : 'min-h-[75px] h-[75px]'
                      } flex-none w-full`}
                      aria-hidden="true"
                    ></div>
                  </div>

                  {/* Signatures Block */}
                  <div className="w-full pb-0 flex-none grid grid-cols-4 gap-4 text-center text-black font-semibold text-xs mt-2">
                    <div>
                      <div className="border-t border-black pt-1">
                        Receiver's Signature
                      </div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">
                        Prepared By
                      </div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">
                        Check By
                      </div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">
                        Approved By
                      </div>
                    </div>
                  </div>

                  {/* Bottom Registered Office Footer */}
                  <div className="w-full pt-1.5 text-center text-[#0284c7] font-semibold text-[10px] leading-tight flex-none border-t border-sky-200/50 mt-1">
                    House-16, Block-C, Main Road, Aftabnagar, Dhaka-1212. Tel : (+88) 02-226602861-8, Web : www.polycables.com.bd
                  </div>
                </div>
              </div>

              {/* Received Copy Proof Section in Details Modal */}
              <div className="cyber-glass-subcard rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-[7.2in] mx-auto">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-lg ${selectedBill.receivedCopy || selectedBill.header.receivedCopy ? 'bg-teal-500/20 text-teal-300 border border-teal-400/35' : 'bg-[#061520] text-slate-400 border border-cyan-500/20'}`}>
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center space-x-2">
                      <span>Received Copy Proof</span>
                      {(selectedBill.receivedCopy || selectedBill.header.receivedCopy) && (
                        <span className="bg-teal-900/80 text-teal-300 border border-teal-500/40 text-[10px] font-bold px-2 py-0.2 rounded-full">
                          Attached ✓
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {(selectedBill.receivedCopy || selectedBill.header.receivedCopy) ? (
                        <span>
                          File: <strong className="text-slate-200">{selectedBill.receivedCopyName || selectedBill.header.receivedCopyName || 'received_copy'}</strong>
                          {(selectedBill.receivedCopyDate || selectedBill.header.receivedCopyDate) && (
                            <span className="ml-1 text-slate-400">
                              ({new Date(selectedBill.receivedCopyDate || selectedBill.header.receivedCopyDate!).toLocaleDateString('en-GB')})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>No customer/party signed received copy attached to this bill yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  {(selectedBill.receivedCopy || selectedBill.header.receivedCopy) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setViewingReceivedCopyBill(selectedBill)}
                        className="bg-teal-700 hover:bg-teal-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerUpload(selectedBill.id)}
                        className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                        title="Replace file"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleTriggerUpload(selectedBill.id)}
                      className="bg-teal-600 hover:bg-teal-500 text-white p-2 rounded-lg font-bold flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                      title="Upload Received Copy"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-cyan-500/25 flex-none">
              <div className="flex items-center space-x-1.5 text-xs text-emerald-300 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-400/30 font-semibold">
                <Layers className="w-3.5 h-3.5" />
                <span>Permanent Saved Invoice</span>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setEmailModalBill(selectedBill);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Send this saved bill via email directly from this page"
                >
                  <Mail className="w-4 h-4 text-blue-200" />
                  <span>Send Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLoadBill(selectedBill);
                    setSelectedBill(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Edit Bill in Generator</span>
                </button>
                <button
                  onClick={() => {
                    onDeleteBill(selectedBill.id);
                    setSelectedBill(null);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBill;
                    setSelectedBill(null);
                    setBillToPrint(b);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Print this bill directly"
                >
                  <Printer className="w-4 h-4 text-white" />
                  <span>Print Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBill;
                    setSelectedBill(null);
                    setBillToPrint(b);
                    setPreviewingBill(b);
                  }}
                  className="bg-[#0b2334] hover:bg-[#11334b] text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer border border-cyan-500/30"
                  title="Open Print Preview with paper size options"
                >
                  <Eye className="w-4 h-4 text-amber-400" />
                  <span>Print Preview</span>
                </button>
                <button
                  onClick={() => setSelectedBill(null)}
                  className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/20 text-xs px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Received Copy Preview Modal for Stored Bills */}
      {viewingReceivedCopyBill && (viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy) && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150 no-print">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 text-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#0c2638]/90 border-b border-cyan-500/25 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm sm:text-base font-bold text-white truncate">
                      Received Copy / Delivery Proof
                    </h3>
                    <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      Bill #{viewingReceivedCopyBill.header.billNo || '01'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    Party: <span className="text-slate-200 font-semibold">{viewingReceivedCopyBill.header.partyName || 'Customer'}</span>
                    {(viewingReceivedCopyBill.receivedCopyDate || viewingReceivedCopyBill.header.receivedCopyDate) && (
                      <span className="ml-2 text-slate-400">
                        • Attached: {new Date(viewingReceivedCopyBill.receivedCopyDate || viewingReceivedCopyBill.header.receivedCopyDate!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Top Controls */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                {(viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy)?.startsWith('data:image') && (
                  <div className="flex items-center bg-slate-950/60 p-1 rounded-lg border border-slate-700/60 space-x-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setReceivedCopyZoom('fit')}
                      className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                        receivedCopyZoom === 'fit' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Fit
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceivedCopyZoom('100%')}
                      className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                        receivedCopyZoom === '100%' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceivedCopyZoom('150%')}
                      className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                        receivedCopyZoom === '150%' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      150%
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setViewingReceivedCopyBill(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                  title="Close Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Document Preview Canvas */}
            <div className="flex-1 bg-slate-950 p-3 sm:p-5 overflow-auto flex items-center justify-center min-h-[300px] max-h-[62vh]">
              {(viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy)?.startsWith('data:image') ? (
                <div className="flex items-center justify-center w-full transition-all">
                  <img
                    src={viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy}
                    alt="Received Copy Preview"
                    referrerPolicy="no-referrer"
                    className={`rounded-lg shadow-2xl border border-slate-800 object-contain transition-all duration-150 ${
                      receivedCopyZoom === 'fit'
                        ? 'max-h-[58vh] max-w-full'
                        : receivedCopyZoom === '100%'
                        ? 'max-w-none w-auto'
                        : 'max-w-none w-[150%]'
                    }`}
                  />
                </div>
              ) : (viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy)?.startsWith('data:application/pdf') ? (
                <div className="w-full h-[58vh] bg-white rounded-lg overflow-hidden flex flex-col">
                  <iframe
                    src={viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy}
                    className="w-full h-full border-0"
                    title="Received Copy PDF Document"
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 space-y-3">
                  <FileText className="w-14 h-14 mx-auto text-slate-500" />
                  <p className="text-sm font-semibold">Attached File: {viewingReceivedCopyBill.receivedCopyName || viewingReceivedCopyBill.header.receivedCopyName || 'Document'}</p>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="px-5 py-3.5 bg-slate-800/90 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <span className="truncate max-w-[200px] font-mono text-slate-300">
                  {viewingReceivedCopyBill.receivedCopyName || viewingReceivedCopyBill.header.receivedCopyName || 'received_copy'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const dataUrl = viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy;
                    if (dataUrl) {
                      downloadDataUrl(dataUrl, viewingReceivedCopyBill.receivedCopyName || viewingReceivedCopyBill.header.receivedCopyName || `bill-${viewingReceivedCopyBill.header.billNo || '01'}-received-copy`);
                    }
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Download copy to computer"
                >
                  <Download className="w-4 h-4 text-slate-300" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const dataUrl = viewingReceivedCopyBill.receivedCopy || viewingReceivedCopyBill.header.receivedCopy;
                    if (dataUrl) {
                      printHtmlViaIframe(
                        `Received Copy - Bill #${viewingReceivedCopyBill.header.billNo || '01'}`,
                        `
                          <div style="text-align:center;">
                            <h2 style="margin-bottom:5px;color:#1e293b;">POLY CABLES - RECEIVED COPY</h2>
                            <p style="margin-top:0;margin-bottom:15px;color:#64748b;font-size:13px;">
                              Bill No: #${viewingReceivedCopyBill.header.billNo || '01'} | Party: ${viewingReceivedCopyBill.header.partyName || 'N/A'} | Date: ${formatDateDDMMYY(viewingReceivedCopyBill.header.date) || 'N/A'}
                            </p>
                            <img src="${dataUrl}" style="max-width:100%;height:auto;border:1px solid #cbd5e1;border-radius:6px;" />
                          </div>
                        `
                      );
                    }
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Print this copy directly"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Print Copy</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTriggerUpload(viewingReceivedCopyBill.id)}
                  className="bg-teal-600 hover:bg-teal-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Upload a new copy to replace current one"
                >
                  <RefreshCw className="w-4 h-4 text-teal-200" />
                  <span>Replace Copy</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveReceivedCopy(viewingReceivedCopyBill.id)}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Remove attached received copy"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewingReceivedCopyBill(null)}
                  className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ========================================================================= */}
      {/* STORED BILL PRINT PREVIEW MODAL (UNIFIED WITH CREATE NEW BILL PREVIEW) */}
      {/* ========================================================================= */}
      {(previewingBill || billToPrint) && (
        <BillPrintPreviewModal
          isOpen={!!(previewingBill || billToPrint)}
          onClose={() => {
            setPreviewingBill(null);
            setBillToPrint(null);
          }}
          branches={branches}
          autoPrintOnOpen={Boolean(billToPrint && !previewingBill)}
          initialPadHeaderMode={padHeaderMode}
          bill={previewingBill || billToPrint}
        />
      )}

      {/* Direct In-Page Email Sender Modal */}
      {emailModalBill && (
        <EmailSenderModal
          isOpen={!!emailModalBill}
          onClose={() => setEmailModalBill(null)}
          title="Send Saved Bill Invoice Email"
          storedBill={emailModalBill}
          documentType="invoice"
          onEmailSentSuccess={(res) => {
            setToastMessage(`Email sent successfully to ${res.recipient}!`);
            setTimeout(() => setToastMessage(null), 3000);
          }}
        />
      )}

      {/* Printer Auto-Config Dialog */}
      <PrinterAutoConfigModal
        isOpen={showPrinterAutoConfigModal}
        onClose={() => setShowPrinterAutoConfigModal(false)}
        documentType="bill"
      />

      {/* Item-Wise Total Quantity Report Modal */}
      <ItemWiseQuantityReportModal
        isOpen={isItemQtyReportOpen}
        onClose={() => setIsItemQtyReportOpen(false)}
        allStoredBills={storedBills}
        currentFilteredBills={filteredBills}
        items={items}
        initialScope={filterCopyStatus === 'draft' ? 'draft' : filterCopyStatus === 'regular' ? 'regular' : filterCopyStatus === 'office' ? 'office' : 'current_filter'}
      />

      {/* Unmatched Stored Bill Items Resolution Modal */}
      {isBillItemMismatchModalOpen &&
        unmatchedBillItemGroups.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-[#091e2c]/98 backdrop-blur-2xl rounded-2xl max-w-4xl w-full shadow-[0_24px_64px_rgba(0,0,0,0.75)] border border-amber-400/40 overflow-hidden flex flex-col max-h-[88vh] text-white">
              {/* Header */}
              <div className="px-5 py-4 bg-[#0c2638] border-b border-cyan-500/25 flex items-center justify-between gap-3 flex-none">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 border border-amber-400/40 rounded-xl text-amber-300 shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      Unmatched Items Found in Stored Bills ({unmatchedBillItemGroups.length})
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      These item names in previous stored bills do not match any active item in Master Item Directory. Map them to the active directory item (historical rates, quantities, discounts &amp; bill totals remain unchanged) or skip.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBillItemMismatchModalOpen(false)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                  title="Dismiss"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Unmatched Bill Items Table */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#071824]/80">
                {unmatchedBillItemGroups.map((grp) => {
                  const currentChoice = billItemMappings[grp.normKey] || '';
                  const previewBills = grp.billRefs.slice(0, 3);
                  const extraBillCount = Math.max(0, grp.billRefs.length - previewBills.length);

                  return (
                    <div
                      key={grp.normKey}
                      className="rounded-xl border border-cyan-500/25 bg-[#0b2334]/85 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-black text-amber-200 break-words">
                            {grp.rawName}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/35 font-mono">
                            {grp.lineCount} line{grp.lineCount > 1 ? 's' : ''} • {grp.billRefs.length} bill{grp.billRefs.length > 1 ? 's' : ''}
                          </span>
                          {grp.sampleRate > 0 && (
                            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/25">
                              Hist. Rate: ৳{grp.sampleRate.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-300">Bills:</span>
                          {previewBills.map((bRef, bIdx) => (
                            <span key={bRef.billId} className="inline-flex items-center gap-1 bg-[#061520] px-1.5 py-0.5 rounded border border-cyan-500/20 text-[10px] text-slate-200">
                              <span className="font-mono font-bold text-cyan-300">#{bRef.billNo}</span>
                              {bRef.date && <span className="opacity-75">({formatDateDDMMYY(bRef.date)})</span>}
                              {bIdx < previewBills.length - 1 ? '' : ''}
                            </span>
                          ))}
                          {extraBillCount > 0 && (
                            <span className="text-[10px] text-slate-400 font-semibold">
                              +{extraBillCount} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-full md:w-80 shrink-0">
                        <SearchableItemSelector
                          theme="dark"
                          options={activeMasterSelectorOptions}
                          value={currentChoice}
                          placeholder="Select active Master Item Directory match..."
                          skipLabel="Keep Original / Skip"
                          emptyOptionsMessage="No active items in Master Item Directory"
                          onChange={(val) => {
                            setBillItemMappings((prev) => ({
                              ...prev,
                              [grp.normKey]: val
                            }));
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 bg-[#0c2638] border-t border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 flex-none">
                <div className="text-xs text-slate-300">
                  Selected to update:{' '}
                  <strong className="text-emerald-300 font-mono">{mappedBillItemGroupCount}</strong> of{' '}
                  <strong className="text-white font-mono">{unmatchedBillItemGroups.length}</strong> item group(s)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBillItemMismatchModalOpen(false)}
                    className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Skip / Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyBillItemMappings}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl shadow-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {mappedBillItemGroupCount > 0
                        ? `Update ${mappedBillItemGroupCount} Selected Item(s)`
                        : 'Done (Keep All Original)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
