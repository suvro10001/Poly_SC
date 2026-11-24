import React, { useRef } from 'react';
import { ViewTab } from '../types';
import {
  LayoutDashboard,
  FileText,
  FileSpreadsheet,
  Truck,
  Users,
  UserCheck,
  FolderArchive,
  BarChart3,
  BookOpen,
  DollarSign,
  TrendingDown,
  Trash2,
  Settings,
  Building,
  Building2,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  RefreshCw,
  Sparkles,
  TrendingUp,
  ArrowLeft,
  Calendar,
  PackageCheck,
  Activity,
  Factory,
  Car,
  CheckCircle2,
  History
} from 'lucide-react';

export interface ChromeTabItem {
  id: string;
  viewTab: ViewTab;
  title: string;
  closable?: boolean;
  itemSubTab?: string;
  reportSubTab?: string;
  expenseSubTab?: string;
  settingsSubTab?: string;
  requisitionSubTab?: string;
  isOfficeBill?: boolean;
}

export function getTabMeta(
  tab: ViewTab,
  itemSubTab?: string,
  reportSubTab?: string,
  expenseSubTab?: string,
  settingsSubTab?: string,
  requisitionSubTab?: string,
  isOfficeBill?: boolean
): { title: string; icon: React.ReactNode } {
  switch (tab) {
    case 'price_history':
      return { title: 'Price Update History', icon: <History className="w-3.5 h-3.5 text-emerald-400" /> };
    case 'main_menu':
      return { title: 'Dashboard', icon: <LayoutDashboard className="w-3.5 h-3.5 text-blue-500" /> };
    case 'approved_menu':
      return { title: 'Approved Hub', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> };
    case 'report_dashboard':
      if (reportSubTab === 'customer_wise_sales_collection') {
        return { title: 'Customer Sales & Collection', icon: <Users className="w-3.5 h-3.5 text-amber-500" /> };
      }
      if (reportSubTab === 'office_report') {
        return { title: 'Office Statement', icon: <Building2 className="w-3.5 h-3.5 text-emerald-500" /> };
      }
      if (reportSubTab === 'party_bank_details') {
        return { title: 'Party-Wise Bank Details', icon: <FileText className="w-3.5 h-3.5 text-blue-500" /> };
      }
      if (reportSubTab === 'special_bank_cash') {
        return { title: 'Bank & Cash Summary', icon: <DollarSign className="w-3.5 h-3.5 text-indigo-500" /> };
      }
      if (reportSubTab === 'bill_wise_sales') {
        return { title: 'Bill-Wise Invoices', icon: <FileSpreadsheet className="w-3.5 h-3.5 text-purple-500" /> };
      }
      return { title: 'Customer Sales & Collection', icon: <LayoutDashboard className="w-3.5 h-3.5 text-blue-500" /> };
    case 'builder':
      if (isOfficeBill) {
        return { title: 'Office Bill Entry', icon: <Building2 className="w-3.5 h-3.5 text-amber-500" /> };
      }
      return { title: 'Sales Center Bill Entry', icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> };
    case 'requisition':
      if (requisitionSubTab === 'approved_history') {
        return {
          title: 'Approved History',
          icon: <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
        };
      }
      if (requisitionSubTab === 'delivered') {
        return {
          title: 'Delivered',
          icon: <Truck className="w-3.5 h-3.5 text-blue-500" />
        };
      }
      return {
        title: requisitionSubTab === 'list' ? 'Requisition History' : 'Requisition Entry',
        icon: <FileText className="w-3.5 h-3.5 text-amber-500" />
      };
    case 'factory':
      if (requisitionSubTab === 'delivered') {
        return {
          title: 'Factory Delivered',
          icon: <Truck className="w-3.5 h-3.5 text-blue-500" />
        };
      }
      return {
        title: 'Approved History',
        icon: <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
      };
    case 'item_directory':
      return {
        title: itemSubTab === 'categories' ? 'Item Categories' : itemSubTab === 'special_items' ? 'Special Items' : 'Product Directory',
        icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
      };
    case 'challan_menu':
      return { title: 'Delivery Challan', icon: <Truck className="w-3.5 h-3.5 text-amber-500" /> };
    case 'color_exchange':
      return { title: 'Color Exchange', icon: <RefreshCw className="w-3.5 h-3.5 text-pink-500" /> };
    case 'slip_pad_memo':
      return { title: 'Slip Pad (5.5"×8.5")', icon: <FileSpreadsheet className="w-3.5 h-3.5 text-amber-500" /> };
    case 'party_directory':
      return { title: 'Party Directory', icon: <Users className="w-3.5 h-3.5 text-purple-500" /> };
    case 'salesperson_directory':
      return { title: 'Sales Center & User List', icon: <UserCheck className="w-3.5 h-3.5 text-cyan-500" /> };
    case 'stored_bills':
      return { title: 'Bills Directory', icon: <FolderArchive className="w-3.5 h-3.5 text-orange-500" /> };
    case 'sales_report':
      return { title: 'Sales & Stock Report', icon: <BarChart3 className="w-3.5 h-3.5 text-teal-500" /> };
    case 'sales_items':
      return { title: 'Sales Items Report', icon: <PackageCheck className="w-3.5 h-3.5 text-indigo-500" /> };
    case 'customer_ledger':
      return { title: 'Customer Ledger Statement', icon: <BookOpen className="w-3.5 h-3.5 text-rose-500" /> };
    case 'expense_directory':
      if (expenseSubTab === 'expense_amount' || expenseSubTab === 'monthly_expense') {
        return { title: 'Monthly Expense', icon: <Calendar className="w-3.5 h-3.5 text-rose-500" /> };
      }
      if (expenseSubTab === 'conveyance') {
        return { title: 'Conveyance Bill', icon: <Car className="w-3.5 h-3.5 text-indigo-500" /> };
      }
      if (expenseSubTab === 'report') {
        return { title: 'Expense Report', icon: <FileText className="w-3.5 h-3.5 text-blue-500" /> };
      }
      return { title: 'Expense Entry & Log', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> };
    case 'conveyance':
      return { title: 'Conveyance Bill', icon: <Car className="w-3.5 h-3.5 text-indigo-500" /> };
    case 'expense_entry':
      return { title: 'Quick Expense Entry', icon: <DollarSign className="w-3.5 h-3.5 text-amber-500" /> };
    case 'collection_entry':
      return { title: 'Party Collection Entry', icon: <DollarSign className="w-3.5 h-3.5 text-blue-500" /> };
    case 'collection_list':
      return { title: 'Collections Management', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> };
    case 'cash_in_hand':
      return { title: 'Cash In Hand', icon: <Building className="w-3.5 h-3.5 text-sky-600" /> };
    case 'cheque_in_hand':
      return { title: 'Cheque In Hand', icon: <Building className="w-3.5 h-3.5 text-sky-500" /> };
    case 'deposit_history':
      return { title: 'Bank Deposit History', icon: <Building className="w-3.5 h-3.5 text-indigo-500" /> };
    case 'returns_menu':
      return { title: 'Stock Return Manager', icon: <TrendingDown className="w-3.5 h-3.5 text-amber-600" /> };
    case 'trash_bin':
      return { title: 'Trash & Recycle Bin', icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" /> };
    case 'ai_sales_forecast':
      return { title: 'AI Demand Forecast', icon: <Sparkles className="w-3.5 h-3.5 text-purple-500" /> };
    case 'admin_debug':
      return { title: 'Admin Debug • CloudSync', icon: <Activity className="w-3.5 h-3.5 text-emerald-400" /> };
    case 'admin_sales_collection_report':
      return { title: 'Dashboard • Sales & Collection (Admin)', icon: <TrendingUp className="w-3.5 h-3.5 text-amber-500" /> };
    case 'settings':
      if (settingsSubTab === 'backup') {
        return { title: 'Backup & Restore System', icon: <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> };
      }
      if (settingsSubTab === 'banks_accounts') {
        return { title: 'Bank & Account Directory', icon: <Building className="w-3.5 h-3.5 text-indigo-500" /> };
      }
      if (settingsSubTab === 'email_smtp') {
        return { title: 'Email & SMTP Settings', icon: <Settings className="w-3.5 h-3.5 text-emerald-500" /> };
      }
      if (settingsSubTab === 'system') {
        return { title: 'System Data Summary', icon: <Settings className="w-3.5 h-3.5 text-blue-500" /> };
      }
      if (settingsSubTab === 'shortcuts') {
        return { title: 'Keyboard Shortcuts', icon: <Keyboard className="w-3.5 h-3.5 text-amber-500" /> };
      }
      if (settingsSubTab === 'allowance_settings') {
        return { title: 'Lunch & Hotel Bill Setting', icon: <Settings className="w-3.5 h-3.5 text-amber-500" /> };
      }
      return { title: 'Company & System Settings', icon: <Settings className="w-3.5 h-3.5 text-slate-500" /> };
    default:
      return { title: 'Management Tab', icon: <FileText className="w-3.5 h-3.5 text-slate-500" /> };
  }
}

interface ChromeTabBarProps {
  tabs: ChromeTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onCloseOtherTabs?: (id: string) => void;
  onDuplicateTab?: (id: string) => void;
  onOpenShortcuts?: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
}

export const ChromeTabBar: React.FC<ChromeTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onCloseOtherTabs,
  onOpenShortcuts,
  onBack,
  canGoBack = true
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  const visibleTabs = tabs.filter((t) => t.viewTab !== 'report_dashboard');

  return (
    <div className="bg-[#071924]/45 backdrop-blur-xl border-b border-white/[0.10] flex items-center px-2.5 pt-1 select-none min-h-[38px] no-print cyber-glass-header">
      {/* Back Button: opens previous page where user was */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 text-slate-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] rounded-lg transition-all mr-1.5 cursor-pointer shrink-0 flex items-center justify-center shadow-xs active:scale-95"
          title="Back to previous page"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-amber-300" />
        </button>
      )}

      {/* Scroll Left Button if overflow */}
      <button
        type="button"
        onClick={scrollLeft}
        className="p-1 text-slate-400 hover:text-white hover:bg-white/[0.08] rounded transition-colors mr-1 cursor-pointer shrink-0 hidden sm:flex items-center justify-center"
        title="Scroll tabs left"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Tabs Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-end space-x-1 overflow-x-auto scrollbar-none py-0.5 min-w-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const meta = getTabMeta(tab.viewTab, tab.itemSubTab, tab.reportSubTab, tab.expenseSubTab, tab.settingsSubTab);

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-t-lg text-xs font-semibold cursor-pointer transition-all shrink-0 max-w-[150px] sm:max-w-[210px] border-t border-x backdrop-blur-md ${
                isActive
                  ? 'bg-[#0d2738]/75 text-white border-cyan-300/35 shadow-[0_0_16px_rgba(34,211,238,0.18)] ring-1 ring-cyan-400/20'
                  : 'bg-white/[0.03] text-slate-300 border-white/[0.08] hover:bg-white/[0.07] hover:text-white'
              }`}
              title={tab.title || meta.title}
            >
              <div className="shrink-0">{meta.icon}</div>
              <span className="truncate flex-1 text-[11px] tracking-tight">{tab.title || meta.title}</span>

              {/* Close Button: Always available so closing any page returns to Executive Dashboard */}
              <div className="flex items-center space-x-0.5 opacity-70 group-hover:opacity-100 shrink-0">
                {tab.closable !== false && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id, e);
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-300 hover:bg-white/[0.12] rounded transition-colors cursor-pointer"
                    title="Close page (returns to Executive Dashboard)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={scrollRight}
        className="p-1 text-slate-400 hover:text-white hover:bg-white/[0.10] rounded transition-colors ml-1 cursor-pointer shrink-0 hidden sm:flex items-center justify-center"
        title="Scroll tabs right"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {/* New Tab Button */}
      <button
        type="button"
        onClick={onNewTab}
        className="ml-1 p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.10] rounded-md transition-colors cursor-pointer shrink-0"
        title="Open new tab (or Ctrl + Click any menu item)"
      >
        <Plus className="w-4 h-4" />
      </button>

    </div>
  );
};
