import React, { useState, useEffect, useMemo } from 'react';
import {
  Item,
  Party,
  CollectionMR,
  DeliveryChallan,
  Salesperson,
  BranchLocation,
  Requisition,
  ConveyanceEntry,
  StoredBill
} from '../types';
import {
  Trash2,
  Database,
  Building2,
  CheckCircle2,
  ArrowLeft,
  X,
  DollarSign,
  CreditCard,
  Banknote,
  Truck,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  RotateCcw,
  FileText,
  Users,
  MapPin,
  ClipboardList,
  Car,
  Sparkles,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import {
  recordDeletedEntityId,
  recordDeletedEntityIds,
  unrecordDeletedEntityId,
  unrecordDeletedEntityIds,
  getGlobalDeletedIds,
  removeIdsFromAllTrashStorages,
  getClientSyncId
} from '../utils/deletedTracker';
import { safeSetStorageItem, idbSaveFailoverData } from '../utils/indexedDbStorage';
import { BankLogoBadge } from './BankAndAccountDirectory';

interface TrashProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  parties: Party[];
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  storedBills?: StoredBill[];
  setStoredBills?: React.Dispatch<React.SetStateAction<any[]>>;
  collections?: CollectionMR[];
  setCollections?: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  deliveryChallans?: DeliveryChallan[];
  setDeliveryChallans?: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  salespersons?: Salesperson[];
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  branches?: BranchLocation[];
  setBranches?: React.Dispatch<React.SetStateAction<BranchLocation[]>>;
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  conveyances?: ConveyanceEntry[];
  setConveyances?: React.Dispatch<React.SetStateAction<ConveyanceEntry[]>>;
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

type TrashCategoryKey =
  | 'bills'
  | 'challans'
  | 'draft_bills'
  | 'collections'
  | 'items'
  | 'special_items'
  | 'parties'
  | 'users'
  | 'branches'
  | 'requisitions'
  | 'conveyances';

interface TrashedItemWrapper {
  id: string;
  storageKey: string;
  category: TrashCategoryKey;
  trashedAt: string;
  title: string;
  subtitle?: string;
  bankName?: string;
  amount?: number;
  badge?: string;
  raw: any;
}

export const Trash: React.FC<TrashProps> = ({
  items,
  setItems,
  parties,
  setParties,
  storedBills = [],
  setStoredBills,
  collections = [],
  setCollections,
  deliveryChallans = [],
  setDeliveryChallans,
  salespersons = [],
  setSalespersons,
  branches = [],
  setBranches,
  requisitions = [],
  setRequisitions,
  conveyances = [],
  setConveyances,
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<TrashCategoryKey>('bills');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Trashed Entities State for each of the 11 categories
  const [trashedBills, setTrashedBills] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_bills');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedChallans, setTrashedChallans] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_challans');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedDraftBills, setTrashedDraftBills] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_draft_bills');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedCollections, setTrashedCollections] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_collections');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedItems, setTrashedItems] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_items');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedSpecialItems, setTrashedSpecialItems] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_special_items');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedParties, setTrashedParties] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_parties');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedUsers, setTrashedUsers] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_users');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedBranches, setTrashedBranches] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_branches');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedRequisitions, setTrashedRequisitions] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_requisitions');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  const [trashedConveyances, setTrashedConveyances] = useState<any[]>(() => {
    try {
      const s = localStorage.getItem('polycables_trashed_conveyances');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  // Modal confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'empty_category' | 'delete_single' | 'delete_selected' | 'restore_selected';
    targetId?: string;
    targetName?: string;
    count?: number;
  } | null>(null);

  // Reload all trashes on storage/focus
  const reloadAllTrash = () => {
    try {
      const b = localStorage.getItem('polycables_trashed_bills');
      if (b) setTrashedBills(JSON.parse(b));
      const ch = localStorage.getItem('polycables_trashed_challans');
      if (ch) setTrashedChallans(JSON.parse(ch));
      const db = localStorage.getItem('polycables_trashed_draft_bills');
      if (db) setTrashedDraftBills(JSON.parse(db));
      const col = localStorage.getItem('polycables_trashed_collections');
      if (col) setTrashedCollections(JSON.parse(col));
      const it = localStorage.getItem('polycables_trashed_items');
      if (it) setTrashedItems(JSON.parse(it));
      const spIt = localStorage.getItem('polycables_trashed_special_items');
      if (spIt) setTrashedSpecialItems(JSON.parse(spIt));
      const p = localStorage.getItem('polycables_trashed_parties');
      if (p) setTrashedParties(JSON.parse(p));
      const u = localStorage.getItem('polycables_trashed_users');
      if (u) setTrashedUsers(JSON.parse(u));
      const br = localStorage.getItem('polycables_trashed_branches');
      if (br) setTrashedBranches(JSON.parse(br));
      const req = localStorage.getItem('polycables_trashed_requisitions');
      if (req) setTrashedRequisitions(JSON.parse(req));
      const conv = localStorage.getItem('polycables_trashed_conveyances');
      if (conv) setTrashedConveyances(JSON.parse(conv));
    } catch (e) {
      console.error('Error reloading trash:', e);
    }
  };

  useEffect(() => {
    reloadAllTrash();
    const handleStorage = () => reloadAllTrash();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleStorage);
    window.addEventListener('polycables_trash_updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleStorage);
      window.removeEventListener('polycables_trash_updated', handleStorage);
    };
  }, []);

  // Clear selections on tab switch
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  // Tab configurations
  const TABS_CONFIG: Array<{
    key: TrashCategoryKey;
    label: string;
    icon: React.ReactNode;
    count: number;
    color: string;
  }> = [
    {
      key: 'bills',
      label: 'Bills (Office & Showroom)',
      icon: <FileText className="w-4 h-4" />,
      count: trashedBills.length,
      color: 'blue'
    },
    {
      key: 'challans',
      label: 'Challans',
      icon: <Truck className="w-4 h-4" />,
      count: trashedChallans.length,
      color: 'amber'
    },
    {
      key: 'draft_bills',
      label: 'Draft Bills',
      icon: <Layers className="w-4 h-4" />,
      count: trashedDraftBills.length,
      color: 'purple'
    },
    {
      key: 'collections',
      label: 'Collections (Cash/Cheque)',
      icon: <DollarSign className="w-4 h-4" />,
      count: trashedCollections.length,
      color: 'emerald'
    },
    {
      key: 'items',
      label: 'Items',
      icon: <Database className="w-4 h-4" />,
      count: trashedItems.length,
      color: 'teal'
    },
    {
      key: 'special_items',
      label: 'Special Items',
      icon: <Sparkles className="w-4 h-4" />,
      count: trashedSpecialItems.length,
      color: 'amber'
    },
    {
      key: 'parties',
      label: 'Customers',
      icon: <Building2 className="w-4 h-4" />,
      count: trashedParties.length,
      color: 'sky'
    },
    {
      key: 'users',
      label: 'Users / Salespersons',
      icon: <Users className="w-4 h-4" />,
      count: trashedUsers.length,
      color: 'indigo'
    },
    {
      key: 'branches',
      label: 'Sales Centers',
      icon: <MapPin className="w-4 h-4" />,
      count: trashedBranches.length,
      color: 'rose'
    },
    {
      key: 'requisitions',
      label: 'Requisitions',
      icon: <ClipboardList className="w-4 h-4" />,
      count: trashedRequisitions.length,
      color: 'orange'
    },
    {
      key: 'conveyances',
      label: 'Conveyance & Hotel',
      icon: <Car className="w-4 h-4" />,
      count: trashedConveyances.length,
      color: 'emerald'
    }
  ];

  // Map active raw list into uniform TrashedItemWrapper
  const currentCategoryItems: TrashedItemWrapper[] = useMemo(() => {
    switch (activeTab) {
      case 'bills':
        return trashedBills.map((b: any) => ({
          id: b.id || b.billNo || `bill-${Date.now()}`,
          storageKey: 'polycables_trashed_bills',
          category: 'bills',
          trashedAt: b.trashedAt || b.savedAt || new Date().toISOString(),
          title: `Bill #${b.header?.billNo || b.billNo || 'N/A'} — ${b.header?.partyName || b.partyName || 'Unknown Customer'}`,
          subtitle: `${b.header?.date || b.date || ''} • ${b.isOfficeBill || b.header?.isOfficeBill ? 'Office Bill' : 'Sales Center Bill'} • ${b.branchName || b.header?.branchName || ''}`,
          amount: Number(b.grandTotal ?? b.totalAmount ?? 0),
          badge: b.isOfficeBill || b.header?.isOfficeBill ? 'Office Bill' : 'Showroom Bill',
          raw: b
        }));

      case 'challans':
        return trashedChallans.map((ch: any) => ({
          id: ch.id || ch.challanNo || `ch-${Date.now()}`,
          storageKey: 'polycables_trashed_challans',
          category: 'challans',
          trashedAt: ch.trashedAt || ch.savedAt || new Date().toISOString(),
          title: `Challan #${ch.challanNo || ch.chNo || 'N/A'} — ${ch.partyName || ch.salesCenter || 'Factory / Showroom'}`,
          subtitle: `${ch.date || ''} • Total Coils: ${ch.totalQuantity || ch.totalCoils || 0} • Status: ${ch.status || 'Active'}`,
          amount: ch.totalAmount,
          badge: ch.deliveryType || ch.challanType || 'Challan',
          raw: ch
        }));

      case 'draft_bills':
        return trashedDraftBills.map((db: any) => ({
          id: db.id || `draft-${Date.now()}`,
          storageKey: 'polycables_trashed_draft_bills',
          category: 'draft_bills',
          trashedAt: db.trashedAt || db.savedAt || new Date().toISOString(),
          title: `Draft #${db.header?.billNo || db.billNo || 'Draft'} — ${db.header?.partyName || db.partyName || 'Draft Bill'}`,
          subtitle: `${db.header?.date || db.date || ''} • Coils: ${db.totalCoils || 0}`,
          amount: db.grandTotal,
          badge: 'Draft Bill',
          raw: db
        }));

      case 'collections':
        return trashedCollections.map((c: any) => ({
          id: c.id || c.mrNo || `col-${Date.now()}`,
          storageKey: 'polycables_trashed_collections',
          category: 'collections',
          trashedAt: c.trashedAt || c.date || new Date().toISOString(),
          title: `MR #${c.mrNo || 'N/A'} — ${c.entityName || c.partyName || 'Customer'}`,
          subtitle: `${c.date || ''} • Method: ${c.paymentType ? c.paymentType.toUpperCase() : (c.chequeNo ? 'CHEQUE' : 'CASH')}`,
          bankName: c.bankName || '',
          amount: Number(c.amount || 0),
          badge: c.paymentType === 'cheque' || c.chequeNo ? 'Cheque' : 'Cash',
          raw: c
        }));

      case 'items':
        return trashedItems.map((it: any) => ({
          id: it.id || it.code || `item-${Date.now()}`,
          storageKey: 'polycables_trashed_items',
          category: 'items',
          trashedAt: it.trashedAt || new Date().toISOString(),
          title: `${it.code ? `[${it.code}] ` : ''}${it.name}`,
          subtitle: `Category: ${it.category || 'General'} • Spec: ${it.sizeSpec || '-'} • Unit: ${it.unit || 'Coils'}`,
          amount: Number(it.rate || 0),
          badge: it.category || 'Item',
          raw: it
        }));

      case 'special_items':
        return trashedSpecialItems.map((it: any) => ({
          id: it.id || it.code || `sp-item-${Date.now()}`,
          storageKey: 'polycables_trashed_special_items',
          category: 'special_items',
          trashedAt: it.trashedAt || new Date().toISOString(),
          title: `${it.code ? `[${it.code}] ` : ''}${it.name}`,
          subtitle: `Linked Base: ${it.baseItemCode || it.baseItemId || 'Linked'} • Multiplier: ${it.stockMultiplier || 1}`,
          amount: Number(it.rate || 0),
          badge: 'Special Item',
          raw: it
        }));

      case 'parties':
        return trashedParties.map((p: any) => ({
          id: p.id || `party-${Date.now()}`,
          storageKey: 'polycables_trashed_parties',
          category: 'parties',
          trashedAt: p.trashedAt || new Date().toISOString(),
          title: p.name,
          subtitle: `Address: ${p.address || '-'} • Phone: ${p.phone || '-'} • Salesperson: ${p.salespersonName || p.salesmanCode || 'N/A'}`,
          amount: p.openingBalance,
          badge: 'Customer',
          raw: p
        }));

      case 'users':
        return trashedUsers.map((u: any) => ({
          id: u.id || u.code || `user-${Date.now()}`,
          storageKey: 'polycables_trashed_users',
          category: 'users',
          trashedAt: u.trashedAt || new Date().toISOString(),
          title: `${u.name} (${u.code || u.username || 'Staff'})`,
          subtitle: `Role: ${u.role || u.designation || 'Salesperson'} • Branch: ${u.branch || u.branchName || 'All'}`,
          badge: u.role || 'User',
          raw: u
        }));

      case 'branches':
        return trashedBranches.map((br: any) => ({
          id: br.id || `branch-${Date.now()}`,
          storageKey: 'polycables_trashed_branches',
          category: 'branches',
          trashedAt: br.trashedAt || new Date().toISOString(),
          title: br.name,
          subtitle: `Address: ${br.address || '-'} • Code: ${br.code || br.id} • Prefix: ${br.prefix || '-'}`,
          badge: 'Sales Center',
          raw: br
        }));

      case 'requisitions':
        return trashedRequisitions.map((rq: any) => ({
          id: rq.id || rq.reqNo || `req-${Date.now()}`,
          storageKey: 'polycables_trashed_requisitions',
          category: 'requisitions',
          trashedAt: rq.trashedAt || rq.savedAt || new Date().toISOString(),
          title: `Requisition #${rq.reqNo || 'N/A'} — ${rq.partyName || 'Internal Branch'}`,
          subtitle: `${rq.date || ''} • Lines: ${rq.lines?.length || 0} • Status: ${rq.stage || 'Draft'}`,
          amount: rq.totalAmount,
          badge: 'Requisition',
          raw: rq
        }));

      case 'conveyances':
        return trashedConveyances.map((cv: any) => ({
          id: cv.id || `conv-${Date.now()}`,
          storageKey: 'polycables_trashed_conveyances',
          category: 'conveyances',
          trashedAt: cv.trashedAt || cv.date || new Date().toISOString(),
          title: `Conveyance: ${cv.salespersonName || 'Staff'} (${cv.date || ''})`,
          subtitle: `From: ${cv.fromLocation || '-'} To: ${cv.toLocation || '-'} • Mode: ${cv.transportMode || '-'} • Allowance: ${cv.dailyAllowanceType || 'None'}`,
          amount: Number(cv.totalBill || (Number(cv.conveyanceAmount || 0) + Number(cv.dailyAllowanceAmount || 0) + Number(cv.hotelBillAmount || 0))),
          badge: 'Conveyance',
          raw: cv
        }));

      default:
        return [];
    }
  }, [
    activeTab,
    trashedBills,
    trashedChallans,
    trashedDraftBills,
    trashedCollections,
    trashedItems,
    trashedSpecialItems,
    trashedParties,
    trashedUsers,
    trashedBranches,
    trashedRequisitions,
    trashedConveyances
  ]);

  // Search filter
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentCategoryItems;
    return currentCategoryItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.bankName && item.bankName.toLowerCase().includes(q)) ||
        (item.badge && item.badge.toLowerCase().includes(q))
    );
  }, [currentCategoryItems, searchQuery]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((x) => x.id));
    }
  };

  // Restore single or multiple
  const restoreEntities = (itemsToRestore: TrashedItemWrapper[]) => {
    if (!itemsToRestore || itemsToRestore.length === 0) return;

    const ids = itemsToRestore.map((x) => x.id);
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem('polycables_last_restore_time', String(Date.now()));
    } catch {}
    unrecordDeletedEntityIds(ids);
    removeIdsFromAllTrashStorages(ids);

    const cloudPatch: Record<string, any> = {
      _isRestore: true,
      restoredEntityIds: ids,
      deletedEntityIds: getGlobalDeletedIds()
    };

    const byCat = new Map<TrashCategoryKey, any[]>();
    itemsToRestore.forEach((w) => {
      const cleanRaw = { ...w.raw, updatedAt: nowIso };
      delete cleanRaw.trashedAt;
      delete cleanRaw.trashCategory;
      const arr = byCat.get(w.category) || [];
      arr.push(cleanRaw);
      byCat.set(w.category, arr);
    });

    const mergeRestored = (prev: any[], restoredList: any[]) => {
      const rIds = new Set(restoredList.map((r) => r.id));
      return [...restoredList, ...prev.filter((x) => !rIds.has(x.id))];
    };

    byCat.forEach((restoredList, cat) => {
      switch (cat) {
        case 'bills':
          if (setStoredBills) {
            const next = mergeRestored(storedBills, restoredList);
            setStoredBills((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.storedBills = next;
            safeSetStorageItem('polycables_stored_bills', JSON.stringify(next), next);
            idbSaveFailoverData('polycables_stored_bills', next).catch(() => {});
          }
          break;
        case 'challans':
          if (setDeliveryChallans) {
            const next = mergeRestored(deliveryChallans, restoredList);
            setDeliveryChallans((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.deliveryChallans = next;
            safeSetStorageItem('polycables_delivery_challans', JSON.stringify(next), next);
          }
          break;
        case 'draft_bills':
          try {
            const rawDrafts = localStorage.getItem('polycables_draft_bills');
            const list = rawDrafts ? JSON.parse(rawDrafts) : [];
            const rIds = new Set(restoredList.map((r) => r.id));
            localStorage.setItem('polycables_draft_bills', JSON.stringify([...restoredList, ...list.filter((x: any) => !rIds.has(x.id))]));
          } catch {}
          break;
        case 'collections':
          if (setCollections) {
            const next = mergeRestored(collections, restoredList);
            setCollections((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.collections = next;
            safeSetStorageItem('polycables_collections', JSON.stringify(next), next);
          }
          break;
        case 'items':
        case 'special_items': {
          const next = mergeRestored(items, restoredList);
          setItems((prev: any[]) => mergeRestored(prev, restoredList));
          cloudPatch.items = next;
          const nextSpecials = next.filter((i: any) => i.isSpecialItem);
          cloudPatch.specialItems = nextSpecials;
          cloudPatch._itemsCleared = false;
          try { localStorage.removeItem('polycables_items_cleared'); } catch {}
          safeSetStorageItem('polycables_items', JSON.stringify(next), next);
          safeSetStorageItem('polycables_special_items', JSON.stringify(nextSpecials), nextSpecials);
          break;
        }
        case 'parties': {
          const next = mergeRestored(parties, restoredList);
          setParties((prev: any[]) => mergeRestored(prev, restoredList));
          cloudPatch.parties = next;
          safeSetStorageItem('polycables_parties', JSON.stringify(next), next);
          break;
        }
        case 'users':
          if (setSalespersons) {
            const next = mergeRestored(salespersons, restoredList);
            setSalespersons((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.salespersons = next;
            safeSetStorageItem('polycables_salespersons', JSON.stringify(next), next);
          }
          break;
        case 'branches':
          if (setBranches) {
            const next = mergeRestored(branches, restoredList);
            setBranches((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.branches = next;
            safeSetStorageItem('polycables_branches', JSON.stringify(next), next);
          }
          break;
        case 'requisitions':
          if (setRequisitions) {
            const next = mergeRestored(requisitions, restoredList);
            setRequisitions((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.requisitions = next;
            safeSetStorageItem('polycables_requisitions', JSON.stringify(next), next);
          }
          break;
        case 'conveyances':
          if (setConveyances) {
            const next = mergeRestored(conveyances, restoredList);
            setConveyances((prev: any[]) => mergeRestored(prev, restoredList));
            cloudPatch.conveyances = next;
            safeSetStorageItem('polycables_conveyances', JSON.stringify(next), next);
            idbSaveFailoverData('polycables_conveyances', next).catch(() => {});
          }
          break;
      }
    });

    if (typeof fetch !== 'undefined' && navigator.onLine) {
      fetch('/api/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          clientId: getClientSyncId(),
          ids,
          restoredItems: cloudPatch
        })
      }).catch(() => {});
    }

    onSyncCloud?.(cloudPatch, true);

    // Dispatch entity restored event
    ids.forEach((id) => {
      window.dispatchEvent(new CustomEvent('polycables_entity_restored', { detail: { id } }));
    });

    reloadAllTrash();
    setSelectedIds([]);
    showToast(`Restored ${itemsToRestore.length} item(s) back to active directory.`);
  };

  // Permanent Delete single or multiple
  const permanentlyDeleteEntities = (itemsToDelete: TrashedItemWrapper[]) => {
    if (!itemsToDelete || itemsToDelete.length === 0) return;

    const ids = itemsToDelete.map((x) => x.id);
    recordDeletedEntityIds(ids);
    removeIdsFromAllTrashStorages(ids);

    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids, type: 'permanent_delete' })
    }).catch(() => {});

    onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);

    ids.forEach((id) => {
      window.dispatchEvent(new CustomEvent('polycables_entity_deleted', { detail: { id } }));
    });

    reloadAllTrash();
    setSelectedIds([]);
    showToast(`Permanently deleted ${itemsToDelete.length} item(s).`);
  };

  // Empty entire active category
  const emptyCurrentCategory = () => {
    if (currentCategoryItems.length === 0) return;
    const ids = currentCategoryItems.map((x) => x.id);
    recordDeletedEntityIds(ids);
    removeIdsFromAllTrashStorages(ids);

    const storageKey = currentCategoryItems[0].storageKey;
    try {
      localStorage.setItem(storageKey, JSON.stringify([]));
    } catch {}

    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids, type: 'empty_trash_category' })
    }).catch(() => {});

    onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);

    reloadAllTrash();
    setSelectedIds([]);
    showToast(`Emptied all ${currentCategoryItems.length} items from ${TABS_CONFIG.find((t) => t.key === activeTab)?.label}.`);
  };

  return (
    <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans text-white">
      {/* Top Header */}
      <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-400/35">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-wide flex items-center gap-2 text-white">
              <span>Universal Trash Bin</span>
              <span className="text-[10px] font-bold uppercase bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded border border-rose-400/35">
                11 Modules Managed
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              Recover accidentally deleted records or permanently erase items with one click
            </p>
          </div>
        </div>
      </div>

      {/* Category Tabs Scrollbar */}
      <div className="bg-[#071824]/90 p-2 overflow-x-auto border-b border-cyan-500/20">
        <div className="flex items-center space-x-1.5 min-w-max">
          {TABS_CONFIG.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-400 text-slate-950 font-black shadow-sm'
                    : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/20'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    isActive
                      ? 'bg-slate-950/20 text-slate-950'
                      : t.count > 0
                      ? 'bg-[#061520] text-amber-300 border border-amber-400/35'
                      : 'bg-[#061520] text-slate-400 border border-cyan-500/20'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Bar (Search & Bulk Tools) */}
      <div className="p-3 px-4 bg-[#0b2334]/75 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-cyan-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${TABS_CONFIG.find((t) => t.key === activeTab)?.label}...`}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-none"
          />
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-1.5">
          {selectedIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  const selectedWrappers = currentCategoryItems.filter((x) =>
                    selectedIds.includes(x.id)
                  );
                  restoreEntities(selectedWrappers);
                }}
                className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Selected ({selectedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'delete_selected',
                    count: selectedIds.length
                  })
                }
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase Selected ({selectedIds.length})</span>
              </button>
            </>
          )}

          {currentCategoryItems.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setConfirmModal({
                  isOpen: true,
                  type: 'empty_category',
                  count: currentCategoryItems.length
                })
              }
              className="px-3 py-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-500/40 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-300" />
              <span>Empty This Bin ({currentCategoryItems.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Trashed List Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0c2638] text-cyan-200 font-extrabold uppercase text-[10px] tracking-wider border-b border-cyan-500/30 whitespace-nowrap">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={
                    filteredItems.length > 0 &&
                    selectedIds.length === filteredItems.length
                  }
                  onChange={handleSelectAll}
                  className="rounded border-cyan-500/40 bg-[#061520] text-cyan-400 cursor-pointer"
                />
              </th>
              <th className="p-3 w-10 text-center">#</th>
              <th className="p-3 min-w-[220px]">Item Description / Title</th>
              <th className="p-3 min-w-[200px]">Details / Metadata</th>
              <th className="p-3 w-28 text-center">Category</th>
              <th className="p-3 w-28 text-right">Value / Amount</th>
              <th className="p-3 w-36 text-center">Deleted At</th>
              <th className="p-3 w-28 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Trash2 className="w-8 h-8 text-cyan-500/40" />
                    <p className="font-semibold text-xs text-slate-300">
                      No deleted records found in {TABS_CONFIG.find((t) => t.key === activeTab)?.label}.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-cyan-500/[0.06] transition-colors ${
                      isSelected ? 'bg-rose-950/25' : ''
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-cyan-500/40 bg-[#061520] text-cyan-400 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-center font-mono text-slate-400 text-xs font-semibold">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-bold text-white text-xs">
                      {item.title}
                    </td>
                    <td className="p-3 text-slate-300 text-xs">
                      <div className="inline-flex items-center gap-2">
                        {item.subtitle || '-'}
                        {item.bankName && <BankLogoBadge bankName={item.bankName} size="sm" />}
                      </div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {item.badge ? (
                        <span className="text-[10px] bg-[#0c2638] text-cyan-200 px-2 py-0.5 rounded font-bold border border-cyan-500/30">
                          {item.badge}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-300 text-xs whitespace-nowrap">
                      {item.amount !== undefined && item.amount !== null ? (
                        <span>৳{Number(item.amount).toLocaleString('en-IN')}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-[11px] text-slate-300 whitespace-nowrap">
                      {item.trashedAt ? new Date(item.trashedAt).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => restoreEntities([item])}
                          className="px-2 py-1 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-200 border border-cyan-400/35 rounded font-bold text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                          title="Restore back to active directory"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmModal({
                              isOpen: true,
                              type: 'delete_single',
                              targetId: item.id,
                              targetName: item.title
                            })
                          }
                          className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/35 rounded font-bold text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                          title="Permanently erase from trash"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Erase</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-5 space-y-4 border border-cyan-400/35 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-rose-500/20 text-rose-300 border border-rose-400/35 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmModal.type === 'empty_category'
                    ? 'Empty Trash Bin?'
                    : confirmModal.type === 'delete_selected'
                    ? 'Erase Selected Records?'
                    : 'Permanently Erase Record?'}
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {confirmModal.type === 'empty_category' ? (
                    <>
                      Are you sure you want to permanently erase all{' '}
                      <strong className="text-rose-300">{confirmModal.count}</strong> record(s) from{' '}
                      <strong className="text-white">{TABS_CONFIG.find((t) => t.key === activeTab)?.label}</strong>? This action cannot be undone.
                    </>
                  ) : confirmModal.type === 'delete_selected' ? (
                    <>
                      Are you sure you want to permanently erase{' '}
                      <strong className="text-rose-300">{confirmModal.count}</strong> selected record(s)? This action cannot be undone.
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently erase &quot;
                      <strong className="text-rose-300">{confirmModal.targetName}</strong>&quot;? This record will be gone permanently.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-cyan-500/20 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmModal.type === 'empty_category') {
                    emptyCurrentCategory();
                  } else if (confirmModal.type === 'delete_selected') {
                    const selectedWrappers = currentCategoryItems.filter((x) =>
                      selectedIds.includes(x.id)
                    );
                    permanentlyDeleteEntities(selectedWrappers);
                  } else if (confirmModal.type === 'delete_single' && confirmModal.targetId) {
                    const target = currentCategoryItems.find(
                      (x) => x.id === confirmModal.targetId
                    );
                    if (target) permanentlyDeleteEntities([target]);
                  }
                  setConfirmModal(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
              >
                Yes, Erase Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#0b2334]/95 backdrop-blur-xl text-white px-4 py-2.5 rounded-lg shadow-lg border border-cyan-400/40 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
