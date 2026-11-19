import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Party, Salesperson, BranchLocation, AuthUser, BillHeader, DeliveryChallan, CollectionMR as Collection } from '../types';
import { Users, Plus, Trash2, Edit3, Save, X, ArrowLeft, Search, MapPin, Phone, Building2, LayoutList, LayoutGrid, UserCheck, Filter, Upload, Download, FileSpreadsheet, FileCheck, AlertCircle, CheckCircle2, AlertTriangle, Info, FileText, Truck, Receipt, Printer, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, ArrowRightLeft, RotateCcw } from 'lucide-react';
import { exportPartiesToXLSX, parseXLSXToParties, downloadPartyTemplateXLSX, SimilarSalespersonMatch } from '../utils/xlsxPartyHelper';
import { downloadTextFile, formatAsciiTable } from '../utils/textExportHelper';
import { moveToTrash, moveMultipleToTrash } from '../utils/trashHelper';
import {
  getUserLoginFilters,
  isAccountsOrStaff,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin
} from '../utils/branchAccess';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import {
  recordDeletedEntityId,
  recordDeletedEntityIds,
  unrecordDeletedEntityId,
  getGlobalDeletedIds,
  removeIdsFromAllTrashStorages
} from '../utils/deletedTracker';

const cleanSalesCenterName = (name: string): string => {
  if (!name) return 'Madhupur Sales Center';
  return name.replace(/\s*\((?:all|\d+)\)$/i, '').trim();
};

interface BlockedPartyDeletionInfo {
  party: Party;
  billsCount: number;
  billsSample: string[];
  challansCount: number;
  challansSample: string[];
  collectionsCount: number;
  collectionsAmount: number;
}

interface PartyDirectoryProps {
  parties: Party[];
  salespersons: Salesperson[];
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  storedBills?: any[];
  setStoredBills?: React.Dispatch<React.SetStateAction<any[]>>;
  deliveryChallans?: DeliveryChallan[];
  setDeliveryChallans?: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  collections?: Collection[];
  setCollections?: React.Dispatch<React.SetStateAction<Collection[]>>;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
  onSelectPartyForBill: (party: Party) => void;
  onSelectPartyForLedger?: (party: Party) => void;
  onAddSalespersonIfMissing?: (code: string, name: string) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const PartyDirectory: React.FC<PartyDirectoryProps> = ({
  parties,
  salespersons,
  branches = [],
  currentUser,
  setParties,
  storedBills = [],
  setStoredBills,
  deliveryChallans = [],
  setDeliveryChallans,
  collections = [],
  setCollections,
  onSyncCloud,
  onSelectPartyForBill,
  onSelectPartyForLedger,
  onBack,
  onClose
}) => {
  const userLoginFilters = useMemo(() => {
    return getUserLoginFilters(currentUser, salespersons, branches);
  }, [currentUser, salespersons, branches]);

  const [search, setSearch] = useState('');
  const [selectedCenterFilter, setSelectedCenterFilter] = useState<string>(() => {
    const init = getUserLoginFilters(currentUser, salespersons, branches);
    if (init.branchName) {
      const match = branches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() || b.id === init.branchId);
      return match ? cleanSalesCenterName(match.name) : cleanSalesCenterName(init.branchName);
    }
    return 'all';
  });
  const [selectedSpFilter, setSelectedSpFilter] = useState<string>(() => {
    if (isAccountsOrStaff(currentUser, salespersons)) return 'all';
    const init = getUserLoginFilters(currentUser, salespersons, branches);
    return init.salesmanCode || 'all';
  });

  // Only reset filters when the logged-in user actually changes (prevents filter reset after editing a customer)
  const prevUserIdentityRef = useRef<string | undefined>(
    currentUser?.id || currentUser?.username || currentUser?.salespersonCode
  );
  useEffect(() => {
    const currentIdentity = currentUser?.id || currentUser?.username || currentUser?.salespersonCode;
    if (prevUserIdentityRef.current !== currentIdentity) {
      prevUserIdentityRef.current = currentIdentity;
      if (userLoginFilters.branchName) {
        const match = branches.find((b) => b.name.toLowerCase().trim() === userLoginFilters.branchName?.toLowerCase().trim() || b.id === userLoginFilters.branchId);
        setSelectedCenterFilter(match ? cleanSalesCenterName(match.name) : cleanSalesCenterName(userLoginFilters.branchName));
      } else {
        setSelectedCenterFilter('all');
      }
      if (isAccountsOrStaff(currentUser, salespersons)) {
        setSelectedSpFilter('all');
      } else if (userLoginFilters.salesmanCode) {
        setSelectedSpFilter(userLoginFilters.salesmanCode);
      } else {
        setSelectedSpFilter('all');
      }
    }
  }, [currentUser, userLoginFilters.branchName, userLoginFilters.branchId, userLoginFilters.salesmanCode, branches, salespersons]);

  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Party | null>(null);
  const [blockedPartyDeletion, setBlockedPartyDeletion] = useState<BlockedPartyDeletionInfo | null>(null);

  // Auto-save on blur / outside click refs
  const editPartyRowRef = useRef<HTMLTableRowElement | null>(null);
  const editFormRef = useRef<Party | null>(null);
  const originalPartyRef = useRef<Party | null>(null);

  // Bulk Selection and Trash Bin state
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<string>>(new Set());
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'xlsx' | 'text'>('xlsx');
  const [bulkPartyText, setBulkPartyText] = useState('');
  const [showTrashBin, setShowTrashBin] = useState(false);
  const [showDuplicateFinder, setShowDuplicateFinder] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getPartyMarketingPersonKey = (
    p: { salesmanCode?: string; salespersonName?: string } | null | undefined
  ): string => {
    if (!p) return '__none__';
    const code = (p.salesmanCode || '').trim().toLowerCase();
    const name = (p.salespersonName || '').trim().toLowerCase();
    if (!code && !name) return '__none__';
    if (Array.isArray(salespersons) && salespersons.length > 0) {
      const matched = salespersons.find(
        (sp) =>
          (code && ((sp.code || '').trim().toLowerCase() === code || (sp.id || '').trim().toLowerCase() === code)) ||
          (name && (sp.name || '').trim().toLowerCase() === name)
      );
      if (matched) {
        return `sp:${(matched.code || matched.id || matched.name || '').trim().toLowerCase()}`;
      }
    }
    return `raw:${code || name}`;
  };

  // High-performance duplicate party detector using O(N) multi-bucket indexing
  // Parties with different marketing persons / salesmen are distinct and never flagged as duplicates
  const duplicateGroups = useMemo(() => {
    const groups: { key: string; parties: Party[]; reason: string }[] = [];
    const processed = new Set<string>();

    // 1. Group by exact trimmed lowercase name + marketing person
    const exactBuckets = new Map<string, Party[]>();
    // 2. Group by normalized alphanumeric + marketing person
    const normBuckets = new Map<string, Party[]>();
    // 3. Group by 12-char prefix + marketing person
    const prefixBuckets = new Map<string, Party[]>();

    for (const p of parties) {
      if (!p || !p.name) continue;
      const rawLow = p.name.trim().toLowerCase();
      const norm = rawLow.replace(/[^a-z0-9]/g, '');
      const mktKey = getPartyMarketingPersonKey(p);

      // Exact bucket
      const exactKey = `${rawLow}::${mktKey}`;
      const eb = exactBuckets.get(exactKey);
      if (eb) eb.push(p); else exactBuckets.set(exactKey, [p]);

      // Normalized bucket
      if (norm.length > 3) {
        const normKey = `${norm}::${mktKey}`;
        const nb = normBuckets.get(normKey);
        if (nb) nb.push(p); else normBuckets.set(normKey, [p]);
      }

      // Prefix bucket
      if (norm.length >= 10) {
        const pfxKey = `${norm.slice(0, 12)}::${mktKey}`;
        const pb = prefixBuckets.get(pfxKey);
        if (pb) pb.push(p); else prefixBuckets.set(pfxKey, [p]);
      }
    }

    // Collect duplicate groups in single linear pass
    for (const p of parties) {
      if (!p || processed.has(p.id)) continue;
      const rawLow = (p.name || '').trim().toLowerCase();
      const norm = rawLow.replace(/[^a-z0-9]/g, '');
      const mktKey = getPartyMarketingPersonKey(p);
      const pfx = norm.length >= 10 ? norm.slice(0, 12) : '';

      const exactList = exactBuckets.get(`${rawLow}::${mktKey}`) || [];
      const normList = norm ? (normBuckets.get(`${norm}::${mktKey}`) || []) : [];
      const prefixList = pfx ? (prefixBuckets.get(`${pfx}::${mktKey}`) || []) : [];

      const candidateMap = new Map<string, Party>();
      for (const cand of [...exactList, ...normList, ...prefixList]) {
        if (!processed.has(cand.id) && getPartyMarketingPersonKey(cand) === mktKey) {
          candidateMap.set(cand.id, cand);
        }
      }

      if (candidateMap.size > 1) {
        const similar = Array.from(candidateMap.values());
        similar.forEach((cand) => processed.add(cand.id));
        const reason =
          similar[0].name.trim().toLowerCase() === similar[1].name.trim().toLowerCase()
            ? 'Exact Duplicate Name'
            : 'Similar / Abbreviated Variation';
        groups.push({ key: p.id, parties: similar, reason });
      }
    }
    return groups;
  }, [parties, salespersons]);

  // Duplicate multi-selection states & helper sets
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState<boolean>(false);

  const allDuplicatePartyIds = useMemo(() => {
    const set = new Set<string>();
    duplicateGroups.forEach((grp) => {
      grp.parties.forEach((p) => set.add(p.id));
    });
    return set;
  }, [duplicateGroups]);

  const secondaryDuplicatePartyIds = useMemo(() => {
    const set = new Set<string>();
    duplicateGroups.forEach((grp) => {
      // Pick all secondary duplicate entries, keeping 1st entry safe
      for (let i = 1; i < grp.parties.length; i++) {
        set.add(grp.parties[i].id);
      }
    });
    return set;
  }, [duplicateGroups]);

  const toggleSelectDuplicate = (id: string) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectDuplicateGroup = (grp: { parties: Party[] }) => {
    const grpIds = grp.parties.map((p) => p.id);
    const allSelected = grpIds.every((id) => selectedDuplicateIds.has(id));
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        grpIds.forEach((id) => next.delete(id));
      } else {
        grpIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSelectGroupDuplicatesKeepFirst = (grp: { parties: Party[] }) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < grp.parties.length; i++) {
        next.add(grp.parties[i].id);
      }
      return next;
    });
  };

  const handleSelectAllDuplicatesKeepFirst = () => {
    setSelectedDuplicateIds(new Set(secondaryDuplicatePartyIds));
  };

  const handleSelectAllDuplicates = () => {
    setSelectedDuplicateIds(new Set(allDuplicatePartyIds));
  };

  const handleDeselectAllDuplicates = () => {
    setSelectedDuplicateIds(new Set());
  };

  const executeDeleteSelectedDuplicates = () => {
    if (selectedDuplicateIds.size === 0) return;
    if (!checkCanTakeEntry('Delete Selected Duplicates', setToastNotification)) return;
    const toTrashList = parties.filter((p) => selectedDuplicateIds.has(p.id));
    if (toTrashList.length === 0) return;

    if (!window.confirm(`Are you sure you want to move ${toTrashList.length} selected duplicate customer(s) to Trash Bin?`)) {
      return;
    }

    recordDeletedEntityIds(toTrashList.map((p) => p.id));
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: toTrashList.map((p) => p.id), type: 'party' })
    }).catch(() => {});

    moveMultipleToTrash('polycables_trashed_parties', toTrashList, 'Party Directory');
    const updatedTrash = [...trashedParties, ...toTrashList];
    setTrashedParties(updatedTrash);
    try {
      localStorage.setItem('polycables_trashed_parties', JSON.stringify(updatedTrash));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error(e);
    }

    const remainingParties = parties.filter((p) => !selectedDuplicateIds.has(p.id));
    setParties(remainingParties);
    try {
      localStorage.setItem('polycables_parties', JSON.stringify(remainingParties));
    } catch {}

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { parties: remainingParties } })
    }).catch(() => {});
    onSyncCloud?.({ parties: remainingParties }, true);

    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      toTrashList.forEach((p) => next.delete(p.id));
      return next;
    });

    const deletedCount = toTrashList.length;
    setSelectedDuplicateIds(new Set());
    setToastNotification(`✓ Moved ${deletedCount} duplicate customer(s) to Trash Bin.`);
  };

  // Automated one-click deduplication system: keeps 1st primary customer, reassigns attached bills/collections, removes duplicates
  const handleAutoRemoveAllDuplicates = () => {
    if (duplicateGroups.length === 0 || secondaryDuplicatePartyIds.size === 0) {
      setToastNotification('No duplicate customer copies found to remove.');
      return;
    }
    if (!checkCanTakeEntry('Auto Remove Duplicates', setToastNotification)) return;

    const duplicatesToRemove = parties.filter((p) => secondaryDuplicatePartyIds.has(p.id));
    if (duplicatesToRemove.length === 0) return;

    if (!window.confirm(`Auto-Remove Duplicates:\nFound ${duplicateGroups.length} duplicate group(s) with ${duplicatesToRemove.length} extra customer copy(ies).\n\nThis will keep the 1st primary customer of each group, merge any linked bills & collections to the primary customer, and move duplicate copies to Trash.\n\nProceed?`)) {
      return;
    }

    const idToPrimaryMap = new Map<string, Party>();
    const nameAndMktToPrimaryMap = new Map<string, Party>();
    duplicateGroups.forEach((grp) => {
      if (grp.parties.length > 1) {
        const primary = grp.parties[0];
        for (let i = 1; i < grp.parties.length; i++) {
          idToPrimaryMap.set(grp.parties[i].id, primary);
          if (grp.parties[i].name) {
            const nameKey = grp.parties[i].name.trim().toLowerCase();
            const mktKey = getPartyMarketingPersonKey(grp.parties[i]);
            nameAndMktToPrimaryMap.set(`${nameKey}::${mktKey}`, primary);
          }
        }
      }
    });

    let updatedBills = storedBills;
    if (storedBills && storedBills.length > 0 && setStoredBills) {
      let billsChanged = false;
      const nextBills = storedBills.map((b: any) => {
        const bId = b.partyId;
        const bName = (b.partyName || b.header?.partyName || '').trim().toLowerCase();
        const bMktKey = getPartyMarketingPersonKey({
          salesmanCode: b.salesmanCode || b.header?.salesmanCode,
          salespersonName: b.salespersonName || b.header?.salespersonName
        });
        const primary = (bId && idToPrimaryMap.get(bId)) || (bName && nameAndMktToPrimaryMap.get(`${bName}::${bMktKey}`));
        if (primary && (b.partyId !== primary.id || (b.header && b.header.partyName !== primary.name))) {
          billsChanged = true;
          return {
            ...b,
            partyId: primary.id,
            header: {
              ...(b.header || {}),
              partyName: primary.name,
              address: primary.address || b.header?.address || '',
              salesmanCode: primary.salesmanCode || b.header?.salesmanCode || ''
            }
          };
        }
        return b;
      });
      if (billsChanged) {
        updatedBills = nextBills;
        setStoredBills(nextBills);
        try { localStorage.setItem('polycables_stored_bills', JSON.stringify(nextBills)); } catch {}
      }
    }

    let updatedCollections = collections;
    if (collections && collections.length > 0 && setCollections) {
      let colsChanged = false;
      const nextCols = collections.map((c: any) => {
        const cId = c.partyId;
        const cName = (c.partyName || c.customerName || '').trim().toLowerCase();
        const cMktKey = getPartyMarketingPersonKey({
          salesmanCode: c.salesmanCode || c.salespersonCode,
          salespersonName: c.marketingPerson || c.salespersonName
        });
        const primary = (cId && idToPrimaryMap.get(cId)) || (cName && nameAndMktToPrimaryMap.get(`${cName}::${cMktKey}`));
        if (primary && (c.partyId !== primary.id || c.partyName !== primary.name)) {
          colsChanged = true;
          return {
            ...c,
            partyId: primary.id,
            partyName: primary.name,
            customerName: primary.name
          };
        }
        return c;
      });
      if (colsChanged) {
        updatedCollections = nextCols;
        setCollections(nextCols);
        try { localStorage.setItem('polycables_collections', JSON.stringify(nextCols)); } catch {}
      }
    }

    recordDeletedEntityIds(duplicatesToRemove.map((p) => p.id));
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: duplicatesToRemove.map((p) => p.id), type: 'party' })
    }).catch(() => {});

    moveMultipleToTrash('polycables_trashed_parties', duplicatesToRemove, 'Party Directory');
    const updatedTrash = [...trashedParties, ...duplicatesToRemove];
    setTrashedParties(updatedTrash);
    try {
      localStorage.setItem('polycables_trashed_parties', JSON.stringify(updatedTrash));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error(e);
    }

    const remainingParties = parties.filter((p) => !secondaryDuplicatePartyIds.has(p.id));
    setParties(remainingParties);
    try {
      localStorage.setItem('polycables_parties', JSON.stringify(remainingParties));
    } catch {}

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: {
          parties: remainingParties,
          storedBills: updatedBills,
          collections: updatedCollections
        }
      })
    }).catch(() => {});

    onSyncCloud?.(
      {
        parties: remainingParties,
        storedBills: updatedBills,
        collections: updatedCollections
      },
      true
    );

    setSelectedDuplicateIds(new Set());
    setSelectedPartyIds(new Set());
    setShowDuplicateFinder(false);
    setToastNotification(`✓ Successfully removed ${duplicatesToRemove.length} duplicate customer copies and merged history into primary records!`);
  };

  // Delete confirmations
  const [deleteConfirmParty, setDeleteConfirmParty] = useState<Party | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 3500);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  const [trashedParties, setTrashedParties] = useState<Party[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_trashed_parties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Duplicate conflict state for Manual Creation
  const [createDuplicateConflict, setCreateDuplicateConflict] = useState<{
    existing: Party;
    newParty: Party;
  } | null>(null);

  // Party-to-Party Transfer State ("Customer Directory, party to party transfer all bill and collection by one click")
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourcePartyId, setTransferSourcePartyId] = useState<string>('');
  const [transferTargetPartyId, setTransferTargetPartyId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const transferSourceParty = useMemo(() => {
    return parties.find((p) => p.id === transferSourcePartyId);
  }, [parties, transferSourcePartyId]);

  const transferTargetParty = useMemo(() => {
    return parties.find((p) => p.id === transferTargetPartyId);
  }, [parties, transferTargetPartyId]);

  const recordBelongsToSpecificParty = (rec: any, targetParty: Party, hasSameNameSibling: boolean): boolean => {
    if (!rec || !targetParty) return false;
    const recPartyId = rec.partyId || rec.header?.partyId;
    if (recPartyId) {
      return recPartyId === targetParty.id;
    }
    const rName = (rec.partyName || rec.header?.partyName || rec.header?.customerName || rec.customerName || '').trim().toLowerCase();
    const sName = targetParty.name.trim().toLowerCase();
    if (!rName || rName !== sName) return false;
    if (!hasSameNameSibling) return true;

    const targetMktKey = getPartyMarketingPersonKey(targetParty);
    const rSpCode = (rec.salesmanCode || rec.header?.salesmanCode || '').trim().toLowerCase();
    const rSpName = (rec.salespersonName || rec.header?.salespersonName || rec.entityName || '').trim().toLowerCase();
    if (rSpCode || rSpName) {
      const matched = salespersons.find(
        (s) =>
          (rSpCode && (s.code || '').trim().toLowerCase() === rSpCode) ||
          (rSpName && (s.name || '').trim().toLowerCase() === rSpName)
      );
      const recMktKey = matched
        ? `sp:${(matched.code || matched.id || matched.name || '').trim().toLowerCase()}`
        : `raw:${rSpCode || rSpName}`;
      return recMktKey === targetMktKey;
    }
    return false;
  };

  const sourceTransferStats = useMemo(() => {
    if (!transferSourceParty) return { bills: [], collections: [], challans: [], billsAmount: 0, collectionsAmount: 0 };
    const sName = transferSourceParty.name.trim().toLowerCase();
    const hasSameNameSibling = parties.filter((p) => p.name.trim().toLowerCase() === sName).length > 1;

    const matchedBills = (storedBills || []).filter((b: any) =>
      recordBelongsToSpecificParty(b, transferSourceParty, hasSameNameSibling)
    );

    const matchedCollections = (collections || []).filter((c: any) =>
      recordBelongsToSpecificParty(c, transferSourceParty, hasSameNameSibling)
    );

    const matchedChallans = (deliveryChallans || []).filter((dc: any) =>
      recordBelongsToSpecificParty(dc, transferSourceParty, hasSameNameSibling)
    );

    const billsAmount = matchedBills.reduce((sum: number, b: any) => sum + (Number(b.grandTotal ?? b.totalAmount ?? 0) || 0), 0);
    const collectionsAmount = matchedCollections.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);

    return {
      bills: matchedBills,
      collections: matchedCollections,
      challans: matchedChallans,
      billsAmount,
      collectionsAmount
    };
  }, [transferSourceParty, parties, storedBills, collections, deliveryChallans, salespersons]);

  const handleExecutePartyTransfer = async () => {
    if (!transferSourceParty || !transferTargetParty) {
      setToastNotification('Please select both Source Customer and Target Customer.');
      return;
    }
    if (transferSourceParty.id === transferTargetParty.id) {
      setToastNotification('Source and Target Customer cannot be the same.');
      return;
    }
    if (sourceTransferStats.bills.length === 0 && sourceTransferStats.collections.length === 0 && sourceTransferStats.challans.length === 0) {
      setToastNotification(`Customer "${transferSourceParty.name}" has no bills, collections, or challans to transfer.`);
      return;
    }

    setIsTransferring(true);
    try {
      const sName = transferSourceParty.name.trim().toLowerCase();
      const hasSameNameSibling = parties.filter((p) => p.name.trim().toLowerCase() === sName).length > 1;
      const tName = transferTargetParty.name.trim();
      const tId = transferTargetParty.id;
      const tAddr = transferTargetParty.address || '';
      const tPhone = transferTargetParty.phone || '';

      // 1. Update bills
      let movedBills = 0;
      const updatedBills = (storedBills || []).map((b: any) => {
        if (recordBelongsToSpecificParty(b, transferSourceParty, hasSameNameSibling)) {
          movedBills++;
          return {
            ...b,
            partyId: tId,
            partyName: tName,
            header: {
              ...(b.header || {}),
              partyName: tName,
              customerName: tName,
              customerAddress: tAddr || b.header?.customerAddress,
              customerPhone: tPhone || b.header?.customerPhone
            }
          };
        }
        return b;
      });

      // 2. Update collections
      let movedCollections = 0;
      const updatedCollections = (collections || []).map((c: any) => {
        if (recordBelongsToSpecificParty(c, transferSourceParty, hasSameNameSibling)) {
          movedCollections++;
          return {
            ...c,
            partyId: tId,
            partyName: tName,
            customerName: tName
          };
        }
        return c;
      });

      // 3. Update delivery challans
      let movedChallans = 0;
      const updatedChallans = (deliveryChallans || []).map((dc: any) => {
        if (recordBelongsToSpecificParty(dc, transferSourceParty, hasSameNameSibling)) {
          movedChallans++;
          return {
            ...dc,
            partyId: tId,
            partyName: tName,
            customerName: tName,
            customerAddress: tAddr || dc.customerAddress,
            customerPhone: tPhone || dc.customerPhone
          };
        }
        return dc;
      });

      // Write to localStorage
      try {
        localStorage.setItem('polycables_stored_bills', JSON.stringify(updatedBills));
        localStorage.setItem('polycables_collections', JSON.stringify(updatedCollections));
        localStorage.setItem('polycables_delivery_challans', JSON.stringify(updatedChallans));
      } catch (err) {}

      // Update state
      setStoredBills?.(updatedBills);
      setCollections?.(updatedCollections);
      setDeliveryChallans?.(updatedChallans);

      // Backend sync
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            storedBills: updatedBills,
            collections: updatedCollections,
            deliveryChallans: updatedChallans
          }
        })
      }).catch((e) => console.warn('Cloud sync error:', e));

      onSyncCloud?.({
        storedBills: updatedBills,
        collections: updatedCollections,
        deliveryChallans: updatedChallans
      }, true);

      window.dispatchEvent(new Event('polycables_bills_updated'));
      window.dispatchEvent(new Event('polycables_collections_updated'));
      window.dispatchEvent(new Event('storage'));

      setToastNotification(
        `✓ One-click transfer complete: ${movedBills} bill(s) and ${movedCollections} collection(s) transferred from "${transferSourceParty.name}" to "${tName}"!`
      );

      setIsTransferModalOpen(false);
      setTransferSourcePartyId('');
      setTransferTargetPartyId('');
    } catch (err: any) {
      setToastNotification(`Transfer failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // States for Excel Import review & resolution
  const [pendingSimilarSalespersons, setPendingSimilarSalespersons] = useState<{
    matches: SimilarSalespersonMatch[];
    importedParties: Party[];
    fileName: string;
  } | null>(null);

  const [pendingImportDuplicates, setPendingImportDuplicates] = useState<{
    duplicates: { imported: Party; existing: Party }[];
    allImported: Party[];
    fileName: string;
  } | null>(null);

  const checkImportDuplicatesAndProceed = (candidateParties: Party[], fileName: string) => {
    const duplicatePairs: { imported: Party; existing: Party }[] = [];

    candidateParties.forEach((imp) => {
      const impMktKey = getPartyMarketingPersonKey(imp);
      const match = parties.find(
        (existing) =>
          existing.name.trim().toLowerCase() === imp.name.trim().toLowerCase() &&
          (existing.address || '').trim().toLowerCase() === (imp.address || '').trim().toLowerCase() &&
          getPartyMarketingPersonKey(existing) === impMktKey
      );
      if (match) {
        duplicatePairs.push({ imported: imp, existing: match });
      }
    });

    if (duplicatePairs.length > 0) {
      setPendingImportDuplicates({
        duplicates: duplicatePairs,
        allImported: candidateParties,
        fileName
      });
    } else {
      // No duplicates detected, save immediately
      setParties((prev) => [...prev, ...candidateParties]);
      setImportStatus({
        type: 'success',
        msg: `Successfully imported ${candidateParties.length} customers from "${fileName}"!`
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmAutoCorrectSalespersons = () => {
    if (!pendingSimilarSalespersons) return;
    const { matches, importedParties, fileName } = pendingSimilarSalespersons;

    const correctedParties = importedParties.map((p) => {
      const match = matches.find((m) => m.partyIds.includes(p.id));
      if (match) {
        return {
          ...p,
          salespersonName: match.matchedSalesperson.name,
          salesmanCode: match.matchedSalesperson.code,
          branchName: match.matchedSalesperson.branchName || p.branchName
        };
      }
      return p;
    });

    setPendingSimilarSalespersons(null);
    setToastNotification(`Auto-corrected ${matches.length} salesperson name(s) to directory personnel.`);
    checkImportDuplicatesAndProceed(correctedParties, fileName);
  };

  const handleSkipAutoCorrectSalespersons = () => {
    if (!pendingSimilarSalespersons) return;
    const { importedParties, fileName } = pendingSimilarSalespersons;
    setPendingSimilarSalespersons(null);
    checkImportDuplicatesAndProceed(importedParties, fileName);
  };

  const handleResolveDuplicatesKeepExisting = () => {
    if (!pendingImportDuplicates) return;
    const { duplicates, allImported, fileName } = pendingImportDuplicates;
    const duplicateImportIds = new Set(duplicates.map((d) => d.imported.id));
    const newPartiesToAdd = allImported.filter((p) => !duplicateImportIds.has(p.id));

    setParties((prev) => [...prev, ...newPartiesToAdd]);
    setPendingImportDuplicates(null);
    setImportStatus({
      type: 'success',
      msg: `Imported ${newPartiesToAdd.length} new customer(s). Kept existing records for ${duplicates.length} duplicate(s).`
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResolveDuplicatesOverwrite = () => {
    if (!pendingImportDuplicates) return;
    const { duplicates, allImported, fileName } = pendingImportDuplicates;

    const overwriteMap = new Map<string, Party>();
    duplicates.forEach((d) => {
      overwriteMap.set(d.existing.id, { ...d.imported, id: d.existing.id });
    });

    const duplicateImportIds = new Set(duplicates.map((d) => d.imported.id));
    const newPartiesToAdd = allImported.filter((p) => !duplicateImportIds.has(p.id));

    setParties((prev) => {
      const updatedExisting = prev.map((p) => (overwriteMap.has(p.id) ? overwriteMap.get(p.id)! : p));
      return [...updatedExisting, ...newPartiesToAdd];
    });

    setPendingImportDuplicates(null);
    setImportStatus({
      type: 'success',
      msg: `Overwrote ${duplicates.length} existing customer(s) and added ${newPartiesToAdd.length} new customer(s).`
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResolveDuplicatesAddAll = () => {
    if (!pendingImportDuplicates) return;
    const { allImported, fileName } = pendingImportDuplicates;

    setParties((prev) => [...prev, ...allImported]);
    setPendingImportDuplicates(null);
    setImportStatus({
      type: 'success',
      msg: `Imported all ${allImported.length} customers (including duplicates) from "${fileName}".`
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleXLSXFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportStatus(null);
      const { importedParties, count, similarSalespersons } = await parseXLSXToParties(file, salespersons);

      if (count === 0) {
        setImportStatus({
          type: 'error',
          msg: 'No valid customer rows found in the selected Excel file.'
        });
        return;
      }

      // If similar salesperson detected, ask user to auto-correct
      if (similarSalespersons && similarSalespersons.length > 0) {
        setPendingSimilarSalespersons({
          matches: similarSalespersons,
          importedParties,
          fileName: file.name
        });
        return;
      }

      // Check duplicates (same party name, address and salesperson name)
      checkImportDuplicatesAndProceed(importedParties, file.name);
    } catch (err: any) {
      setImportStatus({
        type: 'error',
        msg: err?.message || 'Error processing Excel file. Please ensure it is a valid .xlsx or .xls file.'
      });
    }
  };

  React.useEffect(() => {
    localStorage.setItem('polycables_trashed_parties', JSON.stringify(trashedParties));
  }, [trashedParties]);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newParty, setNewParty] = useState({
    name: '',
    address: '',
    phone: '',
    salesmanCode: '',
    salespersonName: '',
    openingBalance: ''
  });

  // Resolve sales center for any party based on explicit branch or marketing person
  const getPartySalesCenter = (p: Party): string => {
    if (p.branchName && p.branchName.trim()) {
      return cleanSalesCenterName(p.branchName);
    }
    if (p.salesmanCode) {
      const sp = salespersons.find(
        (s) => s.code.toLowerCase() === p.salesmanCode?.toLowerCase()
      );
      if (sp?.branchName && sp.branchName.trim()) {
        return cleanSalesCenterName(sp.branchName);
      }
    }
    return 'Madhupur Sales Center';
  };

  const isSuperOrAccounts = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);
  const allowedBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, salespersons),
    [branches, currentUser, salespersons]
  );

  // Distinct list of sales centers (restricted to Admin's assigned centers)
  const availableCenters = useMemo(() => {
    const set = new Set<string>();
    if (!isSuperOrAccounts && allowedBranches.length > 0) {
      allowedBranches.forEach((b) => {
        if (b.name) set.add(cleanSalesCenterName(b.name));
      });
      return Array.from(set).sort();
    }
    set.add('Madhupur Sales Center');
    (branches || []).forEach((b) => {
      if (b.name) set.add(cleanSalesCenterName(b.name));
    });
    salespersons.forEach((s) => {
      if (s.branchName) set.add(cleanSalesCenterName(s.branchName));
    });
    parties.forEach((p) => {
      const c = getPartySalesCenter(p);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [branches, salespersons, parties, allowedBranches, isSuperOrAccounts]);

  // Filter salespersons strictly based on selected / allowed sales center
  const filteredSalespersons = useMemo(() => {
    return filterSalespersonsByBranch(salespersons, selectedCenterFilter, allowedBranches, currentUser);
  }, [salespersons, selectedCenterFilter, allowedBranches, currentUser]);

  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const pCenter = getPartySalesCenter(p);

      // Sales Center filter
      if (selectedCenterFilter !== 'all') {
        if (pCenter.toLowerCase() !== selectedCenterFilter.toLowerCase()) {
          return false;
        }
      }

      // Salesperson filter
      if (selectedSpFilter !== 'all') {
        if (!p.salesmanCode || p.salesmanCode.toLowerCase() !== selectedSpFilter.toLowerCase()) {
          return false;
        }
      }

      // Duplicates only filter
      if (filterDuplicatesOnly && !allDuplicatePartyIds.has(p.id)) {
        return false;
      }

      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.salesmanCode && p.salesmanCode.toLowerCase().includes(q)) ||
        (p.salespersonName && p.salespersonName.toLowerCase().includes(q)) ||
        pCenter.toLowerCase().includes(q)
      );
    });
  }, [parties, selectedCenterFilter, selectedSpFilter, filterDuplicatesOnly, allDuplicatePartyIds, search]);

  // Pagination State - enables Customer Directory to fit neatly on one page / screen
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(15);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCenterFilter, selectedSpFilter, filterDuplicatesOnly]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredParties.length / (typeof pageSize === 'number' ? pageSize : 15)));
  }, [filteredParties.length, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedParties = useMemo(() => {
    if (pageSize === 'all') return filteredParties;
    const size = typeof pageSize === 'number' ? pageSize : 15;
    const start = (currentPage - 1) * size;
    return filteredParties.slice(start, start + size);
  }, [filteredParties, currentPage, pageSize]);

  // Keep form ref updated for auto-save on blur
  useEffect(() => {
    editFormRef.current = editForm;
  }, [editForm]);

  const handleStartEdit = (p: Party) => {
    setEditingId(p.id);
    setEditForm({ ...p });
    originalPartyRef.current = { ...p };
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    if (!checkCanTakeEntry('Edit Customer', setToastNotification)) return;

    // Find salesperson name & sales center if salesmanCode is set
    let spName = editForm.salespersonName;
    let branchName = editForm.branchName || 'Madhupur Sales Center';
    let branchId = editForm.branchId;

    if (editForm.salesmanCode) {
      const matchSp = salespersons.find((s) => s.code.toLowerCase() === editForm.salesmanCode?.toLowerCase());
      if (matchSp) {
        spName = matchSp.name;
        if (matchSp.branchName) branchName = matchSp.branchName;
        if (matchSp.branchId) branchId = matchSp.branchId;
      }
    }

    const updated: Party = {
      ...editForm,
      salespersonName: spName,
      branchName: branchName,
      branchId: branchId,
      openingBalance: editForm.openingBalance !== undefined ? Number(editForm.openingBalance) : 0,
      updatedAt: new Date().toISOString()
    };
    setParties((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      try { localStorage.setItem('polycables_parties', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ parties: next }, true);
      return next;
    });
    setEditingId(null);
    setEditForm(null);
    originalPartyRef.current = null;
  };

  // Auto-save on outside click when editing a party
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!editingId || !editFormRef.current || !originalPartyRef.current) return;
      if (editPartyRowRef.current && !editPartyRowRef.current.contains(e.target as Node)) {
        const current = editFormRef.current;
        const original = originalPartyRef.current;
        const hasChanges =
          current.name.trim() !== original.name.trim() ||
          current.address.trim() !== original.address.trim() ||
          (current.phone || '').trim() !== (original.phone || '').trim() ||
          (current.salesmanCode || '') !== (original.salesmanCode || '') ||
          Number(current.openingBalance || 0) !== Number(original.openingBalance || 0);

        if (hasChanges) {
          let spName = current.salespersonName;
          let branchName = current.branchName || 'Madhupur Sales Center';
          let branchId = current.branchId;
          if (current.salesmanCode) {
            const matchSp = salespersons.find((s) => s.code.toLowerCase() === current.salesmanCode?.toLowerCase());
            if (matchSp) {
              spName = matchSp.name;
              if (matchSp.branchName) branchName = matchSp.branchName;
              if (matchSp.branchId) branchId = matchSp.branchId;
            }
          }
          const updated: Party = {
            ...current,
            salespersonName: spName,
            branchName: branchName,
            branchId: branchId,
            openingBalance: current.openingBalance !== undefined ? Number(current.openingBalance) : 0,
            updatedAt: new Date().toISOString()
          };
          setParties((prev) => {
            const next = prev.map((p) => (p.id === updated.id ? updated : p));
            try { localStorage.setItem('polycables_parties', JSON.stringify(next)); } catch {}
            onSyncCloud?.({ parties: next }, true);
            return next;
          });
          setToastNotification(`Customer "${updated.name}" changes auto-saved.`);
        }
        setEditingId(null);
        setEditForm(null);
        originalPartyRef.current = null;
      }
    };

    const handleTouchOutside = (e: TouchEvent) => handleOutsideClick(e as unknown as MouseEvent);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleTouchOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, [editingId, salespersons, setParties]);

  const handleCreateParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParty.name.trim()) return;
    if (!checkCanTakeEntry('Add Customer', setToastNotification)) return;

    const effectiveSalesmanCode = newParty.salesmanCode.trim() || userLoginFilters.salesmanCode || '';
    let spName = newParty.salespersonName.trim() || userLoginFilters.salesmanName || '';
    let branchName = userLoginFilters.branchName || 'Madhupur Sales Center';
    let branchId: string | undefined = userLoginFilters.branchId || undefined;

    if (effectiveSalesmanCode) {
      const matchSp = salespersons.find((s) => s.code.toLowerCase() === effectiveSalesmanCode.toLowerCase());
      if (matchSp) {
        spName = matchSp.name;
        if (matchSp.branchName) branchName = matchSp.branchName;
        if (matchSp.branchId) branchId = matchSp.branchId;
      }
    }

    if (!branchId && selectedCenterFilter !== 'all') {
      const matchedBranch = branches.find(
        (b) => cleanSalesCenterName(b.name).toLowerCase() === selectedCenterFilter.toLowerCase()
      );
      if (matchedBranch) {
        branchId = matchedBranch.id;
        branchName = matchedBranch.name;
      } else {
        branchName = selectedCenterFilter;
      }
    }

    const partyToAdd: Party = {
      id: `party-${Date.now()}`,
      name: newParty.name.trim(),
      address: newParty.address.trim(),
      phone: newParty.phone.trim(),
      salesmanCode: effectiveSalesmanCode || undefined,
      salespersonName: spName.trim() || undefined,
      branchName: branchName,
      branchId: branchId,
      createdBy: currentUser?.name || currentUser?.username || undefined,
      openingBalance: newParty.openingBalance !== '' ? Number(newParty.openingBalance) : 0,
      updatedAt: new Date().toISOString()
    };

    // Check duplicate: only flag as duplicate when name, address AND marketing person/salesman match
    const newPartyMktKey = getPartyMarketingPersonKey(partyToAdd);
    const existingDuplicate = parties.find(
      (p) =>
        p.name.trim().toLowerCase() === partyToAdd.name.toLowerCase() &&
        (p.address || '').trim().toLowerCase() === (partyToAdd.address || '').toLowerCase() &&
        getPartyMarketingPersonKey(p) === newPartyMktKey
    );

    if (existingDuplicate) {
      setCreateDuplicateConflict({
        existing: existingDuplicate,
        newParty: partyToAdd
      });
      return;
    }

    setParties((prev) => [...prev, partyToAdd]);
    setIsAddingNew(false);
    setSearch(''); // Clear search filter so new customer is immediately visible live
    setNewParty({ name: '', address: '', phone: '', salesmanCode: '', salespersonName: '', openingBalance: '' });
    setToastNotification(`Customer "${partyToAdd.name}" added successfully. Filter cleared to show live.`);
  };

  // Bulk Add Party Names (Supports line-by-line paste: "Name, Address, Phone")
  const handleProcessBulkAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkPartyText.trim()) return;
    if (!checkCanTakeEntry('Add Customers Bulk', setToastNotification)) return;

    const lines = bulkPartyText.split('\n').map((l) => l.trim()).filter(Boolean);
    const createdList: Party[] = [];
    const defaultBranchName = userLoginFilters.branchName || (selectedCenterFilter !== 'all' ? selectedCenterFilter : 'Madhupur Sales Center');
    const defaultBranchId = userLoginFilters.branchId || branches.find((b) => cleanSalesCenterName(b.name).toLowerCase() === defaultBranchName.toLowerCase())?.id;

    lines.forEach((line, idx) => {
      // Split by comma or tab or bar
      const parts = line.split(/[,;\t|]+/).map((p) => p.trim());
      const name = parts[0] || '';
      if (name) {
        createdList.push({
          id: `party-bulk-${Date.now()}-${idx}`,
          name: name,
          address: parts[1] || '',
          phone: parts[2] || '',
          salesmanCode: userLoginFilters.salesmanCode || undefined,
          salespersonName: userLoginFilters.salesmanName || undefined,
          branchId: defaultBranchId,
          branchName: defaultBranchName,
          createdBy: currentUser?.name || currentUser?.username || undefined
        });
      }
    });

    if (createdList.length > 0) {
      setParties((prev) => [...prev, ...createdList]);
      setBulkPartyText('');
      setIsBulkAddOpen(false);
      setToastNotification(`Added ${createdList.length} customers in bulk.`);
    }
  };

  const handleDeleteParty = (id: string) => {
    const toTrash = parties.find((p) => p.id === id);
    if (!toTrash) return;

    // Check transaction history to protect data integrity and accounting records
    const partyNameNorm = toTrash.name.trim().toLowerCase();
    const hasSameNameSibling = parties.filter((p) => p.name.trim().toLowerCase() === partyNameNorm).length > 1;
    const linkedBills = (storedBills || []).filter((b: any) =>
      recordBelongsToSpecificParty(b, toTrash, hasSameNameSibling)
    );
    const linkedChallans = (deliveryChallans || []).filter((c) =>
      recordBelongsToSpecificParty(c, toTrash, hasSameNameSibling)
    );
    const linkedCollections = (collections || []).filter((c) =>
      recordBelongsToSpecificParty(c, toTrash, hasSameNameSibling)
    );
    const collectionsTotal = linkedCollections.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    if (linkedBills.length > 0 || linkedChallans.length > 0 || linkedCollections.length > 0) {
      setBlockedPartyDeletion({
        party: toTrash,
        billsCount: linkedBills.length,
        billsSample: linkedBills.slice(0, 4).map((b: any) => b.billNo || b.header?.billNo).filter(Boolean),
        challansCount: linkedChallans.length,
        challansSample: linkedChallans.slice(0, 4).map((c) => c.challanNo).filter(Boolean),
        collectionsCount: linkedCollections.length,
        collectionsAmount: collectionsTotal,
      });
      return;
    }

    setDeleteConfirmParty(toTrash);
  };

  const confirmExecuteDeleteParty = () => {
    if (!deleteConfirmParty) return;
    if (!checkCanTakeEntry('Delete Customer', setToastNotification)) return;
    const toTrash = deleteConfirmParty;
    recordDeletedEntityId(toTrash.id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [toTrash.id], type: 'party' })
    }).catch(() => {});

    moveToTrash('polycables_trashed_parties', toTrash, 'Party Directory');
    const updatedTrash = [...trashedParties, toTrash];
    setTrashedParties(updatedTrash);
    try {
      localStorage.setItem('polycables_trashed_parties', JSON.stringify(updatedTrash));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error(e);
    }

    setParties((prev) => {
      const next = prev.filter((p) => p.id !== toTrash.id);
      try { localStorage.setItem('polycables_parties', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ parties: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      next.delete(toTrash.id);
      return next;
    });
    setDeleteConfirmParty(null);
    setToastNotification(`Customer "${toTrash.name}" moved to Trash Bin.`);
  };

  const handleBulkDelete = () => {
    if (selectedPartyIds.size === 0) return;
    setIsBulkDeleteConfirmOpen(true);
  };

  const confirmExecuteBulkDelete = () => {
    if (selectedPartyIds.size === 0) return;
    if (!checkCanTakeEntry('Bulk Delete Customers', setToastNotification)) return;
    const toTrashList = parties.filter((p) => selectedPartyIds.has(p.id));
    const trashIdSet = new Set(toTrashList.map((p) => p.id));
    recordDeletedEntityIds(toTrashList.map((p) => p.id));
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: toTrashList.map((p) => p.id), type: 'party' })
    }).catch(() => {});

    moveMultipleToTrash('polycables_trashed_parties', toTrashList, 'Party Directory');
    const updatedTrash = [...trashedParties, ...toTrashList];
    setTrashedParties(updatedTrash);
    try {
      localStorage.setItem('polycables_trashed_parties', JSON.stringify(updatedTrash));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error(e);
    }
    setParties((prev) => {
      const next = prev.filter((p) => !trashIdSet.has(p.id));
      try { localStorage.setItem('polycables_parties', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ parties: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
    setSelectedPartyIds(new Set());
    setIsBulkDeleteConfirmOpen(false);
    setToastNotification(`${toTrashList.length} customer(s) moved to Trash Bin.`);
  };

  const handleRestoreParty = (id: string) => {
    const toRestore = trashedParties.find((p) => p.id === id);
    if (toRestore) {
      unrecordDeletedEntityId(id);
      removeIdsFromAllTrashStorages([id]);
      const restoredParty: Party = { ...toRestore, updatedAt: new Date().toISOString() };
      setParties((prev) => {
        const next = [...prev.filter((p) => p.id !== id), restoredParty];
        try { localStorage.setItem('polycables_parties', JSON.stringify(next)); } catch {}
        onSyncCloud?.({ parties: next, restoredEntityIds: [id], deletedEntityIds: getGlobalDeletedIds() }, true);
        return next;
      });
      setTrashedParties((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handlePermanentDeleteParty = (id: string) => {
    recordDeletedEntityId(id);
    removeIdsFromAllTrashStorages([id]);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: [id], type: 'party' })
    }).catch(() => {});
    onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);
    setTrashedParties((prev) => prev.filter((p) => p.id !== id));
  };

  const handleEmptyTrashParties = () => {
    if (trashedParties.length === 0) return;
    if (window.confirm(`Are you sure you want to permanently delete all ${trashedParties.length} parties in Trash?`)) {
      const ids = trashedParties.map((p) => p.id);
      recordDeletedEntityIds(ids);
      removeIdsFromAllTrashStorages(ids);
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ ids, type: 'party' })
      }).catch(() => {});
      onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);
      setTrashedParties([]);
    }
  };

  const handleToggleSelectParty = (id: string) => {
    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllParties = () => {
    const targetIds = (pageSize === 'all' ? filteredParties : paginatedParties).map((p) => p.id);
    const allSelected = targetIds.length > 0 && targetIds.every((id) => selectedPartyIds.has(id));
    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        targetIds.forEach((id) => next.delete(id));
      } else {
        targetIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handlePrintDirectoryAsText = () => {
    const title = `Customer_Directory_${selectedCenterFilter === 'all' ? 'All' : selectedCenterFilter.replace(/\s+/g, '_')}`;
    const headerLines = [
      '========================================================================================',
      '                                      POLY CABLES                                       ',
      '                       CUSTOMER DIRECTORY • MASTER CLIENT REGISTER                      ',
      '========================================================================================',
      `Sales Center   : ${selectedCenterFilter === 'all' ? 'All Sales Centers' : selectedCenterFilter}`,
      `Representative : ${selectedSpFilter === 'all' ? 'All' : selectedSpFilter}`,
      `Total Parties  : ${filteredParties.length}`,
      `Exported Date  : ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`,
      '========================================================================================\n'
    ].join('\n');

    const headers = ['SL', 'Party Name', 'Address', 'Phone', 'Salesperson', 'Sales Center', 'Op. Bal (Tk)'];
    const rows = filteredParties.map((p, idx) => [
      idx + 1,
      p.name || '',
      p.address || '',
      p.phone || p.mobile || '',
      p.salespersonName || p.salesmanCode || '',
      getPartySalesCenter(p),
      Number(p.openingBalance || 0).toLocaleString('en-IN')
    ]);

    const tableStr = formatAsciiTable(
      headers,
      rows,
      ['center', 'left', 'left', 'left', 'left', 'left', 'right']
    );

    const totalOpBal = filteredParties.reduce((sum, p) => sum + Number(p.openingBalance || 0), 0);
    const summaryLines = [
      '\n========================================================================================',
      `TOTAL OPENING BALANCE: Tk ${totalOpBal.toLocaleString('en-IN')}`,
      `TOTAL REGISTERED PARTIES: ${filteredParties.length}`,
      '========================================================================================'
    ].join('\n');

    const fullContent = `${headerLines}\n${tableStr}\n${summaryLines}`;
    downloadTextFile(title, fullContent);
  };

  return (
    <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans text-white print:bg-white print:text-black print:shadow-none print:border-none">
      {/* Printable Company Header (Visible ONLY on window.print) */}
      <div className="hidden print:block mb-4 text-center border-b-2 border-slate-900 pb-3">
        <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
          POLY CABLES
        </h1>
        <p className="text-xs text-slate-700">
          Customer Directory • Master Client Register
        </p>
        <div className="text-[11px] font-mono text-slate-600 mt-2 flex justify-between px-2 border-t border-slate-300 pt-1">
          <span>Sales Center: {selectedCenterFilter === 'all' ? 'All Sales Centers' : selectedCenterFilter}</span>
          <span>Representative: {selectedSpFilter === 'all' ? 'All' : selectedSpFilter}</span>
          <span>Total Parties: {filteredParties.length}</span>
          <span>Printed: {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </div>

      {/* Header Bar */}
      <div className="bg-[#0c2638]/60 text-white p-4 flex items-center justify-between gap-3 border-b border-cyan-500/20 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="bg-cyan-500/20 border border-cyan-400/35 p-2 rounded-xl shadow-[0_0_16px_rgba(34,211,238,0.18)]">
            <Building2 className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Customer Directory</h2>
          </div>
        </div>
      </div>

      {/* Bulk Party Input & XLSX Import Modal */}
      {isBulkAddOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150 text-white">
            <div className="bg-[#0c2638]/90 text-white p-4 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Bulk Add Customers / Parties</h3>
              </div>
              <button
                onClick={() => setIsBulkAddOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab switcher */}
            <div className="flex border-b border-cyan-500/20 bg-[#061520]/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setBulkMode('xlsx');
                  setImportStatus(null);
                }}
                className={`flex-1 py-2.5 px-4 flex items-center justify-center space-x-2 border-b-2 cursor-pointer transition-colors ${
                  bulkMode === 'xlsx'
                    ? 'border-emerald-400 text-emerald-300 bg-[#0c2638]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Import from Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkMode('text');
                  setImportStatus(null);
                }}
                className={`flex-1 py-2.5 px-4 flex items-center justify-center space-x-2 border-b-2 cursor-pointer transition-colors ${
                  bulkMode === 'text'
                    ? 'border-cyan-400 text-cyan-200 bg-[#0c2638]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Paste Plain Text</span>
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {importStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-start space-x-2 ${
                    importStatus.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-400/35 text-rose-200'
                  }`}
                >
                  {importStatus.type === 'success' ? (
                    <FileCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{importStatus.msg}</span>
                </div>
              )}

              {bulkMode === 'xlsx' ? (
                <div className="space-y-4">
                  <div className="cyber-glass-subcard p-3.5 rounded-xl space-y-2">
                    <p className="font-bold text-cyan-200">Instructions for Excel File Upload:</p>
                    <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1">
                      <li>Exact columns supported: <strong className="text-white">Party name</strong>, <strong className="text-white">Address</strong>, <strong className="text-white">Phone</strong>, <strong className="text-white">Salesperson</strong>, <strong className="text-white">Sales Center</strong>, <strong className="text-white">Opening Balance</strong>.</li>
                      <li>Column order is automatically detected based on headers.</li>
                      <li>Existing salespersons and sales centers will be automatically matched and linked.</li>
                    </ul>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={downloadPartyTemplateXLSX}
                        className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold px-3 py-1.5 rounded-lg border border-emerald-400/40 flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Download Sample XLSX Template</span>
                      </button>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-cyan-500/35 hover:border-emerald-400 bg-[#061520]/80 hover:bg-emerald-500/10 rounded-xl p-6 text-center transition-all">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleXLSXFileUpload}
                      className="hidden"
                      id="customer-xlsx-upload"
                    />
                    <label htmlFor="customer-xlsx-upload" className="cursor-pointer block space-y-2">
                      <Upload className="w-8 h-8 text-emerald-400 mx-auto" />
                      <div>
                        <span className="font-bold text-sm text-white">Click to Select Excel File</span>
                        <p className="text-slate-400 text-[11px]">Supports .xlsx and .xls spreadsheets</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-cyan-500/20">
                    <button
                      type="button"
                      onClick={() => setIsBulkAddOpen(false)}
                      className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 p-2 rounded-lg font-semibold cursor-pointer"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleProcessBulkAdd} className="space-y-4">
                  <div>
                    <label className="block font-bold text-cyan-200 mb-1.5">
                      Paste Multiple Customers (1 Party Per Line)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Format: <code className="bg-[#0b2334] px-1.5 py-0.5 rounded text-cyan-200 border border-cyan-500/20">Shop Name, Address, Phone Number</code>
                    </p>
                    <textarea
                      rows={6}
                      value={bulkPartyText}
                      onChange={(e) => setBulkPartyText(e.target.value)}
                      placeholder={`Alam Hardware, Madhupur, 01711000000\nSonchita Cable Store, Dhaka, 01822000000\nRahim Electric, Chittagong, 01933000000`}
                      className="w-full p-3 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                    <button
                      type="button"
                      onClick={() => setIsBulkAddOpen(false)}
                      className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 px-4 py-2 rounded-xl font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-5 py-2 rounded-xl font-bold shadow-sm cursor-pointer"
                    >
                      Import All Customers
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate / Similar Party Resolution Modal */}
      {showDuplicateFinder && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-3xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600/80 to-amber-800/80 text-white p-4 px-5 flex items-center justify-between border-b border-amber-400/30">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-black/25 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm sm:text-base text-white">Duplicate & Similar Customer Review</h3>
                    <span className="text-[10px] font-black uppercase bg-black/30 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/30">
                      {duplicateGroups.length} Group{duplicateGroups.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-100">
                    Detect exact duplicates or close name variations and eliminate unwanted records.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDuplicateFinder(false)}
                className="text-amber-200 hover:text-white p-1.5 rounded-lg bg-black/15 hover:bg-black/30 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Note */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="bg-amber-500/15 border border-amber-400/35 rounded-xl p-3.5 flex items-start space-x-3">
                <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-100 space-y-1">
                  <p className="font-bold">
                    Important: Similar parties (such as "Lucky Enterprise Electric & Hardwa" and "Lucky Enterprise Electric & Hardware") are kept as separate, independent parties and are never auto-merged.
                  </p>
                  <p className="text-amber-200/80">
                    If an entry was created by mistake or duplicate import, click <strong className="text-white">"Delete Duplicate"</strong> to move it into the Trash Bin. You can restore it anytime if needed.
                  </p>
                </div>
              </div>

              {duplicateGroups.length === 0 ? (
                <div className="text-center py-10 space-y-3 cyber-glass-subcard rounded-xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <div>
                    <h4 className="font-bold text-white text-sm">No Duplicates Found</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                      All customer names in your directory are distinct and unique.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Multi-Selection Action Toolbar */}
                  <div className="cyber-glass-subcard text-white rounded-xl p-3 px-4 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-2.5">
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-bold text-xs text-slate-100">
                          {selectedDuplicateIds.size > 0 ? (
                            <>
                              <span className="text-amber-400 font-extrabold">{selectedDuplicateIds.size}</span> of {allDuplicatePartyIds.size} duplicate entries selected
                            </>
                          ) : (
                            <>Multi-Selection: Select duplicates across all groups</>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={handleAutoRemoveAllDuplicates}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-lg cursor-pointer transition-colors shadow-xs flex items-center space-x-1.5"
                        title="Automatically remove all duplicate entries across all groups, keeping the first primary customer and reassigning bills"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Auto-Remove All Duplicates ({secondaryDuplicatePartyIds.size})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAllDuplicatesKeepFirst}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg cursor-pointer transition-colors shadow-xs"
                        title="Keep the first primary entry of every group and select all extra duplicates"
                      >
                        Select Duplicates (Keep 1st)
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAllDuplicates}
                        className="px-2.5 py-1 bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 font-semibold rounded-lg cursor-pointer transition-colors"
                        title="Select all duplicate entries"
                      >
                        Select All ({allDuplicatePartyIds.size})
                      </button>
                      {selectedDuplicateIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleDeselectAllDuplicates}
                          className="px-2.5 py-1 bg-[#0b2334] hover:bg-[#11334b] text-slate-300 border border-cyan-500/25 font-semibold rounded-lg cursor-pointer transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                      {selectedDuplicateIds.size > 0 && (
                        <button
                          type="button"
                          onClick={executeDeleteSelectedDuplicates}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-lg cursor-pointer transition-colors shadow-sm flex items-center space-x-1.5 ml-1 animate-in fade-in"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Selected ({selectedDuplicateIds.size})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {duplicateGroups.map((grp, gIdx) => {
                    const isGroupAllSelected = grp.parties.every((p) => selectedDuplicateIds.has(p.id));
                    return (
                      <div
                        key={grp.key}
                        className="border border-amber-400/35 rounded-xl bg-[#0b2334]/75 shadow-xs overflow-hidden"
                      >
                        <div className="bg-amber-500/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 text-xs font-bold text-amber-200">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isGroupAllSelected}
                              onChange={() => toggleSelectDuplicateGroup(grp)}
                              className="rounded border-amber-400 text-amber-500 focus:ring-amber-400 cursor-pointer w-4 h-4"
                              title="Select / deselect entire group"
                            />
                            <span>Group #{gIdx + 1} — {grp.reason}</span>
                            <span className="text-[10px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-bold">
                              {grp.parties.length} Variations
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectGroupDuplicatesKeepFirst(grp)}
                            className="text-[11px] font-semibold text-amber-200 bg-amber-500/20 hover:bg-amber-500/35 px-2 py-1 rounded-md transition-colors cursor-pointer border border-amber-400/35"
                            title="Keep primary #1 and select duplicate copies"
                          >
                            Select Copies (Keep #1)
                          </button>
                        </div>

                        <div className="p-3 divide-y divide-cyan-500/15">
                          {grp.parties.map((p, pIdx) => {
                            const isSelected = selectedDuplicateIds.has(p.id);
                            const isPrimary = pIdx === 0;
                            return (
                              <div
                                key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`}
                                className={`py-3 px-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                                  isSelected ? 'bg-rose-500/15 ring-1 ring-rose-400/40 border border-rose-400/30' : 'hover:bg-white/[0.04]'
                                }`}
                              >
                                <div className="flex items-start space-x-3">
                                  <div className="pt-0.5">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectDuplicate(p.id)}
                                      className="rounded border-cyan-500/35 text-rose-500 focus:ring-rose-500 cursor-pointer w-4 h-4"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-black text-white text-xs sm:text-sm">{p.name}</span>
                                      <span className="font-mono text-[10px] text-slate-400">ID: {p.id}</span>
                                      {isPrimary ? (
                                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-400/35">
                                          Primary #1 (Original)
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-400/35">
                                          Copy #{pIdx}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300">
                                      <span>📍 {p.address || 'No Address'}</span>
                                      {p.phone && <span>📞 {p.phone}</span>}
                                      {p.salespersonName && <span>👤 SP: {p.salespersonName}</span>}
                                      <span className="text-emerald-300 font-semibold">💰 Balance: ৳{Number(p.openingBalance || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteParty(p.id);
                                    }}
                                    className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/35 rounded-lg font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setShowDuplicateFinder(false)}
                  className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trash Bin View */}
      {showTrashBin ? (
        <div className="p-4 bg-[#071824]/40 space-y-4">
          <div className="flex items-center justify-between cyber-glass-subcard text-white p-3 px-4 rounded-xl">
            <div className="flex items-center space-x-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <h3 className="font-bold text-sm">Customer Directory Trash Bin ({trashedParties.length})</h3>
            </div>
            {trashedParties.length > 0 && (
              <button
                onClick={handleEmptyTrashParties}
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Empty Trash Permanently
              </button>
            )}
          </div>

          {trashedParties.length === 0 ? (
            <div className="text-center py-12 text-slate-400 cyber-glass-subcard rounded-xl">
              <Trash2 className="w-12 h-12 mx-auto text-slate-600 mb-2" />
              <p className="font-bold text-white">Trash Bin is Empty</p>
              <p className="text-xs text-slate-400 mt-1">Deleted customers will appear here where you can restore or permanently remove them.</p>
            </div>
          ) : (
            <div className="cyber-glass-subcard rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                    <th className="p-3 w-12 text-center">SL #</th>
                    <th className="p-3">Customer Name</th>
                    <th className="p-3">Address</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 text-slate-200">
                  {trashedParties.map((p, idx) => (
                    <tr key={p.id ? `${p.id}-${idx}` : `trashed-party-${idx}`} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-bold text-white">{p.name}</td>
                      <td className="p-3 text-slate-300">{p.address || '-'}</td>
                      <td className="p-3 text-slate-300">{p.phone || '-'}</td>
                      <td className="p-3 text-center space-x-2">
                        <button
                          onClick={() => handleRestoreParty(p.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handlePermanentDeleteParty(p.id)}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer"
                        >
                          Delete Permanently
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Bulk Action Bar when items selected */}
          {selectedPartyIds.size > 0 && (
            <div className="bg-rose-500/15 border-b border-rose-400/30 p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2 font-bold text-rose-200">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>{selectedPartyIds.size} customer(s) selected.</span>
              </div>
              <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const firstSelected = Array.from(selectedPartyIds)[0];
                    if (firstSelected) {
                      setTransferSourcePartyId(firstSelected);
                      setTransferTargetPartyId('');
                      setIsTransferModalOpen(true);
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-xs cursor-pointer flex items-center space-x-1"
                  title="Transfer all bills & collections from selected customer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transfer Records</span>
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-xs cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedPartyIds.size})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPartyIds(new Set())}
                  className="bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Quick Duplicate Selection Banner when duplicates are detected */}
          {duplicateGroups.length > 0 && (
            <div className="bg-amber-500/10 border-b border-amber-400/30 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2 text-amber-200 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Found <strong className="text-white">{duplicateGroups.length}</strong> duplicate/similar customer group(s) with <strong className="text-white">{secondaryDuplicatePartyIds.size}</strong> duplicate copies.
                </span>
              </div>
              <div className="flex items-center space-x-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPartyIds(new Set(secondaryDuplicatePartyIds));
                  }}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold cursor-pointer transition-colors shadow-xs"
                  title="Select all extra duplicate copies (keeps primary entry unselected)"
                >
                  Select Duplicates (Keep 1st) ({secondaryDuplicatePartyIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPartyIds(new Set(allDuplicatePartyIds));
                  }}
                  className="px-2.5 py-1 bg-[#0b2334] hover:bg-[#11334b] text-amber-300 border border-cyan-500/25 rounded-lg font-bold cursor-pointer transition-colors"
                  title="Select all duplicate entries across all groups"
                >
                  Select All Duplicates ({allDuplicatePartyIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors border ${
                    filterDuplicatesOnly
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                      : 'bg-[#0b2334] hover:bg-[#11334b] text-amber-200 border-amber-400/35'
                  }`}
                  title="Toggle table filter to display only duplicate parties"
                >
                  {filterDuplicatesOnly ? 'Showing Duplicates' : 'Filter Duplicates'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuplicateFinder(true)}
                  className="px-2.5 py-1 bg-[#0b2334] hover:bg-[#11334b] text-amber-200 border border-amber-400/35 rounded-lg font-bold cursor-pointer transition-colors"
                >
                  Review Duplicates Modal
                </button>
              </div>
            </div>
          )}

          {/* Search Bar & Salesperson Group Filter Bar */}
          <div className="p-2.5 px-3.5 bg-[#081e2d]/85 backdrop-blur-xl border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-0 w-full flex-wrap">
              <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search party name, location, or salesman..."
                  className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 font-medium"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sales Center Filter Dropdown */}
              <SalesCenterSearchFilter
                value={selectedCenterFilter}
                onChange={(newCenter) => {
                  setSelectedCenterFilter(newCenter);
                  setSelectedSpFilter('all');
                }}
                options={availableCenters.map((center) => ({ id: center, name: center, label: center }))}
                isLocked={!isSuperOrAccounts && !isAnyAdmin(currentUser) && availableCenters.length <= 1}
                lockedReason="Locked to assigned sales center"
                includeAllOption={isSuperOrAccounts || isAnyAdmin(currentUser) || availableCenters.length > 1}
                allOptionLabel={
                  isSuperOrAccounts
                    ? `All Sales Centers (${availableCenters.length})`
                    : `All Assigned Centers (${availableCenters.length})`
                }
                allOptionValue="all"
                label="Sales Center:"
                theme="dark"
                size="sm"
                widthClass="min-w-0 w-full sm:w-auto sm:min-w-[170px] sm:max-w-[230px]"
              />

              {/* Salesperson Filter Dropdown */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <select
                  value={selectedSpFilter}
                  onChange={(e) => setSelectedSpFilter(e.target.value)}
                  className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
                  title="Filter by Marketing Representative"
                >
                  <option value="all" className="bg-[#091e2c] text-white">All Salespersons ({filteredSalespersons.length})</option>
                  {filteredSalespersons.map((s) => (
                    <option key={s.id} value={s.code} className="bg-[#091e2c] text-white">
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {(search || selectedSpFilter !== 'all' || ((isSuperOrAccounts || isAnyAdmin(currentUser) || availableCenters.length > 1) && selectedCenterFilter !== 'all')) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedSpFilter('all');
                    if (isSuperOrAccounts || isAnyAdmin(currentUser) || availableCenters.length > 1) {
                      setSelectedCenterFilter('all');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Reset filters"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* View Toggle */}
              <div className="flex items-center bg-[#061520]/90 p-0.5 h-[34px] rounded-xl border border-cyan-500/30 text-xs">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Table List View"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>List View</span>
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid View</span>
                </button>
              </div>

              <div className="text-xs text-slate-300 bg-[#061520]/90 px-2.5 py-1 h-[34px] flex items-center rounded-xl border border-cyan-500/30">
                Total Parties: <span className="font-bold text-cyan-300 ml-1">{filteredParties.length}</span>
              </div>
            </div>
          </div>

      {/* Add Form */}
      {isAddingNew && (
        <form
          onSubmit={handleCreateParty}
          className="p-4 bg-[#0c2638]/80 border-b border-cyan-500/25 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between font-bold text-cyan-200">
            <span>Add New Party Record</span>
            <button type="button" onClick={() => setIsAddingNew(false)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <div>
              <label className="block font-semibold text-cyan-200 mb-1">Party Name *</label>
              <input
                type="text"
                value={newParty.name}
                onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                placeholder="e.g. New Sonchita Enterprise"
                className="w-full p-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-500 font-bold"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-cyan-200 mb-1">Address / Location</label>
              <input
                type="text"
                value={newParty.address}
                onChange={(e) => setNewParty({ ...newParty, address: e.target.value })}
                placeholder="e.g. Madhupur, Tangail"
                className="w-full p-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-cyan-200 mb-1">Mobile / Phone</label>
              <input
                type="text"
                value={newParty.phone}
                onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                placeholder="e.g. 01711-XXXXXX"
                className="w-full p-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-cyan-200 mb-1">Connected Salesperson</label>
              <select
                value={newParty.salesmanCode}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = salespersons.find((s) => s.code === val);
                  setNewParty({
                    ...newParty,
                    salesmanCode: val,
                    salespersonName: match ? match.name : ''
                  });
                }}
                className="w-full p-2 border border-cyan-500/30 rounded-lg bg-[#061520] font-bold text-cyan-200"
              >
                <option value="">-- Select Salesperson --</option>
                {salespersons.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.code} - {s.name} {s.branchName ? `(${cleanSalesCenterName(s.branchName)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-cyan-200 mb-1">Opening Balance (Tk)</label>
              <input
                type="number"
                value={newParty.openingBalance}
                onChange={(e) => setNewParty({ ...newParty, openingBalance: e.target.value })}
                placeholder="0.00"
                className="w-full p-2 border border-cyan-500/30 rounded-lg bg-[#061520] font-semibold text-white"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="bg-[#0b2334] text-slate-200 border border-cyan-500/25 px-3 py-1.5 rounded-lg font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-1.5 rounded-lg font-bold cursor-pointer shadow-xs"
            >
              Save Party
            </button>
          </div>
        </form>
      )}

      {/* List / Table View */}
      {viewMode === 'list' ? (
        <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
          {filteredParties.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No party records found matching your search or filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0c2638] shadow-xs">
                <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">
                  <th className="py-2.5 px-3 w-10 text-center print:hidden">
                    <input
                      type="checkbox"
                      checked={paginatedParties.length > 0 && paginatedParties.every((p) => selectedPartyIds.has(p.id))}
                      onChange={handleSelectAllParties}
                      className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                    />
                  </th>
                  <th className="py-2 px-2 w-10 text-center">SL</th>
                  <th className="py-2 px-3 min-w-[170px]">Party Name</th>
                  <th className="py-2 px-3 min-w-[130px]">Address / Location</th>
                  <th className="py-2 px-2 min-w-[110px]">Phone</th>
                  <th className="py-2 px-2 min-w-[130px]">Salesperson</th>
                  <th className="py-2 px-2 w-24 text-right">Op. Bal</th>
                  <th className="py-2 px-2 w-28 text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-transparent text-slate-200">
                {paginatedParties.map((p, pIdx) => {
                  const index = pageSize === 'all' ? pIdx : (currentPage - 1) * (typeof pageSize === 'number' ? pageSize : 15) + pIdx;
                  const isEditing = editingId === p.id;
                  const isSelected = selectedPartyIds.has(p.id);

                  if (isEditing && editForm) {
                    return (
                      <tr key={p.id ? `${p.id}-${index}` : `party-edit-${index}`} ref={editPartyRowRef} className="bg-cyan-500/15">
                        <td className="p-2 text-center print:hidden">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectParty(p.id)}
                            className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400"
                          />
                        </td>
                        <td className="p-2 text-center font-mono text-slate-400">{index + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full p-1 bg-[#061520] text-white border border-cyan-500/35 rounded font-bold text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            className="w-full p-1 bg-[#061520] text-white border border-cyan-500/35 rounded text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.phone || ''}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-full p-1 bg-[#061520] text-white border border-cyan-500/35 rounded text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={editForm.salesmanCode || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              const match = salespersons.find((s) => s.code === val);
                              setEditForm({
                                ...editForm,
                                salesmanCode: val,
                                salespersonName: match ? match.name : '',
                                branchName: match?.branchName || editForm.branchName || 'Madhupur Sales Center',
                                branchId: match?.branchId || editForm.branchId
                              });
                            }}
                            className="w-full p-1 bg-[#061520] border border-cyan-500/35 rounded text-xs font-bold text-cyan-200"
                          >
                            <option value="">-- Salesperson --</option>
                            {salespersons.map((s) => (
                              <option key={s.id} value={s.code}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={editForm.openingBalance ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, openingBalance: Number(e.target.value) })}
                            className="w-full p-1 bg-[#061520] border border-cyan-500/35 rounded text-xs font-semibold text-right text-white"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-2 text-center print:hidden">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={handleSaveEdit}
                              className="bg-cyan-500 text-slate-950 px-2.5 py-1 rounded text-xs font-bold hover:bg-cyan-400 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                                originalPartyRef.current = null;
                              }}
                              className="bg-[#0b2334] text-slate-200 border border-cyan-500/25 px-2.5 py-1 rounded text-xs hover:bg-[#11334b] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={p.id ? `${p.id}-${index}` : `party-${index}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('input, button, a')) return;
                        onSelectPartyForLedger?.(p);
                      }}
                      className={`hover:bg-cyan-500/[0.06] transition-colors whitespace-nowrap cursor-pointer ${isSelected ? 'bg-cyan-500/15' : ''}`}
                    >
                      <td className="py-2 px-3 text-center print:hidden">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectParty(p.id)}
                          className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-slate-400 text-xs font-semibold">{index + 1}</td>
                      <td className="py-2 px-3 font-bold text-white text-xs sm:text-[13px] whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectPartyForLedger?.(p)}
                            className="inline-flex items-center space-x-1.5 text-left text-white hover:text-cyan-300 transition-colors cursor-pointer group"
                            title="Click to view Customer Statement / Ledger for this party"
                          >
                            <Building2 className="w-3.5 h-3.5 text-cyan-400 group-hover:text-emerald-400 shrink-0" />
                            <span className="font-bold group-hover:underline decoration-cyan-400 underline-offset-2">{p.name}</span>
                          </button>
                          {allDuplicatePartyIds.has(p.id) && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-400/35">
                              Duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-300 text-xs whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{p.address || '-'}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-300 font-mono text-xs whitespace-nowrap">
                        {p.phone ? (
                          <div className="inline-flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{p.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-slate-200 font-medium">
                        {p.salespersonName ? (
                          <div className="inline-flex items-center space-x-1">
                            <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="font-semibold text-white">{p.salespersonName}</span>
                          </div>
                        ) : p.salesmanCode ? (
                          <div className="inline-flex items-center space-x-1">
                            <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="font-semibold text-white">
                              {salespersons.find((s) => s.code.toLowerCase() === p.salesmanCode?.toLowerCase())?.name || p.salesmanCode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Not Assigned</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-300 text-xs whitespace-nowrap">
                        {p.openingBalance ? (
                          <span>৳{Number(p.openingBalance).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-slate-500 font-normal">৳0</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap print:hidden">
                        <div className="inline-flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTransferSourcePartyId(p.id);
                              setTransferTargetPartyId('');
                              setIsTransferModalOpen(true);
                            }}
                            className="bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 p-1.5 rounded-md transition-colors cursor-pointer border border-indigo-400/30"
                            title="Party to party transfer all bills & collections"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectPartyForLedger?.(p)}
                            className="bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-400/40 p-1.5 rounded-md transition-colors cursor-pointer shadow-2xs"
                            title="View Statement (Customer Ledger)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="text-slate-400 hover:text-cyan-300 p-1.5 rounded hover:bg-cyan-500/15 transition-colors cursor-pointer"
                            title="Edit Party"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteParty(p.id)}
                            className="text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/15 transition-colors cursor-pointer"
                            title="Delete Party"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Card Grid View */
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[calc(100vh-260px)] overflow-y-auto">
          {paginatedParties.map((p, pIdx) => (
            <div
              key={p.id ? `${p.id}-${pIdx}` : `party-card-${pIdx}`}
              className="cyber-glass-subcard p-4 rounded-2xl hover:border-cyan-400/40 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectPartyForLedger?.(p)}
                      className="font-bold text-sm text-white hover:text-cyan-300 leading-tight text-left hover:underline cursor-pointer"
                      title="Click to view Customer Ledger"
                    >
                      {p.name}
                    </button>
                    {allDuplicatePartyIds.has(p.id) && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-400/35">
                        Duplicate
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTransferSourcePartyId(p.id);
                        setTransferTargetPartyId('');
                        setIsTransferModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-indigo-300 p-1 cursor-pointer"
                      title="Transfer bills & collections"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="text-slate-400 hover:text-cyan-300 p-1 cursor-pointer"
                      title="Edit Party"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteParty(p.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                      title="Delete Party"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>{p.address || 'No address specified'}</span>
                </div>

                {p.phone && (
                  <div className="flex items-center space-x-1.5 text-xs text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{p.phone}</span>
                  </div>
                )}

                {(p.salespersonName || p.salesmanCode) && (
                  <div className="flex items-center space-x-1 text-xs font-semibold text-cyan-300 pt-1">
                    <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{p.salespersonName || salespersons.find(s => s.code.toLowerCase() === p.salesmanCode?.toLowerCase())?.name || p.salesmanCode}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1 border-t border-cyan-500/15">
                  <span className="text-slate-400 font-medium">Op. Bal:</span>
                  <span className="font-mono font-bold text-emerald-300">
                    ৳{Number(p.openingBalance || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="pt-1 border-t border-cyan-500/15 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPartyForLedger?.(p)}
                  className="flex-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/35 text-xs py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs"
                  title="View Statement (Customer Ledger)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Statement</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination & Fit-on-One-Page Navigation Toolbar */}
      <div className="p-3 bg-[#071824]/90 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 print:hidden">
        <div className="flex items-center space-x-3">
          <span>
            Showing{' '}
            <span className="font-bold text-white">
              {filteredParties.length === 0
                ? 0
                : pageSize === 'all'
                ? 1
                : (currentPage - 1) * (typeof pageSize === 'number' ? pageSize : 15) + 1}
            </span>{' '}
            to{' '}
            <span className="font-bold text-white">
              {pageSize === 'all'
                ? filteredParties.length
                : Math.min(currentPage * (typeof pageSize === 'number' ? pageSize : 15), filteredParties.length)}
            </span>{' '}
            of <span className="font-bold text-cyan-300">{filteredParties.length}</span> customers
          </span>

          <div className="flex items-center space-x-1.5 pl-2 border-l border-cyan-500/25">
            <span className="text-slate-400 font-medium">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setPageSize(val);
                setCurrentPage(1);
              }}
              className="bg-[#061520] border border-cyan-500/25 rounded px-2 py-1 font-bold text-white text-xs focus:ring-1 focus:ring-cyan-400 cursor-pointer"
            >
              <option value={10}>10 per page</option>
              <option value={15}>15 per page</option>
              <option value={20}>20 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value="all">All ({filteredParties.length})</option>
            </select>
          </div>
        </div>

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200 transition-colors"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <React.Fragment key={`page-${p}-${idx}`}>
                      {showEllipsis && <span className="px-1 text-slate-400 font-mono">…</span>}
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
              className="p-1.5 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-cyan-500/25 bg-[#0b2334] hover:bg-[#11334b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-200 transition-colors"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Action Footer Bar */}
      <div className="p-3 bg-[#081b28]/90 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2 print:hidden">
        <button
          onClick={() => setIsAddingNew(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
        <button
          onClick={() => {
            setIsBulkAddOpen(true);
            setImportStatus(null);
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Bulk Add from XLSX</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTransferSourcePartyId('');
            setTransferTargetPartyId('');
            setIsTransferModalOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
          title="Party to party transfer all bills and collections by one click"
        >
          <ArrowRightLeft className="w-4 h-4 text-indigo-200" />
          <span>Party Transfer</span>
        </button>
        <button
          onClick={() => exportPartiesToXLSX(parties, salespersons)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
          title="Export current customer directory to Excel (.xlsx)"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Export XLSX</span>
        </button>
        <button
          type="button"
          onClick={handlePrintDirectoryAsText}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
          title="Print Customer Directory (Sends as formatted Plain Text .txt file)"
        >
          <Printer className="w-4 h-4 text-amber-400" />
          <span>Print (TXT)</span>
        </button>
        <button
          onClick={() => setShowTrashBin(!showTrashBin)}
          className={`text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer ${
            showTrashBin ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>Trash ({trashedParties.length})</span>
        </button>
        <button
          onClick={() => setShowDuplicateFinder(true)}
          className={`text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer ${
            duplicateGroups.length > 0
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
          title="Detect duplicate or similar customer names and review duplicate entries"
        >
          <AlertTriangle className={`w-4 h-4 ${duplicateGroups.length > 0 ? 'text-slate-950' : 'text-amber-400'}`} />
          <span>Duplicates ({duplicateGroups.length})</span>
        </button>
        {duplicateGroups.length > 0 && (
          <>
            <button
              type="button"
              onClick={handleAutoRemoveAllDuplicates}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              title="Automatically remove all duplicate customer copies, keep primary records, and safely merge bills/collections"
            >
              <Trash2 className="w-4 h-4 text-white" />
              <span>Remove Duplicates ({secondaryDuplicatePartyIds.size})</span>
            </button>
            <button
              onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
              className={`text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                filterDuplicatesOnly
                  ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
              }`}
              title="Toggle list filter to display only duplicate parties in directory"
            >
              <CheckSquare className="w-4 h-4 text-amber-300" />
              <span>{filterDuplicatesOnly ? 'Showing Duplicates' : `Filter Duplicates (${allDuplicatePartyIds.size})`}</span>
            </button>
          </>
        )}
      </div>
        </>
      )}

      {/* Single Party Delete Confirmation Modal */}
      {deleteConfirmParty && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-5 space-y-4 border border-cyan-400/35 text-white">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="p-2 bg-amber-500/20 rounded-full border border-amber-400/35">
                <AlertCircle className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Move to Trash</h3>
                <p className="text-xs text-slate-400">This action safely moves the party to the Trash Bin.</p>
              </div>
            </div>

            <div className="cyber-glass-subcard p-3.5 rounded-xl text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Party Name:</span>
                <span className="font-bold text-white">{deleteConfirmParty.name}</span>
              </div>
              {deleteConfirmParty.phone && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-mono text-slate-200">{deleteConfirmParty.phone}</span>
                </div>
              )}
              {deleteConfirmParty.address && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Address:</span>
                  <span className="text-slate-200">{deleteConfirmParty.address}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Sales Center:</span>
                <span className="font-semibold text-cyan-300">{getPartySalesCenter(deleteConfirmParty)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to delete this customer? You can restore it anytime from the Customer Trash Bin.
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeleteConfirmParty(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-[#0b2334] hover:bg-[#11334b] border border-cyan-500/25 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExecuteDeleteParty}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Deletion Blocked (Why & How to Delete) Modal */}
      {blockedPartyDeletion && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full p-6 space-y-5 border border-amber-400/35 animate-in fade-in zoom-in-95 duration-150 text-white">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-400/35 shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Customer Cannot Be Deleted Directly
                  </h3>
                  <p className="text-xs text-amber-300 font-semibold">
                    Protected by active business and ledger records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockedPartyDeletion(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Customer Info */}
            <div className="cyber-glass-subcard rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Customer Name:</span>
                <span className="font-extrabold text-white text-sm">{blockedPartyDeletion.party.name}</span>
              </div>
              {blockedPartyDeletion.party.address && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Address:</span>
                  <span className="text-slate-200 font-semibold">{blockedPartyDeletion.party.address}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Sales Center:</span>
                <span className="text-cyan-300 font-bold">{getPartySalesCenter(blockedPartyDeletion.party)}</span>
              </div>
            </div>

            {/* WHY CANNOT BE DELETED */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-rose-300 font-bold text-xs uppercase tracking-wide">
                <AlertCircle className="w-4 h-4" />
                <span>Why this customer cannot be deleted:</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-rose-500/15 border border-rose-400/35 rounded-xl">
                  <FileText className="w-4 h-4 text-rose-400 mx-auto mb-1" />
                  <div className="font-black text-rose-200 text-sm">{blockedPartyDeletion.billsCount}</div>
                  <div className="text-[10px] text-rose-300 font-bold">Invoices / Bills</div>
                </div>

                <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/35 rounded-xl">
                  <Truck className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <div className="font-black text-cyan-200 text-sm">{blockedPartyDeletion.challansCount}</div>
                  <div className="text-[10px] text-cyan-300 font-bold">Delivery Challans</div>
                </div>

                <div className="p-2.5 bg-emerald-500/15 border border-emerald-400/35 rounded-xl">
                  <Receipt className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="font-black text-emerald-200 text-sm">{blockedPartyDeletion.collectionsCount}</div>
                  <div className="text-[10px] text-emerald-300 font-bold">Collections (৳{blockedPartyDeletion.collectionsAmount.toLocaleString('en-IN')})</div>
                </div>
              </div>

              <p className="text-[11px] text-amber-200 leading-relaxed bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/30">
                Deleting a customer with active transaction history is restricted because it would orphan invoice audit logs, corrupt customer ledger balances, and break payment receipt histories.
              </p>
            </div>

            {/* HOW TO DELETE */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wide">
                <Info className="w-4 h-4" />
                <span>How to delete this customer:</span>
              </div>

              <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside cyber-glass-subcard p-3 rounded-xl leading-relaxed font-medium">
                {blockedPartyDeletion.billsCount > 0 && (
                  <li>
                    Open <strong className="text-white">Billing Directory</strong> and delete or reassign all <strong className="text-white">{blockedPartyDeletion.billsCount} bills</strong> registered for this customer {blockedPartyDeletion.billsSample.length > 0 && `(e.g., ${blockedPartyDeletion.billsSample.join(', ')})`}.
                  </li>
                )}
                {blockedPartyDeletion.challansCount > 0 && (
                  <li>
                    Open <strong className="text-white">Delivery Challans</strong> and delete or reassign all <strong className="text-white">{blockedPartyDeletion.challansCount} delivery challans</strong>.
                  </li>
                )}
                {blockedPartyDeletion.collectionsCount > 0 && (
                  <li>
                    Open <strong className="text-white">Cash & Cheque Collections</strong> and delete or reassign payment receipts recorded for this customer.
                  </li>
                )}
                <li>
                  Once all historical records are cleared (0 bills, 0 challans, 0 collections), return here and click <strong className="text-white">Delete</strong> to safely move this customer to the Trash Bin.
                </li>
              </ol>

              <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/30 rounded-lg text-[11px] text-cyan-100 flex items-start space-x-2">
                <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Tip:</strong> If you simply want to stop doing business without deleting past sales invoices and accounts history, click <strong className="text-white">Edit Party</strong> and mark the customer name as <em>(Inactive / Closed)</em>.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
              {onSelectPartyForLedger ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = blockedPartyDeletion.party;
                    setBlockedPartyDeletion(null);
                    onSelectPartyForLedger(target);
                  }}
                  className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>View Customer Ledger</span>
                </button>
              ) : <div />}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = blockedPartyDeletion.party;
                    setBlockedPartyDeletion(null);
                    setTransferSourcePartyId(target.id);
                    setTransferTargetPartyId('');
                    setIsTransferModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
                  title="Transfer all bills and collections to another customer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Transfer Records to Another Party</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBlockedPartyDeletion(null)}
                  className="px-5 py-2 bg-[#0b2334] hover:bg-[#11334b] text-white border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Understood / Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-5 space-y-4 border border-cyan-400/35 text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2 bg-rose-500/20 rounded-full border border-rose-400/35">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Bulk Delete Confirmation</h3>
                <p className="text-xs text-slate-400">Move multiple customer records to Trash Bin.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to move <span className="font-bold text-rose-300 text-sm">{selectedPartyIds.size}</span> selected customer(s) to the Trash Bin?
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-[#0b2334] hover:bg-[#11334b] border border-cyan-500/25 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExecuteBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move {selectedPartyIds.size} Customers to Trash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Conflict on Manual Party Creation */}
      {createDuplicateConflict && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-2xl w-full p-6 space-y-5 border border-cyan-400/35 animate-in fade-in zoom-in-95 duration-150 text-white">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-amber-500/20 text-amber-300 border border-amber-400/35 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Duplicate Customer Detected: Who is correct?
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  A customer with the exact same <strong className="text-white">Party Name</strong>, <strong className="text-white">Address</strong>, and <strong className="text-white">Salesperson</strong> already exists in your directory.
                </p>
              </div>
            </div>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Existing Card */}
              <div className="p-4 cyber-glass-subcard rounded-xl border border-cyan-400/30 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/20">
                  <span className="font-bold text-cyan-200 uppercase tracking-wide text-[11px]">Existing Record in Directory</span>
                  <span className="px-2 py-0.5 bg-[#061520] text-cyan-300 rounded text-[10px] font-bold">In System</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Party Name</span>
                  <span className="font-bold text-white text-sm">{createDuplicateConflict.existing.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Address</span>
                  <span className="font-semibold text-slate-200">{createDuplicateConflict.existing.address || '(No Address)'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Salesperson</span>
                  <span className="font-semibold text-slate-200">{createDuplicateConflict.existing.salespersonName || '(None)'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-500/20">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Phone</span>
                    <span className="text-slate-200">{createDuplicateConflict.existing.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Opening Balance</span>
                    <span className="font-bold text-emerald-300">৳{Number(createDuplicateConflict.existing.openingBalance || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* New Input Card */}
              <div className="p-4 bg-amber-500/15 rounded-xl border border-amber-400/35 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-amber-400/25">
                  <span className="font-bold text-amber-200 uppercase tracking-wide text-[11px]">New Entry Just Entered</span>
                  <span className="px-2 py-0.5 bg-amber-500/30 text-amber-200 rounded text-[10px] font-bold">New Input</span>
                </div>
                <div>
                  <span className="text-amber-200/70 text-[10px] uppercase font-bold block">Party Name</span>
                  <span className="font-bold text-white text-sm">{createDuplicateConflict.newParty.name}</span>
                </div>
                <div>
                  <span className="text-amber-200/70 text-[10px] uppercase font-bold block">Address</span>
                  <span className="font-semibold text-slate-200">{createDuplicateConflict.newParty.address || '(No Address)'}</span>
                </div>
                <div>
                  <span className="text-amber-200/70 text-[10px] uppercase font-bold block">Salesperson</span>
                  <span className="font-semibold text-slate-200">{createDuplicateConflict.newParty.salespersonName || '(None)'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-400/25">
                  <div>
                    <span className="text-amber-200/70 text-[10px] uppercase font-bold block">Phone</span>
                    <span className="text-slate-200">{createDuplicateConflict.newParty.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-amber-200/70 text-[10px] uppercase font-bold block">Opening Balance</span>
                    <span className="font-bold text-amber-300">৳{Number(createDuplicateConflict.newParty.openingBalance || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="pt-3 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateDuplicateConflict(null);
                  setToastNotification('Keep existing: New duplicate entry was cancelled.');
                }}
                className="px-4 py-2 bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Keep Existing Customer
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetId = createDuplicateConflict.existing.id;
                  const overwrittenParty: Party = {
                    ...createDuplicateConflict.newParty,
                    id: targetId
                  };
                  setParties((prev) => prev.map((p) => (p.id === targetId ? overwrittenParty : p)));
                  setCreateDuplicateConflict(null);
                  setIsAddingNew(false);
                  setNewParty({ name: '', address: '', phone: '', salesmanCode: '', salespersonName: '', openingBalance: '' });
                  setToastNotification(`Customer "${overwrittenParty.name}" overwritten with new details.`);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Overwrite Existing Customer
              </button>

              <button
                type="button"
                onClick={() => {
                  setParties((prev) => [...prev, createDuplicateConflict.newParty]);
                  setCreateDuplicateConflict(null);
                  setIsAddingNew(false);
                  setNewParty({ name: '', address: '', phone: '', salesmanCode: '', salespersonName: '', openingBalance: '' });
                  setToastNotification(`Customer "${createDuplicateConflict.newParty.name}" added as separate entry.`);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Add as Separate Customer Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Similar Salesperson Detection Prompt on Excel Import */}
      {pendingSimilarSalespersons && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-xl w-full p-6 space-y-4 border border-cyan-400/35 animate-in fade-in zoom-in-95 duration-150 text-white">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-cyan-500/20 text-cyan-300 border border-cyan-400/35 rounded-xl shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Similar Salesperson Detected in Excel Import
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  The salesperson name(s) in your Excel file closely match existing directory personnel. Would you like to auto-correct them?
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-cyan-500/25 rounded-xl max-h-60">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30">
                  <tr>
                    <th className="p-2.5">Name in Excel</th>
                    <th className="p-2.5">Matched Directory Salesperson</th>
                    <th className="p-2.5 text-center">Affected Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 text-slate-200">
                  {pendingSimilarSalespersons.matches.map((m, idx) => (
                    <tr key={idx} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-2.5 font-bold text-amber-300 bg-amber-500/10">
                        "{m.rawName}"
                      </td>
                      <td className="p-2.5 font-bold text-white">
                        {m.matchedSalesperson.name}
                        <span className="text-[11px] text-slate-400 font-normal ml-1">
                          ({m.matchedSalesperson.code}{m.matchedSalesperson.branchName ? ` - ${cleanSalesCenterName(m.matchedSalesperson.branchName)}` : ''})
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold text-cyan-300">
                        {m.partyIds.length} row(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSkipAutoCorrectSalespersons}
                className="px-4 py-2 bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Keep Excel Names As-Is
              </button>
              <button
                type="button"
                onClick={handleConfirmAutoCorrectSalespersons}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Auto-Correct to Directory Personnel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Parties Conflict Review Modal on Excel Import */}
      {pendingImportDuplicates && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-3xl w-full p-6 space-y-4 border border-cyan-400/35 animate-in fade-in zoom-in-95 duration-150 text-white">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-amber-500/20 text-amber-300 border border-amber-400/35 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Duplicate Customer(s) Found in Excel Import ({pendingImportDuplicates.duplicates.length} Matches)
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  The customer(s) below share identical <strong className="text-white">Party Name</strong>, <strong className="text-white">Address</strong>, and <strong className="text-white">Salesperson</strong> with existing directory records. Who is correct?
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-cyan-500/25 rounded-xl max-h-72">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30">
                  <tr>
                    <th className="p-2.5">Party Name & Address</th>
                    <th className="p-2.5">Salesperson</th>
                    <th className="p-2.5">Existing Directory Record</th>
                    <th className="p-2.5">Excel File Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 text-slate-200">
                  {pendingImportDuplicates.duplicates.map((d, idx) => (
                    <tr key={idx} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-2.5">
                        <div className="font-bold text-white">{d.imported.name}</div>
                        <div className="text-[11px] text-slate-400">{d.imported.address || '(No Address)'}</div>
                      </td>
                      <td className="p-2.5 font-medium text-slate-200">
                        {d.imported.salespersonName || '(None)'}
                      </td>
                      <td className="p-2.5 text-slate-300 bg-[#0b2334]/40">
                        <div>Phone: {d.existing.phone || '-'}</div>
                        <div>Op. Bal: ৳{Number(d.existing.openingBalance || 0).toLocaleString('en-IN')}</div>
                      </td>
                      <td className="p-2.5 text-amber-200 bg-amber-500/10 font-semibold">
                        <div>Phone: {d.imported.phone || '-'}</div>
                        <div>Op. Bal: ৳{Number(d.imported.openingBalance || 0).toLocaleString('en-IN')}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleResolveDuplicatesKeepExisting}
                className="px-4 py-2 bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Keep Existing (Skip Duplicates)
              </button>
              <button
                type="button"
                onClick={handleResolveDuplicatesOverwrite}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Overwrite Existing with Excel
              </button>
              <button
                type="button"
                onClick={handleResolveDuplicatesAddAll}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Import All as Separate Duplicates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party to Party Transfer Modal ("Customer Directory, party to party transfer all bill and collection by one click") */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl w-full max-w-xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 overflow-hidden my-auto max-h-[92vh] flex flex-col text-white">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-700/80 to-cyan-800/80 px-5 py-4 text-white flex items-center justify-between shrink-0 border-b border-cyan-500/25">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-500/30 rounded-xl border border-indigo-400/40">
                  <ArrowRightLeft className="w-5 h-5 text-indigo-100" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-snug">Party to Party Transfer</h3>
                  <p className="text-xs text-cyan-200">Transfer all bills &amp; collections in one click</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-indigo-500/15 border border-indigo-400/30 rounded-xl text-xs text-indigo-100 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
                <div>
                  Select a <strong className="text-white">Source Customer</strong> whose past transaction records should be moved, and a <strong className="text-white">Target Customer</strong> who will receive all historical bills, collections, and delivery challans.
                </div>
              </div>

              {/* Source Party Picker */}
              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1">
                  1. Source Customer (Records Will Move From):
                </label>
                <select
                  value={transferSourcePartyId}
                  onChange={(e) => setTransferSourcePartyId(e.target.value)}
                  className="w-full p-2.5 bg-[#061520] border border-cyan-500/30 rounded-xl text-xs font-semibold text-white focus:ring-2 focus:ring-cyan-400 transition-all cursor-pointer"
                >
                  <option value="">-- Select Source Customer --</option>
                  {parties.map((p) => {
                    const partyBillsCount = (storedBills || []).filter(
                      (b: any) => (b.partyId === p.id) || ((b.partyName || b.header?.customerName || '').trim().toLowerCase() === p.name.trim().toLowerCase())
                    ).length;
                    const partyColCount = (collections || []).filter(
                      (c: any) => (c.partyId === p.id) || ((c.partyName || c.customerName || '').trim().toLowerCase() === p.name.trim().toLowerCase())
                    ).length;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.address ? `(${p.address})` : ''} • [{partyBillsCount} bills, {partyColCount} collections]
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Source Records Preview */}
              {transferSourceParty && (
                <div className="cyber-glass-subcard rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-cyan-200">
                    <span>Records Found for &quot;{transferSourceParty.name}&quot;:</span>
                    <span className="text-[10px] text-slate-400 font-normal">{transferSourceParty.address || 'No Address'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-rose-500/15 border border-rose-400/35 rounded-lg p-2">
                      <div className="text-base font-black text-rose-200">{sourceTransferStats.bills.length}</div>
                      <div className="text-[10px] text-rose-300 font-bold">Stored Bills</div>
                      <div className="text-[9px] text-rose-300 font-mono font-semibold">৳{sourceTransferStats.billsAmount.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-emerald-500/15 border border-emerald-400/35 rounded-lg p-2">
                      <div className="text-base font-black text-emerald-200">{sourceTransferStats.collections.length}</div>
                      <div className="text-[10px] text-emerald-300 font-bold">Collections</div>
                      <div className="text-[9px] text-emerald-300 font-mono font-semibold">৳{sourceTransferStats.collectionsAmount.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-cyan-500/15 border border-cyan-400/35 rounded-lg p-2">
                      <div className="text-base font-black text-cyan-200">{sourceTransferStats.challans.length}</div>
                      <div className="text-[10px] text-cyan-300 font-bold">Challans</div>
                      <div className="text-[9px] text-cyan-300 font-semibold">Delivery</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Party Picker */}
              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1">
                  2. Target Customer (Records Will Move To):
                </label>
                <select
                  value={transferTargetPartyId}
                  onChange={(e) => setTransferTargetPartyId(e.target.value)}
                  className="w-full p-2.5 bg-[#061520] border border-cyan-500/30 rounded-xl text-xs font-semibold text-white focus:ring-2 focus:ring-cyan-400 transition-all cursor-pointer"
                >
                  <option value="">-- Select Target Customer --</option>
                  {parties
                    .filter((p) => p.id !== transferSourcePartyId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.address ? `(${p.address})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Summary of Action */}
              {transferSourceParty && transferTargetParty && (
                <div className="p-3 bg-amber-500/15 border border-amber-400/35 rounded-xl text-xs text-amber-100 font-medium leading-relaxed">
                  ⚠️ <strong className="text-white">Action summary:</strong> All {sourceTransferStats.bills.length} bills, {sourceTransferStats.collections.length} collections, and {sourceTransferStats.challans.length} challans currently linked to <strong className="text-white">&quot;{transferSourceParty.name}&quot;</strong> will be reassigned to <strong className="text-white">&quot;{transferTargetParty.name}&quot;</strong>. Customer ledger and party balance reports will update instantly.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-[#0b2334] hover:bg-[#11334b] text-slate-200 border border-cyan-500/25 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !transferSourcePartyId ||
                  !transferTargetPartyId ||
                  transferSourcePartyId === transferTargetPartyId ||
                  isTransferring ||
                  (sourceTransferStats.bills.length === 0 && sourceTransferStats.collections.length === 0 && sourceTransferStats.challans.length === 0)
                }
                onClick={handleExecutePartyTransfer}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl transition-all shadow-md flex items-center space-x-2 cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>{isTransferring ? 'Transferring...' : 'Transfer All Now (One Click)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Save & Action Toast Notification */}
      {toastNotification && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center space-x-2 bg-[#091e2c]/95 backdrop-blur-xl text-white px-4 py-2.5 rounded-xl shadow-lg border border-cyan-400/35 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}
    </div>
  );
};
