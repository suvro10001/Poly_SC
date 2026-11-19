import React, { useState, useEffect, useRef } from 'react';
import { ViewTab, AuthUser } from '../types';
import { MnemonicLabel } from './MnemonicLabel';
import { isSuperAdminOrAgm, isStrictSuperAdmin, isInCharge, isAccountsOrStaff, isFactoryUser, isAnyAdmin, isSuvroAdmin } from '../utils/branchAccess';
import { preloadViewModule, preloadSectionModules } from '../utils/viewPreloader';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import {
  FolderKanban,
  FileSpreadsheet,
  Layers,
  RotateCcw,
  Plus,
  Wallet,
  DollarSign,
  Database,
  BarChart3,
  Building2,
  Users,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  Truck,
  History,
  CheckCircle2,
  Sparkles,
  FileText,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  PieChart,
  UserCheck,
  FileCheck,
  Banknote,
  CreditCard,
  ListOrdered,
  Landmark,
  Settings,
  RefreshCw,
  ShieldCheck,
  Keyboard,
  HardDrive,
  Mail,
  Calendar,
  LayoutDashboard,
  Car,
  TrendingUp,
  PackageCheck,
  Factory,
  Crown,
  Activity,
  Utensils,
  Receipt
} from 'lucide-react';

interface SidebarProps {
  activeTab: ViewTab;
  setActiveTab: (
    tab: ViewTab,
    forceNewTab?: boolean,
    subTabs?: {
      itemSubTab?: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash';
      reportSubTab?: 'customer_wise_sales_collection' | 'office_report' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'executive_dashboard';
      expenseSubTab?: 'list' | 'report' | 'trash' | 'expense_amount' | 'monthly_expense' | 'conveyance';
      settingsSubTab?: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings';
      requisitionSubTab?: 'entry_slip' | 'list' | 'approved_history' | 'delivered';
      factorySubTab?: 'approved_history' | 'delivered';
    }
  ) => void;
  itemCount: number;
  storedBillsCount: number;
  challansCount?: number;
  requisitionsCount?: number;
  onNewBill: (forceNewTab?: boolean, isOffice?: boolean) => void;
  requisitionSubTab?: 'entry_slip' | 'list' | 'approved_history' | 'delivered';
  setRequisitionSubTab?: (tab: 'entry_slip' | 'list' | 'approved_history' | 'delivered') => void;
  isOfficeBillActive?: boolean;
  itemSubTab?: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash';
  setItemSubTab?: (subtab: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash') => void;
  reportSubTab?: 'customer_wise_sales_collection' | 'office_report' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'executive_dashboard';
  setReportDashboardTab?: (tab: 'customer_wise_sales_collection' | 'office_report' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'executive_dashboard') => void;
  expenseSubTab?: 'list' | 'report' | 'trash' | 'expense_amount' | 'monthly_expense' | 'conveyance';
  setExpenseManagerTab?: (tab: 'list' | 'report' | 'trash' | 'expense_amount' | 'monthly_expense' | 'conveyance') => void;
  settingsSubTab?: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings';
  setSettingsSubTab?: (tab: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings') => void;
  factorySubTab?: 'approved_history' | 'delivered';
  setFactorySubTab?: (tab: 'approved_history' | 'delivered') => void;
  approvedHubSubTab?: 'sales_approved' | 'conveyance_approved' | 'expense_approved';
  setApprovedHubSubTab?: (tab: 'sales_approved' | 'conveyance_approved' | 'expense_approved') => void;
  isOpenMobile?: boolean;
  setIsOpenMobile?: (open: boolean) => void;
  onOpenShortcuts?: () => void;
  currentUser?: AuthUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  itemCount,
  storedBillsCount,
  challansCount = 0,
  requisitionsCount = 0,
  onNewBill,
  requisitionSubTab,
  setRequisitionSubTab,
  isOfficeBillActive = false,
  itemSubTab,
  setItemSubTab,
  reportSubTab,
  setReportDashboardTab,
  expenseSubTab,
  setExpenseManagerTab,
  settingsSubTab = 'backup',
  setSettingsSubTab,
  factorySubTab = 'approved_history',
  setFactorySubTab,
  approvedHubSubTab = 'sales_approved',
  setApprovedHubSubTab,
  isOpenMobile = false,
  setIsOpenMobile,
  onOpenShortcuts,
  currentUser
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Array<{
    userId: string;
    username: string;
    name?: string;
    role?: string;
    branchName?: string;
    lastSeen: number;
  }>>([]);
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  const onlinePopupRef = useRef<HTMLDivElement>(null);

  // Close online popup on click/touch outside or Escape key; close mobile drawer on Escape
  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (showOnlinePopup && onlinePopupRef.current && !onlinePopupRef.current.contains(event.target as Node)) {
        setShowOnlinePopup(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowOnlinePopup(false);
        if (isOpenMobile && setIsOpenMobile) {
          setIsOpenMobile(false);
        }
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showOnlinePopup, isOpenMobile, setIsOpenMobile]);

  // Listen to shared heartbeat & presence updates from Navbar (avoid duplicate polling on boot)
  useEffect(() => {
    let isMounted = true;
    const onPresence = (ev: any) => {
      if (isMounted && Array.isArray(ev?.detail)) {
        setOnlineUsers(ev.detail);
      }
    };
    window.addEventListener('polycables_presence_updated', onPresence);
    return () => {
      isMounted = false;
      window.removeEventListener('polycables_presence_updated', onPresence);
    };
  }, [currentUser]);

  const isSuperAdmin = isSuperAdminOrAgm(currentUser);
  const isAdmin = isSuperAdmin || 
    (currentUser?.role || '').toLowerCase().includes('admin') || 
    (currentUser?.userRole || '').toLowerCase().includes('admin') || 
    (currentUser?.username || '').toLowerCase().includes('admin');
  const inCharge = isInCharge(currentUser);
  const isStaffOrAccounts = isAccountsOrStaff(currentUser) || Boolean(
    (currentUser?.role as string) === 'accounts' ||
    (currentUser?.role as string) === 'staff' ||
    (currentUser?.userRole || '').toLowerCase().includes('account') ||
    (currentUser?.userRole || '').toLowerCase().includes('staff')
  );
  const isInChargeOrStaff = inCharge || isStaffOrAccounts;
  // Returns open for all, and Color Exchange only in-charge and accounts or staff (and admins)
  const canColorExchange = isSuperAdmin || isAdmin || isInChargeOrStaff;
  // Factory Import and Factory Import List open for in-charge, sales center staff and account roles
  const canAccessImportFactory = isSuperAdmin || isAdmin || isInChargeOrStaff;

  const isMarketingOfficer = !isSuperAdmin && !isAdmin && !isInChargeOrStaff;
  const isOfficer = isMarketingOfficer;
  const isFactoryRole = isFactoryUser(currentUser);

  // Memoize permissions lookup once per user to avoid heavy repeated localStorage parses during menu render
  const allowedPermissions = React.useMemo<string[] | null>(() => {
    if (currentUser?.allowedMenus && currentUser.allowedMenus.length > 0) {
      return currentUser.allowedMenus;
    }
    try {
      const permsMap = JSON.parse(localStorage.getItem('polycables_user_menu_permissions') || '{}');
      const userPerm = permsMap[currentUser?.salespersonCode || ''] || permsMap[currentUser?.username || ''] || permsMap[(currentUser as any)?.id || ''];
      if (userPerm && Array.isArray(userPerm.allowedMenus) && userPerm.allowedMenus.length > 0) {
        return userPerm.allowedMenus;
      }
    } catch (e) {}
    return null;
  }, [currentUser]);

  // Helper to determine if a navigation menu is allowed for current user
  const isMenuAllowed = (tabKey: string): boolean => {
    // Factory user strictly only sees Factory Menu
    if (isFactoryRole) {
      return tabKey === 'factory';
    }

    // Factory menu is accessible strictly to Super Admin and Factory user only
    if (tabKey === 'factory') {
      return isFactoryRole || isStrictSuperAdmin(currentUser) || Boolean(currentUser?.isSuperAdmin);
    }

    // Admin wise sales collection can see super admin & admins
    if (tabKey === 'admin_sales_collection_report') {
      return isSuperAdmin || isAdmin || isAnyAdmin(currentUser);
    }
    // Approved menu under Admin Dashboard only for Super Admin, Admin, and In-Charge
    if (tabKey === 'approved_menu') {
      return isStrictSuperAdmin(currentUser) || isAdmin || inCharge || isAnyAdmin(currentUser) || isInCharge(currentUser);
    }
    // Main menu / Dashboard is always accessible for non-factory roles
    if (tabKey === 'main_menu') return !isFactoryRole;
    // Requisition & Stored Bills are always open for Admin and Super Admin
    if ((isAdmin || isSuperAdmin) && (tabKey === 'requisition' || tabKey === 'stored_bills')) return true;
    if (isSuperAdmin || isAdmin) return true; // Super admin and Admin always see allowed menus!

    // Customer Sales & Collection, Office Statement, Party-Wise Bank Details,
    // Bank & Cash Summary, Bill-Wise Invoices pages are open for all roles.
    if (tabKey === 'report' || tabKey === 'report_dashboard' || tabKey === 'sales_items') return true;

    // Expense all pages open for all users without factory
    if (['expense', 'expense_directory', 'expense_entry'].includes(tabKey)) {
      return !isFactoryRole;
    }

    const allowed = allowedPermissions;
    if (allowed) {
      if (allowed.includes(tabKey)) return true;
      if (tabKey === 'builder' && (allowed.includes('bill') || allowed.includes('builder'))) return true;
      if (tabKey === 'bill' && (allowed.includes('bill') || allowed.includes('builder'))) return true;
      if (tabKey === 'challan_menu' && (allowed.includes('challan') || allowed.includes('slip_pad') || allowed.includes('challan_menu'))) return true;
      if (tabKey === 'challan' && (allowed.includes('challan') || allowed.includes('slip_pad') || allowed.includes('challan_menu'))) return true;
      if (tabKey === 'requisition' && allowed.includes('requisition')) return true;
      if (tabKey === 'color_exchange' && (allowed.includes('color_exchange') || allowed.includes('returns'))) return true;
      if (tabKey === 'stored_bills' && (allowed.includes('stored_bills') || allowed.includes('bill'))) return true;
      if (tabKey === 'returns_menu' && (allowed.includes('returns') || allowed.includes('returns_menu'))) return true;
      if (tabKey === 'returns' && (allowed.includes('returns') || allowed.includes('returns_menu'))) return true;
      if (['collection', 'collection_entry', 'collection_list', 'cash_in_hand', 'cheque_in_hand', 'deposit_history'].includes(tabKey) && allowed.includes('collection')) return true;
      if (tabKey === 'customer_ledger' && (allowed.includes('customer_ledger') || allowed.includes('party_directory'))) return true;
      if (tabKey === 'party_directory' && (allowed.includes('party_directory') || allowed.includes('customer_ledger'))) return true;
      if (tabKey === 'item_directory' && allowed.includes('item_directory')) return true;
      if (['expense', 'expense_directory', 'expense_entry'].includes(tabKey)) return !isFactoryRole;
      if (tabKey === 'report_dashboard' && allowed.includes('report')) return true;
      if ((tabKey === 'sales_report' || tabKey === 'sales_items') && (allowed.includes('sales_report') || allowed.includes('sales_items') || allowed.includes('report'))) return true;
      if (tabKey === 'admin_sales_collection_report' && (allowed.includes('admin_sales_collection_report') || allowed.includes('report'))) return true;
      if (tabKey === 'settings' && allowed.includes('settings')) return true;
      if (tabKey === 'main_menu') return true;
      return false;
    }

    // Role-based defaults when no custom override is set
    if (isInChargeOrStaff) {
      // In-charge, Accounts, Staff Role:
      // Create New Bill, Challan, Requisition, Color Exchange, Stored Bills, Returns,
      // Collection Entry, Collection List, Cash In Hand, Cheque In Hand, Deposit History,
      // Master Item Directory (Read Only), Customer Directory, Statement,
      // Expense Entry & Log, Quick Expense Entry, Expense Report,
      // Customer Sales & Collection, Office Statement, Party-Wise Bank Details,
      // Bank & Cash Summary, Bill-Wise Invoices, Stock Report.
      // AI Demand Forecast is ONLY for Showroom In-Charge.
      const allowedForInChargeStaff = [
        'main_menu',
        'builder',
        'bill',
        'challan_menu',
        'challan',
        'requisition',
        'color_exchange',
        'stored_bills',
        'returns_menu',
        'returns',
        'collection',
        'collection_entry',
        'collection_list',
        'cash_in_hand',
        'cheque_in_hand',
        'deposit_history',
        'item_directory',
        'party_directory',
        'customer_ledger',
        'expense',
        'expense_directory',
        'expense_entry',
        'report_dashboard',
        'sales_report',
        'sales_items',
        ...(inCharge ? ['ai_sales_forecast'] : [])
      ];
      return allowedForInChargeStaff.includes(tabKey);
    }

    if (isMarketingOfficer) {
      // Marketing Officer Role:
      // Create New Bill, Challan, Requisition, Stored Bills, Returns,
      // Collection Entry, Collection List, Cash In Hand, Cheque In Hand, Deposit History,
      // Master Item Directory (Read Only), Customer Directory, Statement,
      // Expense Entry & Log, Quick Expense Entry, Monthly Expense, Expense Report,
      // Customer Sales & Collection, Office Statement, Party-Wise Bank Details, Bank & Cash Summary, Bill-Wise Invoices, Stock Report, Sales Items.
      const allowedForMarketing = [
        'main_menu',
        'builder',
        'bill',
        'challan_menu',
        'challan',
        'requisition',
        'stored_bills',
        'returns_menu',
        'returns',
        'collection',
        'collection_entry',
        'collection_list',
        'cash_in_hand',
        'cheque_in_hand',
        'deposit_history',
        'item_directory',
        'party_directory',
        'customer_ledger',
        'expense',
        'expense_directory',
        'expense_entry',
        'report',
        'report_dashboard',
        'sales_report',
        'sales_items'
      ];
      return allowedForMarketing.includes(tabKey);
    }

    return true;
  };

  // Hide all menu category items collapsed on startup
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    approved: false,
    sales: false,
    collection: false,
    itemList: false,
    stockReport: false,
    report: false,
    expenseDirectory: false,
    customerDirectory: false,
    salespersonDirectory: false,
    trash: false,
    settings: false,
    factory: false
  });

  const toggleSection = (section: string) => {
    preloadSectionModules(section);
    if (isCollapsed) {
      setIsCollapsed(false);
      setExpandedSections((prev) => ({
        ...prev,
        [section]: true
      }));
      return;
    }
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleNav = (
    tab: ViewTab,
    itemSub?: 'items_list' | 'special_items' | 'categories' | 'import_factory' | 'import_history' | 'trash' | any,
    reportSub?: 'customer_wise_sales_collection' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'executive_dashboard' | any,
    expenseSub?: 'list' | 'report' | 'trash' | any,
    settingsSub?: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | any,
    e?: React.MouseEvent | any,
    requisitionSub?: 'entry_slip' | 'list' | 'approved_history' | 'delivered'
  ) => {
    // Find if any parameter was the MouseEvent / SyntheticEvent
    const allArgs = [itemSub, reportSub, expenseSub, settingsSub, e, requisitionSub];
    let foundEvent: React.MouseEvent | undefined = undefined;
    for (const arg of allArgs) {
      if (arg && typeof arg === 'object' && ('ctrlKey' in arg || 'metaKey' in arg || 'nativeEvent' in arg || 'preventDefault' in arg)) {
        foundEvent = arg;
        break;
      }
    }

    if (foundEvent) {
      foundEvent.preventDefault?.();
    }

    // Check if any arg was entry_slip, list, approved_history, or delivered
    let foundReqSub: 'entry_slip' | 'list' | 'approved_history' | 'delivered' | undefined = undefined;
    for (const arg of allArgs) {
      if (arg === 'entry_slip' || arg === 'list' || arg === 'approved_history' || arg === 'delivered') {
        foundReqSub = arg;
        break;
      }
    }

    const cleanItemSub = typeof itemSub === 'string' && itemSub !== 'entry_slip' && itemSub !== 'list' && itemSub !== 'approved_history' && itemSub !== 'delivered' ? (itemSub as any) : undefined;
    const cleanReportSub = typeof reportSub === 'string' ? (reportSub as any) : undefined;
    const cleanExpenseSub = typeof expenseSub === 'string' ? (expenseSub as any) : undefined;
    const cleanSettingsSub = typeof settingsSub === 'string' ? (settingsSub as any) : undefined;
    const cleanFactorySub = foundReqSub === 'approved_history' || foundReqSub === 'delivered' ? foundReqSub : undefined;

    const isCtrl = Boolean(foundEvent && (foundEvent.ctrlKey || foundEvent.metaKey));
    setActiveTab(tab, isCtrl, {
      itemSubTab: cleanItemSub,
      reportSubTab: cleanReportSub,
      expenseSubTab: cleanExpenseSub,
      settingsSubTab: cleanSettingsSub,
      requisitionSubTab: foundReqSub,
      factorySubTab: cleanFactorySub
    });
    setShowOnlinePopup(false);
    if (setIsOpenMobile) {
      setIsOpenMobile(false);
    }

    const mainEl = document.getElementById('main-content-area') || document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile?.(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[55] md:hidden no-print"
          aria-hidden="true"
        />
      )}

      <aside
        className={`bg-[#081d2a]/92 md:bg-[#081d2a]/58 backdrop-blur-2xl text-slate-200 border-r border-white/[0.12] shadow-[8px_0_32px_rgba(0,0,0,0.28)] flex flex-col transition-transform md:transition-all duration-300 no-print fixed inset-y-0 left-0 z-[60] w-72 max-w-[85vw] ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:sticky md:top-0 md:z-30 ${
          isCollapsed ? 'md:w-16' : 'md:w-56 lg:w-60'
        } flex-shrink-0 min-h-screen max-h-screen overflow-hidden`}
      >
        {/* Sidebar Header (Clean Navigation Bar) */}
        <div className="p-3 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02] min-h-[44px]">
          {(!isCollapsed || isOpenMobile) && (
            <span className="text-[11px] font-black tracking-wider uppercase text-white/90 px-1 select-none flex items-center gap-1.5">
              <span>Navigation Menu</span>
            </span>
          )}

          <div className={`flex items-center space-x-1 ${isCollapsed ? 'md:mx-auto ml-auto' : 'ml-auto'}`}>
            {/* Mobile Close Drawer Button */}
            <button
              type="button"
              onClick={() => setIsOpenMobile?.(false)}
              className="md:hidden flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              title="Close Menu"
              aria-label="Close Navigation Menu"
            >
              <X className="w-4 h-4 text-cyan-400" />
            </button>

            {/* Collapse/Expand Toggle Button (Desktop) */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4 text-cyan-400" /> : <PanelLeftClose className="w-4 h-4 text-cyan-400" />}
            </button>
          </div>
        </div>

      {/* Scrollable Navigation List */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-2.5 custom-scrollbar text-xs">
        {/* 0. DASHBOARD SECTION */}
        {!isFactoryRole && (
          <div>
            {(isStrictSuperAdmin(currentUser) || isAdmin || isAnyAdmin(currentUser) || (currentUser?.role || '').toLowerCase() === 'sadmin' || (currentUser?.role || '').toLowerCase() === 'super_admin') ? (
              <button
                onMouseEnter={() => preloadViewModule('admin_sales_collection_report')}
                onPointerDown={() => preloadViewModule('admin_sales_collection_report')}
                onClick={(e) => handleNav('admin_sales_collection_report', undefined, undefined, undefined, undefined, e)}
                className={`w-full flex items-center space-x-2 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                  activeTab === 'admin_sales_collection_report'
                    ? 'bg-cyan-400/[0.15] text-white border border-cyan-300/85 shadow-[0_0_18px_rgba(34,211,238,0.32)] font-black'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 border border-transparent'
                }`}
                title="Dashboard"
              >
                <LayoutDashboard className={`w-4 h-4 flex-shrink-0 ${activeTab === 'admin_sales_collection_report' ? 'text-cyan-300' : 'text-cyan-400'}`} />
                {!isCollapsed && <span className="truncate">Dashboard</span>}
              </button>
            ) : (
              <button
                onMouseEnter={() => preloadViewModule('main_menu')}
                onPointerDown={() => preloadViewModule('main_menu')}
                onClick={(e) => handleNav('main_menu', undefined, undefined, undefined, undefined, e)}
                className={`w-full flex items-center space-x-2 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer group ${
                  activeTab === 'main_menu'
                    ? 'bg-cyan-400/[0.15] text-white border border-cyan-300/85 shadow-[0_0_18px_rgba(34,211,238,0.32)] font-black'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 border border-transparent'
                }`}
                title="Dashboard"
              >
                <LayoutDashboard className={`w-4 h-4 flex-shrink-0 ${activeTab === 'main_menu' ? 'text-cyan-300' : 'text-cyan-400'}`} />
                {!isCollapsed && <span className="truncate">Dashboard</span>}
              </button>
            )}

            {/* Approved Menu under Dashboard • Sales & Collection (Admin) - only for Admin, Super Admin, and In-Charge */}
            {(isStrictSuperAdmin(currentUser) || isAdmin || inCharge || isAnyAdmin(currentUser) || isInCharge(currentUser)) && (
              <div className="mt-1">
                <button
                  onMouseEnter={() => preloadViewModule('approved_menu')}
                  onPointerDown={() => preloadViewModule('approved_menu')}
                  onClick={(e) => {
                    toggleSection('approved');
                    handleNav('approved_menu', undefined, undefined, undefined, undefined, e);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer group ${
                    activeTab === 'approved_menu'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 border border-transparent'
                  }`}
                  title="Approved (Approve Requisition & Approve Conveyance)"
                >
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${activeTab === 'approved_menu' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                    {!isCollapsed && <span>Approved</span>}
                  </div>
                  {!isCollapsed && (
                    <div className="flex items-center space-x-1">
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[9px] px-1.5 py-0.2 rounded-full font-mono">
                        Admin
                      </span>
                      <ChevronDown
                        className={`w-3 h-3 transition-transform duration-200 ${
                          expandedSections.approved ? 'rotate-180 text-cyan-300' : 'text-slate-400'
                        }`}
                      />
                    </div>
                  )}
                </button>

                {/* Sub Menu: Approve Requisition, Approve Conveyance, Approve Expense */}
                {!isCollapsed && (expandedSections.approved || activeTab === 'approved_menu') && (
                  <div className="ml-3 pl-2 border-l border-cyan-500/25 py-1 space-y-1">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (setApprovedHubSubTab) setApprovedHubSubTab('sales_approved');
                        handleNav('approved_menu', undefined, undefined, undefined, undefined, e);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'approved_menu' && approvedHubSubTab === 'sales_approved'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Approve Requisition"
                    >
                      <FileText className={`w-3.5 h-3.5 ${activeTab === 'approved_menu' && approvedHubSubTab === 'sales_approved' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <span>Approve Requisition</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (setApprovedHubSubTab) setApprovedHubSubTab('conveyance_approved');
                        handleNav('approved_menu', undefined, undefined, undefined, undefined, e);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'approved_menu' && approvedHubSubTab === 'conveyance_approved'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Approve Conveyance"
                    >
                      <Car className={`w-3.5 h-3.5 ${activeTab === 'approved_menu' && approvedHubSubTab === 'conveyance_approved' ? 'text-cyan-300' : 'text-amber-400'}`} />
                      <span>Approve Conveyance</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (setApprovedHubSubTab) setApprovedHubSubTab('expense_approved');
                        handleNav('approved_menu', undefined, undefined, undefined, undefined, e);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'approved_menu' && approvedHubSubTab === 'expense_approved'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Approve Expense (Head Office & Branch Settlement Approvals)"
                    >
                      <Receipt className={`w-3.5 h-3.5 ${activeTab === 'approved_menu' && approvedHubSubTab === 'expense_approved' ? 'text-cyan-300' : 'text-rose-400'}`} />
                      <span>Approve Expense</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 1. SALES SECTION */}
        {(isMenuAllowed('bill') || isMenuAllowed('challan_menu') || isMenuAllowed('requisition') || isMenuAllowed('stored_bills') || isMenuAllowed('returns_menu')) && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('sales')}
              onClick={() => toggleSection('sales')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'builder' || activeTab === 'challan_menu' || activeTab === 'stored_bills' || activeTab === 'returns_menu' || activeTab === 'requisition' || activeTab === 'color_exchange'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FolderKanban className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                {!isCollapsed && <span>Sales</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.sales ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.sales) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                {isMenuAllowed('bill') && (
                  <div className="space-y-0.5">
                    {/* Sales Center Bill Entry (Renamed from Create New Bill) */}
                    <button
                      onClick={(e) => {
                        const isCtrl = Boolean(e && (e.ctrlKey || e.metaKey));
                        onNewBill(isCtrl, false);
                        setShowOnlinePopup(false);
                        if (setIsOpenMobile) setIsOpenMobile(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'builder' && !isOfficeBillActive
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Sales Center Bill Entry (Alt+N | Hold Ctrl for new tab)"
                    >
                      <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'builder' && !isOfficeBillActive ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <MnemonicLabel label="Sales Center Bill Entry" mnemonic="N" />
                    </button>

                    {/* Submenu under Showroom Bill Entry: Office bill Entry */}
                    <div className="ml-3 pl-2 border-l border-cyan-500/25 my-0.5">
                      <button
                        onClick={(e) => {
                          const isCtrl = Boolean(e && (e.ctrlKey || e.metaKey));
                          onNewBill(isCtrl, true);
                          setShowOnlinePopup(false);
                          if (setIsOpenMobile) setIsOpenMobile(false);
                        }}
                        className={`w-full flex items-center space-x-2 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer group ${
                          activeTab === 'builder' && isOfficeBillActive
                            ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                        }`}
                        title="Office bill Entry (Factory Direct Sales | Hold Ctrl for new tab)"
                      >
                        <Building2 className={`w-3 h-3 ${activeTab === 'builder' && isOfficeBillActive ? 'text-cyan-300' : 'text-amber-400'}`} />
                        <span>Office bill Entry</span>
                      </button>
                    </div>
                  </div>
                )}

                {isMenuAllowed('challan_menu') && (
                  <button
                    onClick={(e) => handleNav('challan_menu', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'challan_menu'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Delivery Challan (Alt+3 / Alt+D | Hold Ctrl for new tab)"
                  >
                    <div className="flex items-center space-x-2">
                      <Truck className={`w-3.5 h-3.5 ${activeTab === 'challan_menu' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <MnemonicLabel label="Challan" mnemonic="3" />
                    </div>
                    {challansCount !== undefined && challansCount > 0 && (
                      <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold font-mono">
                        {challansCount}
                      </span>
                    )}
                  </button>
                )}

                {isMenuAllowed('requisition') && (
                  <div className="space-y-0.5">
                    {!isFactoryRole && (
                      <button
                        onClick={(e) => {
                          if (setRequisitionSubTab) setRequisitionSubTab('entry_slip');
                          handleNav('requisition', undefined, undefined, undefined, undefined, e, 'entry_slip');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                          activeTab === 'requisition' && requisitionSubTab === 'entry_slip'
                            ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                        }`}
                        title="Requisition Entry (Alt+Q | Hold Ctrl for new tab)"
                      >
                        <div className="flex items-center space-x-2">
                          <FileText className={`w-3.5 h-3.5 ${activeTab === 'requisition' && requisitionSubTab === 'entry_slip' ? 'text-cyan-300' : 'text-blue-400'}`} />
                          <MnemonicLabel label="Requisition Entry" mnemonic="Q" />
                        </div>
                      </button>
                    )}

                    {!isFactoryRole && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          if (setRequisitionSubTab) setRequisitionSubTab('list');
                          handleNav('requisition', undefined, undefined, undefined, undefined, e, 'list');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                          activeTab === 'requisition' && requisitionSubTab === 'list'
                            ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                        }`}
                        title="Requisition History (Hold Ctrl for new tab)"
                      >
                        <div className="flex items-center space-x-2">
                          <History className={`w-3.5 h-3.5 ${activeTab === 'requisition' && requisitionSubTab === 'list' ? 'text-cyan-300' : 'text-indigo-400'}`} />
                          <span>Requisition History</span>
                        </div>
                        <span className="bg-cyan-500/20 text-cyan-200 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold font-mono border border-cyan-400/40">
                          {requisitionsCount}
                        </span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (setRequisitionSubTab) setRequisitionSubTab('approved_history');
                        handleNav('requisition', undefined, undefined, undefined, undefined, e, 'approved_history');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'requisition' && requisitionSubTab === 'approved_history'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Approved Requisitions (Factory Supply)"
                    >
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${activeTab === 'requisition' && requisitionSubTab === 'approved_history' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                        <span>Approved History</span>
                      </div>
                    </button>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (setRequisitionSubTab) setRequisitionSubTab('delivered');
                        handleNav('requisition', undefined, undefined, undefined, undefined, e, 'delivered');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'requisition' && requisitionSubTab === 'delivered'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Delivered Orders & Requisitions"
                    >
                      <div className="flex items-center space-x-2">
                        <Truck className={`w-3.5 h-3.5 ${activeTab === 'requisition' && requisitionSubTab === 'delivered' ? 'text-cyan-300' : 'text-blue-400'}`} />
                        <span>Delivered</span>
                      </div>
                    </button>
                  </div>
                )}

                {(canColorExchange && isMenuAllowed('color_exchange')) && (
                  <button
                    onClick={(e) => handleNav('color_exchange', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'color_exchange'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Color / Unit Exchange (Input vs Output) (Alt+E | Hold Ctrl for new tab)"
                  >
                    <div className="flex items-center space-x-2">
                      <RotateCcw className={`w-3.5 h-3.5 ${activeTab === 'color_exchange' ? 'text-cyan-300' : 'text-pink-400'}`} />
                      <MnemonicLabel label="Color Exchange" mnemonic="E" />
                    </div>
                  </button>
                )}

                {isMenuAllowed('stored_bills') && (
                  <button
                    onClick={(e) => handleNav('stored_bills', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'stored_bills'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Stored Bills (Alt+6 / Alt+S | Hold Ctrl for new tab)"
                  >
                    <div className="flex items-center space-x-2">
                      <Layers className={`w-3.5 h-3.5 ${activeTab === 'stored_bills' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <MnemonicLabel label="Stored Bills" mnemonic="S" />
                    </div>
                    <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold font-mono">
                      {storedBillsCount}
                    </span>
                  </button>
                )}

                {isMenuAllowed('returns_menu') && (
                  <button
                    onClick={(e) => handleNav('returns_menu', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'returns_menu'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Stock Returns (Alt+R | Hold Ctrl for new tab)"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${activeTab === 'returns_menu' ? 'text-cyan-300' : 'text-indigo-400'}`} />
                    <MnemonicLabel label="Returns" mnemonic="R" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. COLLECTION SECTION */}
        {isMenuAllowed('collection') && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('collection')}
              onClick={() => toggleSection('collection')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'collection_entry' ||
                activeTab === 'collection_list' ||
                activeTab === 'cash_in_hand' ||
                activeTab === 'cheque_in_hand' ||
                activeTab === 'deposit_history'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                {!isCollapsed && <span>Collection</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.collection ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.collection) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                <button
                  onClick={(e) => handleNav('collection_entry', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'collection_entry'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Party Collection Entry (Alt+C | Hold Ctrl for new tab)"
                >
                  <Plus className={`w-3.5 h-3.5 ${activeTab === 'collection_entry' ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <MnemonicLabel label="Party Collection Entry" mnemonic="C" />
                </button>

                <button
                  onClick={(e) => handleNav('collection_list', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'collection_list'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Collection List (Alt+L | Hold Ctrl for new tab)"
                >
                  <ListOrdered className={`w-3.5 h-3.5 ${activeTab === 'collection_list' ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <MnemonicLabel label="Collection List" mnemonic="L" />
                </button>

                <button
                  onClick={(e) => handleNav('cash_in_hand', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'cash_in_hand'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Cash In Hand (Alt+0 / Alt+H | Hold Ctrl for new tab)"
                >
                  <Banknote className={`w-3.5 h-3.5 ${activeTab === 'cash_in_hand' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                  <MnemonicLabel label="Cash In Hand" mnemonic="H" />
                </button>

                <button
                  onClick={(e) => handleNav('cheque_in_hand', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'cheque_in_hand'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Cheque In Hand (Alt+Q | Hold Ctrl for new tab)"
                >
                  <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'cheque_in_hand' ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <MnemonicLabel label="Cheque In Hand" mnemonic="q" />
                </button>

                <button
                  onClick={(e) => handleNav('deposit_history', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'deposit_history'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Deposit History (Alt+D | Hold Ctrl for new tab)"
                >
                  <Landmark className={`w-3.5 h-3.5 ${activeTab === 'deposit_history' ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <MnemonicLabel label="Deposit History" mnemonic="D" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. ITEM LIST SECTION */}
        {(isSuperAdmin || isAdmin || isMenuAllowed('item_directory')) && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('itemList')}
              onClick={() => toggleSection('itemList')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'item_directory' || activeTab === 'price_history'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {!isCollapsed && <span>Item Directory</span>}
              </div>
              {!isCollapsed && (
                <div className="flex items-center space-x-1">
                  <span className="bg-cyan-500/20 text-cyan-200 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border border-cyan-400/40">
                    {itemCount}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      expandedSections.itemList ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                    }`}
                  />
                </div>
              )}
            </button>

            {(!isCollapsed && expandedSections.itemList) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                <button
                  onClick={(e) => handleNav('item_directory', 'items_list', undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'item_directory' && (itemSubTab === 'items_list' || !itemSubTab)
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Master Item Directory (Alt+4 / Alt+M | Hold Ctrl for new tab)"
                >
                  <Database className={`w-3.5 h-3.5 ${activeTab === 'item_directory' && (itemSubTab === 'items_list' || !itemSubTab) ? 'text-cyan-300' : 'text-emerald-400'}`} />
                  <MnemonicLabel label="Master Item Directory" mnemonic="M" />
                  {!isAdmin && !isSuperAdmin && (
                    <span className="text-[9px] bg-white/[0.07] border border-cyan-400/30 text-slate-300 px-1 py-0.2 rounded font-mono">Read Only</span>
                  )}
                </button>

                {(isSuperAdmin || isAdmin) && (
                  <button
                    onClick={(e) => handleNav('item_directory', 'special_items', undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'item_directory' && itemSubTab === 'special_items'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Special Item List (Alt+P | Hold Ctrl for new tab)"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'item_directory' && itemSubTab === 'special_items' ? 'text-cyan-300' : 'text-amber-400'}`} />
                    <MnemonicLabel label="Special Item List" mnemonic="p" />
                  </button>
                )}

                {isSuperAdmin && (
                  <button
                    onClick={(e) => handleNav('item_directory', 'categories', undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'item_directory' && itemSubTab === 'categories'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Category List (Alt+A | Hold Ctrl for new tab)"
                  >
                    <Tag className={`w-3.5 h-3.5 ${activeTab === 'item_directory' && itemSubTab === 'categories' ? 'text-cyan-300' : 'text-amber-400'}`} />
                    <MnemonicLabel label="Category List" mnemonic="a" />
                  </button>
                )}

                {(isSuperAdmin || isAdmin) && (
                  <button
                    onClick={(e) => handleNav('price_history', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'price_history'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Price Update History (Alt+H | Hold Ctrl for new tab)"
                  >
                    <History className={`w-3.5 h-3.5 ${activeTab === 'price_history' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                    <MnemonicLabel label="Price Update History" mnemonic="h" />
                  </button>
                )}

                {canAccessImportFactory && (
                  <button
                    onClick={(e) => handleNav('item_directory', 'import_history', undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'item_directory' && itemSubTab === 'import_history'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Import from Factory List (Alt+F | Hold Ctrl for new tab)"
                  >
                    <History className={`w-3.5 h-3.5 ${activeTab === 'item_directory' && itemSubTab === 'import_history' ? 'text-cyan-300' : 'text-purple-400'}`} />
                    <MnemonicLabel label="Import from Factory List" mnemonic="F" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. CUSTOMER SECTION */}
        {(isMenuAllowed('party_directory') || isMenuAllowed('customer_ledger')) && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('customerDirectory')}
              onClick={() => toggleSection('customerDirectory')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'party_directory' || activeTab === 'customer_ledger'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {!isCollapsed && <span>Customer</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.customerDirectory ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.customerDirectory) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                {isMenuAllowed('party_directory') && (
                  <button
                    onClick={(e) => handleNav('party_directory', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'party_directory'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Customer Directory (Alt+5 / Alt+U | Hold Ctrl for new tab)"
                  >
                    <Building2 className={`w-3.5 h-3.5 ${activeTab === 'party_directory' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                    <MnemonicLabel label="Customer Directory" mnemonic="u" />
                  </button>
                )}

                {isMenuAllowed('customer_ledger') && (
                  <button
                    onClick={(e) => handleNav('customer_ledger', undefined, 'customer_wise_sales_collection', undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'customer_ledger'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Customer Ledger Statement (Alt+8 / Alt+A | Hold Ctrl for new tab)"
                  >
                    <FileText className={`w-3.5 h-3.5 ${activeTab === 'customer_ledger' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                    <MnemonicLabel label="Statement" mnemonic="a" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. USER & SHOWROOM DIRECTORY SECTION (Admin and Super Admin only) */}
        {(isSuperAdmin || isAdmin) && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('salespersonDirectory')}
              onClick={() => toggleSection('salespersonDirectory')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'salesperson_directory'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                {!isCollapsed && <span>User & Sales Centers</span>}
              </div>
              {!isCollapsed && (
                <div className="flex items-center space-x-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      expandedSections.salespersonDirectory ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                    }`}
                  />
                </div>
              )}
            </button>

            {(!isCollapsed && expandedSections.salespersonDirectory) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                <button
                  onClick={(e) => handleNav('salesperson_directory', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'salesperson_directory'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Sales Center & User List Directory (Alt+U | Hold Ctrl for new tab)"
                >
                  <Building2 className={`w-3.5 h-3.5 ${activeTab === 'salesperson_directory' ? 'text-cyan-300' : 'text-amber-400'}`} />
                  <MnemonicLabel label="Sales Center & User List" mnemonic="U" />
                  <Lock className="w-3 h-3 text-amber-400 ml-auto" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 6. EXPENSE SECTION */}
        {isMenuAllowed('expense') && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('expenseDirectory')}
              onClick={() => toggleSection('expenseDirectory')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'expense_directory' || activeTab === 'expense_entry' || activeTab === 'conveyance'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-purple-400 flex-shrink-0" />
                {!isCollapsed && <span>Expense</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.expenseDirectory ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.expenseDirectory) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                <button
                  onClick={(e) => handleNav('expense_directory', undefined, undefined, 'list', undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'expense_directory' && (expenseSubTab === 'list' || !expenseSubTab)
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Expense Entry & Log (Alt+E | Hold Ctrl for new tab)"
                >
                  <Wallet className={`w-3.5 h-3.5 ${activeTab === 'expense_directory' && (expenseSubTab === 'list' || !expenseSubTab) ? 'text-cyan-300' : 'text-indigo-400'}`} />
                  <MnemonicLabel label="Expense Entry & Log" mnemonic="E" />
                </button>

                <button
                  onClick={(e) => handleNav('expense_directory', undefined, undefined, 'expense_amount', undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'expense_directory' && (expenseSubTab === 'expense_amount' || expenseSubTab === 'monthly_expense')
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Monthly Expense (Alt+M | Hold Ctrl for new tab)"
                >
                  <Calendar className={`w-3.5 h-3.5 ${activeTab === 'expense_directory' && (expenseSubTab === 'expense_amount' || expenseSubTab === 'monthly_expense') ? 'text-cyan-300' : 'text-rose-400'}`} />
                  <MnemonicLabel label="Monthly Expense" mnemonic="M" />
                </button>

                <button
                  onClick={(e) => handleNav('expense_entry', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'expense_entry'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Quick Expense Entry (Alt+Q | Hold Ctrl for new tab)"
                >
                  <Plus className={`w-3.5 h-3.5 ${activeTab === 'expense_entry' ? 'text-cyan-300' : 'text-amber-400'}`} />
                  <MnemonicLabel label="Quick Expense Entry" mnemonic="Q" />
                </button>

                <button
                  onClick={(e) => handleNav('conveyance', undefined, undefined, 'conveyance', undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'conveyance' || (activeTab === 'expense_directory' && expenseSubTab === 'conveyance')
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Conveyance & Daily Allowance Bill (Alt+C | Hold Ctrl for new tab)"
                >
                  <Car className={`w-3.5 h-3.5 ${activeTab === 'conveyance' || (activeTab === 'expense_directory' && expenseSubTab === 'conveyance') ? 'text-cyan-300' : 'text-indigo-400'}`} />
                  <MnemonicLabel label="Conveyance" mnemonic="C" />
                </button>

                <button
                  onClick={(e) => handleNav('expense_directory', undefined, undefined, 'report', undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'expense_directory' && expenseSubTab === 'report'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Expense Report (Alt+R | Hold Ctrl for new tab)"
                >
                  <FileText className={`w-3.5 h-3.5 ${activeTab === 'expense_directory' && expenseSubTab === 'report' ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <MnemonicLabel label="Expense Report" mnemonic="R" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* FACTORY SECTION (Placed strictly in the middle of Expense and Report) */}
        {isMenuAllowed('factory') && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('factory')}
              onClick={() => toggleSection('factory')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'factory'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Factory className="w-4 h-4 text-amber-400 flex-shrink-0" />
                {!isCollapsed && <span>Factory</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.factory ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.factory) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                <button
                  onClick={(e) => {
                    if (setRequisitionSubTab) setRequisitionSubTab('approved_history');
                    if (setFactorySubTab) setFactorySubTab('approved_history');
                    handleNav(isFactoryRole ? 'factory' : 'requisition', undefined, undefined, undefined, undefined, e, 'approved_history');
                    if (setIsOpenMobile) setIsOpenMobile(false);
                  }}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    (activeTab === 'requisition' && requisitionSubTab === 'approved_history') || (activeTab === 'factory' && factorySubTab === 'approved_history')
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Approved Requisitions (Factory Supply)"
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${(activeTab === 'requisition' && requisitionSubTab === 'approved_history') || (activeTab === 'factory' && factorySubTab === 'approved_history') ? 'text-cyan-300' : 'text-emerald-400'}`} />
                  <span>Approved History</span>
                </button>

                <button
                  onClick={(e) => {
                    if (setRequisitionSubTab) setRequisitionSubTab('delivered');
                    if (setFactorySubTab) setFactorySubTab('delivered');
                    handleNav(isFactoryRole ? 'factory' : 'requisition', undefined, undefined, undefined, undefined, e, 'delivered');
                    if (setIsOpenMobile) setIsOpenMobile(false);
                  }}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    (activeTab === 'requisition' && requisitionSubTab === 'delivered') || (activeTab === 'factory' && factorySubTab === 'delivered')
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Delivered Orders & Office Bills"
                >
                  <Truck className={`w-3.5 h-3.5 ${(activeTab === 'requisition' && requisitionSubTab === 'delivered') || (activeTab === 'factory' && factorySubTab === 'delivered') ? 'text-cyan-300' : 'text-blue-400'}`} />
                  <span>Delivered</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 7. REPORT SECTION */}
        {(isMenuAllowed('report') || isMenuAllowed('sales_report') || isMenuAllowed('admin_sales_collection_report')) && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('report')}
              onClick={() => toggleSection('report')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'report_dashboard' || activeTab === 'sales_report' || activeTab === 'sales_items' || activeTab === 'ai_sales_forecast'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <PieChart className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                {!isCollapsed && <span>Report</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.report ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.report) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                {isMenuAllowed('report') && (
                  <>
                    <button
                      onClick={(e) => handleNav('report_dashboard', undefined, 'customer_wise_sales_collection', undefined, undefined, e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'report_dashboard' && reportSubTab === 'customer_wise_sales_collection'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Customer Sales & Collection Report (Alt+1 / Alt+S | Hold Ctrl for new tab)"
                    >
                      <PieChart className={`w-3.5 h-3.5 ${activeTab === 'report_dashboard' && reportSubTab === 'customer_wise_sales_collection' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <MnemonicLabel label="Customer Sales & Collection" mnemonic="S" />
                    </button>

                    <button
                      onClick={(e) => handleNav('report_dashboard', undefined, 'office_report', undefined, undefined, e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'report_dashboard' && reportSubTab === 'office_report'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Office Statement (This Month Sales & Collection + Auto Cash Deposit to H/O) (Alt+O | Hold Ctrl for new tab)"
                    >
                      <Building2 className={`w-3.5 h-3.5 ${activeTab === 'report_dashboard' && reportSubTab === 'office_report' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <MnemonicLabel label="Office Statement" mnemonic="O" />
                    </button>

                    <button
                      onClick={(e) => handleNav('report_dashboard', undefined, 'party_bank_details', undefined, undefined, e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'report_dashboard' && reportSubTab === 'party_bank_details'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Party-Wise Bank Details (Alt+P | Hold Ctrl for new tab)"
                    >
                      <FileText className={`w-3.5 h-3.5 ${activeTab === 'report_dashboard' && reportSubTab === 'party_bank_details' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <MnemonicLabel label="Party-Wise Bank Details" mnemonic="P" />
                    </button>

                    <button
                      onClick={(e) => handleNav('report_dashboard', undefined, 'special_bank_cash', undefined, undefined, e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'report_dashboard' && reportSubTab === 'special_bank_cash'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Bank & Cash Summary (Alt+B | Hold Ctrl for new tab)"
                    >
                      <DollarSign className={`w-3.5 h-3.5 ${activeTab === 'report_dashboard' && reportSubTab === 'special_bank_cash' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <MnemonicLabel label="Bank & Cash Summary" mnemonic="B" />
                    </button>

                    <button
                      onClick={(e) => handleNav('report_dashboard', undefined, 'bill_wise_sales', undefined, undefined, e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'report_dashboard' && reportSubTab === 'bill_wise_sales'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Bill-Wise Invoices (Alt+W | Hold Ctrl for new tab)"
                    >
                      <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'report_dashboard' && reportSubTab === 'bill_wise_sales' ? 'text-cyan-300' : 'text-purple-400'}`} />
                      <MnemonicLabel label="Bill-Wise Invoices" mnemonic="W" />
                    </button>
                  </>
                )}

                {isMenuAllowed('sales_report') && (
                  <button
                    onClick={(e) => handleNav('sales_report', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'sales_report'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Stock Report (Alt+7 / Alt+K | Hold Ctrl for new tab)"
                  >
                    <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'sales_report' ? 'text-cyan-300' : 'text-blue-400'}`} />
                    <MnemonicLabel label="Stock Report" mnemonic="K" />
                  </button>
                )}

                {(isMenuAllowed('sales_report') || isMenuAllowed('sales_items')) && (
                  <button
                    onClick={(e) => handleNav('sales_items', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'sales_items'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="Sales Items (Only Sold Items Report | Office & Sales Center Wise) (Hold Ctrl for new tab)"
                  >
                    <PackageCheck className={`w-3.5 h-3.5 ${activeTab === 'sales_items' ? 'text-cyan-300' : 'text-rose-400'}`} />
                    <MnemonicLabel label="Sales Items" mnemonic="I" />
                  </button>
                )}

                {inCharge && isMenuAllowed('ai_sales_forecast') && (
                  <button
                    onClick={(e) => handleNav('ai_sales_forecast', undefined, undefined, undefined, undefined, e)}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                      activeTab === 'ai_sales_forecast'
                        ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                    }`}
                    title="AI Sales & Demand Forecasting Intelligence (Sales Center In-Charge Only | Hold Ctrl for new tab)"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'ai_sales_forecast' ? 'text-cyan-300' : 'text-purple-400'}`} />
                    <MnemonicLabel label="AI Demand Forecast" mnemonic="A" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 8. SETTINGS & TRASH SECTION (Super Admin full settings; Admin & Super Admin get Lunch & Hotel Bill Setting) */}
        {(isSuperAdmin || isAdmin || isAnyAdmin(currentUser)) && isMenuAllowed('settings') && (
          <div>
            <button
              onMouseEnter={() => preloadSectionModules('settings')}
              onClick={() => toggleSection('settings')}
              className={`w-full flex items-center justify-between p-2 rounded-lg font-extrabold uppercase text-[11px] tracking-wider transition-all ${
                activeTab === 'settings' || activeTab === 'trash_bin'
                  ? 'text-cyan-200 bg-cyan-500/15 border border-cyan-400/45 shadow-[0_0_12px_rgba(34,211,238,0.18)]'
                  : 'text-slate-400 hover:text-cyan-200 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4 text-amber-400 flex-shrink-0" />
                {!isCollapsed && <span>Settings Directory</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expandedSections.settings !== false ? 'rotate-180 text-cyan-300' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {(!isCollapsed && expandedSections.settings !== false) && (
              <div className="ml-3 pl-2 border-l border-cyan-500/25 mt-1 space-y-1">
                {/* Lunch & Hotel Bill Setting — Strictly for Admin & Super Admin */}
                <button
                  onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'allowance_settings', e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'settings' && settingsSubTab === 'allowance_settings'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="Designation-wise Lunch Bill & Hotel Bill Setting (Admin & Super Admin Only)"
                >
                  <Car className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'allowance_settings' ? 'text-cyan-300' : 'text-amber-400'}`} />
                  <span>Lunch &amp; Hotel Bill Setting</span>
                </button>

                {isSuperAdmin && (
                  <>
                    <button
                      onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'backup', e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'settings' && settingsSubTab === 'backup'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Backup & Restore System (Alt+9 / Alt+B | Hold Ctrl for new tab)"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'backup' ? 'text-cyan-300' : 'text-amber-400'}`} />
                      <MnemonicLabel label="Backup & Restore" mnemonic="B" />
                    </button>

                    <button
                      onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'system', e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'settings' && settingsSubTab === 'system'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="System Data Summary (Alt+S | Hold Ctrl for new tab)"
                    >
                      <HardDrive className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'system' ? 'text-cyan-300' : 'text-blue-400'}`} />
                      <MnemonicLabel label="System Summary" mnemonic="S" />
                    </button>

                    <button
                      onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'banks_accounts', e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'settings' && settingsSubTab === 'banks_accounts'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Bank & Accounts Directory (Hold Ctrl for new tab)"
                    >
                      <Landmark className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'banks_accounts' ? 'text-cyan-300' : 'text-indigo-400'}`} />
                      <MnemonicLabel label="Bank & Accounts" mnemonic="A" />
                    </button>

                    <button
                      onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'email_smtp', e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'settings' && settingsSubTab === 'email_smtp'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Email & SMTP Dispatch Settings (Hold Ctrl for new tab)"
                    >
                      <Mail className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'email_smtp' ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <MnemonicLabel label="Email & SMTP" mnemonic="M" />
                    </button>

                    <button
                      onClick={(e) => handleNav('settings', undefined, undefined, undefined, 'user_roles_menus', e)}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                        activeTab === 'settings' && settingsSubTab === 'user_roles_menus'
                          ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                      }`}
                      title="Super Admin Only: User Roles & Menu Permissions"
                    >
                      <ShieldCheck className={`w-3.5 h-3.5 ${activeTab === 'settings' && settingsSubTab === 'user_roles_menus' ? 'text-cyan-300' : 'text-purple-400'}`} />
                      <MnemonicLabel label="User Roles & Menus" mnemonic="U" />
                    </button>
                  </>
                )}

                <button
                  onClick={(e) => handleNav('trash_bin', undefined, undefined, undefined, undefined, e)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group ${
                    activeTab === 'trash_bin'
                      ? 'bg-cyan-500/[0.16] text-cyan-100 border border-cyan-400/75 shadow-[0_0_16px_rgba(34,211,238,0.30)] font-black'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200 font-semibold border border-transparent'
                  }`}
                  title="System Trash & Recycle Bin (Alt+T | Hold Ctrl for new tab)"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${activeTab === 'trash_bin' ? 'text-cyan-300' : 'text-rose-400'}`} />
                  <MnemonicLabel label="Trash" mnemonic="T" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Online Active Staff Presence Footer & Expandable Popover */}
      <div ref={onlinePopupRef} className="p-2 border-t border-white/[0.08] bg-white/[0.03] relative select-none">
        {!isCollapsed ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowOnlinePopup(!showOnlinePopup)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.12] hover:bg-white/[0.09] transition-all text-xs text-cyan-200 cursor-pointer backdrop-blur-md"
              title="Click to view online active users"
            >
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-[11px] text-emerald-300">
                  {onlineUsers.length > 0 ? `${onlineUsers.length} Online Staff` : '1 Online Staff'}
                </span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-400/40 font-semibold">
                {showOnlinePopup ? 'Close' : 'View'}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowOnlinePopup(!showOnlinePopup)}
              className="relative p-2 rounded-lg bg-white/[0.05] border border-white/[0.12] text-emerald-400 hover:bg-white/[0.09] transition-all cursor-pointer backdrop-blur-md"
              title={`${onlineUsers.length || 1} staff active online - Click to view`}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="absolute -top-1 -right-1 bg-emerald-600 text-[9px] font-black text-white rounded-full w-4 h-4 flex items-center justify-center">
                {onlineUsers.length || 1}
              </span>
            </button>
          </div>
        )}

        {/* Online Users Popover List */}
        {showOnlinePopup && (
          <div className={`absolute bottom-full mb-2 ${isCollapsed ? 'left-14 w-64 max-w-[calc(100vw-4rem)]' : 'left-2 right-2'} bg-[#091e2c]/95 backdrop-blur-xl border border-cyan-400/35 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150`}>
            <div className="flex items-center justify-between pb-2 border-b border-cyan-500/25 mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold text-white">Active Online Staff</span>
                <span className="text-[10px] bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-1.5 py-0.2 rounded-full font-bold">
                  {onlineUsers.length || 1}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowOnlinePopup(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar text-xs">
              {(onlineUsers.length > 0 ? onlineUsers : [
                {
                  userId: currentUser?.id || 'current',
                  username: currentUser?.username || 'You',
                  name: currentUser?.name || currentUser?.username || 'You',
                  role: currentUser?.role || 'Staff',
                  branchName: currentUser?.branchName || 'Main Branch',
                  lastSeen: Date.now()
                }
              ]).map((u, i) => (
                <div key={`${u.userId}-${i}`} className="flex items-center justify-between p-1.5 rounded-lg bg-[#0c2536]/85 border border-cyan-500/25">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 font-bold flex items-center justify-center text-[10px] shrink-0 uppercase">
                      {(u.name || u.username || 'U').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100 truncate">{u.name || u.username}</div>
                      <div className="text-[10px] text-cyan-200/70 truncate">
                        {u.branchName ? u.branchName.replace(' Showroom', '').replace(' Sales Center', '') : u.role}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.5 rounded shrink-0 font-medium">
                    online
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
