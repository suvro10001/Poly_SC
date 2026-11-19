export interface PriceHistoryEntry {
  effectiveDate: string; // YYYY-MM-DD or DD.MM.YYYY
  rate: number;
  updatedAt?: string;
  notes?: string;
}

export interface PriceListRevision {
  id: string;
  effectiveDate: string;
  label: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  itemCount: number;
  snapshotItems?: Item[];
}

export interface ColorBreakdown {
  red?: number;
  blk?: number;
  yel?: number;
  grn?: number;
  blu?: number;
  others?: number;
  black?: number;
  yellow?: number;
  green?: number;
  blue?: number;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  description?: string;
  brand?: string;
  sizeSpec?: string;
  unit: string; // e.g. Coils, Coil, Meter, Pc, Pkt, Box
  rate: number;
  effectiveDate?: string; // Effective Date for this price (YYYY-MM-DD)
  priceHistory?: PriceHistoryEntry[]; // Historical price entries by effective date
  category: string;
  openingStock: number; // Opening Coil Qty
  addedStock?: number; // Stock In from Factory Imports
  importFactory?: number; // Stock In from Factory Imports
  returnParty?: number; // Return From Party (R.Party)
  returnFactory?: number; // Return Factory (Re. Fac.)
  totalSales?: number; // Total sold coils
  isSpecialItem?: boolean; // True if special variant item (e.g. 500m coil)
  baseItemId?: string; // Linked base item ID for stock deduction
  baseItemCode?: string; // Linked base item code
  stockMultiplier?: number; // Multiplier e.g. 5 coils deducted from base item per unit
  isActive?: boolean; // Active / Inactive status
  branchActiveStatus?: Record<string, boolean>; // Sales Center specific active status e.g. { 'branch-1': true, 'branch-2': false }
  branchOpeningStock?: Record<string, number>; // Sales Center / Branch specific opening stock e.g. { 'branch-1': 100, 'branch-2': 50 }
  colorStock?: ColorBreakdown;
  colorComments?: string;
  baseRate?: number;
  specialItems?: boolean;
  remarks?: string;
  serial?: number | string;
  serialNo?: number | string;
  order?: number;
  hasExplicitStock?: boolean;
  updatedAt?: number | string;
  savedAt?: string;
  deletedAt?: string;
}

export interface BillLineItem {
  id: string;
  slNo: number;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemDescription: string;
  sizeSpec?: string;
  coilQty: number; // Quantity
  totalCoil?: number;
  unit: string; // Coils, Meter, etc.
  rate: number; // Price/Unit
  amount: number; // Amount
  isSpecialItem?: boolean;
  baseItemId?: string;
  baseItemCode?: string;
  stockMultiplier?: number;
  colors?: ColorBreakdown;
  remarks?: string;
  manuallyEdited?: boolean;
  userConfirmed?: boolean;
}

export interface CompanyDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  branchName?: string;
}

export interface BillHeader {
  partyName: string;
  customerName?: string;
  address: string;
  customerAddress?: string;
  phone?: string;
  orderNumber: string;
  billNo: string;
  challanNo: string;
  refNo: string;
  salesmanCode: string;
  salespersonCode?: string;
  salespersonName?: string;
  salesmanName?: string;
  salesperson?: string;
  date: string;
  orderDate?: string;
  challanDate?: string;
  discountPercent: number; // e.g., 10 for 10% discount
  discountAmount?: number; // Exact discount amount (allows manual override and exact float precision persistence)
  isDraft?: boolean; // True if saved as Draft Bill (does not affect showroom stock, excluded from reports)
  status?: 'saved' | 'draft' | 'final';
  isOfficeBill?: boolean; // True if Office Sale (Factory Direct, no showroom stock deduction)
  receivedCopy?: string; // Base64 data URL or image URL of signed/stamped received copy
  receivedCopyName?: string; // File name e.g. "Received_Copy_Inv_12.jpg"
  receivedCopyDate?: string; // Upload / Received timestamp
  branchId?: string; // Sales Center / Showroom Branch ID
  branchName?: string; // Sales Center / Showroom Branch Name
  salesCenter?: string;
  inWords?: string;
  notes?: string;
  createdBy?: string; // Username who created the bill
  updatedAt?: string | number;
}

export interface StoredBill {
  id: string;
  savedAt: string; // ISO date string
  date?: string;
  billNo?: string;
  company: CompanyDetails;
  header: BillHeader;
  lines: BillLineItem[];
  subtotal: number;
  subTotal?: number;
  totalGross?: number;
  discountAmount: number;
  grandTotal: number;
  netTotal?: number;
  totalAmount?: number;
  inWords: string;
  totalCoils?: number;
  isDraft?: boolean; // True if saved as Draft Bill (does not affect showroom stock, excluded from reports)
  status?: 'saved' | 'draft' | 'final';
  isOfficeBill?: boolean; // True if Office Sale (Factory Direct, no showroom stock deduction)
  receivedCopy?: string; // Base64 data URL or document URL of signed/stamped received copy
  receivedCopyName?: string; // File name
  receivedCopyDate?: string; // Upload / Received timestamp
  branchId?: string; // Sales Center / Showroom Branch ID
  branchName?: string; // Sales Center / Showroom Branch Name
  partyName?: string;
  netAmount?: number;
  createdBy?: string; // Username who created the bill
  copyStatus?: string;
  salesmanCode?: string;
  salesmanName?: string;
  marketingPerson?: string;
  items?: any[];
  updatedAt?: string | number;
}

export interface Party {
  id: string;
  name: string;
  address: string;
  phone?: string;
  mobile?: string;
  salesmanCode?: string;
  salespersonName?: string;
  openingBalance?: number; // Customer Opening Balance (Tk)
  branchId?: string; // Sales Center / Showroom Branch ID
  branchName?: string; // Sales Center / Showroom Branch Name
  branch?: string;
  salesCenter?: string;
  createdBy?: string;
  updatedAt?: string | number;
}

export type BranchType = 'showroom' | 'head_office' | 'power_market' | 'other';

export interface BranchLocation {
  id: string;
  name: string;
  code?: string;
  type: BranchType; // 'showroom' | 'head_office' | 'power_market' | 'other'
  district?: string;
  location?: string;
  inChargeId?: string; // Salesperson / Staff ID (required for showroom, not needed for head_office / power_market)
  inChargeCode?: string;
  inChargeName?: string;
  inChargePhone?: string;
  approverId?: string; // Assigned Approver
  approverName?: string;
  adminId?: string; // Assigned Admin ID (e.g. admin-1, admin-2)
  adminName?: string; // Assigned Admin Name
  adminUsername?: string; // Assigned Admin Username
  assignedAdminId?: string; // Direct assigned admin ID alias
  adminZone?: string; // Admin Zone / Division
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
  isUserCreated?: boolean;
}

export type RequisitionStage =
  | 'pending_goods'
  | 'goods_received'
  | 'converted_to_bill'
  | 'draft'
  | 'pending_incharge'
  | 'pending_admin'
  | 'pending_approver'
  | 'in_audit'
  | 'sent_to_factory'
  | 'factory_dispatched'
  | 'factory_received'
  | 'rejected'
  | 'revision_requested';

export interface RequisitionLineItem {
  id: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  description?: string;
  sizeSpec?: string;
  unit: string;
  category?: string;
  currentStock?: number;
  requestedQty: number;
  approvedQty?: number;
  deliveredQty?: number;
  quantity?: number;
  restQty?: number;
  rate: number;
  amount: number;
  red?: number | '';
  black?: number | '';
  yellow?: number | '';
  green?: number | '';
  blue?: number | '';
  others?: number | '';
  colors?: RequisitionColorBreakdown;
  remarks?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  actorName: string;
  actorRole: 'associate' | 'in_charge' | 'approver' | 'auditor' | 'factory' | 'admin';
  actorId?: string;
  action: string; // e.g. 'Created', 'Submitted', 'In-Charge Approved', 'Approver Approved', 'Audit Approved', 'Sent to Factory', 'Rejected', 'Revision Requested'
  fromStage?: RequisitionStage;
  toStage: RequisitionStage;
  comments?: string;
}

export interface RequisitionColorBreakdown {
  red?: number;
  black?: number;
  yellow?: number;
  green?: number;
  blue?: number;
  others?: number;
  blk?: number;
  yel?: number;
  grn?: number;
  blu?: number;
}

export interface RequisitionSlipItem {
  id: string;
  sl: number;
  itemId?: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unit: string;
  colors?: RequisitionColorBreakdown;
  remarks?: string;
  // Special Item detection (e.g. 500m / 1000m / Bobin)
  isSpecialItem?: boolean;
  specialMeters?: number; // e.g. 500 or 1000
  baseCoilEquivalent?: number; // 500m = 5 coils (1 coil = 100m)
  // Delivery & Office Bill conversion tracking:
  deliveredQty?: number;
  rate?: number;
  amount?: number;
}

export interface RequisitionSlipData {
  id: string;
  prefix?: string; // Optional requisition prefix (e.g. TC, SC, HO)
  reqNo: string; // e.g. "62-Subrata" (Marketing person count)
  seqNumber: number; // e.g. 62
  marketingPersonId?: string;
  marketingPersonName: string; // e.g. "Subrata"
  toDestination: string; // e.g. "Factory"
  partyId?: string;
  partyName: string; // e.g. "Maa Electric"
  partyAddress?: string; // e.g. "Sagordighi, Ghatail"
  partyPhone?: string;
  deliverySite?: string; // Delivery Site box / Project Site
  reqDate: string; // YYYY-MM-DD or DD.MM.YYYY
  delvDate: string; // YYYY-MM-DD or DD.MM.YYYY
  lines: RequisitionSlipItem[];
  totalQuantity: number;
  // Requisition Discount & Amounts
  subtotalAmount?: number;
  discountPercent?: number; // e.g. 10
  discountEffectiveDate?: string; // e.g. "01.02.2026"
  discountAmount?: number;
  netAmount?: number; // After discount
  dueAmount?: number; // Previous/Current Due e.g. 39,112 Tk
  totalDeliveredQty?: number;
  deliveryCount?: number; // How many times goods delivered (1st: 62, 2nd: 62(A), 3rd: 62(B), etc.)
  deliveredBillNumbers?: string[]; // List of bill numbers generated (e.g. ["62", "62(A)"])
  partialDeliveries?: Array<{
    billId: string;
    billNo: string;
    deliveredAt: string;
    deliveredQty: number;
    lines: RequisitionSlipItem[];
  }>;
  reqBy: string; // e.g. "Subrata"
  preparedBy: string; // e.g. "Rajon"
  approvedBy: string; // e.g. "Madhupur Sales Center"
  status: 'pending' | 'sent_to_factory' | 'goods_received' | 'converted_to_bill' | 'cancelled';
  convertedBillId?: string;
  convertedBillNo?: string;
  convertedAt?: string;
  auditMailSent?: boolean;
  auditMailSentAt?: string;
  notes?: string;
  savedAt: string;
  updatedAt?: string;
}

export interface PriceListSnapshot {
  id: string;
  title?: string;
  effectiveDate: string; // dd.mm.yy e.g. "01.02.2026"
  createdAt: string;
  itemCount: number;
  items: Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    unit: string;
    rate: number;
    sizeSpec?: string;
    serial?: number | string;
  }>;
  isActive: boolean;
  updatedAt?: string;
  activatedAt?: string;
  notes?: string;
  description?: string;
  changeSummary?: string;
}

export interface Requisition {
  id: string;
  prefix?: string; // Optional requisition prefix (e.g. TC, SC, HO)
  reqNo: string; // e.g. REQ-2026-001 or 62-Subrata or # 68-Subrata
  seqNumber?: number;
  date: string; // YYYY-MM-DD
  branchId?: string;
  branchName?: string;
  branchType?: BranchType;
  partyName?: string;
  partyAddress?: string;
  toDestination?: string;
  deliverySite?: string;
  discountPercent?: number;
  discountAmount?: number;
  customerCurrentDue?: number;
  reqDateStr?: string;
  delvDateStr?: string;
  marketingPersonName?: string;
  salesmanCode?: string;
  needsInChargeApproval?: boolean; // false for head_office and power_market; true for showroom
  // Stakeholders
  createdByUserId?: string;
  createdByName?: string;
  createdByRole?: string;
  reqBySignature?: string;
  inChargeId?: string;
  inChargeName?: string;
  inChargeApprovalDate?: string;
  inChargeComments?: string;
  approverId?: string;
  approverName?: string;
  approverApprovalDate?: string;
  approverComments?: string;
  auditorId?: string;
  auditorName?: string;
  auditApprovalDate?: string;
  auditComments?: string;
  auditVerificationNumber?: string;
  factoryStatus?: 'pending_dispatch' | 'dispatched' | 'received';
  factoryChallanNo?: string;
  factoryDispatchDate?: string;
  inChargeApproved?: boolean;
  inChargeApprovedBy?: string;
  inChargeApprovedAt?: string;
  deliveryStatus?: 'not_delivered' | 'partially_delivered' | 'fully_delivered';
  deliveryHistory?: Array<{
    deliveryIndex: number;
    billNo: string;
    date: string;
    deliveredCoils: number;
    lines: any[];
  }>;
  // Status & Details
  stage: RequisitionStage;
  isApproved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  percentage?: number; // 0 - 100%
  auditMailSent?: boolean;
  auditMailSentAt?: string;
  isLocked?: boolean;
  convertedBillId?: string;
  convertedBillNo?: string;
  convertedAt?: string;
  urgency?: 'normal' | 'urgent' | 'emergency';
  remarks?: string;
  lines: RequisitionLineItem[];
  totalRequestedQty: number;
  totalApprovedQty?: number;
  totalDeliveredQty?: number;
  totalAmount: number;
  deliveryCount?: number;
  partialDeliveries?: any[];
  linesWithRest?: any[];
  deliveredBillNumbers?: string[];
  auditLogs?: AuditLogEntry[];
  preparedBySignature?: string;
  checkedBySignature?: string;
  approvedBySignature?: string;
  savedAt: string;
  updatedAt?: string;
  isSalesCenterRequisition?: boolean;
}

export interface SalespersonTarget {
  salespersonId: string;
  salespersonCode: string;
  salespersonName: string;
  monthYear: string; // e.g. "2026-08" or "default"
  targetSalesAmount: number; // in ৳
  targetCollectionAmount: number; // in ৳
  targetCoils?: number;
  notes?: string;
  updatedAt?: string;
}

export const USER_DESIGNATIONS = [
  'Officer',
  'Senior Officer',
  'Jr. Executive',
  'Executive',
  'Sr. Executive',
  'Asst. Manager',
  'Deputy Manager',
  'Manager',
  'Sr. Manager',
  'A.G.M',
  'D.G.M',
  'Director',
  'Managing Director'
] as const;

export type UserDesignation = (typeof USER_DESIGNATIONS)[number];

export interface Salesperson {
  id: string;
  code: string;
  name: string;
  username?: string;
  isSuperAdmin?: boolean;
  phone?: string;
  areaGroup?: string;
  password?: string; // Individual Salesperson Password / PIN for login
  userType?: 'marketing' | 'user'; // 'marketing' = Marketing Person, 'user' = General User/Staff Role
  role?: string; // e.g. 'Marketing Representative', 'Accountant', 'Manager', etc.
  designation?: string; // Jr. Executive, Executive, Sr. Executive, Asst. Manager, Deputy Manager, Manager, Sr. Manager, A.G.M, D.G.M
  isInCharge?: boolean; // In Charge (tik mark yes or no)
  branchId?: string; // Assigned Showroom / Branch ID
  branchName?: string; // Assigned Showroom / Branch Name
  branch?: string;
  isApproved?: boolean; // New user requires approval by super admin or admin
  isActive?: boolean; // Active or inactive user status
  isBlocked?: boolean; // Blocked user flag
  approvedBy?: string; // Admin username/name who approved
  approvedAt?: string; // Approval timestamp
  monthlyTargetSales?: number; // Default monthly target in ৳
  monthlyTargetCollection?: number; // Default monthly collection target in ৳
  monthlyTargetCoils?: number; // Default monthly coils target
  yearlyTargetSales?: number; // Yearly sales target in ৳ (auto-calculates monthly: yearly / 12)
  yearlyTargetCollection?: number; // Yearly collection target in ৳ (auto-calculates monthly: yearly / 12)
  allowedMenus?: string[]; // Customized menu tabs allowed for this user/role (configured by super admin)
  assignedBranchIds?: string[]; // Multiple sales centers assigned under this Admin (4, 5, etc.)
  assignedBranchNames?: string[];
  adminZone?: string;
  updatedAt?: number;
}

export interface AuthUser {
  id?: string;
  username: string;
  name: string;
  role: 'admin' | 'salesperson' | 'agm' | 'user' | 'accountant' | 'super_admin' | 'Super Admin' | string;
  salespersonCode?: string;
  branchId?: string;
  branchName?: string;
  isSuperAdmin?: boolean;
  isAgm?: boolean;
  isInCharge?: boolean;
  designation?: string;
  userRole?: string;
  isApproved?: boolean;
  allowedMenus?: string[];
  yearlyTargetSales?: number;
  yearlyTargetCollection?: number;
  assignedBranchIds?: string[]; // Multiple sales centers assigned under this Admin (4, 5, etc.)
  assignedBranchNames?: string[];
  adminZone?: string;
  areaGroup?: string;
}

export interface FactoryImportLine {
  id: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  sizeSpec?: string;
  unit: string;
  category?: string;
  branchId?: string; // Target Sales Center / Branch ID
  branchName?: string; // Target Sales Center / Branch Name
  quantity: number; // Imported coil/meter qty
  rate: number;
  amount: number;
  red?: number | string;
  black?: number | string;
  yellow?: number | string;
  green?: number | string;
  blue?: number | string;
  others?: number | string;
  remarks?: string;
}

export interface FactoryImportChallan {
  id: string;
  savedAt: string; // ISO date string
  updatedAt?: string; // ISO date string when edited
  reqNo?: string; // Requisition Number
  challanNo: string;
  date: string;
  branchId?: string; // Target Sales Center / Showroom Branch ID
  branchName?: string; // Target Sales Center / Showroom Branch Name
  carNumber: string;
  driverName: string;
  driverPhone: string;
  remarks?: string;
  lines: FactoryImportLine[];
  totalQuantity: number;
  totalAmount: number;
  discountPercent?: number;
  discountAmount?: number;
  netAmount?: number;
  items?: any[];
}

export type ReturnType = 'party_return' | 'factory_return' | 'color_exchange';

export interface ColorExchangeLine {
  id: string;
  // Input (L.H.S - Return in from Party)
  inItemId?: string;
  inItemCode?: string;
  inItemName: string;
  inUnit: string; // 'Coils' | 'Bobin'
  inQty: number;
  inColors: ColorBreakdown;
  inCoilEquivalent: number;
  // Output (R.H.S - Issued out to Party)
  outItemId?: string;
  outItemCode?: string;
  outItemName: string;
  outUnit: string; // 'Coils' | 'Bobin'
  outQty: number;
  outColors: ColorBreakdown;
  outCoilEquivalent: number;
  remarks?: string;
}

export interface ColorExchangeChallan {
  id: string;
  exchangeNo: string; // EX-001
  date: string;
  partyName: string;
  partyAddress?: string;
  partyPhone?: string;
  branchId?: string; // Sales Center ID
  branchName?: string; // Sales Center Name
  exchangeType: 'color_only' | 'bobin_to_coils' | 'coils_to_bobin';
  lines: ColorExchangeLine[];
  totalInCoils: number;
  totalOutCoils: number;
  isBalanced: boolean; // L.H.S === R.H.S
  remarks?: string;
  savedAt: string;
  updatedAt?: string | number;
}

export interface StockReturnLine {
  id: string;
  itemId?: string;
  itemCode: string;
  itemName: string;
  sizeSpec?: string;
  unit: string;
  category?: string;
  quantity: number; // Returned quantity
  rate: number;
  amount: number;
  remarks?: string;
  colors?: ColorBreakdown;
}

export interface StockReturnChallan {
  id: string;
  returnType: ReturnType; // 'party_return' or 'factory_return'
  returnNo: string; // PR-001 or FR-001
  date: string;
  partyName?: string;
  challanNo?: string; // Ref Challan/Invoice No
  reqNo?: string; // Ref Requisition No
  carNumber?: string;
  driverName?: string;
  driverPhone?: string;
  remarks?: string;
  lines: StockReturnLine[];
  totalQuantity: number;
  totalAmount: number;
  discountPercent?: number;
  discountAmount?: number;
  subtotalAmount?: number;
  savedAt: string;
  branchId?: string;
  branchName?: string;
  salesmanCode?: string;
  salespersonName?: string;
  createdBy?: string;
  updatedAt?: string | number;
}

export interface ExpenseEntry {
  id: string;
  date: string; // YYYY-MM-DD
  entityType: 'center' | 'marketing'; // 'Madhupur Sales Center' or 'Marketing Person'
  entityName: string; // 'Madhupur Sales Center' or Salesperson Name
  expenseHead: string; // e.g., 'Bank Charge', 'Conveyance', 'Trade licence Fee', etc.
  amount: number;
  remarks?: string;
  monthRange?: string; // e.g. "01.01.25 to 31.01.25"
  area?: string; // e.g. "Tangail"
  branchId?: string;
  branchName?: string;
  createdBy?: string;
  // Party Cash Funding & Head Office Approval
  fundingPartyName?: string; // Specific party whose collected cash funded this expense
  isApproved?: boolean; // Whether approved at Head Office
  approvalStatus?: 'pending_incharge' | 'pending_admin' | 'approved' | 'rejected' | 'pending';
  approvedAt?: string;
  approvedBy?: string;
  inChargeApproved?: boolean;
  inChargeApprovedBy?: string;
  inChargeApprovedAt?: string;
  adminApproved?: boolean;
  adminApprovedBy?: string;
  adminApprovedAt?: string;
  hoDepositId?: string; // Auto-generated BankDeposit ID with Bank Tag 'H/O'
  createdById?: string;
  periodMonth?: string;
  assignedEntity?: string;
  areaName?: string;
  salesCenter?: string;
  staffName?: string;
  marketingPerson?: string;
  personName?: string;
  billingMonth?: string;
  updatedAt?: string | number;
}

export type DailyAllowanceType =
  | 'None'
  | 'Breakfast'
  | 'Lunch'
  | 'Dinner'
  | 'Breakfast & Lunch'
  | 'Lunch & Dinner'
  | 'Full Day';

export type ConveyanceStatus =
  | 'pending_incharge'
  | 'pending_admin'
  | 'approved'
  | 'rejected';

export interface ConveyanceJourneyLeg {
  id?: string;
  from: string;
  to: string;
  by: string;
  taka: number;
  ps?: string | number;
}

export interface ConveyanceEntry {
  id: string;
  voucherNo?: string; // Vr. No
  date: string; // YYYY-MM-DD
  salespersonId: string;
  salespersonName: string;
  salesmanCode?: string;
  branchId?: string;
  branchName?: string;
  fromLocation: string;
  toLocation: string;
  transportMode: string; // Bus, Rickshaw, CNG, Bike, Train, Leguna, etc.
  conveyanceAmount: number; // travel amount
  journeyRows?: ConveyanceJourneyLeg[]; // Multi-leg journeys for printed conveyance paper
  dailyAllowanceType: DailyAllowanceType;
  dailyAllowanceAmount: number; // daily allowance amount
  hasHotelBill?: boolean;
  hotelName?: string;
  hotelAmount?: number;
  hotelSlipUrl?: string; // image or file data URL
  hotelSlipName?: string;
  totalAmount: number; // conveyanceAmount + dailyAllowanceAmount + (hotelAmount || 0)
  remarks?: string;
  status: ConveyanceStatus;
  inChargeApprovedBy?: string;
  inChargeApprovedAt?: string;
  adminApprovedBy?: string;
  adminApprovedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  customFields?: Array<{ id: string; label: string; amount: number }>;
  createdAt?: string;
  updatedAt?: string | number;
}

export type ApprovedHubSubTab = 'sales_approved' | 'conveyance_approved' | 'expense_approved';

export interface DesignationAllowanceSetting {
  id: string;
  designation: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  meal1Day: number;
  hotelBill: number;
  description?: string;
}

export interface CollectionMR {
  id: string;
  date: string;
  mrNo: string; // Money Receipt #
  entityName: string;
  partyName?: string; // Party / Customer Name
  customerAddress?: string; // Customer / Party address
  salesCenter?: string;
  branchLocation?: string;
  salespersonName?: string;
  type?: string;
  paymentType?: 'cash' | 'cheque';
  bankName?: string;
  accountName?: string;
  chequeNo?: string;
  passDate?: string;
  amount: number;
  remarks?: string;
  isDeposited?: boolean;
  bankDepositId?: string;
  depositDate?: string;
  depositBankTag?: string;
  isMonthlyExpenseAdjusted?: boolean;
  isYearClosingCollection?: boolean;
  branchId?: string;
  branchName?: string;
  marketingPerson?: string;
  salesmanCode?: string;
  createdBy?: string;
  chequeToCash?: boolean;
  chequeToCashDate?: string;
  chequeToCashRemarks?: string;
  cashedCollectionId?: string;
  convertedFromChequeId?: string;
  savedAt?: string;
  collectedBy?: string;
  salesperson?: string;
  accountNumber?: string;
  voucherNo?: string;
  updatedAt?: string | number;
}

export interface BankDeposit {
  id: string;
  batchId?: string; // Links multiple parties deposited together in a single multi-party transaction
  date: string; // YYYY-MM-DD or dd.mm.yy
  depositDate?: string; // Explicit deposit date e.g., YYYY-MM-DD
  entityName: string; // Person/Account e.g., 'Sonjoy Chowhan' or 'Madhupur Sales Center'
  customerName?: string; // Customer who gave collection e.g., 'Sarker Electric'
  partyName?: string; // Optional alias for customerName
  voucherNo?: string; // Optional voucher/slip/MR number
  customerAddress?: string; // Address e.g., 'Bhuapur'
  marketingPerson?: string; // Marketing person e.g., 'Subrata Sutradar'
  collectionMrId?: string; // Optional linked Collection MR ID
  bankName: string; // e.g., 'Pubali Bank PLC'
  accountName: string; // e.g., 'Padma Enterprise'
  bankShortCode?: string; // e.g., 'PBL'
  accountShortCode?: string; // e.g., 'P.E'
  displayTag: string; // e.g., 'PBL (P.E)'
  amount: number;
  remarks?: string;
  slipImage?: string; // Base64 or image URL of deposit slip
  slipUrl?: string;
  slipFile?: string;
  slipName?: string;
  slipDate?: string;
  emailSent?: boolean; // True if email sent to head office
  isAutoDeposit?: boolean; // True if automatically generated month-end deposit to H/O
  isHoDeposit?: boolean; // True if Head Office deposit or party funded adjustment
  expenseId?: string; // Linked Expense voucher ID if generated from approved expense
  isExpenseHoDeposit?: boolean; // True if generated from approved branch expenses funded by party
  branchId?: string;
  branchName?: string;
  createdBy?: string;
  collections?: any[];
  salesmanCode?: string;
  accountNumber?: string;
  targetBankName?: string;
  accountShortTag?: string;
  depositBankTag?: string;
  depositType?: string;
  chequeNo?: string;
  status?: string;
  depositedBy?: string;
  referenceCode?: string;
  savedAt?: string | number;
  updatedAt?: string | number;
}

export interface ChallanLineItem {
  id: string;
  slNo: number;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemDescription: string;
  sizeSpec?: string;
  coilQty: number; // Delivered quantity
  billedQty?: number; // Quantity billed so far
  dueQty?: number; // coilQty - (billedQty || 0)
  unit: string; // Coils, Meter, etc.
  rate: number;
  amount: number;
  isSpecialItem?: boolean;
  baseItemId?: string;
  baseItemCode?: string;
  stockMultiplier?: number;
  colors?: ColorBreakdown;
}

export interface DeliveryChallan {
  id: string;
  challanNo: string;
  date: string; // dd.mm.yy or YYYY-MM-DD
  branchId?: string;
  branchName?: string;
  orderNumber?: string;
  orderDate?: string;
  refNo?: string;
  salesmanCode?: string;
  salespersonName?: string;
  partyName: string;
  address: string;
  phone?: string;
  lines: ChallanLineItem[];
  totalQuantity: number;
  billedQuantity?: number;
  dueQuantity?: number;
  totalAmount: number;
  discountPercent?: number;
  discountAmount?: number;
  netAmount?: number;
  advanceAmount?: number;
  dueBalance?: number;
  inWords?: string;
  billedAmount?: number;
  dueAmount?: number;
  status: 'unbilled' | 'partial' | 'billed';
  remarks?: string;
  savedAt: string;
  updatedAt?: string;
  linkedBillIds?: string[];
  receivedCopy?: string;
  receivedCopyName?: string;
  receivedCopyDate?: string;
  items?: any[];
  invoiceNo?: string;
  customerName?: string;
  deliveryAddress?: string;
  customerPhone?: string;
  vehicleNo?: string;
  driverName?: string;
  driverPhone?: string;
  totalPackages?: number;
  notes?: string;
}

export type ViewTab =
  | 'main_menu'
  | 'admin_sales_collection_report'
  | 'approved_menu'
  | 'builder'
  | 'challan_menu'
  | 'color_exchange'
  | 'requisition'
  | 'factory'
  | 'slip_pad_memo'
  | 'item_directory'
  | 'sales_report'
  | 'sales_items'
  | 'report_dashboard'
  | 'customer_ledger'
  | 'returns_menu'
  | 'expense_directory'
  | 'expense_entry'
  | 'collection_entry'
  | 'collection_list'
  | 'cash_in_hand'
  | 'cheque_in_hand'
  | 'deposit_history'
  | 'stored_bills'
  | 'party_directory'
  | 'salesperson_directory'
  | 'audit_directory'
  | 'trash_bin'
  | 'settings'
  | 'allowance_settings'
  | 'ai_sales_forecast'
  | 'admin_debug'
  | 'conveyance'
  | 'price_history';

export interface YearlyDiscountTierSetting {
  discountPercent: number; // e.g. 0 (Flat), 5, 10, 15
  billsCount: number;
  coils: number;
  grossSales: number; // Without invoice discount (gross amount before 10%)
  netSales: number; // Total after invoice discount (net amount after 10%)
  yearlyDiscountPercent: number; // Annual incentive % e.g. 2%, 3%
  yearlyDiscountBasis: 'net' | 'gross'; // Apply yearly discount on Net or Gross
  calculatedDiscount: number; // (netSales or grossSales) * (yearlyDiscountPercent / 100)
}

export interface SpecialDiscountItem {
  id: string;
  partyId?: string;
  partyName: string;
  amount: number;
  purpose: string; // e.g. "Target Clearance Incentive", "Annual Festival Rebate", "Payment Clearance Incentive"
  date: string;
  remarks?: string;
}

export interface CustomerClosingBalance {
  partyId: string;
  partyName: string;
  salespersonName?: string;
  openingBalance: number; // B/F at start of the fiscal year
  totalSales: number; // Total Sales Debit during period
  totalCollections: number; // Total Collections Credit during period
  yearlyDiscount: number; // Proportionate/Assigned yearly discount
  specialDiscount: number; // Special discounts for this customer
  netClosingBalance: number; // Final remaining due / balance carried forward
  newOpeningBalance: number; // Opening balance set for next financial year
}

export interface FinancialYearClosing {
  id: string;
  financialYear: string; // e.g. "FY 2024-2025" or "FY 2025"
  title: string;
  startDate: string; // Period start date (e.g. 01.01.2025 or YYYY-MM-DD)
  endDate: string; // Period closing date (e.g. 31.12.2025 or YYYY-MM-DD)
  closingTimestamp: string; // ISO string
  closedBy: string; // e.g. "suvroadmin" or Admin User
  status: 'closed' | 'reopened';
  
  // Specific Party details (for party-specific closing)
  partyId?: string;
  partyName?: string;
  closedBillIds?: string[];
  closedChallanIds?: string[];
  closedCollectionIds?: string[];
  
  // Calculation Breakdown
  balanceBeforeDiscounts?: number;
  yearlyDiscountBasis?: 'net' | 'gross' | string;
  yearlyDiscountPercent?: number;
  totalYearlyDiscount: number;
  balanceAfterYearlyDiscount?: number;
  totalSpecialDiscount: number;
  netPayAmount?: number;
  settlementCollectionAmount?: number;
  remainingDue?: number;
  settlementCollection?: {
    date: string;
    amount: number;
    bankName: string;
    mrNo: string;
    remarks: string;
  };
  
  // Discount Tiers
  discountTiers: YearlyDiscountTierSetting[];
  totalGrossSales: number;
  totalNetSales: number;
  
  // Special Discounts
  specialDiscounts: SpecialDiscountItem[];
  
  // Overall Financials
  totalBills: number;
  totalCoils: number;
  totalOpeningBalance: number;
  totalCollections: number;
  totalNetClosingBalance: number;
  
  // Customer Balances
  customerBalances: CustomerClosingBalance[];
  notes?: string;
}

export interface BackupDataPackage {
  version: string;
  backupDate: string;
  backupType?: string;
  appTitle?: string;
  appName?: string;
  exportedAt?: string;
  stats?: {
    totalStoredBills: number;
    totalDeliveryChallans?: number;
    totalMasterItems: number;
    totalParties: number;
    totalSalespersons: number;
    totalFactoryImports: number;
    totalStockReturns: number;
    totalExpenses: number;
    totalCollections: number;
    totalBankDeposits: number;
    totalRequisitions?: number;
    totalBranches?: number;
    totalCollectionAmount: number;
    totalExpenseAmount: number;
    totalDepositAmount: number;
    totalSalesAmount: number;
  };
  selectedModules?: RestoreModuleSelection;
  data: {
    items?: Item[];
    specialItems?: any[];
    parties?: Party[];
    salespersons?: Salesperson[];
    storedBills?: StoredBill[];
    deliveryChallans?: DeliveryChallan[];
    factoryImports?: FactoryImportChallan[];
    stockReturns?: StockReturnChallan[];
    colorExchanges?: ColorExchangeChallan[];
    expenses?: ExpenseEntry[];
    collections?: CollectionMR[];
    cashInHand?: any[];
    chequeInHand?: any[];
    bankDeposits?: BankDeposit[];
    requisitions?: Requisition[];
    branches?: BranchLocation[];
    company?: CompanyDetails;
    header?: BillHeader;
    priceHistory?: any[];
    trashedItems?: Item[];
    trashedParties?: Party[];
    trashedCollections?: CollectionMR[];
    trashedChallans?: DeliveryChallan[];
    trashedBills?: StoredBill[];
    trashed?: any;
    orderedCategories?: string[];
    customCategories?: string[];
    bankList?: string[];
    accountList?: string[];
    deletedAutoDeposits?: string[];
    closings?: FinancialYearClosing[];
    conveyances?: ConveyanceEntry[];
    adminPassword?: string;
    expenseCategories?: any[];
    yearlyTargets?: Record<string, any>;
  };
}

export interface RestoreModuleSelection {
  storedBills?: boolean; // Invoices
  deliveryChallans?: boolean; // Challan
  requisitions?: boolean; // Requisition
  colorExchanges?: boolean; // Colour Exchange
  stockReturns?: boolean; // Returns
  collections?: boolean; // Collection List
  collectionList?: boolean;
  cashInHand?: boolean; // Cash In Hand
  chequeInHand?: boolean; // Cheque In Hand
  depositHistory?: boolean; // Deposit History
  bankDeposits?: boolean;
  items?: boolean; // Items
  specialItems?: boolean; // Special Item
  categories?: boolean; // Categories
  orderedCategories?: boolean;
  priceHistory?: boolean; // Price Update History
  factoryImports?: boolean; // Import from Factory List
  parties?: boolean; // Customers with Statement
  salespersons?: boolean; // Sales Reps
  branches?: boolean; // Sales Center List
  expenses?: boolean; // Expenses
  monthlyExpense?: boolean;
  expenseEntryLog?: boolean;
  conveyances?: boolean; // Conveyance
  bankList?: boolean; // Banks
  accountList?: boolean; // Accounts Name
  banksAndAccounts?: boolean;
  trashed?: boolean; // Trashed
  settings?: boolean;
}

// Poly Packaging & Delivery Challan Types
export interface CatalogItem {
  id: string;
  name: string;
  category: 'HDPE' | 'LDPE' | 'BOPP' | 'PP' | 'Biodegradable' | 'Stretch & Shrink' | string;
  specifications: string;
  unit: 'Kg' | 'Pcs' | 'Rolls' | 'Bags' | string;
  unitPrice: number;
  taxRate: number;
  stockAvailable: number;
  description?: string;
  sizeSpec?: string;
  code?: string;
}

export interface ChallanItem {
  id: string;
  itemId?: string;
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
  clientContact?: string;
  clientGstOrTaxId?: string;
  deliveryAddress: string;
  vehicleNo?: string;
  driverName?: string;
  purchaseOrderNo?: string;
  notes?: string;
  items: ChallanItem[];
  status: 'Pending' | 'Partially Billed' | 'Fully Billed';
  isLocked: boolean;
  billingHistory: LinkedBillingRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id?: string;
  name: string;
  itemName?: string;
  itemCode?: string;
  isSpecialItem?: boolean;
  specifications: string;
  specification?: string;
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
  challanId?: string;
  challanNo?: string;
  clientName: string;
  clientContact?: string;
  clientGstOrTaxId?: string;
  billingAddress: string;
  items: InvoiceLineItem[];
  subtotal: number;
  subTotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  paidAmount?: number;
  dueAmount?: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  paymentStatus: 'Pending' | 'Paid' | 'Partial' | 'Overdue';
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Credit' | 'UPI';
  notes?: string;
  createdAt: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerGstOrVat?: string;
  challanReference?: string;
  status?: string;
}

export interface SlipPadSettings {
  showCompanyLogo: boolean;
  companyTitle: string;
  companySubtitle: string;
  companyAddress: string;
  companyPhone: string;
  customHeaderNote?: string;
  copyType?: string;
  fontSizeScale: 'compact' | 'standard' | 'normal' | 'large';
  paperPreset?: string;
  paperSize?: string;
  orientation?: 'portrait' | 'landscape';
  marginsMm?: number;
  topOffsetInch?: number;
  leftOffsetInch?: number;
  rowHeightPx?: number;
  totalRows?: number;
  showTableHeader?: boolean;
  showBankDetails?: boolean;
  bankInfo?: string;
  showBorder?: boolean;
  showSignatureSection?: boolean;
  customerSignatureLabel?: string;
  authorizedSignatoryLabel?: string;
  footerTerms?: string;
}

export interface SpecialItem {
  id: string;
  code: string;
  name: string;
  specification?: string;
  unit: string;
  rate: number;
  baseItemId?: string;
  baseItemCode?: string;
  stockMultiplier?: number;
  parentItemName?: string;
  isActive?: boolean;
  category?: string;
}

export interface CashTransaction {
  id: string;
  voucherNo: string;
  date: string;
  time?: string;
  type: 'IN' | 'OUT';
  category: string;
  amount: number;
  description: string;
  recipientOrPayer: string;
  balanceAfter: number;
  referenceNo?: string;
}

export interface Category {
  id: string;
  name: string;
  code: string;
  description: string;
  itemCount: number;
  colorTag: string;
}

export interface ChequeRecord {
  id: string;
  chequeNo: string;
  bankName: string;
  depositBank?: string;
  branch: string;
  issueDate: string;
  maturityDate: string;
  amount: number;
  payerName: string;
  payeeName: string;
  status: 'In Hand' | 'Deposited' | 'Cleared' | 'Bounced' | 'Cancelled';
  notes?: string;
}

export interface DepositRecord {
  id: string;
  slipNo: string;
  date: string;
  bankName: string;
  accountNumber: string;
  accountTitle: string;
  depositType: 'Cash Deposit' | 'Cheque Deposit' | 'Online Transfer';
  amount: number;
  referenceCode: string;
  depositedBy: string;
  status: 'Pending' | 'Confirmed' | 'Reconciled';
  notes?: string;
}

export interface ExpenseRecord {
  id: string;
  expenseNo: string;
  date: string;
  category: string;
  amount: number;
  paymentMode: 'Cash' | 'Cheque' | 'Bank Transfer' | 'Card';
  paidTo: string;
  referenceReceiptNo?: string;
  authorizedBy: string;
  description: string;
  taxDeducted?: number;
}

export interface ReturnLineItem {
  id: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  isSpecialItem?: boolean;
  mainItemName?: string;
  specification?: string;
  returnQty: number;
  unit: string;
  rate: number;
  totalRefund: number;
  condition: 'Good' | 'Defective / Scrapped' | 'Damaged Packaging';
  reason: string;
}

export interface ReturnEntry {
  id: string;
  returnNo: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  invoiceReference?: string;
  items: ReturnLineItem[];
  totalRefundAmount: number;
  actionTaken: 'Credit Note' | 'Stock Restock' | 'Cash Refund' | 'Scrap';
  status?: string;
  notes?: string;
  processedBy: string;
}

export type ItemType = 'text' | 'link' | 'code' | 'todo' | 'contact' | 'note';

export type FilterCategory = 'all' | 'pinned' | 'links' | 'code' | 'todos' | 'notes';

export interface QuickSaveItem {
  id: string;
  title: string;
  content: string;
  type: ItemType;
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  completed?: boolean;
  aiSummary?: string;
  isArchived?: boolean;
}

export interface MonthEndExpenseSettlement {
  monthStr: string;
  monthDisplay: string;
  totalExpenseAmount: number;
  depositDate: string;
  parties: Array<{
    partyName: string;
    partyAddress?: string;
    amount: number;
  }>;
  closedAt: string;
  status: 'closed' | 'open';
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface SnippetHistoryItem {
  id: string;
  timestamp: number;
  code: string;
  note?: string;
}

export interface Snippet {
  id: string;
  title: string;
  description?: string;
  language: string;
  tags: string[];
  folderId?: string;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
  code: string;
  history?: SnippetHistoryItem[];
}

export interface LanguageMeta {
  id: string;
  label: string;
  extension: string;
  prismGrammar: string;
  canExecute?: boolean;
  samplePlaceholder?: string;
}

export type SupportedLanguage = string;
export type EditorTheme = 'dark' | 'light' | 'dracula' | 'github' | 'monokai' | string;

export type AppTheme =
  | 'cyber_teal'
  | 'glassy_neon'
  | 'midnight_slate'
  | 'ocean_navy'
  | 'emerald_dark'
  | 'classic_dark_slate';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  isPrimary?: boolean;
  createdAt: number;
  focusMinutesSpent?: number;
}

export type TimerPreset = number;
export type AmbientSound = 'none' | 'rain' | 'brown-noise' | 'binaural' | 'stream';

export interface ConveyanceMovementRow {
  id: string;
  from: string;
  to: string;
  by: string;
  reason: string;
  amount: number;
}

export interface DailyAllowanceBreakdown {
  breakfast: number;
  lunch: number;
  dinner: number;
  hasHotel?: boolean;
  hotelName?: string;
  hotelReceiptNo?: string;
  hotelBill?: number;
  totalAllowance: number;
}

export interface DailyConveyanceBill {
  id: string;
  billNo: string;
  date: string;
  userId?: string;
  userName: string;
  userCode?: string;
  userRole?: string;
  branchId?: string;
  branchName?: string;
  movements: ConveyanceMovementRow[];
  totalMovementsAmount: number;
  allowance: DailyAllowanceBreakdown;
  grandTotal: number;
  status: 'pending_approval' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  approvalComments?: string;
  rejectedReason?: string;
  createdAt: string;
  remarks?: string;
}
