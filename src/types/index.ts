export type ChallanStatus = 'Pending' | 'Partially Billed' | 'Fully Billed';

export interface CatalogItem {
  id: string;
  name: string;
  category: 'HDPE' | 'LDPE' | 'BOPP' | 'PP' | 'Biodegradable' | 'Stretch & Shrink' | 'Custom Packaging';
  specifications: string;
  unit: 'Kg' | 'Pcs' | 'Rolls' | 'Packets' | 'Bundles' | 'Meters';
  unitPrice: number;
  taxRate: number; // e.g. 18 for 18%
  stockAvailable: number;
  description?: string;
}

export interface ChallanItem {
  id: string; // unique item line id
  itemId?: string; // reference to catalog item
  name: string;
  specifications: string;
  unit: string;
  dispatchedQty: number;
  billedQty: number;
  unitPrice: number;
  notes?: string;
}

export interface LinkedBillingRecord {
  invoiceId: string;
  invoiceNo: string;
  billedAt: string;
  billedAmount: number;
  billedItemCount: number;
}

export interface Challan {
  id: string;
  challanNo: string;
  date: string;
  clientName: string;
  clientContact: string;
  clientGstOrTaxId?: string;
  deliveryAddress: string;
  vehicleNo: string;
  driverName?: string;
  purchaseOrderNo?: string;
  notes?: string;
  items: ChallanItem[];
  status: ChallanStatus;
  isLocked: boolean; // True when Fully Billed
  billingHistory: LinkedBillingRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  name: string;
  specifications: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  dueDate: string;
  challanId: string;
  challanNo: string;
  clientName: string;
  clientContact: string;
  clientGstOrTaxId?: string;
  billingAddress: string;
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  paymentStatus: 'Paid' | 'Unpaid' | 'Partial';
  paymentMethod?: 'Bank Transfer' | 'Cash' | 'Cheque' | 'UPI';
  notes?: string;
  createdAt: string;
}
