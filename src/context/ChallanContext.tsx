import React, { createContext, useContext, useState, useEffect } from 'react';
import { Challan, CatalogItem, Invoice, LinkedBillingRecord } from '../types';
import { INITIAL_CHALLANS, INITIAL_INVOICES } from '../data/mockData';
import { getPriceListSnapshots, normalizePriceSnapshots } from '../utils/priceCircularHelper';

interface ChallanContextType {
  challans: Challan[];
  invoices: Invoice[];
  catalogItems: CatalogItem[];
  unbilledChallansCount: number; // Count of challans NOT fully billed
  totalChallansCount: number;
  pendingCount: number;
  partialCount: number;
  fullyBilledCount: number;
  
  // Actions
  createChallan: (newChallanData: Omit<Challan, 'id' | 'createdAt' | 'updatedAt' | 'isLocked' | 'billingHistory' | 'status'> & { status?: Challan['status'] }) => Challan;
  updateChallan: (id: string, updatedData: Partial<Challan>) => boolean;
  deleteChallan: (id: string) => boolean;
  markAsFullBilled: (id: string) => void;
  generateBillFromChallan: (challanId: string, billedQtys?: Record<string, number>, paymentMethod?: Invoice['paymentMethod']) => Invoice;
  unlockChallan: (id: string) => void;
  createCatalogItem: (item: Omit<CatalogItem, 'id'>) => CatalogItem;
  deleteCatalogItem: (id: string) => void;
  resetAllToDemo: () => void;
  getChallanById: (id: string) => Challan | undefined;
  getInvoiceById: (id: string) => Invoice | undefined;
}

const ChallanContext = createContext<ChallanContextType | undefined>(undefined);

const STORAGE_CHALLANS = 'poly_challans_v2';
const STORAGE_INVOICES = 'poly_invoices_v2';
const STORAGE_CATALOG = 'poly_catalog_v2';

const STORAGE_CATALOG_CLEAN_FLAG = 'poly_catalog_clean_v1';

function resolveActiveSnapshotCatalogItems(): CatalogItem[] {
  try {
    const snaps = normalizePriceSnapshots(getPriceListSnapshots());
    const activeSnap = snaps.find((s) => s && s.isActive) || (snaps.length === 1 ? snaps[0] : undefined);
    const snapItems = activeSnap && Array.isArray(activeSnap.items) ? activeSnap.items : [];
    if (snapItems.length === 0) return [];
    return snapItems
      .filter((si) => si && (si.name || '').trim())
      .map((si, idx) => ({
        id: si.id || `cat-snap-${idx + 1}`,
        name: String(si.name || '').trim(),
        category: ((si.category || 'Custom Packaging') as CatalogItem['category']),
        specifications: String(si.sizeSpec || si.category || 'Standard Grade'),
        unit: ((si.unit || 'Pcs') as CatalogItem['unit']),
        unitPrice: Number(si.rate) || 0,
        taxRate: 18,
        stockAvailable: 0,
      }));
  } catch {
    return [];
  }
}

export const ChallanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [challans, setChallans] = useState<Challan[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHALLANS);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_CHALLANS;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_INVOICES);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_INVOICES;
  });

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(() => {
    try {
      if (!localStorage.getItem(STORAGE_CATALOG_CLEAN_FLAG)) {
        localStorage.setItem(STORAGE_CATALOG_CLEAN_FLAG, 'true');
        localStorage.setItem(STORAGE_CATALOG, '[]');
      }
    } catch {
      // ignore
    }
    return resolveActiveSnapshotCatalogItems();
  });

  useEffect(() => {
    const syncCatalogFromSnapshots = () => {
      setCatalogItems(resolveActiveSnapshotCatalogItems());
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key === 'polycables_price_snapshots' ||
        e.key === 'polycables_price_history_lists' ||
        e.key === 'polycables_active_effective_date' ||
        e.key === 'polycables_price_snapshots_cleared'
      ) {
        syncCatalogFromSnapshots();
      }
    };
    syncCatalogFromSnapshots();
    window.addEventListener('polycables_snapshots_updated', syncCatalogFromSnapshots);
    window.addEventListener('polycables_price_snapshots_updated', syncCatalogFromSnapshots);
    window.addEventListener('polycables_active_price_circular_changed', syncCatalogFromSnapshots);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('polycables_snapshots_updated', syncCatalogFromSnapshots);
      window.removeEventListener('polycables_price_snapshots_updated', syncCatalogFromSnapshots);
      window.removeEventListener('polycables_active_price_circular_changed', syncCatalogFromSnapshots);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHALLANS, JSON.stringify(challans));
    } catch {
      // ignore
    }
  }, [challans]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_INVOICES, JSON.stringify(invoices));
    } catch {
      // ignore
    }
  }, [invoices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CATALOG, JSON.stringify(catalogItems));
    } catch {
      // ignore
    }
  }, [catalogItems]);

  // Crucial calculation:
  // If complete full billed in chalan directory's any challan, then it is NOT shown in the active count.
  // When all are fully billed, unbilledChallansCount becomes 0 -> shows "Challan Directory (0)".
  const unbilledChallansCount = challans.filter(c => c.status !== 'Fully Billed').length;
  const totalChallansCount = challans.length;
  const pendingCount = challans.filter(c => c.status === 'Pending').length;
  const partialCount = challans.filter(c => c.status === 'Partially Billed').length;
  const fullyBilledCount = challans.filter(c => c.status === 'Fully Billed').length;

  const createChallan = (data: Omit<Challan, 'id' | 'createdAt' | 'updatedAt' | 'isLocked' | 'billingHistory' | 'status'> & { status?: Challan['status'] }) => {
    const timestamp = new Date().toISOString();
    const newId = 'chl-' + Date.now().toString(36);
    const newChallan: Challan = {
      ...data,
      id: newId,
      status: data.status || 'Pending',
      isLocked: data.status === 'Fully Billed',
      billingHistory: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setChallans(prev => [newChallan, ...prev]);
    return newChallan;
  };

  const updateChallan = (id: string, updatedData: Partial<Challan>) => {
    const target = challans.find(c => c.id === id);
    if (target && target.isLocked && updatedData.isLocked !== false && target.status === 'Fully Billed') {
      // Locked protection
      console.warn('Cannot edit locked challan directly');
      return false;
    }

    setChallans(prev =>
      prev.map(c => {
        if (c.id === id) {
          const status = updatedData.status || c.status;
          const isLocked = status === 'Fully Billed' ? true : (updatedData.isLocked ?? c.isLocked);
          return {
            ...c,
            ...updatedData,
            status,
            isLocked,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );
    return true;
  };

  const deleteChallan = (id: string) => {
    setChallans(prev => prev.filter(c => c.id !== id));
    return true;
  };

  const markAsFullBilled = (id: string) => {
    const target = challans.find(c => c.id === id);
    if (!target) return;

    // Generate bill or mark full billed
    generateBillFromChallan(id);
  };

  const unlockChallan = (id: string) => {
    setChallans(prev =>
      prev.map(c => {
        if (c.id === id) {
          return {
            ...c,
            status: 'Partially Billed',
            isLocked: false,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );
  };

  const generateBillFromChallan = (
    challanId: string,
    billedQtys?: Record<string, number>,
    paymentMethod: Invoice['paymentMethod'] = 'Bank Transfer'
  ): Invoice => {
    const targetChallan = challans.find(c => c.id === challanId);
    if (!targetChallan) {
      throw new Error('Challan not found');
    }

    const invSeq = String(invoices.length + 42).padStart(4, '0');
    const invoiceNo = `INV-${new Date().getFullYear()}-${invSeq}`;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const dueObj = new Date();
    dueObj.setDate(dueObj.getDate() + 15);
    const dueDateStr = dueObj.toISOString().split('T')[0];

    // Compute billed items
    let isAllFullyBilled = true;
    const updatedItems = targetChallan.items.map(item => {
      const remainingQty = Math.max(0, item.dispatchedQty - item.billedQty);
      const qtyToBill = billedQtys && billedQtys[item.id] !== undefined
        ? Math.min(remainingQty, Math.max(0, billedQtys[item.id]))
        : remainingQty;

      const newBilledTotal = item.billedQty + qtyToBill;
      if (newBilledTotal < item.dispatchedQty) {
        isAllFullyBilled = false;
      }
      return {
        ...item,
        billedQty: newBilledTotal,
        _justBilledQty: qtyToBill,
      };
    });

    const invoiceItems = updatedItems
      .filter(item => item._justBilledQty > 0)
      .map(item => {
        const matchingCat = catalogItems.find(ci => ci.name === item.name);
        const taxRate = matchingCat?.taxRate ?? 18;
        const amount = item._justBilledQty * item.unitPrice;
        const taxAmount = (amount * taxRate) / 100;
        return {
          name: item.name,
          specifications: item.specifications,
          unit: item.unit,
          qty: item._justBilledQty,
          rate: item.unitPrice,
          amount,
          taxRate,
          taxAmount,
          total: amount + taxAmount,
        };
      });

    const subtotal = invoiceItems.reduce((acc, it) => acc + it.amount, 0);
    const taxTotal = invoiceItems.reduce((acc, it) => acc + it.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;

    const newInvoice: Invoice = {
      id: 'inv-' + Date.now().toString(36),
      invoiceNo,
      date: todayStr,
      dueDate: dueDateStr,
      challanId: targetChallan.id,
      challanNo: targetChallan.challanNo,
      clientName: targetChallan.clientName,
      clientContact: targetChallan.clientContact,
      clientGstOrTaxId: targetChallan.clientGstOrTaxId,
      billingAddress: targetChallan.deliveryAddress,
      items: invoiceItems,
      subtotal,
      taxTotal,
      discount: 0,
      grandTotal,
      paymentStatus: 'Paid',
      paymentMethod,
      notes: `Bill generated for Delivery Challan ${targetChallan.challanNo}. Goods verified & delivered.`,
      createdAt: nowIso,
    };

    // Save invoice
    setInvoices(prev => [newInvoice, ...prev]);

    // Update Challan status:
    // If complete full billed in chalan directory's any challan, its status is 'Fully Billed' & isLocked is TRUE
    const newStatus = isAllFullyBilled ? 'Fully Billed' : 'Partially Billed';
    const newIsLocked = isAllFullyBilled; // Locked in Read-Only Mode!

    const billingRecord: LinkedBillingRecord = {
      invoiceId: newInvoice.id,
      invoiceNo: newInvoice.invoiceNo,
      billedAt: nowIso,
      billedAmount: grandTotal,
      billedItemCount: invoiceItems.length,
    };

    setChallans(prev =>
      prev.map(c => {
        if (c.id === challanId) {
          return {
            ...c,
            items: updatedItems.map(({ _justBilledQty, ...rest }) => rest),
            status: newStatus,
            isLocked: newIsLocked,
            billingHistory: [billingRecord, ...c.billingHistory],
            updatedAt: nowIso,
          };
        }
        return c;
      })
    );

    return newInvoice;
  };

  const createCatalogItem = (item: Omit<CatalogItem, 'id'>) => {
    const newItem: CatalogItem = {
      ...item,
      id: 'cat-' + Date.now().toString(36),
    };
    setCatalogItems(prev => [newItem, ...prev]);
    return newItem;
  };

  const deleteCatalogItem = (id: string) => {
    setCatalogItems(prev => prev.filter(i => i.id !== id));
  };

  const resetAllToDemo = () => {
    localStorage.removeItem(STORAGE_CHALLANS);
    localStorage.removeItem(STORAGE_INVOICES);
    localStorage.setItem(STORAGE_CATALOG, '[]');
    setChallans(INITIAL_CHALLANS);
    setInvoices(INITIAL_INVOICES);
    setCatalogItems(resolveActiveSnapshotCatalogItems());
  };

  const getChallanById = (id: string) => challans.find(c => c.id === id);
  const getInvoiceById = (id: string) => invoices.find(i => i.id === id);

  return (
    <ChallanContext.Provider
      value={{
        challans,
        invoices,
        catalogItems,
        unbilledChallansCount,
        totalChallansCount,
        pendingCount,
        partialCount,
        fullyBilledCount,
        createChallan,
        updateChallan,
        deleteChallan,
        markAsFullBilled,
        generateBillFromChallan,
        unlockChallan,
        createCatalogItem,
        deleteCatalogItem,
        resetAllToDemo,
        getChallanById,
        getInvoiceById,
      }}
    >
      {children}
    </ChallanContext.Provider>
  );
};

export const useChallan = () => {
  const context = useContext(ChallanContext);
  if (!context) {
    throw new Error('useChallan must be used within a ChallanProvider');
  }
  return context;
};
