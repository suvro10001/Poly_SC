import React, { useState, useMemo, useEffect } from 'react';
import { DateInputWithPicker } from './DateInputWithPicker';
import {
  DailyConveyanceBill,
  ConveyanceMovementRow,
  DailyAllowanceBreakdown,
  Salesperson,
  BranchLocation,
  AuthUser,
  ExpenseEntry
} from '../types';
import {
  Truck,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Building2,
  DollarSign,
  FileText,
  Eye,
  Check,
  X,
  Printer,
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Utensils,
  Moon,
  Hotel,
  MapPin,
  ArrowRight,
  Sparkles,
  Layers
} from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { isAnyAdmin, isInCharge, isStrictSuperAdmin, getUserBranch } from '../utils/branchAccess';
import * as XLSX from 'xlsx';

interface DailyConveyanceManagerProps {
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  salespersons: Salesperson[];
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

const DEFAULT_TRANSPORT_MODES = [
  'Rickshaw',
  'Auto',
  'Easy Bike',
  'Bus',
  'CNG',
  'Motorcycle',
  'Bike',
  'Train',
  'Walking',
  'On Foot',
  'Other'
];

const COMMON_REASONS = [
  'Customer Visit & Orders',
  'Payment Collection',
  'Bill & Challan Delivery',
  'Sample & Catalog Show',
  'Site Verification',
  'Official Bank / Post Work',
  'Market Survey'
];

const DEFAULT_ORIGINS = [
  'Showroom',
  'Madhupur',
  'Tangail',
  'Dhanbari',
  'Bhuapur',
  'Ghatail',
  'Elenga',
  'Gopalpur',
  'Office'
];

export const DailyConveyanceManager: React.FC<DailyConveyanceManagerProps> = ({
  expenses,
  setExpenses,
  salespersons,
  branches = [],
  currentUser,
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [subView, setSubView] = useState<'entry' | 'monthly_list'>('entry');
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showNotify = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const isUserApprover = useMemo(() => {
    if (!currentUser) return true;
    return isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser) || isInCharge(currentUser, salespersons);
  }, [currentUser, salespersons]);

  // Load persistent conveyance bills from localStorage
  const [conveyanceBills, setConveyanceBills] = useState<DailyConveyanceBill[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_daily_conveyance');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    // Seed realistic default conveyance records for the current month
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');

    return [
      {
        id: 'conv-demo-1',
        billNo: 'CONV-101',
        date: `${curYear}-${curMonth}-05`,
        userName: 'Subrata Sutradhar',
        userCode: '134',
        userRole: 'Showroom In-Charge',
        branchId: 'branch-1',
        branchName: 'Madhupur Sales Center',
        movements: [
          { id: 'mov-1', from: 'Showroom', to: 'Madhupur Bazar', by: 'Rickshaw', reason: 'Customer Visit & Orders', amount: 40 },
          { id: 'mov-2', from: 'Madhupur Bazar', to: 'Dhanbari', by: 'Bus', reason: 'Payment Collection from Alif Ent.', amount: 50 },
          { id: 'mov-3', from: 'Dhanbari', to: 'Showroom', by: 'Bus', reason: 'Return to Showroom', amount: 50 }
        ],
        totalMovementsAmount: 140,
        allowance: {
          breakfast: 50,
          lunch: 150,
          dinner: 0,
          totalAllowance: 200
        },
        grandTotal: 340,
        status: 'approved',
        approvedBy: 'Suvro Admin',
        approvedAt: `${curYear}-${curMonth}-06T10:00:00.000Z`,
        createdAt: `${curYear}-${curMonth}-05T18:00:00.000Z`
      },
      {
        id: 'conv-demo-2',
        billNo: 'CONV-102',
        date: `${curYear}-${curMonth}-12`,
        userName: 'Kabir Hossain',
        userCode: 'S01',
        userRole: 'Marketing Officer',
        branchId: 'branch-1',
        branchName: 'Madhupur Sales Center',
        movements: [
          { id: 'mov-4', from: 'Madhupur', to: 'Tangail Sadar', by: 'Bus', reason: 'Payment Collection at Cable House', amount: 80 },
          { id: 'mov-5', from: 'Tangail Sadar', to: 'Partho Electric', by: 'Auto / Easy Bike', reason: 'Order follow-up', amount: 30 },
          { id: 'mov-6', from: 'Tangail Sadar', to: 'Madhupur', by: 'Bus', reason: 'Return to base', amount: 80 }
        ],
        totalMovementsAmount: 190,
        allowance: {
          breakfast: 60,
          lunch: 180,
          dinner: 0,
          totalAllowance: 240
        },
        grandTotal: 430,
        status: 'approved',
        approvedBy: 'Subrata Sutradhar (In-Charge)',
        approvedAt: `${curYear}-${curMonth}-13T09:30:00.000Z`,
        createdAt: `${curYear}-${curMonth}-12T19:00:00.000Z`
      },
      {
        id: 'conv-demo-3',
        billNo: 'CONV-103',
        date: `${curYear}-${curMonth}-18`,
        userName: 'Sanjoy Chowhan',
        userCode: '149',
        userRole: 'Marketing Officer',
        branchId: 'branch-1',
        branchName: 'Madhupur Sales Center',
        movements: [
          { id: 'mov-7', from: 'Madhupur', to: 'Ghatail Bazar', by: 'CNG', reason: 'Customer shop visit (Sattar Electric)', amount: 100 },
          { id: 'mov-8', from: 'Ghatail', to: 'Bhuapur', by: 'Auto / Easy Bike', reason: 'New Sonchita Enterprise Delivery', amount: 70 },
          { id: 'mov-9', from: 'Bhuapur', to: 'Madhupur', by: 'CNG', reason: 'Return to center', amount: 120 }
        ],
        totalMovementsAmount: 290,
        allowance: {
          breakfast: 50,
          lunch: 160,
          dinner: 140,
          hasHotel: false,
          totalAllowance: 350
        },
        grandTotal: 640,
        status: 'pending_approval',
        createdAt: `${curYear}-${curMonth}-18T20:00:00.000Z`
      }
    ];
  });

  // Save changes to localStorage & trigger sync
  const saveConveyanceBills = (updated: DailyConveyanceBill[]) => {
    setConveyanceBills(updated);
    try {
      localStorage.setItem('polycables_daily_conveyance', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) {
      onSyncCloud({ dailyConveyance: updated }, true);
    }
  };

  // --- FORM STATE ---
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedUser, setSelectedUser] = useState<string>(() => {
    if (currentUser?.name) {
      const match = salespersons.find(
        (s) => s.name.toLowerCase() === currentUser.name?.toLowerCase() || s.code === currentUser.salespersonCode
      );
      if (match) return match.name;
    }
    return salespersons[0]?.name || 'Subrata Sutradhar';
  });

  const isAdminOrSuper = isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser);

  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (isAdminOrSuper) return 'All';
    const userBr = getUserBranch(currentUser, salespersons, branches);
    return (userBr.branchId && userBr.branchId !== 'all' && userBr.branchName) || branches[0]?.name || 'Madhupur Sales Center';
  });

  useEffect(() => {
    if (isAdminOrSuper) {
      setSelectedBranch('All');
    } else {
      const userBr = getUserBranch(currentUser, salespersons, branches);
      if (userBr.branchId && userBr.branchId !== 'all' && userBr.branchName) {
        setSelectedBranch(userBr.branchName);
      } else if (branches.length > 0 && !branches.some((b) => b.name === selectedBranch)) {
        setSelectedBranch(branches[0].name);
      }
    }
    if (currentUser?.name) {
      const match = salespersons.find(
        (s) => s.name.toLowerCase() === currentUser.name?.toLowerCase() || s.code === currentUser.salespersonCode
      );
      if (match) setSelectedUser(match.name);
    }
  }, [currentUser, salespersons, branches, isAdminOrSuper]);

  const [movements, setMovements] = useState<ConveyanceMovementRow[]>([
    {
      id: `mov-${Date.now()}-1`,
      from: 'Showroom',
      to: '',
      by: 'Rickshaw',
      reason: 'Customer Visit & Orders',
      amount: 0
    }
  ]);

  // Daily Allowance inputs
  const [breakfast, setBreakfast] = useState<string>('0');
  const [lunch, setLunch] = useState<string>('0');
  const [dinner, setDinner] = useState<string>('0');
  const [hasHotel, setHasHotel] = useState<boolean>(false);
  const [hotelName, setHotelName] = useState<string>('');
  const [hotelReceiptNo, setHotelReceiptNo] = useState<string>('');
  const [hotelBill, setHotelBill] = useState<string>('0');
  const [formRemarks, setFormRemarks] = useState<string>('');

  // Calculations
  const totalMovements = useMemo(() => {
    return movements.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  }, [movements]);

  const totalAllowance = useMemo(() => {
    const b = Number(breakfast) || 0;
    const l = Number(lunch) || 0;
    const d = Number(dinner) || 0;
    const h = hasHotel ? (Number(hotelBill) || 0) : 0;
    return b + l + d + h;
  }, [breakfast, lunch, dinner, hasHotel, hotelBill]);

  const grandTotal = totalMovements + totalAllowance;

  // Form row handlers
  const handleAddMovementRow = () => {
    const lastRow = movements[movements.length - 1];
    const newFrom = lastRow?.to ? lastRow.to : 'Showroom';
    setMovements((prev) => [
      ...prev,
      {
        id: `mov-${Date.now()}-${prev.length + 1}`,
        from: newFrom,
        to: '',
        by: 'Auto / Easy Bike',
        reason: 'Payment Collection',
        amount: 0
      }
    ]);
  };

  const handleUpdateMovementRow = (idx: number, field: keyof ConveyanceMovementRow, value: any) => {
    setMovements((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleRemoveMovementRow = (idx: number) => {
    if (movements.length <= 1) return;
    setMovements((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleResetForm = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setMovements([
      {
        id: `mov-${Date.now()}-1`,
        from: 'Showroom',
        to: '',
        by: 'Rickshaw',
        reason: 'Customer Visit & Orders',
        amount: 0
      }
    ]);
    setBreakfast('0');
    setLunch('0');
    setDinner('0');
    setHasHotel(false);
    setHotelName('');
    setHotelReceiptNo('');
    setHotelBill('0');
    setFormRemarks('');
  };

  // Submit Handler
  const handleSubmitBill = (autoApprove: boolean = false) => {
    if (grandTotal <= 0) {
      showNotify('Please enter movement travel fares or allowance amounts greater than 0.', 'error');
      return;
    }

    const matchedSp = salespersons.find((s) => s.name === selectedUser);
    const matchedBr =
      selectedBranch === 'All'
        ? (branches.find((b) => b.id === matchedSp?.branchId || b.name === matchedSp?.branchName) || branches[0])
        : (branches.find((b) => b.name === selectedBranch) || branches[0]);

    const billNumber = `CONV-${Date.now().toString().slice(-4)}`;
    const billId = `conv-${Date.now()}`;

    const newBill: DailyConveyanceBill = {
      id: billId,
      billNo: billNumber,
      date: entryDate,
      userId: matchedSp?.id,
      userName: selectedUser,
      userCode: matchedSp?.code,
      userRole: matchedSp?.designation || matchedSp?.role || 'Marketing Officer',
      branchId: matchedBr?.id,
      branchName: selectedBranch,
      movements: movements.filter((m) => m.from || m.to || m.amount > 0),
      totalMovementsAmount: totalMovements,
      allowance: {
        breakfast: Number(breakfast) || 0,
        lunch: Number(lunch) || 0,
        dinner: Number(dinner) || 0,
        hasHotel,
        hotelName: hasHotel ? hotelName.trim() : undefined,
        hotelReceiptNo: hasHotel ? hotelReceiptNo.trim() : undefined,
        hotelBill: hasHotel ? (Number(hotelBill) || 0) : 0,
        totalAllowance
      },
      grandTotal,
      status: autoApprove ? 'approved' : 'pending_approval',
      approvedBy: autoApprove ? (currentUser?.name || 'In-Charge') : undefined,
      approvedAt: autoApprove ? new Date().toISOString() : undefined,
      remarks: formRemarks.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const updated = [newBill, ...conveyanceBills];
    saveConveyanceBills(updated);

    // If auto-approved, integrate directly into the master Expense entries as an approved Conveyance voucher
    if (autoApprove) {
      const newExpenseEntry: ExpenseEntry = {
        id: `exp-conv-${Date.now()}`,
        date: entryDate,
        entityType: 'marketing',
        entityName: selectedUser,
        expenseHead: 'Conveyance',
        amount: grandTotal,
        remarks: `Daily Conveyance & Allowance (#${billNumber}) [Approved]`,
        branchId: matchedBr?.id,
        branchName: selectedBranch,
        isApproved: true,
        approvalStatus: 'approved',
        approvedBy: currentUser?.name || 'In-Charge',
        approvedAt: new Date().toISOString()
      };
      setExpenses((prev) => [newExpenseEntry, ...prev]);
      if (onSyncCloud) {
        onSyncCloud({ expenses: [newExpenseEntry, ...expenses] }, true);
      }
    }

    showNotify(
      autoApprove
        ? `Daily Conveyance Bill #${billNumber} saved and approved successfully!`
        : `Daily Conveyance Bill #${billNumber} submitted for approval!`
    );

    handleResetForm();
    setSubView('monthly_list');
  };

  // --- MONTHLY LIST & APPROVAL STATE ---
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed

  const monthLabel = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedYear, selectedMonth]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // Filtered Conveyance Bills
  const filteredBills = useMemo(() => {
    return conveyanceBills.filter((bill) => {
      // Month check
      const billDate = new Date(bill.date);
      if (!isNaN(billDate.getTime())) {
        if (billDate.getFullYear() !== selectedYear || billDate.getMonth() !== selectedMonth) {
          return false;
        }
      }

      // User filter
      if (filterUser !== 'all' && bill.userName !== filterUser) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'all' && bill.status !== filterStatus) {
        return false;
      }

      return true;
    });
  }, [conveyanceBills, selectedYear, selectedMonth, filterUser, filterStatus]);

  // Monthly KPI Totals
  const monthlyMetrics = useMemo(() => {
    const totalBills = filteredBills.length;
    const totalTravel = filteredBills.reduce((s, b) => s + (b.totalMovementsAmount || 0), 0);
    const totalFood = filteredBills.reduce(
      (s, b) => s + (Number(b.allowance.breakfast) || 0) + (Number(b.allowance.lunch) || 0) + (Number(b.allowance.dinner) || 0),
      0
    );
    const totalHotel = filteredBills.reduce((s, b) => s + (Number(b.allowance.hotelBill) || 0), 0);
    const grandMonthlyTotal = filteredBills.reduce((s, b) => s + (b.grandTotal || 0), 0);

    const approvedTotal = filteredBills
      .filter((b) => b.status === 'approved')
      .reduce((s, b) => s + (b.grandTotal || 0), 0);

    const pendingTotal = filteredBills
      .filter((b) => b.status === 'pending_approval')
      .reduce((s, b) => s + (b.grandTotal || 0), 0);

    return {
      totalBills,
      totalTravel,
      totalFood,
      totalHotel,
      grandMonthlyTotal,
      approvedTotal,
      pendingTotal
    };
  }, [filteredBills]);

  // User-wise summary breakdown for the active month
  const userWiseBreakdown = useMemo(() => {
    const map = new Map<string, { user: string; count: number; travel: number; allowance: number; total: number; approved: number; pending: number }>();

    filteredBills.forEach((b) => {
      const u = b.userName;
      const prev = map.get(u) || { user: u, count: 0, travel: 0, allowance: 0, total: 0, approved: 0, pending: 0 };
      prev.count += 1;
      prev.travel += b.totalMovementsAmount || 0;
      prev.allowance += b.allowance.totalAllowance || 0;
      prev.total += b.grandTotal || 0;
      if (b.status === 'approved') prev.approved += b.grandTotal;
      if (b.status === 'pending_approval') prev.pending += b.grandTotal;
      map.set(u, prev);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredBills]);

  // Approval Actions
  const handleApproveBill = (bill: DailyConveyanceBill) => {
    const updated = conveyanceBills.map((b) => {
      if (b.id === bill.id) {
        return {
          ...b,
          status: 'approved' as const,
          approvedBy: currentUser?.name || 'In-Charge / Admin',
          approvedAt: new Date().toISOString()
        };
      }
      return b;
    });

    saveConveyanceBills(updated);

    // Sync to master Expenses
    const newExpenseEntry: ExpenseEntry = {
      id: `exp-conv-${bill.id}`,
      date: bill.date,
      entityType: 'marketing',
      entityName: bill.userName,
      expenseHead: 'Conveyance',
      amount: bill.grandTotal,
      remarks: `Daily Conveyance & Allowance (#${bill.billNo || 'CONV'}) [Approved]`,
      branchId: bill.branchId,
      branchName: bill.branchName,
      isApproved: true,
      approvalStatus: 'approved',
      approvedBy: currentUser?.name || 'In-Charge',
      approvedAt: new Date().toISOString()
    };

    setExpenses((prev) => [newExpenseEntry, ...prev.filter((e) => e.id !== `exp-conv-${bill.id}`)]);
    if (onSyncCloud) {
      onSyncCloud({ expenses: [newExpenseEntry, ...expenses] }, true);
    }

    showNotify(`Conveyance bill #${bill.billNo || bill.id} Approved successfully! Added to Monthly Expenses.`);
  };

  const handleRejectBill = (bill: DailyConveyanceBill) => {
    const reason = window.prompt('Please enter a rejection reason (optional):', 'Fare discrepancy or unauthorized stay');
    if (reason === null) return;

    const updated = conveyanceBills.map((b) => {
      if (b.id === bill.id) {
        return {
          ...b,
          status: 'rejected' as const,
          approvalComments: reason || 'Rejected by In-Charge',
          approvedBy: currentUser?.name || 'In-Charge / Admin',
          approvedAt: new Date().toISOString()
        };
      }
      return b;
    });

    saveConveyanceBills(updated);

    // Remove from expenses if previously synced
    setExpenses((prev) => prev.filter((e) => e.id !== `exp-conv-${bill.id}`));
    showNotify(`Conveyance bill #${bill.billNo || bill.id} has been Rejected.`, 'info');
  };

  const handleDeleteBill = (billId: string) => {
    if (!window.confirm('Are you sure you want to delete this Daily Conveyance entry?')) return;
    const updated = conveyanceBills.filter((b) => b.id !== billId);
    saveConveyanceBills(updated);
    setExpenses((prev) => prev.filter((e) => e.id !== `exp-conv-${billId}`));
    showNotify('Conveyance entry deleted.', 'info');
  };

  // Modal View
  const [viewingBill, setViewingBill] = useState<DailyConveyanceBill | null>(null);

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const rows = filteredBills.map((b, idx) => ({
        'SL': idx + 1,
        'Bill #': b.billNo || '-',
        'Date': formatDateDDMMYY(b.date),
        'User / Marketing': b.userName,
        'Sales Center': b.branchName || '-',
        'Movements Count': b.movements.length,
        'Movements Routes': b.movements.map((m) => `${m.from} -> ${m.to} (${m.by})`).join('; '),
        'Travel Fare (৳)': b.totalMovementsAmount,
        'Breakfast (৳)': b.allowance.breakfast || 0,
        'Lunch (৳)': b.allowance.lunch || 0,
        'Dinner (৳)': b.allowance.dinner || 0,
        'Hotel Bill (৳)': b.allowance.hotelBill || 0,
        'Hotel Name': b.allowance.hotelName || '-',
        'Total Allowance (৳)': b.allowance.totalAllowance,
        'Grand Total (৳)': b.grandTotal,
        'Status': b.status.toUpperCase(),
        'Approved By': b.approvedBy || '-',
        'Remarks': b.remarks || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Conveyance');
      XLSX.writeFile(wb, `Daily_Conveyance_${selectedYear}_${selectedMonth + 1}.xlsx`);
      showNotify('Conveyance Excel Report exported successfully!');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 font-sans p-3 sm:p-5 space-y-4">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 font-bold text-xs animate-in slide-in-from-top duration-200 border ${
            notification.type === 'error'
              ? 'bg-rose-600 text-white border-rose-400'
              : notification.type === 'info'
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-emerald-600 text-white border-emerald-400'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-200" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-xl flex items-center justify-center shadow-lg border border-emerald-400/30">
            <Truck className="w-6 h-6 text-slate-950 font-black" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">Daily Conveyance & Allowance</h1>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Field Movement Bill
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Daily travel fare (From ➔ To, Mode, Purpose), Daily Fooding & Hotel Allowance, and In-Charge Approval
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">View:</span>
          <select
            value={subView}
            onChange={(e) => setSubView(e.target.value as any)}
            className="bg-slate-950 text-emerald-300 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="entry">New Conveyance Entry</option>
            <option value="monthly_list">Monthly Register &amp; Approvals ({conveyanceBills.length})</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. NEW DAILY CONVEYANCE ENTRY FORM                                       */}
      {/* ========================================================================= */}
      {subView === 'entry' && (
        <div className="bg-white text-slate-900 border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 max-w-5xl mx-auto font-sans">
          {/* Header matching physical slip pad */}
          <div className="text-center relative pb-3 border-b border-slate-300">
            <div className="inline-block border border-slate-700 rounded-full px-6 py-0.5 text-xs font-bold tracking-widest text-slate-800 uppercase mb-2">
              CONVEYANCE BILL
            </div>

            <div className="flex items-center justify-center space-x-2">
              <span className="text-3xl font-black tracking-tight text-blue-950 font-sans">POLY CABLES</span>
            </div>
            <div className="text-xs font-bold tracking-widest text-slate-600 uppercase">
              Connect &amp; Protect
            </div>

            <div className="text-xs font-mono text-slate-700 mt-2 font-bold">
              Bill Date: {formatDateDDMMYY(entryDate)}
            </div>
          </div>

          {/* Header Metadata Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Date (dd.mm.yy) *</label>
              <DateInputWithPicker
                value={entryDate}
                onChange={setEntryDate}
                valueFormat="iso"
                theme="light"
                required
                inputClassName="!bg-slate-50 !rounded-xl px-3 py-2 text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Marketing / Field User *</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:ring-2 focus:ring-blue-900 focus:outline-none cursor-pointer"
              >
                {salespersons.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} ({s.code || 'Staff'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Assigned Sales Center *</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:ring-2 focus:ring-blue-900 focus:outline-none cursor-pointer"
              >
                {isAdminOrSuper && (
                  <option value="All">All Sales Centers</option>
                )}
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Datalist helpers for fast entry */}
          <datalist id="dl-origins">
            {DEFAULT_ORIGINS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <datalist id="dl-reasons">
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>

          {/* Movements (Travel Routes) Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-amber-400 flex items-center space-x-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>1. Travel & Conveyance Movements (From ➔ To)</span>
              </h3>
              <button
                type="button"
                onClick={handleAddMovementRow}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Movement Route</span>
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5">From (Origin) *</th>
                    <th className="p-2.5">To (Destination) *</th>
                    <th className="p-2.5 w-40">By (Transport Mode) *</th>
                    <th className="p-2.5">Reason / Purpose *</th>
                    <th className="p-2.5 w-28 text-right">Fare (৳) *</th>
                    <th className="p-2.5 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {movements.map((mov, idx) => (
                    <tr key={mov.id} className="hover:bg-slate-900/40">
                      <td className="p-2 text-center text-slate-500 font-mono font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          list="dl-origins"
                          value={mov.from}
                          onChange={(e) => handleUpdateMovementRow(idx, 'from', e.target.value)}
                          placeholder="e.g. Showroom"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={mov.to}
                          onChange={(e) => handleUpdateMovementRow(idx, 'to', e.target.value)}
                          placeholder="e.g. Dhanbari Bazar"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={mov.by}
                          onChange={(e) => handleUpdateMovementRow(idx, 'by', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                        >
                          {mov.by && !DEFAULT_TRANSPORT_MODES.includes(mov.by) && (
                            <option value={mov.by}>{mov.by}</option>
                          )}
                          {DEFAULT_TRANSPORT_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          list="dl-reasons"
                          value={mov.reason}
                          onChange={(e) => handleUpdateMovementRow(idx, 'reason', e.target.value)}
                          placeholder="e.g. Party Visit & Collection"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          value={mov.amount === 0 ? '' : mov.amount}
                          onChange={(e) => handleUpdateMovementRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-400 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveMovementRow(idx)}
                          disabled={movements.length <= 1}
                          className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                          title="Remove movement row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-xs font-bold border-t border-slate-800 text-slate-300">
                    <td colSpan={5} className="p-2.5 text-right font-extrabold uppercase text-[11px] text-slate-400">
                      Subtotal Travel Fare:
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-amber-400 text-sm">
                      ৳{totalMovements.toLocaleString('en-IN')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Daily Allowance Section (Breakfast, Lunch, Dinner, Hotel Bill) */}
          {/* Daily Allowance Section (Breakfast, Lunch, Dinner, Hotel Bill) - Left side label, Right side Fare amount */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-sky-400 flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-sky-400" />
                <span>2. Daily Allowance & Fooding (Breakfast, Lunch, Dinner, Hotel)</span>
              </h3>
              <span className="text-xs font-mono font-bold text-sky-300">
                Subtotal: ৳{totalAllowance.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
              {/* Row 1: Breakfast */}
              <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Coffee className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Breakfast Allowance</span>
                    <span className="text-[11px] text-slate-500">Morning breakfast & tea refreshments</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 sm:w-48 justify-end">
                  <span className="text-xs font-mono text-slate-500">৳</span>
                  <input
                    type="number"
                    min="0"
                    value={breakfast}
                    onChange={(e) => setBreakfast(e.target.value)}
                    placeholder="0"
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-amber-400 text-right focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 2: Lunch */}
              <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Utensils className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Lunch Allowance</span>
                    <span className="text-[11px] text-slate-500">Daytime field meal / lunch standard rate</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 sm:w-48 justify-end">
                  <span className="text-xs font-mono text-slate-500">৳</span>
                  <input
                    type="number"
                    min="0"
                    value={lunch}
                    onChange={(e) => setLunch(e.target.value)}
                    placeholder="0"
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-emerald-400 text-right focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 3: Dinner */}
              <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Dinner Allowance</span>
                    <span className="text-[11px] text-slate-500">Night travel / field work evening dinner</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 sm:w-48 justify-end">
                  <span className="text-xs font-mono text-slate-500">৳</span>
                  <input
                    type="number"
                    min="0"
                    value={dinner}
                    onChange={(e) => setDinner(e.target.value)}
                    placeholder="0"
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-purple-400 text-right focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 4: Hotel Bill */}
              <div className="p-3.5 hover:bg-slate-900/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                      <Hotel className="w-4 h-4 text-rose-400" />
                    </div>
                    <div>
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hasHotel}
                          onChange={(e) => setHasHotel(e.target.checked)}
                          className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">Hotel / Night Stay Bill</span>
                      </label>
                      <span className="text-[11px] text-slate-500 block">Check if tour required overnight hotel accommodation</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 sm:w-48 justify-end">
                    <span className="text-xs font-mono text-slate-500">৳</span>
                    <input
                      type="number"
                      min="0"
                      disabled={!hasHotel}
                      value={hasHotel ? hotelBill : '0'}
                      onChange={(e) => setHotelBill(e.target.value)}
                      placeholder="0"
                      className="w-32 bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-rose-400 text-right focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-40"
                    />
                  </div>
                </div>

                {hasHotel && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-800 text-xs animate-in fade-in pl-12">
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">Hotel / Lodge Name</label>
                      <input
                        type="text"
                        value={hotelName}
                        onChange={(e) => setHotelName(e.target.value)}
                        placeholder="e.g. Hotel Al-Rahman, Tangail"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">Receipt / Voucher #</label>
                      <input
                        type="text"
                        value={hotelReceiptNo}
                        onChange={(e) => setHotelReceiptNo(e.target.value)}
                        placeholder="e.g. Rec-8891"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Subtotal Row */}
              <div className="p-3 bg-slate-900/60 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                  Subtotal Daily Allowance (Food & Hotel):
                </span>
                <span className="font-mono font-black text-sky-400 text-sm">
                  ৳{totalAllowance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Remarks Field */}
          <div>
            <label className="block text-slate-400 font-bold text-xs mb-1">Remarks / Note (Optional)</label>
            <input
              type="text"
              value={formRemarks}
              onChange={(e) => setFormRemarks(e.target.value)}
              placeholder="e.g. Heavy rain delay; visited 4 client shops for collections"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>

          {/* Summary Banner & Submit Action */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Travel Fare</span>
                <span className="text-amber-400 font-bold text-sm">৳{totalMovements.toLocaleString('en-IN')}</span>
              </div>
              <div className="text-slate-600 font-bold text-sm">+</div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Daily Allowance</span>
                <span className="text-sky-400 font-bold text-sm">৳{totalAllowance.toLocaleString('en-IN')}</span>
              </div>
              <div className="text-slate-600 font-bold text-sm">=</div>
              <div>
                <span className="text-emerald-400 block text-[10px] uppercase font-bold">Grand Total Daily Conveyance</span>
                <span className="text-emerald-300 font-black text-xl">৳{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={() => handleSubmitBill(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Clock className="w-4 h-4 text-slate-950" />
                <span>Submit for Approval</span>
              </button>

              {isUserApprover && (
                <button
                  type="button"
                  onClick={() => handleSubmitBill(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs shadow-lg transition-all cursor-pointer flex items-center space-x-1.5"
                  title="Save and directly approve this conveyance bill"
                >
                  <Check className="w-4 h-4 text-white" />
                  <span>Save & Approve Now</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. USER-WISE CONVEYANCE & MONTHLY REGISTER WITH APPROVALS               */}
      {/* ========================================================================= */}
      {subView === 'monthly_list' && (
        <div className="space-y-4">
          {/* Monthly KPI Metrics Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
              <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Total Bills ({monthLabel})</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
                {monthlyMetrics.totalBills}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Logged daily conveyance entries</p>
            </div>

            <div className="bg-slate-900 border border-amber-500/30 p-3.5 rounded-2xl shadow-lg">
              <div className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-400" />
                <span>Total Travel Fare</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono mt-1">
                ৳{monthlyMetrics.totalTravel.toLocaleString('en-IN')}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Transport movement routes</p>
            </div>

            <div className="bg-slate-900 border border-sky-500/30 p-3.5 rounded-2xl shadow-lg">
              <div className="text-[11px] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Utensils className="w-3.5 h-3.5 text-sky-400" />
                <span>Food & Hotel Allowance</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-sky-300 font-mono mt-1">
                ৳{(monthlyMetrics.totalFood + monthlyMetrics.totalHotel).toLocaleString('en-IN')}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Meals (৳{monthlyMetrics.totalFood.toLocaleString('en-IN')}) + Hotel (৳{monthlyMetrics.totalHotel.toLocaleString('en-IN')})</p>
            </div>

            <div className="bg-slate-900 border border-emerald-500/30 p-3.5 rounded-2xl shadow-lg">
              <div className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Monthly Grand Total</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono mt-1">
                ৳{monthlyMetrics.grandMonthlyTotal.toLocaleString('en-IN')}
              </div>
              <div className="flex items-center space-x-2 mt-1 text-[10px]">
                <span className="text-emerald-400 font-bold">Appr: ৳{monthlyMetrics.approvedTotal.toLocaleString('en-IN')}</span>
                <span className="text-amber-400 font-bold">Pend: ৳{monthlyMetrics.pendingTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Month & User Filter Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Month Navigator */}
              <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold font-mono text-slate-100 text-xs">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* User Wise Dropdown */}
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-bold">User:</span>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="all">👤 All Field Personnel</option>
                  {salespersons.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.code || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Approval Status Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-bold">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending_approval">⏳ Pending Approval</option>
                  <option value="approved">✅ Approved</option>
                  <option value="rejected">❌ Rejected</option>
                </select>
              </div>

            </div>

            {/* User-Wise Monthly Summary Breakdown Chips */}
            {userWiseBreakdown.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-[11px] font-bold text-slate-400 mb-2">
                  User Wise Monthly Total Summary ({monthLabel}):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {userWiseBreakdown.map((ub) => (
                    <div
                      key={ub.user}
                      onClick={() => setFilterUser(filterUser === ub.user ? 'all' : ub.user)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        filterUser === ub.user
                          ? 'bg-emerald-950/60 border-emerald-500/60 ring-1 ring-emerald-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span className="truncate">{ub.user}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{ub.count} bills</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px]">
                        <span className="text-slate-500">Monthly Total:</span>
                        <span className="font-mono font-black text-emerald-400">৳{ub.total.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Table of Conveyance Bills */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {filteredBills.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-14 h-14 bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-slate-500">
                  <Truck className="w-7 h-7 text-emerald-500/50" />
                </div>
                <h3 className="text-base font-bold text-slate-300">No Conveyance Bills Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No daily conveyance entries found for {monthLabel} matching the selected user and status filters.
                </p>
                <button
                  type="button"
                  onClick={() => setSubView('entry')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Create New Conveyance Bill
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/90 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800 text-[10px]">
                      <th className="py-3 px-3.5">Bill # & Date</th>
                      <th className="py-3 px-3.5">User & Sales Center</th>
                      <th className="py-3 px-3.5">Movements (From ➔ To)</th>
                      <th className="py-3 px-3.5">Daily Allowance</th>
                      <th className="py-3 px-3.5 text-right">Grand Total (৳)</th>
                      <th className="py-3 px-3.5 text-center">Approval Status</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredBills.map((bill) => {
                      const isApproved = bill.status === 'approved';
                      const isRejected = bill.status === 'rejected';

                      return (
                        <tr
                          key={bill.id}
                          className={`hover:bg-slate-850/60 transition-colors ${
                            isApproved
                              ? 'border-l-4 border-l-emerald-500 bg-slate-900/40'
                              : isRejected
                              ? 'border-l-4 border-l-rose-500 bg-rose-950/10'
                              : 'border-l-4 border-l-amber-500 bg-amber-950/10'
                          }`}
                        >
                          {/* Bill # & Date */}
                          <td className="py-3 px-3.5">
                            <span className="font-mono font-black text-amber-400 block text-xs">
                              {bill.billNo || bill.id}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              📅 {formatDateDDMMYY(bill.date)}
                            </span>
                          </td>

                          {/* User & Sales Center */}
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-slate-100 flex items-center space-x-1">
                              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{bill.userName}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate max-w-[150px]">{bill.branchName || 'Sales Center'}</span>
                            </div>
                          </td>

                          {/* Movements Summary */}
                          <td className="py-3 px-3.5 max-w-[260px]">
                            <div className="space-y-1">
                              {bill.movements.slice(0, 2).map((m, idx) => (
                                <div key={idx} className="text-[11px] text-slate-300 truncate">
                                  <span className="text-amber-400 font-semibold">{m.from}</span> ➔{' '}
                                  <span className="text-slate-100 font-semibold">{m.to}</span>{' '}
                                  <span className="text-slate-500">({m.by})</span>
                                </div>
                              ))}
                              {bill.movements.length > 2 && (
                                <div className="text-[10px] text-slate-500 italic">
                                  + {bill.movements.length - 2} more movements...
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 font-mono">
                                Travel: ৳{bill.totalMovementsAmount.toLocaleString('en-IN')}
                              </div>
                            </div>
                          </td>

                          {/* Daily Allowance */}
                          <td className="py-3 px-3.5">
                            <div className="space-y-0.5 text-[11px] text-slate-300">
                              <div>
                                Meals: ৳{(
                                  (bill.allowance.breakfast || 0) +
                                  (bill.allowance.lunch || 0) +
                                  (bill.allowance.dinner || 0)
                                ).toLocaleString('en-IN')}
                              </div>
                              {bill.allowance.hasHotel && (
                                <div className="text-amber-400 font-semibold text-[10px]">
                                  🏨 Hotel: ৳{(bill.allowance.hotelBill || 0).toLocaleString('en-IN')}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Grand Total */}
                          <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-400 text-sm">
                            ৳{bill.grandTotal.toLocaleString('en-IN')}
                          </td>

                          {/* Approval Status */}
                          <td className="py-3 px-3.5 text-center">
                            {isApproved ? (
                              <div>
                                <span className="inline-flex items-center space-x-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Approved</span>
                                </span>
                                {bill.approvedBy && (
                                  <div className="text-[9px] text-slate-400 truncate max-w-[120px] mx-auto mt-0.5">
                                    By {bill.approvedBy}
                                  </div>
                                )}
                              </div>
                            ) : isRejected ? (
                              <div>
                                <span className="inline-flex items-center space-x-1 bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  <span>Rejected</span>
                                </span>
                                {bill.approvalComments && (
                                  <div className="text-[9px] text-rose-400 truncate max-w-[120px] mx-auto mt-0.5">
                                    {bill.approvalComments}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center space-x-1 bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>Pending Approval</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingBill(bill)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-colors"
                                title="View Complete Breakdown"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {!isApproved && isUserApprover && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveBill(bill)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] flex items-center space-x-1 cursor-pointer transition-colors"
                                  title="Approve conveyance bill"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                              )}

                              {!isApproved && isUserApprover && !isRejected && (
                                <button
                                  type="button"
                                  onClick={() => handleRejectBill(bill)}
                                  className="px-2 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-300 font-bold rounded-lg text-[10px] flex items-center space-x-1 cursor-pointer transition-colors"
                                  title="Reject conveyance bill"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteBill(bill.id)}
                                className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer"
                                title="Delete"
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
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      )}

      {/* View Bill Details Modal */}
      {viewingBill && (
        <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in print:p-0 print:bg-white">
          <div id="daily-conveyance-print-slip" className="print-preview-modal-dialog bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 text-slate-100 shadow-2xl space-y-4 print:bg-white print:text-black print:border-none print:shadow-none print:max-w-full print:max-h-none print:overflow-visible print:p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 print:border-black">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-emerald-400 no-print" />
                <h3 className="text-base font-black text-white print:text-black">
                  Daily Conveyance Voucher: {viewingBill.billNo || viewingBill.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingBill(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer no-print"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill Summary Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800 print:bg-white print:border-black">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">User</span>
                <span className="font-bold text-slate-100 print:text-black">{viewingBill.userName}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Date</span>
                <span className="font-bold text-slate-100 font-mono print:text-black">{formatDateDDMMYY(viewingBill.date)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Sales Center</span>
                <span className="font-bold text-slate-200 print:text-black">{viewingBill.branchName || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Status</span>
                <span
                  className={`font-black uppercase text-[10px] ${
                    viewingBill.status === 'approved'
                      ? 'text-emerald-400'
                      : viewingBill.status === 'rejected'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  } print:text-black`}
                >
                  {viewingBill.status}
                </span>
              </div>
            </div>

            {/* Movements List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider print:text-black">Movement Routes</h4>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 print:bg-white print:border-black print:rounded-none">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold uppercase border-b border-slate-800 print:bg-slate-100 print:text-black print:border-black">
                    <tr>
                      <th className="p-2">Route</th>
                      <th className="p-2">By</th>
                      <th className="p-2">Reason</th>
                      <th className="p-2 text-right">Fare (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium print:divide-black">
                    {viewingBill.movements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="p-2 text-slate-200 print:text-black">
                          {m.from} ➔ {m.to}
                        </td>
                        <td className="p-2 text-slate-400 print:text-black">{m.by}</td>
                        <td className="p-2 text-slate-400 print:text-black">{m.reason}</td>
                        <td className="p-2 text-right font-mono font-bold text-amber-400 print:text-black">
                          ৳{m.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Allowance Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider print:text-black">Daily Allowance Breakdown</h4>
              <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800 print:bg-white print:border-black">
                <div>
                  <span className="text-slate-500 text-[10px] block">Breakfast</span>
                  <span className="font-mono font-bold text-slate-200 print:text-black">৳{viewingBill.allowance.breakfast || 0}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Lunch</span>
                  <span className="font-mono font-bold text-slate-200 print:text-black">৳{viewingBill.allowance.lunch || 0}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Dinner</span>
                  <span className="font-mono font-bold text-slate-200 print:text-black">৳{viewingBill.allowance.dinner || 0}</span>
                </div>
                {viewingBill.allowance.hasHotel && (
                  <div className="col-span-3 pt-2 border-t border-slate-800 print:border-black flex items-center justify-between">
                    <div>
                      <span className="text-amber-400 font-bold block text-[11px] print:text-black">🏨 Hotel Stay ({viewingBill.allowance.hotelName || 'Lodge'})</span>
                      {viewingBill.allowance.hotelReceiptNo && (
                        <span className="text-[10px] text-slate-500">Rec #: {viewingBill.allowance.hotelReceiptNo}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-amber-400 print:text-black">৳{viewingBill.allowance.hotelBill || 0}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grand Total Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 print:border-black text-xs">
              <div className="text-slate-400 print:text-black">
                Grand Total: <strong className="text-emerald-400 print:text-black font-mono text-base">৳{viewingBill.grandTotal.toLocaleString('en-IN')}</strong>
              </div>
              <div className="flex items-center space-x-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingBill(null)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
