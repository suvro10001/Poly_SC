import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Building2,
  User,
  DollarSign,
  Calendar,
  Landmark,
  CreditCard,
  Sparkles,
  X,
  Search,
  Check,
  Tag,
  ArrowRight,
  Filter
} from 'lucide-react';
import { CollectionMR, BankDeposit, Party, Salesperson, BranchLocation, AuthUser } from '../types';
import { getBankShortCode, getAccountShortCode, generateDisplayTag, resolveFullBankName, resolveFullAccountName, BankLogoBadge } from './BankAndAccountDirectory';
import { parseExcelDateToISO, parseExcelAmount, isExcelDateValue } from './ExpenseManager';
import { computeNextSalesCenterMrNo, resolveEntityToSalesCenter } from '../utils/mrNumberHelper';
import { DateInputWithPicker } from './DateInputWithPicker';

export interface ImportedRowItem {
  id: string;
  rawIndex: number;
  date: string;
  dateValid: boolean;
  partyName: string;
  matchedParty: Party | null;
  partyNotFound: boolean;
  marketingPerson: string;
  salesmanCode: string;
  marketingPersonSource: 'excel' | 'party_profile' | 'manual';
  amount: number;
  amountValid: boolean;
  mrNo: string;
  isBankDeposit: boolean;
  bankName: string;
  accountName: string;
  displayTag: string;
  paymentType: 'cash' | 'cheque';
  chequeNo: string;
  remarks: string;
  isDuplicate: boolean;
  duplicateReason: string;
  errors: string[];
  salesCenter?: string;
  branchId?: string;
}

export interface CollectionExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  parties: Party[];
  salespersons: Salesperson[];
  branches?: BranchLocation[];
  bankList?: string[];
  accountList?: string[];
  currentUser?: AuthUser | null;
  existingCollections: CollectionMR[];
  existingDeposits?: BankDeposit[];
  onConfirmImport: (results: {
    collections: CollectionMR[];
    deposits: BankDeposit[];
    newParties: Party[];
  }) => void;
  onShowDepositHistory: () => void;
  showNotify: (type: 'success' | 'error' | 'warning', message: string) => void;
}

const CollectionExcelImportModalContent: React.FC<CollectionExcelImportModalProps> = ({
  isOpen,
  onClose,
  file,
  parties = [],
  salespersons = [],
  branches = [],
  bankList = [],
  accountList = [],
  currentUser,
  existingCollections = [],
  existingDeposits = [],
  onConfirmImport,
  onShowDepositHistory,
  showNotify
}) => {
  // Modal State
  const [rows, setRows] = useState<ImportedRowItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'all' | 'attention' | 'deposits' | 'collections'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Inline party creation popover/modal state
  const [creatingPartyRowId, setCreatingPartyRowId] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState<string>('');
  const [newPartyAddress, setNewPartyAddress] = useState<string>('Madhupur');
  const [newPartyPhone, setNewPartyPhone] = useState<string>('');
  const [newPartySpCode, setNewPartySpCode] = useState<string>('');
  const [newPartyBranchId, setNewPartyBranchId] = useState<string>('');

  // Default target sales center
  const defaultSalesCenterName = useMemo(() => {
    if (branches && branches.length > 0) return branches[0].name;
    return 'Madhupur Sales Center';
  }, [branches]);

  // Read and parse Excel file whenever file changes
  useEffect(() => {
    if (!isOpen || !file) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        const rawGrid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        if (!rawGrid || rawGrid.length === 0) {
          showNotify('error', 'The uploaded Excel file contains no data.');
          setLoading(false);
          return;
        }

        // Detect header row by scanning first 15 rows
        const headerKeywords = [
          'amount', 'amt', 'collection', 'taka', 'tk', 'টাকা', 'পরিমাণ', 'date', 'তারিখ',
          'party', 'customer', 'নাম', 'পার্টি', 'mr', 'receipt', 'bank', 'ব্যাংক', 'account', 'হিসাব', 'marketing', 'salesman'
        ];

        let headerRowIndex = 0;
        let bestScore = 0;
        for (let r = 0; r < Math.min(15, rawGrid.length); r++) {
          const rowCells = rawGrid[r];
          if (!Array.isArray(rowCells)) continue;
          let score = 0;
          rowCells.forEach((cell) => {
            const str = String(cell || '').toLowerCase().trim();
            if (headerKeywords.some((k) => str.includes(k))) score++;
          });
          if (score > bestScore) {
            bestScore = score;
            headerRowIndex = r;
          }
        }

        const data = XLSX.utils.sheet_to_json<any>(sheet, {
          range: headerRowIndex,
          defval: ''
        });

        if (!data || data.length === 0) {
          showNotify('error', 'No collection rows found in the Excel file.');
          setLoading(false);
          return;
        }

        const parsedRows: ImportedRowItem[] = [];
        const mrCalcWorkingList: CollectionMR[] = [...existingCollections];

        // Keywords for auto-detection
        const dateKeywords = ['collectiondate', 'mrdate', 'txdate', 'voucherdate', 'entrydate', 'date', 'dt', 'তারিখ', 'দিন'];
        const partyKeywords = ['partyname', 'party', 'customer', 'customername', 'client', 'accountname', 'নাম', 'পার্টি', 'গ্রাহক', 'দোকানেরনাম'];
        const marketingKeywords = ['marketing', 'salesperson', 'salesman', 'officer', 'sp', 'entity', 'assignedaccount', 'বিক্রেতা', 'অফিসার', 'প্রতিনিধি'];
        const amountKeywords = [
          'collectionamount', 'collamount', 'amounttk', 'mramount', 'টাকারপরিমাণ', 'কালেকশনটাকা', 'জমাটাকা', 'receivedamount', 'netamount',
          'amount', 'amt', 'cash', 'cashamount', 'collected', 'collection', 'taka', 'tk', 'টাকা', 'পরিমাণ', 'received', 'payment', 'paid'
        ];
        const mrNoKeywords = ['mrno', 'mr', 'receiptno', 'receipt', 'sl', 'slno', 'voucherno', 'memo', 'ভাউচার', 'সিরিয়াল'];
        const bankKeywords = ['bank', 'bankname', 'ব্যাংক', 'ব্যাংকনাম'];
        const accountKeywords = ['account', 'accountname', 'হিসাব', 'হিসাবনং', 'tag', 'banktag', 'shorttag', 'ট্যাগ'];
        const chequeKeywords = ['chequeno', 'cheque', 'cqno', 'chkno', 'চেক'];
        const remarksKeywords = ['remarks', 'note', 'ref', 'reference', 'বিবরণ', 'মন্তব্য'];

        data.forEach((row, idx) => {
          const keys = Object.keys(row);
          const findVal = (colNames: string[], excludeWords: string[] = []): string => {
            const key = keys.find((k) => {
              const cleanedK = k.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
              if (excludeWords.some((ex) => cleanedK.includes(ex))) return false;
              return colNames.some((c) => {
                const cleanedC = c.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
                return cleanedK.includes(cleanedC) || cleanedC.includes(cleanedK);
              });
            });
            return key !== undefined ? String(row[key] || '').trim() : '';
          };

          const rawDate = findVal(dateKeywords);
          const rawParty = findVal(partyKeywords, ['date', 'amount', 'salesman', 'marketing']);
          const rawMarketing = findVal(marketingKeywords, ['date', 'amount', 'party']);
          let rawAmountStr = findVal(amountKeywords, ['date', 'dt', 'mr', 'party', 'salesman', 'phone', 'cell']);
          const rawMrNo = findVal(mrNoKeywords, ['date', 'amount', 'party']);
          const rawBank = findVal(bankKeywords, ['amount', 'party']);
          const rawAccount = findVal(accountKeywords, ['amount', 'party']);
          const rawChequeNo = findVal(chequeKeywords, ['amount']);
          const rawRemarks = findVal(remarksKeywords, ['amount', 'party']);

          // Amount parsing
          let parsedAmount = parseExcelAmount(rawAmountStr);
          if (parsedAmount <= 0) {
            // Scan numeric columns
            for (const k of keys) {
              const cleanK = k.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
              if (['date', 'dt', 'mr', 'sl', 'phone', 'mobile', 'party', 'name', 'নাম', 'তারিখ'].some(ex => cleanK.includes(ex))) {
                continue;
              }
              const val = row[k];
              if (isExcelDateValue(val)) continue;
              const testAmt = parseExcelAmount(val);
              if (testAmt > 0) {
                parsedAmount = testAmt;
                break;
              }
            }
          }

          // Skip completely empty rows
          if (!rawParty && parsedAmount <= 0 && !rawDate) {
            return;
          }

          // Date parsing
          let parsedDate = rawDate ? parseExcelDateToISO(rawDate) : '';
          const dateValid = Boolean(parsedDate && /^\d{4}-\d{2}-\d{2}$/.test(parsedDate));
          if (!dateValid) {
            parsedDate = new Date().toISOString().split('T')[0];
          }

          // Party matching
          const cleanPartyName = rawParty.trim();
          let matchedParty: Party | null = null;
          let partyNotFound = true;

          if (cleanPartyName) {
            const cleanPNameLower = cleanPartyName.toLowerCase();
            matchedParty = parties.find((p) => {
              const pLower = (p.name || '').trim().toLowerCase();
              return (
                pLower === cleanPNameLower ||
                pLower.replace(/[^a-z0-9]/g, '') === cleanPNameLower.replace(/[^a-z0-9]/g, '')
              );
            }) || null;

            if (matchedParty) {
              partyNotFound = false;
            }
          }

          // Marketing person auto-detection
          let detectedMarketing = '';
          let detectedSpCode = '';
          let marketingSource: 'excel' | 'party_profile' | 'manual' = 'manual';

          // 1. From matched party profile (Customer Directory is master truth)
          if (matchedParty?.salespersonName && matchedParty.salespersonName.trim() && matchedParty.salespersonName !== '-') {
            detectedMarketing = matchedParty.salespersonName.trim();
            detectedSpCode = matchedParty.salesmanCode || '';
            marketingSource = 'party_profile';
          } else if (matchedParty?.salesmanCode) {
            const sp = salespersons.find((s) => s.code?.toLowerCase() === matchedParty?.salesmanCode?.toLowerCase());
            if (sp?.name) {
              detectedMarketing = sp.name;
              detectedSpCode = sp.code;
              marketingSource = 'party_profile';
            }
          }

          // 2. From Excel column if not found from party profile
          if (!detectedMarketing && rawMarketing) {
            const spMatch = salespersons.find(
              (s) =>
                s.name.toLowerCase().includes(rawMarketing.toLowerCase()) ||
                s.code.toLowerCase() === rawMarketing.toLowerCase() ||
                rawMarketing.toLowerCase().includes(s.name.toLowerCase())
            );
            if (spMatch) {
              detectedMarketing = spMatch.name;
              detectedSpCode = spMatch.code;
            } else {
              detectedMarketing = rawMarketing.trim();
            }
            marketingSource = 'excel';
          }

          // 3. Fallback to default salesperson
          if (!detectedMarketing && salespersons.length > 0) {
            detectedMarketing = salespersons[0].name;
            detectedSpCode = salespersons[0].code || '';
          }

          // Bank & Account Detection
          const fullRowText = `${rawBank} ${rawAccount} ${rawRemarks} ${rawChequeNo}`.toLowerCase();
          const knownBankKeywords = [
            'pubali', 'pbl', 'dutch', 'dbbl', 'islami', 'ibbl', 'brac', 'ebl', 'cbl', 'city bank',
            'uttara', 'janata', 'agrani', 'sonali', 'prime', 'united', 'ucb', 'mutual', 'mtb',
            'national bank', 'padma', 'bank', 'ব্যাংক'
          ];
          const hasBankKeyword = knownBankKeywords.some((bk) => fullRowText.includes(bk));
          const hasExplicitBankCol = Boolean(rawBank || rawAccount);

          const isBankDeposit = Boolean(hasExplicitBankCol || hasBankKeyword);

          let detectedBankName = rawBank ? resolveFullBankName(rawBank, bankList) : '';
          if (!detectedBankName && hasBankKeyword) {
            detectedBankName = resolveFullBankName(fullRowText, bankList);
          } else if (!detectedBankName) {
            detectedBankName = (bankList && bankList.length > 0) ? bankList[0] : 'Pubali Bank PLC';
          }

          let detectedAccountName = rawAccount ? resolveFullAccountName(rawAccount, accountList) : '';
          if (!detectedAccountName && (fullRowText.includes('padma') || fullRowText.includes('p.e') || fullRowText.includes('(pe)'))) {
            detectedAccountName = resolveFullAccountName('Padma Enterprise', accountList);
          } else if (!detectedAccountName && (fullRowText.includes('zahid') || fullRowText.includes('z.e'))) {
            detectedAccountName = resolveFullAccountName('Zahid Enterprise', accountList);
          } else if (!detectedAccountName) {
            detectedAccountName = (accountList && accountList.length > 0) ? accountList[0] : 'Padma Enterprise';
          }

          const detectedDisplayTag = isBankDeposit
            ? generateDisplayTag(detectedBankName, detectedAccountName) || `${getBankShortCode(detectedBankName)} (${getAccountShortCode(detectedAccountName)})`
            : '';

          // Duplicate detection
          let isDuplicate = false;
          let duplicateReason = '';
          const dupCol = existingCollections.find((c) => {
            const sameDate = c.date === parsedDate;
            const sameParty = (c.partyName || '').trim().toLowerCase() === cleanPartyName.toLowerCase();
            const sameAmt = Math.abs(c.amount - parsedAmount) < 1;
            return sameDate && sameParty && sameAmt;
          });
          if (dupCol) {
            isDuplicate = true;
            duplicateReason = `Matches existing collection #${dupCol.mrNo} on ${dupCol.date} (৳${dupCol.amount.toLocaleString('en-IN')})`;
          }

          // Error and attention flags
          const errors: string[] = [];
          if (!cleanPartyName) errors.push('Party name is missing');
          if (partyNotFound && cleanPartyName) errors.push('Party not found in Customer Directory');
          if (parsedAmount <= 0) errors.push('Amount is missing or 0');
          if (!dateValid) errors.push('Date is missing or invalid');

          const rowSalesCenter =
            matchedParty?.branchName ||
            resolveEntityToSalesCenter(detectedMarketing, branches, salespersons) ||
            defaultSalesCenterName;
          const matchedRowBranch = branches.find(
            (b) =>
              b.id === matchedParty?.branchId ||
              b.name.trim().toLowerCase() === rowSalesCenter.trim().toLowerCase() ||
              b.name.toLowerCase().replace(/\b(sales\s*center|showroom|branch)\b/gi, '').trim() ===
                rowSalesCenter.toLowerCase().replace(/\b(sales\s*center|showroom|branch)\b/gi, '').trim()
          );
          const rowBranchId =
            matchedRowBranch?.id ||
            matchedParty?.branchId ||
            (rowSalesCenter.toLowerCase().includes('madhupur') ? 'branch-1' : undefined);
          const canonicalRowCenter = matchedRowBranch?.name || rowSalesCenter;

          const finalMr =
            rawMrNo.trim() ||
            computeNextSalesCenterMrNo(
              mrCalcWorkingList,
              canonicalRowCenter,
              branches,
              parties,
              salespersons
            );

          const isChequeRow = Boolean(
            rawChequeNo.trim() || fullRowText.includes('cheque') || fullRowText.includes('chq') || fullRowText.includes('চেক')
          );
          mrCalcWorkingList.push({
            id: `mr-calc-${idx}`,
            date: parsedDate,
            mrNo: finalMr,
            entityName: canonicalRowCenter,
            branchId: rowBranchId,
            branchName: canonicalRowCenter,
            partyName: cleanPartyName || 'Unknown Customer',
            paymentType: isChequeRow ? 'cheque' : 'cash',
            amount: parsedAmount,
            marketingPerson: detectedMarketing,
            salesmanCode: detectedSpCode
          });

          parsedRows.push({
            id: `imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            rawIndex: idx + 1,
            date: parsedDate,
            dateValid,
            partyName: cleanPartyName || 'Unknown Customer',
            matchedParty,
            partyNotFound,
            marketingPerson: detectedMarketing,
            salesmanCode: detectedSpCode,
            marketingPersonSource: marketingSource,
            amount: parsedAmount,
            amountValid: parsedAmount > 0,
            mrNo: finalMr,
            isBankDeposit,
            bankName: detectedBankName,
            accountName: detectedAccountName,
            displayTag: detectedDisplayTag,
            paymentType: isChequeRow ? 'cheque' : 'cash',
            chequeNo: rawChequeNo.trim(),
            remarks: rawRemarks.trim(),
            isDuplicate,
            duplicateReason,
            errors,
            salesCenter: canonicalRowCenter,
            branchId: rowBranchId
          });
        });

        setRows(parsedRows);
        setLoading(false);

        // Auto-select attention tab if any errors exist
        const hasErrors = parsedRows.some((r) => r.errors.length > 0);
        if (hasErrors) {
          setFilterTab('attention');
        }
      } catch (err: any) {
        showNotify('error', `Failed to parse Excel file: ${err.message || err}`);
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  }, [isOpen, file]);

  // Modal State
  const totalCount = rows.length;
  const attentionRows = rows.filter((r) => r.errors.length > 0 || r.isDuplicate);
  const attentionCount = attentionRows.length;
  const depositRows = rows.filter((r) => r.isBankDeposit);
  const depositCount = depositRows.length;
  const collectionRows = rows.filter((r) => !r.isBankDeposit);
  const collectionCount = collectionRows.length;
  const missingPartiesCount = rows.filter((r) => r.partyNotFound && r.partyName.trim()).length;
  const totalAmount = rows.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Filtered rows for display
  const displayedRows = rows.filter((r) => {
    if (filterTab === 'attention' && r.errors.length === 0 && !r.isDuplicate) return false;
    if (filterTab === 'deposits' && !r.isBankDeposit) return false;
    if (filterTab === 'collections' && r.isBankDeposit) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchP = r.partyName.toLowerCase().includes(q);
      const matchSp = r.marketingPerson.toLowerCase().includes(q);
      const matchB = r.bankName.toLowerCase().includes(q);
      const matchMr = r.mrNo.toLowerCase().includes(q);
      return matchP || matchSp || matchB || matchMr;
    }
    return true;
  });

  // Inline row updates
  const updateRow = (id: string, updates: Partial<ImportedRowItem>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };

        // Recompute errors
        const errs: string[] = [];
        if (!updated.partyName.trim()) errs.push('Party name is missing');
        if (updated.partyNotFound) errs.push('Party not found in Customer Directory');
        if (updated.amount <= 0) errs.push('Amount is missing or 0');
        if (!updated.dateValid) errs.push('Date is missing or invalid');

        return {
          ...updated,
          amountValid: updated.amount > 0,
          errors: errs
        };
      })
    );
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // 1-Click Create All Missing Parties
  const handleCreateAllMissingParties = () => {
    const missingUniqueNames = Array.from(
      new Set(rows.filter((r) => r.partyNotFound && r.partyName.trim()).map((r) => r.partyName.trim()))
    );

    if (missingUniqueNames.length === 0) {
      showNotify('warning', 'No missing parties to create.');
      return;
    }

    // For each missing party, determine assigned marketing officer from rows
    const newlyCreatedParties: Party[] = missingUniqueNames.map((pName) => {
      const sampleRow = rows.find((r) => r.partyName.trim().toLowerCase() === pName.toLowerCase());
      const spName = sampleRow?.marketingPerson || (salespersons[0]?.name || '');
      const spCode = sampleRow?.salesmanCode || (salespersons[0]?.code || '');

      return {
        id: `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: pName,
        address: 'Madhupur',
        salesmanCode: spCode || undefined,
        salespersonName: spName || undefined,
        branchName: defaultSalesCenterName,
        openingBalance: 0,
        createdBy: currentUser?.name || 'Excel Collection Import'
      };
    });

    // Update all matching rows
    setRows((prev) =>
      prev.map((r) => {
        const found = newlyCreatedParties.find((p) => p.name.toLowerCase() === r.partyName.trim().toLowerCase());
        if (found) {
          const errs = r.errors.filter((e) => !e.includes('Party not found'));
          return {
            ...r,
            partyNotFound: false,
            matchedParty: found,
            marketingPerson: found.salespersonName || r.marketingPerson,
            salesmanCode: found.salesmanCode || r.salesmanCode,
            errors: errs
          };
        }
        return r;
      })
    );

    showNotify(
      'success',
      `Registered ${newlyCreatedParties.length} missing customer(s) into Customer Directory with assigned Marketing Officers!`
    );
  };

  // Open inline party creator for a specific row
  const openPartyCreator = (row: ImportedRowItem) => {
    setCreatingPartyRowId(row.id);
    setNewPartyName(row.partyName);
    setNewPartyAddress('Madhupur');
    setNewPartyPhone('');
    setNewPartySpCode(row.salesmanCode || (salespersons[0]?.code || ''));
    setNewPartyBranchId(branches[0]?.id || '');
  };

  const saveSingleNewParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartyName.trim()) {
      showNotify('error', 'Customer name is required.');
      return;
    }

    const matchedSp = salespersons.find((s) => s.code === newPartySpCode);
    const matchedBranch = branches.find((b) => b.id === newPartyBranchId);

    const createdParty: Party = {
      id: `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newPartyName.trim(),
      address: newPartyAddress.trim() || 'Madhupur',
      phone: newPartyPhone.trim() || undefined,
      salesmanCode: matchedSp?.code || undefined,
      salespersonName: matchedSp?.name || undefined,
      branchId: matchedBranch?.id || undefined,
      branchName: matchedBranch?.name || defaultSalesCenterName,
      openingBalance: 0,
      createdBy: currentUser?.name || 'Excel Collection Import'
    };

    // Update rows that have this party name
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === creatingPartyRowId || r.partyName.trim().toLowerCase() === newPartyName.trim().toLowerCase()) {
          const errs = r.errors.filter((err) => !err.includes('Party not found'));
          return {
            ...r,
            partyName: createdParty.name,
            partyNotFound: false,
            matchedParty: createdParty,
            marketingPerson: createdParty.salespersonName || r.marketingPerson,
            salesmanCode: createdParty.salesmanCode || r.salesmanCode,
            errors: errs
          };
        }
        return r;
      })
    );

    setCreatingPartyRowId(null);
    showNotify('success', `Customer "${createdParty.name}" created and assigned to ${createdParty.salespersonName || 'Unassigned'}!`);
  };

  // Confirm & Save All
  const handleFinalSubmit = () => {
    // Check if any blocking errors remain
    const blockingErrors = rows.filter((r) => r.amount <= 0 || !r.partyName.trim());
    if (blockingErrors.length > 0) {
      showNotify('error', `Please fix or remove the ${blockingErrors.length} row(s) with missing party name or zero amount before importing.`);
      setFilterTab('attention');
      return;
    }

    if (rows.length === 0) {
      showNotify('error', 'No rows available to import.');
      return;
    }

    // Collect all newly created parties
    const newlyAddedPartiesMap = new Map<string, Party>();
    rows.forEach((r) => {
      if (r.matchedParty && !parties.some((p) => p.name.toLowerCase() === r.matchedParty?.name.toLowerCase())) {
        newlyAddedPartiesMap.set(r.matchedParty.name.toLowerCase(), r.matchedParty);
      } else if (r.partyNotFound && r.partyName.trim()) {
        const pName = r.partyName.trim();
        if (!newlyAddedPartiesMap.has(pName.toLowerCase())) {
          newlyAddedPartiesMap.set(pName.toLowerCase(), {
            id: `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: pName,
            address: 'Madhupur',
            salesmanCode: r.salesmanCode || undefined,
            salespersonName: r.marketingPerson || undefined,
            branchName: defaultSalesCenterName,
            openingBalance: 0,
            createdBy: currentUser?.name || 'Excel Collection Import'
          });
        }
      }
    });

    const finalNewParties = Array.from(newlyAddedPartiesMap.values());

    // Separate Collections vs Bank Deposits
    const finalCollections: CollectionMR[] = [];
    const finalDeposits: BankDeposit[] = [];

    rows.forEach((r, idx) => {
      const rowCenterName = r.salesCenter || defaultSalesCenterName;
      const rowBranchId = r.branchId || (branches && branches.length > 0 ? branches[0].id : undefined) || 'branch-1';

      if (r.isBankDeposit) {
        // Create Bank Deposit record
        const bShort = getBankShortCode(r.bankName) || 'PBL';
        const aShort = getAccountShortCode(r.accountName) || 'P.E';
        const displayTag = r.displayTag.trim() || generateDisplayTag(r.bankName, r.accountName) || `${bShort} (${aShort})`;

        const newDep: BankDeposit = {
          id: `dep-import-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          date: r.date,
          depositDate: r.date,
          entityName: rowCenterName,
          customerName: r.partyName,
          partyName: r.partyName,
          voucherNo: r.mrNo,
          customerAddress: r.matchedParty?.address || 'Madhupur',
          marketingPerson: r.marketingPerson || 'Sanjoy Chowhan',
          salesmanCode: r.salesmanCode || undefined,
          bankName: r.bankName || 'Pubali Bank PLC',
          accountName: r.accountName || 'Padma Enterprise',
          bankShortCode: bShort,
          accountShortCode: aShort,
          displayTag,
          amount: r.amount,
          remarks: r.remarks || (r.chequeNo ? `Cheque No: ${r.chequeNo}` : 'Imported via Excel Collection List'),
          slipImage: undefined,
          emailSent: false,
          branchId: rowBranchId,
          branchName: rowCenterName
        };
        finalDeposits.push(newDep);

        // Also create a linked Collection MR marked as deposited so collection totals stay balanced
        finalCollections.push({
          id: `col-import-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          date: r.date,
          mrNo: r.mrNo,
          entityName: rowCenterName,
          partyName: r.partyName,
          paymentType: r.chequeNo ? 'cheque' : (r.paymentType || 'cash'),
          bankName: r.bankName,
          chequeNo: r.chequeNo || undefined,
          amount: r.amount,
          remarks: r.remarks,
          isDeposited: true,
          bankDepositId: newDep.id,
          depositDate: r.date,
          branchId: rowBranchId,
          branchName: rowCenterName,
          marketingPerson: r.marketingPerson,
          salesmanCode: r.salesmanCode
        });
      } else {
        // Regular Collection MR (Cash or Cheque in hand)
        finalCollections.push({
          id: `col-import-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          date: r.date,
          mrNo: r.mrNo,
          entityName: rowCenterName,
          partyName: r.partyName,
          paymentType: r.paymentType,
          bankName: r.paymentType === 'cheque' ? r.bankName : undefined,
          chequeNo: r.chequeNo || undefined,
          amount: r.amount,
          remarks: r.remarks,
          isDeposited: false,
          branchId: rowBranchId,
          branchName: rowCenterName,
          marketingPerson: r.marketingPerson,
          salesmanCode: r.salesmanCode
        });
      }
    });

    onConfirmImport({
      collections: finalCollections,
      deposits: finalDeposits,
      newParties: finalNewParties
    });

    // Close modal
    onClose();

    // User requirement: "if have bank name and account name or short tag then auto show Deposit History page"
    if (finalDeposits.length > 0) {
      onShowDepositHistory();
      showNotify(
        'success',
        `✅ Imported ${finalCollections.length} Collection records & ${finalDeposits.length} Bank Deposits! Automatically switched to Deposit History page.`
      );
    } else {
      showNotify(
        'success',
        `✅ Successfully imported ${finalCollections.length} collections into Collection List!`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 border-b border-teal-800/40 p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-600/30 border border-teal-500/50 rounded-xl text-teal-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                  Excel Collection Import & Verification
                </h2>
                <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-md text-[10px] font-bold">
                  Auto-Detect Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Auto-detected Date, Party, Marketing Person, Amount & Bank Deposits. Verify or correct below before saving.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Statistics & Quick Summary Banner */}
        <div className="bg-slate-950/70 border-b border-slate-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800/90 rounded-lg text-slate-300 font-bold border border-slate-700">
              <span>Total Rows:</span>
              <span className="text-white font-mono">{totalCount}</span>
            </div>

            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-950/60 rounded-lg text-emerald-300 font-bold border border-emerald-800/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Collections:</span>
              <span className="text-emerald-200 font-mono">{collectionCount}</span>
            </div>

            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-purple-950/60 rounded-lg text-purple-300 font-bold border border-purple-800/60">
              <Landmark className="w-3.5 h-3.5 text-purple-400" />
              <span>Bank Deposits:</span>
              <span className="text-purple-200 font-mono">{depositCount}</span>
              <span className="text-[10px] bg-purple-800/50 px-1.5 py-0.2 rounded text-purple-200">&rarr; Deposit History</span>
            </div>

            {attentionCount > 0 && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/60 rounded-lg text-amber-300 font-bold border border-amber-800/60">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Needs Review:</span>
                <span className="text-amber-200 font-mono">{attentionCount}</span>
              </div>
            )}

            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800/90 rounded-lg text-teal-300 font-bold border border-slate-700">
              <DollarSign className="w-3.5 h-3.5 text-teal-400" />
              <span>Total Amount:</span>
              <span className="text-teal-200 font-mono">৳{totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* 1-Click Create Missing Parties Action */}
          {missingPartiesCount > 0 && (
            <button
              type="button"
              onClick={handleCreateAllMissingParties}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-lg shadow-md flex items-center space-x-1.5 cursor-pointer transition-all border border-amber-400 text-xs shrink-0 animate-pulse"
              title="Automatically register all missing customer names in Customer Directory"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Create All {missingPartiesCount} Missing Customer(s)</span>
            </button>
          )}
        </div>

        {/* Filter Navigation & Search Bar */}
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center space-x-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All Rows ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('attention')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                filterTab === 'attention'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Needs Review ({attentionCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('deposits')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                filterTab === 'deposits'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Landmark className="w-3 h-3" />
              <span>Bank Deposits ({depositCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('collections')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                filterTab === 'collections'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Collections ({collectionCount})</span>
            </button>
          </div>

          <div className="relative min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search party, marketing, bank..."
              className="w-full pl-8 pr-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Rows Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto" />
              <p className="font-semibold text-sm">Parsing and analyzing Excel file...</p>
            </div>
          ) : displayedRows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="font-semibold text-sm">No rows found matching current filter.</p>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 text-center w-10">#</th>
                    <th className="p-2 w-28">Date</th>
                    <th className="p-2 min-w-[200px]">Party / Customer Name</th>
                    <th className="p-2 min-w-[150px]">Marketing Officer</th>
                    <th className="p-2 w-28 text-right">Amount (Tk)</th>
                    <th className="p-2 min-w-[200px]">Deposit & Bank Details</th>
                    <th className="p-2 text-center w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {displayedRows.map((r, idx) => {
                    const hasError = r.errors.length > 0;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors hover:bg-slate-800/40 ${
                          hasError ? 'bg-amber-950/20' : r.isBankDeposit ? 'bg-purple-950/10' : ''
                        }`}
                      >
                        {/* Row Index & Status Icon */}
                        <td className="p-2 text-center text-slate-400 font-mono text-[11px] align-top">
                          <div className="flex flex-col items-center space-y-1">
                            <span>{r.rawIndex}</span>
                            {hasError ? (
                              <span title={r.errors.join(', ')}>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              </span>
                            ) : r.isBankDeposit ? (
                              <span title="Bank Deposit (Will show in Deposit History)">
                                <Landmark className="w-3.5 h-3.5 text-purple-400" />
                              </span>
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </div>
                        </td>

                        {/* Date Input (dd.mm.yy) */}
                        <td className="p-2 align-top">
                          <DateInputWithPicker
                            value={r.date}
                            onChange={(val) => updateRow(r.id, { date: val, dateValid: Boolean(val) })}
                            valueFormat="iso"
                            theme="dark"
                            inputClassName={`p-1 text-white ${
                              !r.dateValid ? '!border-amber-500 !bg-amber-950/30' : '!border-slate-700 focus:!border-teal-500 !bg-slate-900'
                            }`}
                          />
                          {!r.dateValid && (
                            <span className="text-[10px] text-amber-400 block mt-0.5">⚠️ Date required</span>
                          )}
                        </td>

                        {/* Party Name */}
                        <td className="p-2 align-top">
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={r.partyName}
                              onChange={(e) => {
                                const newP = e.target.value;
                                const matched = parties.find(
                                  (p) => p.name.trim().toLowerCase() === newP.trim().toLowerCase()
                                );
                                updateRow(r.id, {
                                  partyName: newP,
                                  matchedParty: matched || null,
                                  partyNotFound: !matched
                                });
                              }}
                              placeholder="Customer Name"
                              className={`w-full p-1 bg-slate-900 border rounded-lg text-white font-bold text-xs focus:outline-none ${
                                r.partyNotFound
                                  ? 'border-amber-500/80 bg-amber-950/20'
                                  : 'border-slate-700 focus:border-teal-500'
                              }`}
                            />

                            {/* Party Verification Badges & Create Action */}
                            {r.partyNotFound ? (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-semibold flex items-center space-x-1">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  <span>Not in Directory</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openPartyCreator(r)}
                                  className="px-2 py-0.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>+ Create Party</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1 text-[10px] text-emerald-400 font-semibold">
                                <Check className="w-3 h-3" />
                                <span>Verified Customer</span>
                                {r.matchedParty?.address && (
                                  <span className="text-slate-400">({r.matchedParty.address})</span>
                                )}
                              </div>
                            )}

                            {r.isDuplicate && (
                              <span className="text-[10px] text-rose-300 bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-800/40 block">
                                ⚠️ Duplicate: {r.duplicateReason}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Marketing Person Dropdown */}
                        <td className="p-2 align-top">
                          <div className="space-y-1">
                            <select
                              value={r.marketingPerson}
                              onChange={(e) => {
                                const sp = salespersons.find((s) => s.name === e.target.value);
                                updateRow(r.id, {
                                  marketingPerson: e.target.value,
                                  salesmanCode: sp?.code || '',
                                  marketingPersonSource: 'manual'
                                });
                              }}
                              className="w-full p-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium text-xs focus:border-teal-500 focus:outline-none cursor-pointer"
                            >
                              <option value="">Unassigned</option>
                              {salespersons.map((s) => (
                                <option key={s.id || s.code} value={s.name}>
                                  {s.code ? `[${s.code}] ` : ''}{s.name}
                                </option>
                              ))}
                              {r.marketingPerson && !salespersons.some((s) => s.name === r.marketingPerson) && (
                                <option value={r.marketingPerson}>{r.marketingPerson} (From Excel)</option>
                              )}
                            </select>

                            <span className="text-[10px] text-slate-400 block">
                              {r.marketingPersonSource === 'party_profile' && '✓ From Customer Profile'}
                              {r.marketingPersonSource === 'excel' && '📋 Detected from Excel'}
                              {r.marketingPersonSource === 'manual' && '✏️ Manually assigned'}
                            </span>
                          </div>
                        </td>

                        {/* Amount Input */}
                        <td className="p-2 text-right align-top">
                          <div className="space-y-0.5">
                            <input
                              type="number"
                              value={r.amount === 0 ? '' : r.amount}
                              onChange={(e) => updateRow(r.id, { amount: Number(e.target.value) || 0 })}
                              placeholder="0"
                              className={`w-full p-1 text-right bg-slate-900 border rounded-lg text-white font-mono font-bold text-xs focus:outline-none ${
                                !r.amountValid ? 'border-rose-500 bg-rose-950/30' : 'border-slate-700 focus:border-teal-500'
                              }`}
                            />
                            {!r.amountValid && (
                              <span className="text-[10px] text-rose-400 block text-right">⚠️ Invalid Amount</span>
                            )}
                          </div>
                        </td>

                        {/* Bank Details / Type Selection */}
                        <td className="p-2 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <label className="flex items-center space-x-1 text-[11px] font-bold cursor-pointer text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={r.isBankDeposit}
                                  onChange={(e) => {
                                    const isDep = e.target.checked;
                                    const bName = isDep ? (r.bankName || (bankList[0] || 'Pubali Bank PLC')) : r.bankName;
                                    const aName = isDep ? (r.accountName || (accountList[0] || 'Padma Enterprise')) : r.accountName;
                                    updateRow(r.id, {
                                      isBankDeposit: isDep,
                                      bankName: bName,
                                      accountName: aName,
                                      displayTag: isDep ? generateDisplayTag(bName, aName) : ''
                                    });
                                  }}
                                  className="rounded border-slate-700 text-teal-600 focus:ring-0 cursor-pointer"
                                />
                                <span className={r.isBankDeposit ? 'text-purple-300' : 'text-slate-400'}>
                                  Bank Deposit (&rarr; Deposit History)
                                </span>
                              </label>
                            </div>

                            {r.isBankDeposit ? (
                              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                <div className="flex items-center gap-1 min-w-0">
                                  <BankLogoBadge bankName={r.bankName} size="sm" />
                                  <select
                                    value={r.bankName}
                                    onChange={(e) => {
                                      const b = e.target.value;
                                      updateRow(r.id, {
                                        bankName: b,
                                        displayTag: generateDisplayTag(b, r.accountName)
                                      });
                                    }}
                                    className="flex-1 min-w-0 p-1 bg-slate-900 border border-purple-800/60 rounded-md text-[11px] text-purple-200 focus:outline-none cursor-pointer"
                                  >
                                    {bankList.map((b, bIdx) => (
                                      <option key={`${b}-${bIdx}`} value={b}>
                                        {b}
                                      </option>
                                    ))}
                                    {r.bankName && !bankList.includes(r.bankName) && (
                                      <option key={`bank-extra-${r.bankName}`} value={r.bankName}>{r.bankName}</option>
                                    )}
                                  </select>
                                </div>

                                <select
                                  value={r.accountName}
                                  onChange={(e) => {
                                    const a = e.target.value;
                                    updateRow(r.id, {
                                      accountName: a,
                                      displayTag: generateDisplayTag(r.bankName, a)
                                    });
                                  }}
                                  className="p-1 bg-slate-900 border border-purple-800/60 rounded-md text-[11px] text-purple-200 focus:outline-none cursor-pointer"
                                >
                                  {accountList.map((a, aIdx) => (
                                    <option key={`${a}-${aIdx}`} value={a}>
                                      {a}
                                    </option>
                                  ))}
                                  {r.accountName && !accountList.includes(r.accountName) && (
                                    <option key={`acc-extra-${r.accountName}`} value={r.accountName}>{r.accountName}</option>
                                  )}
                                </select>

                                {r.displayTag && (
                                  <div className="col-span-2 flex items-center space-x-1 text-[10px] text-purple-300 font-mono">
                                    <Tag className="w-3 h-3" />
                                    <span>Tag: {r.displayTag}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                                <span>MR #{r.mrNo}</span>
                                {r.remarks && <span className="truncate max-w-[120px]">({r.remarks})</span>}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Delete Row Action */}
                        <td className="p-2 text-center align-top">
                          <button
                            type="button"
                            onClick={() => deleteRow(r.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                            title="Remove row from import"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Bar with Actions & Confirm Button */}
        <div className="bg-slate-950 border-t border-slate-800 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {attentionCount > 0 && (
              <span className="text-xs text-amber-400 font-semibold hidden sm:inline">
                ⚠️ {attentionCount} record(s) need attention before import
              </span>
            )}

            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={rows.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-teal-600/30 flex items-center space-x-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>
                Confirm & Import {rows.length} Records
                {depositCount > 0 ? ` (${depositCount} to Deposit History)` : ''}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Quick Party Creator Modal */}
      {creatingPartyRowId && (
        <div
          className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setCreatingPartyRowId(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-teal-400">
                <Plus className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Create New Customer</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreatingPartyRowId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveSingleNewParty} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Customer / Party Name *</label>
                <input
                  type="text"
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  placeholder="e.g. Bhai Bhai Electric"
                  required
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Address / Location</label>
                <input
                  type="text"
                  value={newPartyAddress}
                  onChange={(e) => setNewPartyAddress(e.target.value)}
                  placeholder="e.g. Madhupur Bazaar"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-medium focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={newPartyPhone}
                  onChange={(e) => setNewPartyPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Marketing Officer</label>
                  <select
                    value={newPartySpCode}
                    onChange={(e) => setNewPartySpCode(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {salespersons.map((s) => (
                      <option key={s.id || s.code} value={s.code}>
                        {s.code ? `[${s.code}] ` : ''}{s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Sales Center</label>
                  <select
                    value={newPartyBranchId}
                    onChange={(e) => setNewPartyBranchId(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:border-teal-500 focus:outline-none cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreatingPartyRowId(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const CollectionExcelImportModal: React.FC<CollectionExcelImportModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <CollectionExcelImportModalContent {...props} />;
};
