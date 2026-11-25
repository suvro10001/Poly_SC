import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ViewTab, AuthUser, CompanyDetails, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import { MnemonicLabel } from './MnemonicLabel';
import { isSuperAdminOrAgm, isStrictSuperAdmin, isInCharge, isAccountsOrStaff, isFactoryUser, isAnyAdmin, isSuvroAdmin, cleanBranchName, getAdminBranches } from '../utils/branchAccess';
import { PolyCablesLogo } from './PolyCablesLogo';
import { FirestoreUsageCard } from './FirestoreUsageCard';
import { FileSpreadsheet, Database, Building2, Layers, BarChart3, Plus, Users, RotateCcw, Trash2, Wallet, FolderKanban, ChevronDown, DollarSign, BookOpen, Menu, LogOut, User, Sparkles, Truck, TrendingUp, LayoutDashboard, Crown } from 'lucide-react';

interface NavbarProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab, forceNewTab?: boolean) => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  onSaveCurrentBill: () => void;
  onNewBill: (forceNewTab?: boolean) => void;
  itemCount: number;
  storedBillsCount: number;
  challansCount?: number;
  onToggleMobileSidebar?: () => void;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  onLogout?: () => void;
  onOpenShortcuts?: () => void;
  company?: CompanyDetails;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onExportExcel,
  onPrint,
  onSaveCurrentBill,
  onNewBill,
  itemCount,
  storedBillsCount,
  challansCount = 0,
  onToggleMobileSidebar,
  currentUser,
  branches,
  onLogout,
  onOpenShortcuts,
  company
}) => {
  const [isSalesOpen, setIsSalesOpen] = useState(false);
  const [showMobileQuickMenu, setShowMobileQuickMenu] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const salesRef = useRef<HTMLDivElement>(null);
  const onlinePopoverRef = useRef<HTMLDivElement>(null);
  const mobileQuickMenuRef = useRef<HTMLDivElement>(null);

  const isAdminOnlyUser = Boolean(currentUser && isAnyAdmin(currentUser) && !isStrictSuperAdmin(currentUser));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  const adminSalesCenterCount = useMemo(() => {
    let list = branches && branches.length > 0 ? branches : defaultBranches;
    try {
      const saved = localStorage.getItem('polycables_branches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      }
    } catch {}

    if (!currentUser || isStrictSuperAdmin(currentUser) || currentUser.isSuperAdmin || currentUser.username?.toLowerCase() === 'suvroadmin') {
      return list.length;
    }

    let salespersonsList: any[] = [];
    try {
      const savedSp = localStorage.getItem('polycables_salespersons');
      if (savedSp) {
        const parsedSp = JSON.parse(savedSp);
        if (Array.isArray(parsedSp)) salespersonsList = parsedSp;
      }
    } catch {}

    const assigned = getAdminBranches(currentUser, list, salespersonsList);
    if (assigned.length > 0) return assigned.length;
    if (!currentUser.branchName || currentUser.branchName === 'all') return list.length;
    return 1;
  }, [currentUser, branches]);

  const [showOnlinePopover, setShowOnlinePopover] = useState(false);

  const closeAllNavbarMenus = () => {
    setIsSalesOpen(false);
    setShowOnlinePopover(false);
    setShowMobileQuickMenu(false);
  };

  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (salesRef.current && !salesRef.current.contains(target)) {
        setIsSalesOpen(false);
      }
      if (onlinePopoverRef.current && !onlinePopoverRef.current.contains(target)) {
        setShowOnlinePopover(false);
      }
      if (mobileQuickMenuRef.current && !mobileQuickMenuRef.current.contains(target)) {
        setShowMobileQuickMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAllNavbarMenus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const isSalesActive = activeTab === 'builder' || activeTab === 'challan_menu' || activeTab === 'stored_bills' || activeTab === 'returns_menu';
  const companyDisplayName = (company?.name || 'POLY CABLES').replace(/\s*(?:ind\.?\s*ltd\.?|industries\s*ltd\.?)\s*/gi, '').trim() || 'POLY CABLES';

  const isSuperAdmin = isSuperAdminOrAgm(currentUser);
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin' || (currentUser?.userRole || '').toLowerCase().includes('admin');
  const inCharge = isInCharge(currentUser);
  const isStaffOrAccounts = isAccountsOrStaff(currentUser) || Boolean(
    currentUser?.role === 'accounts' ||
    currentUser?.role === 'staff' ||
    (currentUser?.userRole || '').toLowerCase().includes('account') ||
    (currentUser?.userRole || '').toLowerCase().includes('staff')
  );
  const isInChargeOrStaff = inCharge || isStaffOrAccounts;
  const isMarketingOfficer = !isAdmin && !isInChargeOrStaff;

  // Live Online Users State for Admin / Super Admin
  const [onlineUsers, setOnlineUsers] = useState<Array<{
    userId: string;
    username: string;
    name?: string;
    role?: string;
    branchName?: string;
    lastSeen: number;
  }>>([]);

  // Send heartbeat and fetch online users periodically (shared with Sidebar via custom event)
  useEffect(() => {
    let isMounted = true;
    const sendHeartbeat = async () => {
      try {
        const payload = {
          userId: currentUser?.id || currentUser?.username || 'user-' + (currentUser?.name || 'guest'),
          username: currentUser?.username || currentUser?.name || 'guest',
          name: currentUser?.name || currentUser?.username || 'Anonymous',
          role: currentUser?.role || currentUser?.userRole || 'User',
          branchName: currentUser?.branchName || ''
        };
        const res = await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.users)) {
            setOnlineUsers(data.users);
            try {
              window.dispatchEvent(new CustomEvent('polycables_presence_updated', { detail: data.users }));
            } catch {}
          }
        }
      } catch {}
    };

    const bootTimer = setTimeout(sendHeartbeat, 600);
    const interval = setInterval(sendHeartbeat, 25000);
    return () => {
      isMounted = false;
      clearTimeout(bootTimer);
      clearInterval(interval);
    };
  }, [currentUser]);

  const isExecutiveAdmin = Boolean(isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser));

  return (
    <header className="bg-[#081a24]/88 md:bg-[#081a24]/56 backdrop-blur-2xl text-white shadow-[0_8px_32px_rgba(0,0,0,0.32)] border-b border-white/[0.13] fixed top-0 left-0 right-0 z-50 md:sticky md:top-0 no-print py-1.5 sm:py-2">
      <div className="w-full px-2.5 sm:px-5 lg:px-6">
        {/* Compact Single-Row Mobile Navbar (< md) - Always Fixed on Top */}
        <div className="flex md:hidden items-center justify-between gap-2 min-h-[40px]">
          <div className="flex items-center gap-2 min-w-0">
            {onToggleMobileSidebar && (
              <button
                type="button"
                onClick={() => {
                  closeAllNavbarMenus();
                  onToggleMobileSidebar();
                }}
                className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-cyan-300 border border-white/[0.14] backdrop-blur-md cursor-pointer shrink-0 active:scale-95"
                title="Open Navigation Menu"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                closeAllNavbarMenus();
                if (isFactoryUser(currentUser)) {
                  setActiveTab('factory');
                } else if (isExecutiveAdmin) {
                  setActiveTab('admin_sales_collection_report');
                } else {
                  setActiveTab('main_menu');
                }
              }}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-90 min-w-0"
              title="Poly Cables - Dashboard"
            >
              <PolyCablesLogo size="sm" variant="dark" showSubtitle={false} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {(isAnyAdmin(currentUser) || isStrictSuperAdmin(currentUser)) && (
              <div className="relative" ref={onlinePopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileQuickMenu(false);
                    setShowOnlinePopover((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-[#0c2333]/90 text-emerald-300 border border-emerald-500/50 cursor-pointer"
                  title="Online Users"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-mono font-black text-white text-xs">{onlineUsers.length || 1}</span>
                </button>

                {showOnlinePopover && (
                  <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-[#091a27]/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl shadow-2xl p-3 z-50 text-xs">
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2 font-bold text-white">
                      <span className="flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Online Users ({onlineUsers.length || 1})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowOnlinePopover(false)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(onlineUsers.length > 0 ? onlineUsers : [
                        {
                          userId: currentUser?.id || '1',
                          username: currentUser?.username || 'admin',
                          name: currentUser?.name || 'Administrator',
                          role: currentUser?.role || 'Admin',
                          branchName: currentUser?.branchName || 'Madhupur',
                          lastSeen: Date.now()
                        }
                      ]).map((u, i) => (
                        <div key={u.userId || i} className="flex items-center justify-between bg-[#0e2434] px-2 py-1.5 rounded-lg border border-cyan-900/60">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            <span className="font-bold text-slate-200 truncate">{u.name || u.username}</span>
                          </div>
                          {u.branchName && (
                            <span className="text-[10px] text-amber-300 font-medium px-1.5 py-0.2 bg-[#122e42] border border-cyan-900/80 rounded shrink-0">
                              {u.branchName.replace(' Showroom', '').replace(' Sales Center', '')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isStrictSuperAdmin(currentUser) && isMobileViewport && <FirestoreUsageCard compact />}

            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  closeAllNavbarMenus();
                  onLogout();
                }}
                className="p-1.5 bg-[#0e2434] hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 rounded-lg border border-cyan-900/60 transition-colors cursor-pointer"
                title="Sign Out / Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop Header (md+): Clean Brand Bar without Top Button Clutter */}
        <div className="hidden md:flex items-center justify-between gap-3">
          {/* Left: Live Online Users Indicator */}
          <div className="flex items-center gap-2 min-w-[120px]">
            {(isAnyAdmin(currentUser) || isStrictSuperAdmin(currentUser)) && (
              <div className="relative" ref={onlinePopoverRef}>
                <button
                  type="button"
                  onClick={() => setShowOnlinePopover(!showOnlinePopover)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer bg-[#0a2333]/65 backdrop-blur-xl hover:bg-emerald-500/22 text-emerald-200 border border-emerald-400/50 shadow-[0_0_14px_rgba(16,185,129,0.20)]"
                  title="Active users currently online (Admin view)"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-mono font-black text-white text-xs">{onlineUsers.length || 1}</span>
                  <span className="text-[11px] font-semibold text-emerald-200">Online</span>
                </button>

                {showOnlinePopover && (
                  <div className="absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-[#091a27]/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl shadow-2xl p-3 z-50 text-xs">
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-2 font-bold text-white">
                      <span className="flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Online Users ({onlineUsers.length || 1})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowOnlinePopover(false)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(onlineUsers.length > 0 ? onlineUsers : [
                        {
                          userId: currentUser?.id || '1',
                          username: currentUser?.username || 'admin',
                          name: currentUser?.name || 'Administrator',
                          role: currentUser?.role || 'Admin',
                          branchName: currentUser?.branchName || 'Madhupur',
                          lastSeen: Date.now()
                        }
                      ]).map((u, i) => (
                        <div key={u.userId || i} className="flex items-center justify-between bg-[#0e2434] px-2 py-1.5 rounded-lg border border-cyan-900/60">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            <span className="font-bold text-slate-200 truncate">{u.name || u.username}</span>
                          </div>
                          {u.branchName && (
                            <span className="text-[10px] text-amber-300 font-medium px-1.5 py-0.2 bg-[#122e42] border border-cyan-900/80 rounded shrink-0">
                              {u.branchName.replace(' Showroom', '').replace(' Sales Center', '')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center: Poly Cables Logo */}
          <button
            type="button"
            onClick={() => {
              closeAllNavbarMenus();
              if (isFactoryUser(currentUser)) {
                setActiveTab('factory');
              } else if (isExecutiveAdmin) {
                setActiveTab('admin_sales_collection_report');
              } else {
                setActiveTab('main_menu');
              }
            }}
            className="flex items-center justify-center space-x-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            title="Poly Cables - Dashboard"
          >
            <PolyCablesLogo
              size="md"
              variant="dark"
              showSubtitle={true}
              subtitleText="STORE & BILLING"
            />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/45 shadow-[0_0_10px_rgba(16,185,129,0.22)]">
              Active
            </span>
          </button>

          {/* Right: Sales Center Indicator & Logout */}
          <div className="flex items-center justify-end gap-2 min-w-[120px]">
            {currentUser && (
              <span className="hidden lg:inline-flex items-center space-x-1.5 px-3 py-1 bg-[#0a2333]/65 text-cyan-200 font-bold rounded-full text-xs border border-white/[0.12] select-none">
                <Building2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="max-w-[140px] truncate">
                  {isStrictSuperAdmin(currentUser)
                    ? 'Super Admin'
                    : isAdminOnlyUser
                      ? `${adminSalesCenterCount} Center${adminSalesCenterCount === 1 ? '' : 's'}`
                      : (currentUser.branchName || 'Sales Center').replace(' Showroom', '').replace(' Sales Center', '')}
                </span>
              </span>
            )}
            {isStrictSuperAdmin(currentUser) && !isMobileViewport && <FirestoreUsageCard compact />}
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  closeAllNavbarMenus();
                  onLogout();
                }}
                className="p-2 bg-[#0a2333]/65 hover:bg-rose-500/25 backdrop-blur-xl text-slate-300 hover:text-rose-200 rounded-full border border-white/[0.16] hover:border-rose-400/55 transition-colors cursor-pointer shadow-xs"
                title="Sign Out / Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
