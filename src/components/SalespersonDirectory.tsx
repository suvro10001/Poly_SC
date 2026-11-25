import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Salesperson, Party, BranchLocation, BranchType, AuthUser, USER_DESIGNATIONS } from '../types';
import { isAccountsOrStaff, isMarketingOfficer, isAdminSalesperson, cleanBranchName, getAllAdmins, AdminClusterInfo, isStrictSuperAdmin, filterBranchesForUser, getAdminBranches, isDefaultAdmin, isProtectedSalesCenter, formatSalesCenterDisplayName, isUnwantedSalesCenter, isSuvroAdmin } from '../utils/branchAccess';
import { moveToTrash } from '../utils/trashHelper';
import {
  UserCheck,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ArrowLeft,
  Search,
  Phone,
  MapPin,
  Mail,
  Building2,
  Users,
  Lock,
  Unlock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Network,
  Crown,
  FolderTree,
  Sparkles,
  GitMerge,
  Filter,
  UserPlus,
  Settings,
  List,
  LayoutGrid,
  FileText,
  ClipboardList,
  Repeat,
  PlusCircle,
  Boxes,
  RotateCcw,
  Info,
  CheckSquare,
  Square,
  Download,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface SalespersonDirectoryProps {
  currentUser?: AuthUser | null;
  salespersons: Salesperson[];
  parties: Party[];
  branches?: BranchLocation[];
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  setParties?: React.Dispatch<React.SetStateAction<Party[]>>;
  setBranches?: React.Dispatch<React.SetStateAction<BranchLocation[]>>;
  onAddSalesperson?: (salesperson: Omit<Salesperson, 'id'>) => void;
  onUpdateSalesperson?: (salesperson: Salesperson) => void;
  onDeleteSalesperson?: (id: string) => void;
  onAddBranch?: (branch: Omit<BranchLocation, 'id'>) => void;
  onUpdateBranch?: (branch: BranchLocation) => void;
  onDeleteBranch?: (id: string) => void;
  onUpdateParty?: (party: Party) => void;
  initialTab?: 'users' | 'showrooms' | 'admin_set' | 'mapping';
  onNavigate?: (tab: string, options?: { salesmanCode?: string; salespersonName?: string }) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const SalespersonDirectory: React.FC<SalespersonDirectoryProps> = ({
  currentUser,
  salespersons,
  parties,
  branches = [],
  setSalespersons,
  setParties,
  setBranches,
  onAddSalesperson,
  onUpdateSalesperson,
  onDeleteSalesperson,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  onUpdateParty,
  initialTab = 'users',
  onNavigate,
  onBack,
  onClose
}) => {
  // Main Tab Navigation: 'users' | 'showrooms' | 'admin_set' | 'mapping'
  const [activeTab, setActiveTab] = useState<'users' | 'showrooms' | 'admin_set' | 'mapping'>(initialTab as any);

  const isSuperAdminUser = Boolean(currentUser?.isSuperAdmin || currentUser?.username?.toLowerCase() === 'suvroadmin');
  const userRoleLower = (currentUser?.role || currentUser?.userRole || '').toLowerCase();
  const isUserAdminOrSuper = isSuperAdminUser || userRoleLower.includes('admin') || userRoleLower.includes('director') || userRoleLower.includes('agm');
  const canApproveUsers = isSuperAdminUser || userRoleLower.includes('admin');
  const canViewTargets = isSuperAdminUser || 
    userRoleLower.includes('admin') || 
    userRoleLower.includes('approver') || 
    userRoleLower.includes('in-charge') || 
    userRoleLower.includes('incharge');

  // Pending user approvals
  const pendingUsers = useMemo(() => {
    return salespersons.filter((s) => {
      if (
        s.code.toLowerCase() === 'suvroadmin' ||
        s.username?.toLowerCase() === 'suvroadmin' ||
        s.isSuperAdmin ||
        s.role?.toLowerCase() === 'super admin' ||
        s.name.toLowerCase() === 'suvroadmin' ||
        s.name.toLowerCase().includes('suvroadmin')
      ) {
        return false;
      }
      return s.isApproved === false;
    });
  }, [salespersons]);

  const isStrictSuperAdminUser = isStrictSuperAdmin(currentUser);

  const cleanSortedBranches = useMemo(() => {
    return branches
      .filter((b) => !isUnwantedSalesCenter(b))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches]);

  // Available Admins in the company who manage sales centers
  const adminUsersList = useMemo(() => {
    return salespersons.filter((s) => {
      const r = (s.role || '').toLowerCase();
      const idLow = (s.id || '').toLowerCase();
      const codeLow = (s.code || '').toLowerCase();
      const unLow = (s.username || '').toLowerCase();
      if (
        idLow === 'adm-mahmudul' ||
        idLow === 'adm-subrata' ||
        idLow === 'adm-rashidul' ||
        unLow === 'admin1' ||
        unLow === 'admin2' ||
        unLow === 'admin3' ||
        codeLow === '111' ||
        unLow === '111' ||
        codeLow === 'suvroadmin' ||
        unLow === 'suvroadmin' ||
        s.isSuperAdmin
      ) {
        return false;
      }
      return r === 'admin' || r.includes('admin') || r.includes('agm');
    });
  }, [salespersons]);

  // Allowed branches for user: Super Admin sees all; Regional Admin sees only their assigned 4/5 centers
  const allowedBranchesForUser = useMemo(() => {
    return filterBranchesForUser(branches, currentUser, salespersons);
  }, [branches, currentUser, salespersons]);

  // Admin & Sales Center Mapping Matrix State
  const allAdminClusters = useMemo(() => {
    return getAllAdmins(salespersons, branches);
  }, [salespersons, branches]);

  const [selectedAdminForMapping, setSelectedAdminForMapping] = useState<AdminClusterInfo | null>(null);
  const [adminMappingBranchIds, setAdminMappingBranchIds] = useState<string[]>([]);
  const [adminMappingSearch, setAdminMappingSearch] = useState<string>('');
  const [adminSetFilterSearch, setAdminSetFilterSearch] = useState<string>('');
  const [adminMappingSuccessToast, setAdminMappingSuccessToast] = useState<string>('');

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userBranchFilter, setUserBranchFilter] = useState('all');
  const [newlyCreatedUserId, setNewlyCreatedUserId] = useState<string | null>(null);

  const [branchSearch, setBranchSearch] = useState('');
  const [branchTypeFilter, setBranchTypeFilter] = useState<string>('all');

  // Modal / Form States - User
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState<Salesperson | null>(null);
  const editUserRowRef = useRef<HTMLTableRowElement>(null);
  const editUserFormRef = useRef<Salesperson | null>(null);
  editUserFormRef.current = editUserForm;
  const originalUserRef = useRef<Salesperson | null>(null);

  useEffect(() => {
    if (editingUserId) {
      originalUserRef.current = salespersons.find((s) => s.id === editingUserId) || null;
    } else {
      originalUserRef.current = null;
    }
  }, [editingUserId, salespersons]);

  // Auto save user/staff when clicking outside (ignoring scrollbar clicks)
  useEffect(() => {
    if (!editingUserId) return;

    const isScrollbarClick = (e: MouseEvent): boolean => {
      if (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight) {
        return true;
      }
      let el: HTMLElement | null = e.target as HTMLElement | null;
      while (el) {
        const rect = el.getBoundingClientRect();
        if (el.scrollHeight > el.clientHeight && el.clientHeight > 0) {
          if (e.clientX >= rect.left + el.clientWidth && e.clientX <= rect.right) {
            return true;
          }
        }
        if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
          if (e.clientY >= rect.top + el.clientHeight && e.clientY <= rect.bottom) {
            return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    };

    const handleClickOutsideUserEdit = (e: MouseEvent) => {
      if (isScrollbarClick(e)) return;

      if (editUserRowRef.current && !editUserRowRef.current.contains(e.target as Node)) {
        const cur = editUserFormRef.current;
        const orig = originalUserRef.current;
        if (cur && orig) {
          const isChanged =
            cur.name !== orig.name ||
            cur.code !== orig.code ||
            cur.role !== orig.role ||
            cur.designation !== orig.designation ||
            cur.branchId !== orig.branchId ||
            cur.branchName !== orig.branchName ||
            cur.isInCharge !== orig.isInCharge ||
            cur.phone !== orig.phone ||
            cur.areaGroup !== orig.areaGroup ||
            cur.password !== orig.password ||
            cur.isApproved !== orig.isApproved;

          if (isChanged) {
            const isAdmin = cur.role === 'Admin' || cur.role === 'Director / Admin' || cur.role?.includes('Admin') || cur.role === 'Super Admin';
            const targetBranch = isAdmin ? undefined : branches.find((b) => b.id === cur.branchId);
            const isInChargeRole = cur.role === 'Sales Center In-Charge' || cur.role === 'Showroom In-Charge';
            const updatedUser: Salesperson = {
              ...cur,
              role: cur.role,
              designation: cur.designation || 'Executive',
              isInCharge: isInChargeRole ? true : ((isAdmin || cur.role === 'Factory') ? false : Boolean(cur.isInCharge)),
              branchId: isAdmin ? undefined : (targetBranch?.id || cur.branchId),
              branchName: isAdmin ? undefined : (targetBranch ? targetBranch.name : cur.branchName),
              updatedAt: Date.now()
            };
            if (onUpdateSalesperson) {
              onUpdateSalesperson(updatedUser);
            } else if (setSalespersons) {
              setSalespersons((prev) => prev.map((s) => (s.id === updatedUser.id ? updatedUser : s)));
            }
            try {
              const raw = localStorage.getItem('polycables_salespersons');
              if (raw) {
                const list: Salesperson[] = JSON.parse(raw);
                const nextList = list.map((s) => (s.id === updatedUser.id ? updatedUser : s));
                localStorage.setItem('polycables_salespersons', JSON.stringify(nextList));
              }
            } catch {}
          }
        }
        setEditingUserId(null);
        setEditUserForm(null);
      }
    };

    const handleTouchOutside = (e: TouchEvent) => handleClickOutsideUserEdit(e as unknown as MouseEvent);
    document.addEventListener('mousedown', handleClickOutsideUserEdit);
    document.addEventListener('touchstart', handleTouchOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideUserEdit);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, [editingUserId, branches, onUpdateSalesperson, setSalespersons]);

  // New User Form State
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAreaGroup, setNewAreaGroup] = useState('');
  const [newSpPassword, setNewSpPassword] = useState('123456');
  const [newMonthlyTarget, setNewMonthlyTarget] = useState('');
  const [newYearlyTarget, setNewYearlyTarget] = useState('');
  const [selectedRoleOption, setSelectedRoleOption] = useState<string>('');
  const [customRoleText, setCustomRoleText] = useState('');
  const [newDesignation, setNewDesignation] = useState<string>('Executive');
  const [newIsInCharge, setNewIsInCharge] = useState<boolean>(false);
  const [newUserBranchId, setNewUserBranchId] = useState('');
  const [newAdminBranchIds, setNewAdminBranchIds] = useState<string[]>([]);

  // Password Management Modal State (Change & Forgot Password)
  const [passwordModalUser, setPasswordModalUser] = useState<Salesperson | null>(null);
  const [passwordModalMode, setPasswordModalMode] = useState<'change' | 'forgot'>('change');
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [oldPasswordVerified, setOldPasswordVerified] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordModalError, setPasswordModalError] = useState('');
  const [passwordModalSuccess, setPasswordModalSuccess] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Sales Center Deletion (Why & How to Delete / Confirm Delete) State
  const [blockedBranchDeletion, setBlockedBranchDeletion] = useState<{
    branch: BranchLocation;
    staffCount: number;
    staffNames: string[];
    partiesCount: number;
    partiesSample: string[];
    isHeadOffice: boolean;
  } | null>(null);
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState<BranchLocation | null>(null);
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);
  const [salesDirConfirmModal, setSalesDirConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleOpenPasswordModal = (user: Salesperson | null, mode: 'change' | 'forgot' = 'change') => {
    const targetUser = user || (salespersons.length > 0 ? salespersons[0] : null);
    if (!targetUser) return;
    setPasswordModalUser(targetUser);
    setPasswordModalMode(mode);
    setOldPasswordInput('');
    setOldPasswordVerified(false);
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordModalError('');
    setPasswordModalSuccess('');
    setShowOldPassword(false);
    setShowNewPassword(false);
  };

  const handleVerifyOldPassword = () => {
    if (!passwordModalUser) return;
    const currentPass = passwordModalUser.password || '123456';
    if (oldPasswordInput.trim() === currentPass.trim() || (currentPass === '123456' && oldPasswordInput.trim() === '1234')) {
      setOldPasswordVerified(true);
      setPasswordModalError('');
      setPasswordModalSuccess('✓ Old password verified! Enter your new password below.');
    } else {
      setOldPasswordVerified(false);
      setPasswordModalError('Incorrect old password! Please try again or use "Forgot Password" to reset.');
    }
  };

  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    if (passwordModalMode === 'change' && !oldPasswordVerified) {
      handleVerifyOldPassword();
      return;
    }
    const cleanPass = newPasswordInput.trim();
    if (!cleanPass) {
      setPasswordModalError('New password cannot be empty.');
      return;
    }
    if (!/^\d{6,}$/.test(cleanPass)) {
      setPasswordModalError('Password must be a minimum of 6 digits (numeric PIN, e.g. 123456).');
      return;
    }
    if (cleanPass !== confirmPasswordInput.trim()) {
      setPasswordModalError('New password and Confirm password do not match.');
      return;
    }

    const updatedUser: Salesperson = {
      ...passwordModalUser,
      password: cleanPass
    };

    if (onUpdateSalesperson) {
      onUpdateSalesperson(updatedUser);
    } else if (setSalespersons) {
      setSalespersons((prev) => prev.map((s) => (s.id === updatedUser.id ? updatedUser : s)));
    }

    // Persist to localStorage
    try {
      const raw = localStorage.getItem('polycables_salespersons');
      if (raw) {
        const list: Salesperson[] = JSON.parse(raw);
        const nextList = list.map((s) => (s.id === updatedUser.id ? updatedUser : s));
        localStorage.setItem('polycables_salespersons', JSON.stringify(nextList));
      }
    } catch {}

    // If currently logged-in user changed their password, update app_current_user
    try {
      const curSaved = localStorage.getItem('app_current_user');
      if (curSaved) {
        const parsed = JSON.parse(curSaved);
        if (parsed && (parsed.id === updatedUser.id || parsed.username === updatedUser.username || parsed.salespersonCode === updatedUser.code)) {
          localStorage.setItem('app_current_user', JSON.stringify({ ...parsed, password: cleanPass }));
        }
      }
    } catch {}

    setPasswordModalSuccess(`✓ Password successfully updated and stored for ${passwordModalUser.name}!`);
    setTimeout(() => {
      setPasswordModalUser(null);
    }, 1200);
  };

  // Modal / Form States - Showroom / Branch
  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchForm, setEditBranchForm] = useState<BranchLocation | null>(null);

  // New Branch Form State
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchType, setNewBranchType] = useState<BranchType>('showroom');
  const [newBranchInChargeId, setNewBranchInChargeId] = useState('');
  const [newBranchApprover, setNewBranchApprover] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchEmail, setNewBranchEmail] = useState('');
  const [newBranchAdminId, setNewBranchAdminId] = useState('');
  const [newBranchIsActive, setNewBranchIsActive] = useState(true);

  // Selected Salesperson for viewing/managing assigned parties
  const [selectedSpCode, setSelectedSpCode] = useState<string | null>(null);

  // Password visibility
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Record<string, boolean>>({});

  // View Mode for Showrooms & User List (Defaults to list view)
  const [showroomViewMode, setShowroomViewMode] = useState<'list' | 'grid'>('list');

  // Showroom expansion state for drill-down view (matches user request)
  const [expandedBranchIds, setExpandedBranchIds] = useState<Record<string, boolean>>({});

  const toggleBranchExpand = (branchId: string) => {
    setExpandedBranchIds((prev) => ({
      ...prev,
      [branchId]: !prev[branchId]
    }));
  };

  // Default Approver configuration (synced with Requisitions)
  const [currentDefaultApprover, setCurrentDefaultApprover] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_default_approver');
      if (saved && saved.trim()) {
        if (saved.toLowerCase().includes('mahmudul hasan')) {
          localStorage.removeItem('polycables_default_approver');
          return '';
        }
        return saved.trim();
      }
    } catch {}
    return '';
  });

  // Set Approver Modal State
  const [approverModalBranch, setApproverModalBranch] = useState<BranchLocation | 'ALL' | null>(null);
  const [approverInput, setApproverInput] = useState(() => currentDefaultApprover);

  const handleSetApprover = (targetBranchId: string | 'ALL', newApproverName: string) => {
    const cleanApprover = newApproverName.trim();
    try {
      if (cleanApprover) {
        localStorage.setItem('polycables_default_approver', cleanApprover);
        localStorage.setItem('polycables_req_approved_by', cleanApprover);
      } else {
        localStorage.removeItem('polycables_default_approver');
        localStorage.removeItem('polycables_req_approved_by');
      }
    } catch {}
    setCurrentDefaultApprover(cleanApprover);

    if (targetBranchId === 'ALL') {
      const updated = branches.map((b) => ({ ...b, approverName: cleanApprover }));
      if (setBranches) setBranches(updated);
      updated.forEach((b) => onUpdateBranch?.(b));
    } else {
      const target = branches.find((b) => b.id === targetBranchId);
      if (target) {
        const updatedBranch = { ...target, approverName: cleanApprover };
        if (onUpdateBranch) {
          onUpdateBranch(updatedBranch);
        } else if (setBranches) {
          setBranches((prev) => prev.map((b) => (b.id === targetBranchId ? updatedBranch : b)));
        }
      }
    }
  };

  const handleOpenAdminAssignModal = (cluster: AdminClusterInfo) => {
    setSelectedAdminForMapping(cluster);
    // Find all branches currently assigned to this admin
    const currentMappedIds = branches
      .filter((b) => {
        if (b.adminId && b.adminId.toLowerCase() === cluster.adminId.toLowerCase()) return true;
        if (b.assignedAdminId && b.assignedAdminId.toLowerCase() === cluster.adminId.toLowerCase()) return true;
        if (b.adminUsername && b.adminUsername.toLowerCase() === cluster.adminUsername.toLowerCase()) return true;
        if (cluster.branches.some((cb) => cb.id === b.id)) return true;
        return false;
      })
      .map((b) => b.id);
    setAdminMappingBranchIds(currentMappedIds);
    setAdminMappingSearch('');
  };

  const handleSaveAdminMapping = () => {
    if (!selectedAdminForMapping) return;

    const targetAdmin = selectedAdminForMapping;
    const selectedSet = new Set(adminMappingBranchIds);

    // 1. Update branches
    const updatedBranchesList = branches.map((b) => {
      if (selectedSet.has(b.id)) {
        return {
          ...b,
          adminId: targetAdmin.adminId,
          adminName: targetAdmin.adminName,
          adminUsername: targetAdmin.adminUsername,
          assignedAdminId: targetAdmin.adminId,
          adminZone: targetAdmin.adminZone || (b as any).adminZone
        };
      } else {
        const wasAssignedToThis =
          b.adminId === targetAdmin.adminId ||
          b.assignedAdminId === targetAdmin.adminId ||
          (b.adminUsername && b.adminUsername.toLowerCase() === targetAdmin.adminUsername.toLowerCase());
        if (wasAssignedToThis) {
          return {
            ...b,
            adminId: undefined,
            adminName: undefined,
            adminUsername: undefined,
            assignedAdminId: undefined
          };
        }
        return b;
      }
    });

    if (setBranches) {
      setBranches(updatedBranchesList);
    }
    updatedBranchesList.forEach((b) => {
      onUpdateBranch?.(b);
    });

    // 2. Update salesperson record for this admin
    const targetSp = salespersons.find(
      (s) =>
        s.id === targetAdmin.adminId ||
        (s.code && s.code.toLowerCase() === targetAdmin.adminUsername.toLowerCase()) ||
        (s.username && s.username.toLowerCase() === targetAdmin.adminUsername.toLowerCase())
    );



    if (targetSp) {
      const assignedObjs = updatedBranchesList.filter((b) => selectedSet.has(b.id));
      const updatedSp: Salesperson = {
        ...targetSp,
        assignedBranchIds: adminMappingBranchIds,
        assignedBranchNames: assignedObjs.map((b) => b.name)
      };
      if (onUpdateSalesperson) {
        onUpdateSalesperson(updatedSp);
      }
      if (setSalespersons) {
        setSalespersons((prev) => prev.map((s) => (s.id === updatedSp.id ? updatedSp : s)));
      }
    }

    setAdminMappingSuccessToast(
      `Assigned ${adminMappingBranchIds.length} sales centers to ${targetAdmin.adminName}! Changes saved live.`
    );
    setTimeout(() => setAdminMappingSuccessToast(''), 4000);
    setSelectedAdminForMapping(null);
  };

  // Handler: Delete Admin from Assignment Matrix & Entire System
  const handleDeleteAdminCluster = (cluster: AdminClusterInfo) => {
    const adminUser = salespersons.find(
      (s) =>
        s.id === cluster.adminId ||
        (s.code && s.code.toLowerCase() === cluster.adminUsername.toLowerCase()) ||
        (s.username && s.username.toLowerCase() === cluster.adminUsername.toLowerCase()) ||
        (s.name && s.name.toLowerCase() === cluster.adminName.toLowerCase())
    );

    const displayName = adminUser ? adminUser.name : cluster.adminName;
    setSalesDirConfirmModal({
      isOpen: true,
      title: 'Delete Admin Account',
      description: `Are you sure you want to delete Admin "${displayName}"? This will move the admin account to Trash and unassign all ${cluster.branches.length} sales centers under them.`,
      confirmText: 'Delete Admin',
      isDestructive: true,
      onConfirm: () => {
        if (adminUser) {
          moveToTrash('polycables_trashed_users', adminUser, 'Users & Staff');
        }

        // 1. Unassign all branches under this admin
        const adminBranchIds = cluster.branches.map((b) => b.id);
        branches.forEach((b) => {
          if (
            adminBranchIds.includes(b.id) ||
            b.adminId === cluster.adminId ||
            b.adminUsername === cluster.adminUsername ||
            b.adminName === cluster.adminName
          ) {
            const updatedBranch: BranchLocation = {
              ...b,
              adminId: undefined,
              adminName: undefined,
              adminUsername: undefined
            };
            onUpdateBranch?.(updatedBranch);
          }
        });

        // 2. Delete the admin user from salespersons
        if (adminUser) {
          if (onDeleteSalesperson) {
            onDeleteSalesperson(adminUser.id);
          } else if (setSalespersons) {
            setSalespersons((prev) => prev.filter((s) => s.id !== adminUser.id));
          }
        } else {
          if (setSalespersons) {
            setSalespersons((prev) =>
              prev.filter(
                (s) =>
                  s.id !== cluster.adminId &&
                  s.code.toLowerCase() !== cluster.adminUsername.toLowerCase() &&
                  s.name.toLowerCase() !== cluster.adminName.toLowerCase()
              )
            );
          }
        }

        setAdminMappingSuccessToast(`Deleted Admin "${displayName}" and unassigned their sales centers.`);
        setTimeout(() => setAdminMappingSuccessToast(''), 4000);
      }
    });
  };

  // Handler: Remove a single Sales Center from an Admin's assigned cluster
  const handleRemoveBranchFromAdmin = (cluster: AdminClusterInfo, branchId: string) => {
    const targetBranch = branches.find((b) => b.id === branchId);
    if (!targetBranch) return;

    setSalesDirConfirmModal({
      isOpen: true,
      title: 'Remove Sales Center from Admin',
      description: `Remove sales center "${targetBranch.name}" from Admin "${cluster.adminName}"?`,
      confirmText: 'Remove Sales Center',
      isDestructive: true,
      onConfirm: () => {
        const updatedBranch: BranchLocation = {
          ...targetBranch,
          adminId: undefined,
          adminName: undefined,
          adminUsername: undefined
        };
        onUpdateBranch?.(updatedBranch);

        const adminUser = salespersons.find(
          (s) =>
            s.id === cluster.adminId ||
            (s.code && s.code.toLowerCase() === cluster.adminUsername.toLowerCase()) ||
            (s.username && s.username.toLowerCase() === cluster.adminUsername.toLowerCase())
        );
        if (adminUser) {
          const remainingIds = (adminUser.assignedBranchIds || []).filter((id) => id !== branchId);
          const remainingNames = (adminUser.assignedBranchNames || []).filter((n) => n !== targetBranch.name);
          const updatedAdmin: Salesperson = {
            ...adminUser,
            assignedBranchIds: remainingIds,
            assignedBranchNames: remainingNames
          };
          onUpdateSalesperson?.(updatedAdmin);
        }

        setAdminMappingSuccessToast(`Removed "${targetBranch.name}" from Admin "${cluster.adminName}".`);
        setTimeout(() => setAdminMappingSuccessToast(''), 4000);
      }
    });
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswordIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const branchExcelFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportBranchesToXLSX = () => {
    try {
      const exportRows = branches.map((b, idx) => {
        const inCharge = salespersons.find((s) => s.id === b.inChargeId || s.code === b.inChargeCode);
        return {
          'SL': idx + 1,
          'Sales Center Code': b.code || b.id || '',
          'Sales Center Name': b.name || '',
          'Branch Type': b.type === 'showroom' ? 'Sales Center' : b.type === 'head_office' ? 'Head Office' : b.type === 'power_market' ? 'Power Market' : (b.type || 'Sales Center'),
          'District / Location': b.district || b.location || '',
          'Address': b.address || '',
          'Phone': b.phone || '',
          'Email': b.email || '',
          'In-Charge Name': inCharge?.name || b.inChargeName || '',
          'In-Charge Phone': inCharge?.phone || b.inChargePhone || '',
          'Managing Admin': b.adminName || '',
          'Requisition Approver': b.approverName || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Centers');
      XLSX.writeFile(wb, `Polycables_Sales_Centers_${new Date().toISOString().slice(0, 10)}.xlsx`);
      alert(`✓ Exported ${branches.length} Sales Centers to Excel.`);
    } catch (err: any) {
      console.error('Error exporting sales centers:', err);
      alert('Failed to export sales centers to Excel: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleImportBranchesFromXLSX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rawRows || rawRows.length < 2) {
        alert('The uploaded Excel file does not contain valid data rows.');
        return;
      }

      // Detect header row
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(10, rawRows.length); r++) {
        const row = (rawRows[r] || []).map((c) => String(c || '').toLowerCase().trim());
        if (row.some((c) => c.includes('sales center') || c.includes('branch') || c.includes('name') || c.includes('center'))) {
          headerRowIndex = r;
          break;
        }
      }

      const headers = (rawRows[headerRowIndex] || []).map((c) => String(c || '').toLowerCase().trim());
      const nameCol = headers.findIndex((h) => h.includes('center name') || h.includes('branch name') || h.includes('name') || h === 'center');
      const codeCol = headers.findIndex((h) => h.includes('code') || h.includes('id'));
      const typeCol = headers.findIndex((h) => h.includes('type'));
      const districtCol = headers.findIndex((h) => h.includes('district') || h.includes('location') || h.includes('city') || h.includes('zone'));
      const addrCol = headers.findIndex((h) => h.includes('address'));
      const phoneCol = headers.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('contact'));
      const emailCol = headers.findIndex((h) => h.includes('email'));
      const inChargeCol = headers.findIndex((h) => h.includes('in-charge') || h.includes('incharge'));
      const approverCol = headers.findIndex((h) => h.includes('approver'));
      const adminCol = headers.findIndex((h) => h.includes('admin'));

      if (nameCol === -1) {
        alert('Could not detect a "Sales Center Name" column in the Excel file.');
        return;
      }

      let newCount = 0;
      let updatedCount = 0;
      const updatedList = [...branches];

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || !Array.isArray(row)) continue;

        const rawName = String(row[nameCol] || '').trim();
        if (!rawName || rawName.toLowerCase() === 'total' || rawName.toLowerCase().startsWith('grand')) continue;

        const cleanName = formatSalesCenterDisplayName(rawName);
        const code = codeCol !== -1 && row[codeCol] ? String(row[codeCol]).trim() : '';
        const rawType = typeCol !== -1 && row[typeCol] ? String(row[typeCol]).toLowerCase().trim() : '';
        const branchType: BranchType = rawType.includes('head') ? 'head_office' : rawType.includes('power') ? 'power_market' : 'showroom';
        const district = districtCol !== -1 && row[districtCol] ? String(row[districtCol]).trim() : '';
        const address = addrCol !== -1 && row[addrCol] ? String(row[addrCol]).trim() : '';
        const phone = phoneCol !== -1 && row[phoneCol] ? String(row[phoneCol]).trim() : '';
        const email = emailCol !== -1 && row[emailCol] ? String(row[emailCol]).trim() : '';
        const inChargeName = inChargeCol !== -1 && row[inChargeCol] ? String(row[inChargeCol]).trim() : '';
        const approverName = approverCol !== -1 && row[approverCol] ? String(row[approverCol]).trim() : '';
        const adminName = adminCol !== -1 && row[adminCol] ? String(row[adminCol]).trim() : '';

        // Match existing branch
        const existingIdx = updatedList.findIndex(
          (b) =>
            (code && (b.id === code || b.code === code)) ||
            (b.name && b.name.toLowerCase().trim() === cleanName.toLowerCase().trim())
        );

        if (existingIdx !== -1) {
          const prev = updatedList[existingIdx];
          updatedList[existingIdx] = {
            ...prev,
            name: cleanName || prev.name,
            code: code || prev.code,
            type: branchType || prev.type,
            district: district || prev.district,
            location: district || prev.location,
            address: address || prev.address,
            phone: phone || prev.phone,
            email: email || prev.email,
            approverName: approverName || prev.approverName,
            adminName: adminName || prev.adminName
          };
          updatedCount++;
        } else {
          const newBranch: BranchLocation = {
            id: code ? `branch-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : `branch-${Date.now()}-${r}`,
            code: code || `SC-${updatedList.length + 1}`,
            name: cleanName,
            type: branchType,
            district: district,
            location: district,
            address: address,
            phone: phone,
            email: email,
            approverName: approverName,
            adminName: adminName,
            inChargeName: inChargeName,
            isActive: true
          };
          updatedList.push(newBranch);
          newCount++;
        }
      }

      if (setBranches) {
        setBranches(updatedList);
      }
      try {
        localStorage.setItem('polycables_branches', JSON.stringify(updatedList));
      } catch {}

      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: { branches: updatedList } })
      }).catch(() => {});

      try {
        window.dispatchEvent(new CustomEvent('polycables_branches_updated', { detail: { branches: updatedList } }));
      } catch {}

      alert(`🎉 Successfully imported Sales Centers from Excel!\n• ${newCount} new sales center(s) added\n• ${updatedCount} existing sales center(s) updated`);
    } catch (err: any) {
      console.error('Error importing sales centers:', err);
      alert('Failed to parse Excel file: ' + (err?.message || 'Invalid format'));
    } finally {
      if (branchExcelFileInputRef.current) {
        branchExcelFileInputRef.current.value = '';
      }
    }
  };

  // Check if a salesperson is assigned as in-charge of any branch
  const inChargeBranchMap = useMemo(() => {
    const map = new Map<string, BranchLocation>();
    branches.forEach((b) => {
      if (b.inChargeId) {
        const sp = salespersons.find((s) => s.id === b.inChargeId);
        // Do not map if user is explicitly a non-incharge staff member of an entirely different branch
        if (!sp || sp.isInCharge !== false || sp.branchId === b.id || sp.role === 'Showroom In-Charge') {
          map.set(b.inChargeId, b);
        }
      }
    });
    return map;
  }, [branches, salespersons]);

  // Filtered Users
  const filteredSalespersons = useMemo(() => {
    return salespersons.filter((sp) => {
      // Super admin user must never show in any directory or anywhere
      if (
        sp.code.toLowerCase() === 'suvroadmin' ||
        sp.username?.toLowerCase() === 'suvroadmin' ||
        sp.isSuperAdmin ||
        sp.role?.toLowerCase() === 'super admin' ||
        sp.name.toLowerCase() === 'suvroadmin' ||
        sp.name.toLowerCase().includes('suvroadmin')
      ) {
        return false;
      }

      const q = userSearch.toLowerCase();
      const matchSearch =
        sp.name.toLowerCase().includes(q) ||
        sp.code.toLowerCase().includes(q) ||
        (sp.phone && sp.phone.includes(q)) ||
        (sp.areaGroup && sp.areaGroup.toLowerCase().includes(q)) ||
        (sp.role && sp.role.toLowerCase().includes(q)) ||
        (sp.designation && sp.designation.toLowerCase().includes(q)) ||
        (sp.branchName && sp.branchName.toLowerCase().includes(q));

      const isMkt = isMarketingOfficer(sp);
      const roleStr = isAdminSalesperson(sp) ? 'Administrator' : sp.role || (isMkt ? 'Marketing Officer' : 'Showroom Staff');

      const matchRole =
        userRoleFilter === 'all' ||
        (userRoleFilter === 'pending' && sp.isApproved === false) ||
        (userRoleFilter === 'approved' && sp.isApproved !== false) ||
        (userRoleFilter === 'marketing' && isMkt) ||
        (userRoleFilter === 'incharge' && inChargeBranchMap.has(sp.id)) ||
        (userRoleFilter === 'staff' && !isMkt) ||
        roleStr.toLowerCase().includes(userRoleFilter.toLowerCase());

      const matchBranch =
        userBranchFilter === 'all' ||
        sp.branchId === userBranchFilter ||
        (sp.branchName && sp.branchName === userBranchFilter);

      return matchSearch && matchRole && matchBranch;
    });
  }, [salespersons, userSearch, userRoleFilter, userBranchFilter, inChargeBranchMap]);

  // Fast pre-computed map of party count per salesperson to prevent sluggish table rendering
  const assignedPartiesCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    if (!Array.isArray(parties) || parties.length === 0) return counts;

    const partiesByCode = new Map<string, number>();
    const partiesByName = new Map<string, number>();

    const spByCode = new Map<string, Salesperson>();
    const spByName = new Map<string, Salesperson>();
    salespersons.forEach((s) => {
      if (!s) return;
      if (s.code) spByCode.set(s.code.toLowerCase().trim(), s);
      if (s.name) spByName.set(s.name.toLowerCase().trim(), s);
    });

    for (const p of parties) {
      if (!p) continue;
      const c = (p.salesmanCode || '').toLowerCase().trim();
      const n = (p.salespersonName || '').toLowerCase().trim();
      if (c) partiesByCode.set(c, (partiesByCode.get(c) || 0) + 1);
      if (n) partiesByName.set(n, (partiesByName.get(n) || 0) + 1);
    }

    for (const sp of salespersons) {
      if (!sp || !sp.id) continue;
      const userBranch = branches.find((b) => b.id === sp.branchId) || (sp.branchName ? { name: sp.branchName } : null);
      const isStaffOrAcc = isAccountsOrStaff(sp as any, salespersons) || !isMarketingOfficer(sp);
      const spCodeLow = (sp.code || '').toLowerCase().trim();
      const spNameLow = (sp.name || '').toLowerCase().trim();

      if (isStaffOrAcc && userBranch) {
        const bName = (userBranch.name || '').toLowerCase().trim();
        const bNameClean = bName.replace('sales center', '').trim();
        let total = 0;
        for (const p of parties) {
          if (!p) continue;
          if (p.salesmanCode && p.salesmanCode.toLowerCase().trim() === spCodeLow) {
            total++;
            continue;
          }
          const pCenter = (p.salesCenter || p.branchName || '').toLowerCase().trim();
          if (pCenter && bName && (pCenter === bName || pCenter.includes(bNameClean))) {
            total++;
            continue;
          }
          const pSp = (p.salesmanCode ? spByCode.get(p.salesmanCode.toLowerCase().trim()) : null) ||
                      (p.salespersonName ? spByName.get(p.salespersonName.toLowerCase().trim()) : null);
          if (pSp && (pSp.branchId === sp.branchId || (pSp.branchName && userBranch.name && pSp.branchName.toLowerCase().trim() === bName))) {
            total++;
          }
        }
        counts.set(sp.id, total);
      } else {
        const codeCnt = spCodeLow ? (partiesByCode.get(spCodeLow) || 0) : 0;
        const nameCnt = spNameLow && !codeCnt ? (partiesByName.get(spNameLow) || 0) : 0;
        counts.set(sp.id, codeCnt || nameCnt);
      }
    }

    return counts;
  }, [parties, salespersons, branches]);

  // Filtered Branches / Showrooms (User-created only, sorted alphabetically A-Z)
  const filteredBranches = useMemo(() => {
    return branches
      .filter((b) => {
        if (!b || isUnwantedSalesCenter(b)) return false;
        const q = branchSearch.toLowerCase();
        const matchSearch =
          b.name.toLowerCase().includes(q) ||
          (b.address && b.address.toLowerCase().includes(q)) ||
          (b.phone && b.phone.includes(q)) ||
          (b.inChargeName && b.inChargeName.toLowerCase().includes(q)) ||
          (b.approverName && b.approverName.toLowerCase().includes(q));

        const matchType = branchTypeFilter === 'all' || b.type === branchTypeFilter;

        return matchSearch && matchType;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [branches, branchSearch, branchTypeFilter]);

  // Handler: Create User
  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleOption) {
      alert('Please select a Role');
      return;
    }
    if (!newName.trim()) {
      alert('Please enter a User Full Name');
      return;
    }
    const generatedCode = newCode.trim() ? newCode.trim() : `U${String(salespersons.length + 1).padStart(2, '0')}`;
    const roleValue = selectedRoleOption === 'Other' ? customRoleText.trim() || 'Staff' : selectedRoleOption;
    const isSuperAdminRole = roleValue === 'Super Admin' || roleValue.toLowerCase().includes('super admin');
    const isAdmin = roleValue === 'Admin' || roleValue.toLowerCase().includes('admin');
    const isAccountsAdmin = roleValue === 'Admin ( Accounts )';

    if (isSuperAdminRole && !isSuvroAdmin(currentUser)) {
      alert('Security Policy: Only suvroadmin user is authorized to create or assign the Super Admin role.');
      return;
    }

    if (isAdmin && !isStrictSuperAdmin(currentUser)) {
      alert('Security Policy: Only Super Admin (suvroadmin) is authorized to create Admin accounts.');
      return;
    }

    const isMarketing = roleValue.toLowerCase().includes('marketing') || roleValue.toLowerCase().includes('in-charge');
    if (!isAdmin && !isAccountsAdmin && roleValue !== 'Super Admin' && roleValue !== 'Factory' && !newUserBranchId) {
      alert('Please select a Sales Center / Showroom');
      return;
    }

    // If Admin, sales center defaults to selected branch or Head Office / 1st active branch
    const firstBranch = branches.find(b => b.type === 'head_office') || (branches.length > 0 ? branches[0] : undefined);
    const selectedBranchObj = isAccountsAdmin
      ? undefined
      : newUserBranchId
      ? branches.find((b) => b.id === newUserBranchId)
      : (isAdmin ? firstBranch : branches.find((b) => b.id === newUserBranchId));

    const finalBranchId = selectedBranchObj?.id;
    const finalBranchName = selectedBranchObj?.name;

    const parsedMonthly = (!isAdmin && isUserAdminOrSuper) ? (Number(newMonthlyTarget) || 0) : 0;
    const parsedYearly = (!isAdmin && isUserAdminOrSuper) ? (Number(newYearlyTarget) || (parsedMonthly * 12)) : 0;

    const assignedBranchIds = isAdmin
      ? (newAdminBranchIds.length > 0 ? newAdminBranchIds : (newUserBranchId ? [newUserBranchId] : []))
      : undefined;
    const assignedBranches = assignedBranchIds ? branches.filter((b) => assignedBranchIds.includes(b.id)) : [];

    const cleanSpPass = newSpPassword.trim();
    if (!/^\d{6,}$/.test(cleanSpPass)) {
      alert('Password must be a minimum of 6 digits (numeric only, e.g. 123456).');
      return;
    }

    const newUserPayload: Omit<Salesperson, 'id'> = {
      code: generatedCode,
      username: generatedCode.toLowerCase(),
      name: newName.trim(),
      phone: newPhone.trim(),
      areaGroup: newAreaGroup.trim() || (selectedBranchObj ? selectedBranchObj.name : 'General Territory'),
      password: cleanSpPass,
      userType: isMarketing ? 'marketing' : 'user',
      role: selectedRoleOption === 'Sales Center In-Charge' ? 'Sales Center In-Charge' : (roleValue || (newIsInCharge ? 'Sales Center In-Charge' : 'Sales Center Staff')),
      designation: newDesignation || 'Executive',
      isInCharge: selectedRoleOption === 'Sales Center In-Charge' ? true : newIsInCharge,
      isApproved: true, // Created by admin in directory, automatically approved
      approvedBy: currentUser?.name || currentUser?.username || 'Admin',
      approvedAt: new Date().toISOString(),
      branchId: finalBranchId,
      branchName: finalBranchName,
      assignedBranchIds,
      assignedBranchNames: assignedBranches.map((b) => b.name),
      monthlyTargetSales: parsedMonthly,
      monthlyTargetCollection: Math.round(parsedMonthly * 0.9),
      monthlyTargetCoils: 0,
      yearlyTargetSales: parsedYearly,
      yearlyTargetCollection: Math.round(parsedYearly * 0.9)
    };

    if (onAddSalesperson) {
      onAddSalesperson(newUserPayload);
    } else if (setSalespersons) {
      setSalespersons((prev) => [...prev, { ...newUserPayload, id: `sp-${Date.now()}` }]);
    }

    // Link assigned sales centers to this newly created Admin
    if (isAdmin && assignedBranches.length > 0 && onUpdateBranch) {
      assignedBranches.forEach((b) => {
        onUpdateBranch({
          ...b,
          adminId: generatedCode,
          adminName: `${newName.trim()} (Admin)`,
          adminUsername: generatedCode.toLowerCase()
        });
      });
    }

    // Reset Form
    setNewCode('');
    setNewName('');
    setNewPhone('');
    setNewAreaGroup('');
    setNewSpPassword('123456');
    setNewMonthlyTarget('');
    setNewYearlyTarget('');
    setSelectedRoleOption('');
    setCustomRoleText('');
    setNewDesignation('Executive');
    setNewIsInCharge(false);
    setNewUserBranchId('');
    setNewAdminBranchIds([]);
    setIsAddingUser(false);

    // CRITICAL: Clear all search and filter conditions immediately so the newly created user is visible live
    setUserSearch('');
    setUserRoleFilter('all');
    setUserBranchFilter('all');
    setNewlyCreatedUserId(generatedCode);
  };

  // Handler: Save User Edit
  const handleSaveUserEdit = () => {
    if (!editUserForm) return;

    const cleanPass = (editUserForm.password || '').trim();
    if (!/^\d{6,}$/.test(cleanPass)) {
      alert('Password must be a minimum of 6 digits (numeric only, e.g. 123456).');
      return;
    }
    const cleanCode = (editUserForm.code || '').trim();
    if (!cleanCode) {
      alert('User code cannot be empty.');
      return;
    }
    const cleanName = (editUserForm.name || '').trim();
    if (!cleanName) {
      alert('User full name cannot be empty.');
      return;
    }
    const cleanUsername = (editUserForm.username || cleanCode).trim().toLowerCase();

    const isSuperAdminRole = editUserForm.role === 'Super Admin' || editUserForm.role.toLowerCase().includes('super admin');
    if (isSuperAdminRole && !isSuvroAdmin(currentUser)) {
      alert('Security Policy: Only suvroadmin user is authorized to create or assign the Super Admin role.');
      return;
    }

    const isAdmin = editUserForm.role === 'Admin' || editUserForm.role === 'Director / Admin' || editUserForm.role?.includes('Admin') || editUserForm.role === 'Super Admin';
    const isAccountsAdmin = editUserForm.role === 'Admin ( Accounts )';
    const targetBranch = (isAdmin || isAccountsAdmin)
      ? undefined
      : branches.find((b) => b.id === editUserForm.branchId);

    const isInChargeRole = editUserForm.role === 'Sales Center In-Charge' || editUserForm.role === 'Showroom In-Charge';

    const updatedUser: Salesperson = {
      ...editUserForm,
      role: editUserForm.role,
      designation: editUserForm.designation || 'Executive',
      isInCharge: isInChargeRole ? true : ((isAdmin || isAccountsAdmin || editUserForm.role === 'Factory') ? false : Boolean(editUserForm.isInCharge)),
      code: cleanCode,
      username: cleanUsername,
      name: cleanName,
      password: cleanPass,
      branchId: (isAdmin || isAccountsAdmin) ? undefined : (targetBranch?.id || editUserForm.branchId),
      branchName: (isAdmin || isAccountsAdmin) ? undefined : (targetBranch ? targetBranch.name : editUserForm.branchName),
      monthlyTargetSales: isAccountsAdmin ? 0 : editUserForm.monthlyTargetSales,
      monthlyTargetCollection: isAccountsAdmin ? 0 : editUserForm.monthlyTargetCollection,
      monthlyTargetCoils: isAccountsAdmin ? 0 : editUserForm.monthlyTargetCoils,
      updatedAt: Date.now()
    };

    if (onUpdateSalesperson) {
      onUpdateSalesperson(updatedUser);
    } else if (setSalespersons) {
      setSalespersons((prev) => prev.map((s) => (s.id === updatedUser.id ? updatedUser : s)));
    }

    // Update localStorage directly so any immediate login or refresh sees the changes
    try {
      const raw = localStorage.getItem('polycables_salespersons');
      if (raw) {
        const list: Salesperson[] = JSON.parse(raw);
        const nextList = list.map((s) => (s.id === updatedUser.id ? updatedUser : s));
        localStorage.setItem('polycables_salespersons', JSON.stringify(nextList));
      }
    } catch {}

    // If currently logged-in user changed their designation, role, code, username, or name, update app_current_user session
    try {
      const curSaved = localStorage.getItem('app_current_user');
      if (curSaved) {
        const parsed = JSON.parse(curSaved);
        if (parsed && (parsed.id === updatedUser.id || parsed.username === editUserForm.username || parsed.salespersonCode === editUserForm.code)) {
          const roleLower = (updatedUser.role || '').toLowerCase();
          const isAdminRole = roleLower === 'admin' || updatedUser.role === 'Admin' || (updatedUser.code && updatedUser.code.startsWith('ADM'));
          const isAgmRole = roleLower.includes('agm') || roleLower.includes('director') || roleLower.includes('general manager');
          const isStrictSuper = Boolean(updatedUser.isSuperAdmin || updatedUser.role === 'Super Admin');
          const updatedCur = {
            ...parsed,
            username: cleanUsername,
            salespersonCode: cleanCode,
            name: cleanName,
            password: cleanPass,
            role: isAdminRole ? 'admin' : (isAgmRole ? 'agm' : 'salesperson'),
            userRole: updatedUser.role,
            designation: updatedUser.designation,
            isInCharge: updatedUser.isInCharge,
            isSuperAdmin: isStrictSuper,
            branchId: updatedUser.branchId,
            branchName: updatedUser.branchName
          };
          localStorage.setItem('app_current_user', JSON.stringify(updatedCur));
        }
      }
    } catch {}

    setEditingUserId(null);
    setEditUserForm(null);
  };

  // Handler: Approve User Registration
  const handleApproveUser = (sp: Salesperson) => {
    const updatedUser: Salesperson = {
      ...sp,
      isApproved: true,
      approvedBy: currentUser?.name || currentUser?.username || 'Super Admin',
      approvedAt: new Date().toISOString()
    };
    if (onUpdateSalesperson) {
      onUpdateSalesperson(updatedUser);
    } else if (setSalespersons) {
      setSalespersons((prev) => prev.map((s) => (s.id === sp.id ? updatedUser : s)));
    }
  };

  // Handler: Reject User Registration
  const handleRejectUser = (sp: Salesperson) => {
    setSalesDirConfirmModal({
      isOpen: true,
      title: 'Reject User Registration',
      description: `Reject and delete registration for "${sp.name}" (${sp.code})? This will move the user to the Trash archive.`,
      confirmText: 'Reject & Delete',
      isDestructive: true,
      onConfirm: () => {
        moveToTrash('polycables_trashed_users', sp, 'Rejected Users');
        if (onDeleteSalesperson) {
          onDeleteSalesperson(sp.id);
        } else if (setSalespersons) {
          setSalespersons((prev) => prev.filter((s) => s.id !== sp.id));
        }
      }
    });
  };

  // Handler: Delete User
  const handleDeleteUser = (id: string) => {
    const userToDelete = salespersons.find((s) => s.id === id);
    if (!userToDelete) return;

    setSalesDirConfirmModal({
      isOpen: true,
      title: 'Delete User Account',
      description: `Are you sure you want to delete user "${userToDelete.name}" (${userToDelete.code})? This account will be moved to the Trash archive and can be restored if needed.`,
      confirmText: 'Delete User',
      isDestructive: true,
      onConfirm: () => {
        moveToTrash('polycables_trashed_users', userToDelete, 'Users & Staff');

        // If deleted user was an admin, unassign their managed branches
        const isSpAdmin =
          userToDelete.role === 'Admin' ||
          (userToDelete.code && userToDelete.code.toUpperCase().startsWith('ADM')) ||
          userToDelete.username?.startsWith('admin');
        if (isSpAdmin && onUpdateBranch) {
          branches.forEach((b) => {
            if (
              b.adminId === userToDelete.id ||
              b.adminUsername === userToDelete.username ||
              b.adminName === userToDelete.name ||
              userToDelete.assignedBranchIds?.includes(b.id)
            ) {
              const updatedBranch: BranchLocation = {
                ...b,
                adminId: undefined,
                adminName: undefined,
                adminUsername: undefined
              };
              onUpdateBranch(updatedBranch);
            }
          });
        }

        if (onDeleteSalesperson) {
          onDeleteSalesperson(id);
        } else if (setSalespersons) {
          setSalespersons((prev) => prev.filter((s) => s.id !== id));
        }
      }
    });
  };

  // Handler: Create Showroom / Branch
  const handleCreateBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) {
      return;
    }

    const effectiveAdminId = newBranchAdminId.trim();

    const inChargeUser = salespersons.find((s) => s.id === newBranchInChargeId);
    const assignedAdmin = effectiveAdminId
      ? salespersons.find((s) => s.id === effectiveAdminId || s.code === effectiveAdminId || s.username === effectiveAdminId)
      : undefined;

    const newBranchPayload: Omit<BranchLocation, 'id'> & { isUserCreated?: boolean } = {
      name: newBranchName.trim(),
      type: newBranchType,
      isUserCreated: true,
      inChargeId: inChargeUser?.id,
      inChargeName: inChargeUser ? `${inChargeUser.name} (${inChargeUser.code})` : undefined,
      inChargePhone: inChargeUser?.phone,
      approverName: newBranchApprover.trim() || currentDefaultApprover || '',
      adminId: assignedAdmin?.id,
      adminName: assignedAdmin ? assignedAdmin.name : undefined,
      adminUsername: assignedAdmin ? (assignedAdmin.username || assignedAdmin.code) : undefined,
      address: newBranchAddress.trim(),
      phone: newBranchPhone.trim() || inChargeUser?.phone || '',
      email: newBranchEmail.trim(),
      isActive: newBranchIsActive
    };

    if (onAddBranch) {
      onAddBranch(newBranchPayload);
    } else if (setBranches) {
      setBranches((prev) => [...prev, { ...newBranchPayload, id: `branch-${Date.now()}` }]);
    }

    // Also link user to this branch if inCharge was selected
    if (inChargeUser && (!inChargeUser.branchId || inChargeUser.branchId !== '')) {
      const updatedInCharge: Salesperson = {
        ...inChargeUser,
        branchName: newBranchName.trim()
      };
      if (onUpdateSalesperson) onUpdateSalesperson(updatedInCharge);
    }

    // Reset Form & Clear search so the new sales center is immediately visible
    setNewBranchName('');
    setNewBranchType('showroom');
    setNewBranchInChargeId('');
    setNewBranchApprover('');
    setNewBranchAdminId('');
    setNewBranchAddress('');
    setNewBranchPhone('');
    setNewBranchEmail('');
    setNewBranchIsActive(true);
    setBranchSearch('');
    setBranchTypeFilter('all');
    setIsAddingBranch(false);
  };

  // Handler: Save Branch Edit
  const handleSaveBranchEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBranchForm) return;

    const inChargeUser = salespersons.find((s) => s.id === editBranchForm.inChargeId);
    const assignedAdmin = editBranchForm.adminId
      ? salespersons.find(
          (s) => s.id === editBranchForm.adminId || s.code === editBranchForm.adminId || s.username === editBranchForm.adminId
        )
      : undefined;
    const updatedBranch: BranchLocation = {
      ...editBranchForm,
      inChargeName: inChargeUser ? `${inChargeUser.name} (${inChargeUser.code})` : (editBranchForm.inChargeId ? editBranchForm.inChargeName : undefined),
      inChargePhone: inChargeUser?.phone || (editBranchForm.inChargeId ? editBranchForm.inChargePhone : undefined),
      adminId: assignedAdmin ? assignedAdmin.id : (editBranchForm.adminId || undefined),
      adminName: assignedAdmin ? assignedAdmin.name : (editBranchForm.adminId ? editBranchForm.adminName : undefined),
      adminUsername: assignedAdmin ? (assignedAdmin.username || assignedAdmin.code) : (editBranchForm.adminId ? editBranchForm.adminUsername : undefined),
      assignedAdminId: assignedAdmin ? assignedAdmin.id : (editBranchForm.adminId || undefined)
    };

    if (onUpdateBranch) {
      onUpdateBranch(updatedBranch);
    } else if (setBranches) {
      setBranches((prev) => prev.map((b) => (b.id === updatedBranch.id ? updatedBranch : b)));
    }

    setEditingBranchId(null);
    setEditBranchForm(null);
  };

  // Handler: Attempt to Delete Showroom / Branch with Validation
  const handleAttemptDeleteBranch = (branch: BranchLocation) => {
    if (isProtectedSalesCenter(branch, salespersons)) {
      alert(`"${branch.name}" is a core Sales Center assigned to Default Admin and CANNOT be deleted or removed from the system.`);
      return;
    }
    const branchNameClean = branch.name.trim().toLowerCase();
    const stationedStaff = salespersons.filter(
      (s) =>
        s.branchId === branch.id ||
        (s.branchName && s.branchName.trim().toLowerCase() === branchNameClean)
    );
    const branchParties = parties.filter(
      (p) =>
        p.branchId === branch.id ||
        (p.branchName && p.branchName.trim().toLowerCase() === branchNameClean)
    );
    const isHeadOffice =
      branch.type === 'head_office' ||
      branchNameClean.includes('head office') ||
      branch.name.toLowerCase().includes('head office');

    if (stationedStaff.length > 0 || branchParties.length > 0 || isHeadOffice) {
      setBlockedBranchDeletion({
        branch,
        staffCount: stationedStaff.length,
        staffNames: stationedStaff.map((s) => `${s.name} (${s.code || s.role || 'Staff'})`),
        partiesCount: branchParties.length,
        partiesSample: branchParties.slice(0, 5).map((p) => p.name),
        isHeadOffice
      });
      return;
    }

    // Branch has no dependencies and is not Head Office
    setConfirmDeleteBranch(branch);
  };

  const executeConfirmDeleteBranch = () => {
    if (!confirmDeleteBranch) return;
    const branchId = confirmDeleteBranch.id;
    if (onDeleteBranch) {
      onDeleteBranch(branchId);
    } else if (setBranches) {
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
    }
    setConfirmDeleteBranch(null);
  };

  // Legacy fallback if referenced
  const handleDeleteBranch = (id: string) => {
    const target = branches.find((b) => b.id === id);
    if (target) {
      handleAttemptDeleteBranch(target);
    }
  };

  return (
    <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans space-y-0 text-white">
      {/* Top Header Banner */}
      <div className="bg-[#0c2638]/75 text-white px-5 py-3.5 border-b border-cyan-500/25 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 min-w-[160px]">
            <span>Centers: <strong className="text-amber-300">{cleanSortedBranches.length}</strong></span>
            <span>•</span>
            <span>In-Charges: <strong className="text-emerald-300">{inChargeBranchMap.size}</strong></span>
          </div>

          <div className="flex-1 flex items-center justify-center space-x-2">
            <UserCheck className="w-5 h-5 text-cyan-400 shrink-0" />
            <h1 className="text-base sm:text-lg font-black tracking-wide text-white text-center">
              User &amp; Sales Center Directory
            </h1>
          </div>

          <div className="flex items-center justify-end space-x-1.5 min-w-[90px] sm:min-w-[160px]">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[#061520] hover:bg-[#0e2a3d] border border-cyan-500/30 text-cyan-200 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-[#061520] hover:bg-rose-500/20 border border-cyan-500/30 hover:border-rose-400/50 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Top-Middle Button Set */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              activeTab === 'users'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                : 'bg-[#061520] text-cyan-200 border-cyan-500/30 hover:bg-[#0e2a3d]'
            }`}
          >
            Users &amp; Staff ({salespersons.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('showrooms')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              activeTab === 'showrooms'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                : 'bg-[#061520] text-cyan-200 border-cyan-500/30 hover:bg-[#0e2a3d]'
            }`}
          >
            Sales Center &amp; User List ({cleanSortedBranches.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin_set')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              activeTab === 'admin_set'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                : 'bg-[#061520] text-cyan-200 border-cyan-500/30 hover:bg-[#0e2a3d]'
            }`}
          >
            Admin &amp; Sales Center Set ({allAdminClusters.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mapping')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              activeTab === 'mapping'
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm'
                : 'bg-[#061520] text-cyan-200 border-cyan-500/30 hover:bg-[#0e2a3d]'
            }`}
          >
            Sales Center &amp; Staff Mapping
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. USERS & STAFF DIRECTORY TAB */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="p-5 space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-[#081e2d]/85 backdrop-blur-xl border border-cyan-500/25 rounded-2xl p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-2 shadow-lg text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, code, phone, role, sales center..."
                  className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 font-medium"
                />
                {userSearch && (
                  <button
                    type="button"
                    onClick={() => setUserSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Role Filter */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#091e2c] text-white">All Roles &amp; Statuses</option>
                  {pendingUsers.length > 0 && (
                    <option value="pending" className="text-amber-300 font-bold bg-[#0c2638]">
                      ⚠️ Pending Approval ({pendingUsers.length})
                    </option>
                  )}
                  <option value="approved" className="bg-[#091e2c] text-white">Approved Users Only</option>
                  <option value="marketing" className="bg-[#091e2c] text-white">Marketing Officers Only</option>
                  <option value="incharge" className="bg-[#091e2c] text-white">Sales Center In-Charges ⭐</option>
                  <option value="staff" className="bg-[#091e2c] text-white">Sales Center Staff / Admin</option>
                </select>
              </div>

              {/* Showroom / Branch Filter */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <select
                  value={userBranchFilter}
                  onChange={(e) => setUserBranchFilter(e.target.value)}
                  className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#091e2c] text-white">All Sales Centers & Outlets</option>
                  {cleanSortedBranches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-[#091e2c] text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters Reset Button (Live) */}
              {(userSearch || userRoleFilter !== 'all' || userBranchFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setUserSearch('');
                    setUserRoleFilter('all');
                    setUserBranchFilter('all');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Clear active filters"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="text-xs text-slate-300 font-medium flex items-center space-x-2">
              <span>Showing:</span>
              <span className="font-black text-cyan-200 bg-[#061520]/90 px-2.5 py-1 h-[34px] flex items-center rounded-xl border border-cyan-500/30 shadow-2xs">
                {filteredSalespersons.length} of {salespersons.length} Users
              </span>
            </div>
          </div>

          {/* Add New User Inline Form */}
          {isAddingUser && (
            <form
              onSubmit={handleCreateUserSubmit}
              className="p-5 cyber-glass-subcard border border-cyan-400/35 rounded-2xl text-xs space-y-4 shadow-md animate-in fade-in"
            >
              <div className="flex items-center justify-between font-extrabold text-cyan-200 border-b border-cyan-500/25 pb-2">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm">Create New User / Staff Profile</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Role / User Type */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Role *</label>
                  <select
                    value={selectedRoleOption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedRoleOption(val);
                      if (val.includes('Admin') || val === 'Super Admin' || val === 'Factory') {
                        setNewIsInCharge(false);
                      }
                      if (val === 'Sales Center In-Charge') {
                        setNewIsInCharge(true);
                      }
                      if (val.includes('Admin')) {
                        setNewUserBranchId('');
                        setNewAreaGroup('');
                      }
                    }}
                    required
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="">-- Select Role --</option>
                    <option value="Admin (Regional Admin)">Admin (Regional)</option>
                    <option value="Admin ( Accounts )">Admin ( Accounts )</option>
                    {isSuvroAdmin(currentUser) && (
                      <option value="Super Admin">Super Admin</option>
                    )}
                    <option value="Sales Center In-Charge">Sales Center In-Charge</option>
                    <option value="Marketing Officer">Marketing Officer</option>
                    <option value="Sales Center Staff">Sales Center Staff</option>
                    <option value="Accountant sales center">Accountant sales center</option>
                    <option value="Factory">Factory</option>
                  </select>
                </div>

                {/* Designation Dropdown */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Designation *</label>
                  <select
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none cursor-pointer"
                  >
                    {USER_DESIGNATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* In-Charge Tik Mark Yes / No (Hidden for Admin, Admin Accounts, Super Admin, Factory) */}
                {!(selectedRoleOption === 'Admin (Regional Admin)' || selectedRoleOption === 'Admin ( Accounts )' || selectedRoleOption === 'Super Admin' || selectedRoleOption === 'Admin' || selectedRoleOption === 'Factory') ? (
                  <div>
                    <label className="font-bold text-slate-200 block mb-1">In-Charge</label>
                    <label className="flex items-center space-x-2.5 p-2 bg-[#061520] border border-cyan-500/30 rounded-xl cursor-pointer hover:bg-[#0c2638] transition-colors h-[42px]">
                      <input
                        type="checkbox"
                        checked={newIsInCharge}
                        onChange={(e) => setNewIsInCharge(e.target.checked)}
                        className="w-4 h-4 text-cyan-400 rounded border-cyan-500/40 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
                      />
                      <span className="text-xs font-bold select-none flex items-center gap-1.5">
                        {newIsInCharge ? (
                          <span className="text-emerald-300 font-extrabold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Tik Mark: Yes (Auto: In-Charge)
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            <span className="w-3.5 h-3.5 inline-block border border-slate-500 rounded-xs text-[10px] text-center leading-none text-slate-400">✗</span>
                            Tik Mark: No
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="hidden sm:block"></div>
                )}

                {/* Assigned Sales Center for Single-Center Users */}
                {!selectedRoleOption.includes('Admin') && selectedRoleOption !== 'Super Admin' && selectedRoleOption !== 'Factory' && (
                  <div>
                    <label className="font-bold text-slate-200 block mb-1">Sales Center *</label>
                    <select
                      value={newUserBranchId}
                      onChange={(e) => setNewUserBranchId(e.target.value)}
                      className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-semibold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    >
                      <option value="">-- Select Sales Center --</option>
                      {cleanSortedBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {formatSalesCenterDisplayName(b.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Multi-Sales Center Assignment for Regional Admin (Every Admin has 4/5 Sales Centers) */}
              {(selectedRoleOption === 'Admin (Regional Admin)' || selectedRoleOption === 'Admin (Regional)') && (
                <div className="bg-[#081c2a]/90 border border-cyan-400/30 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-black text-cyan-200 text-xs">
                        Assign Sales Centers under this Admin ({newAdminBranchIds.length} Selected)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-cyan-200 bg-cyan-500/15 px-2 py-0.5 rounded-md border border-cyan-400/30">
                      Rule: Each Admin manages 4 to 5 Sales Centers
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2.5 bg-[#061520] rounded-lg border border-cyan-500/25">
                    {cleanSortedBranches.map((b) => {
                      const isChecked = newAdminBranchIds.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-center space-x-2 text-xs p-2 rounded-lg cursor-pointer border transition-colors ${
                            isChecked
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100 font-bold'
                              : 'bg-[#0b2334]/60 border-cyan-500/20 text-slate-300 hover:bg-[#0c2638]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewAdminBranchIds((prev) => [...prev, b.id]);
                              } else {
                                setNewAdminBranchIds((prev) => prev.filter((id) => id !== b.id));
                              }
                            }}
                            className="w-4 h-4 rounded text-cyan-400 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
                          />
                          <span className="truncate" title={b.name}>
                            {formatSalesCenterDisplayName(b.name)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* User Code */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Staff Id / User Code</label>
                  <input
                    type="text"
                    placeholder={`e.g. U${String(salespersons.length + 1).padStart(2, '0')} or S04`}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-mono font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>

                {/* Full Name */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mahfuzur Rahman"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="01711-xxxxxx"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] text-white placeholder-slate-400 font-mono focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-start">
                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-200">Login PIN / Password</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Default: 123456 (min 6 digits)"
                    value={newSpPassword}
                    onChange={(e) => setNewSpPassword(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] text-white placeholder-slate-400 font-mono font-bold focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="flex items-center justify-between text-[11px] mt-1.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPasswordModal(null, 'change')}
                      className="text-cyan-300 hover:text-cyan-200 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Change Password</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenPasswordModal(null, 'forgot')}
                      className="text-amber-300 hover:text-amber-200 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Forgot Password?</span>
                    </button>
                  </div>
                </div>

                {/* Target Inputs: HIDDEN if Role is Admin, Admin Accounts, Super Admin or Factory */}
                {!selectedRoleOption.includes('Admin') && selectedRoleOption !== 'Super Admin' && selectedRoleOption !== 'Factory' && isUserAdminOrSuper && (
                  <>
                    <div>
                      <label className="font-bold text-amber-300 block mb-1">🎯 Monthly Target (৳)</label>
                      <input
                        type="number"
                        placeholder="e.g. 500000"
                        value={newMonthlyTarget}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewMonthlyTarget(val);
                          if (val && !isNaN(Number(val))) {
                            setNewYearlyTarget(String(Number(val) * 12));
                          }
                        }}
                        className="w-full p-2.5 border border-amber-400/40 rounded-xl text-xs bg-[#061520] font-mono font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-amber-300 block mb-1">📅 Yearly Target (৳)</label>
                      <input
                        type="number"
                        placeholder="e.g. 6000000"
                        value={newYearlyTarget}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewYearlyTarget(val);
                          if (val && !isNaN(Number(val))) {
                            setNewMonthlyTarget(String(Math.round(Number(val) / 12)));
                          }
                        }}
                        className="w-full p-2.5 border border-amber-400/40 rounded-xl text-xs bg-[#061520] font-mono font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 px-4 py-2 rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-5 py-2 rounded-xl font-black cursor-pointer shadow-md transition-all"
                >
                  Save User Profile
                </button>
              </div>
            </form>
          )}

          {/* Admin Approval Notice removed per user request: new users are active upon registration */}

          {/* User Table */}
          <div className="overflow-x-auto rounded-xl border border-cyan-500/25 bg-[#071824]/70 shadow-2xs">
            {filteredSalespersons.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs bg-[#091e2c]/60">
                <Users className="w-8 h-8 text-cyan-400/40 mx-auto mb-2" />
                <p className="font-semibold text-slate-200">No user records found matching your filters.</p>
                <p className="text-slate-400 mt-1">Try changing your search term or clear the branch/role filter.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-2 w-16 text-center">Code</th>
                    <th className="py-2.5 px-3 min-w-[140px]">User Full Name</th>
                    <th className="py-2.5 px-2 min-w-[130px]">Designation &amp; Role</th>
                    <th className="py-2.5 px-1 w-20 text-center">In-Charge</th>
                    <th className="py-2.5 px-2 min-w-[130px]">Assigned Sales Center</th>
                    <th className="py-2.5 px-1 w-20 text-center">Status</th>
                    <th className="py-2.5 px-2 w-28">Phone</th>
                    <th className="py-2.5 px-1 w-28 text-center">Login Password</th>
                    <th className="py-2.5 px-1 w-20 text-center">Parties</th>
                    <th className="py-2.5 px-1 w-24 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-transparent text-slate-200">
                  {filteredSalespersons.map((sp, idx) => {
                    const isEditing = editingUserId === sp.id;
                    const isPasswordVisible = !!visiblePasswordIds[sp.id];
                    const currentPassword = sp.password || '1234';

                    // Check if In-Charge of any branch
                    const inChargeOfBranch = inChargeBranchMap.get(sp.id);

                    // Assigned branch name
                    const userBranch = branches.find((b) => b.id === sp.branchId) || (sp.branchName ? { name: sp.branchName } : null);
                    const isStaffOrAcc = isAccountsOrStaff(sp as any, salespersons) || !isMarketingOfficer(sp);

                    // Pre-computed count of parties assigned to this salesperson
                    const assignedPartiesCount = assignedPartiesCountMap.get(sp.id) || 0;

                    if (isEditing && editUserForm) {
                      const isEditAdmin = editUserForm.role === 'Admin' || editUserForm.role === 'Director / Admin';

                      return (
                        <tr key={sp.id ? `${sp.id}-${idx}` : `sp-edit-${idx}`} ref={editUserRowRef} className="bg-cyan-500/15">
                          <td className="p-2 space-y-1">
                            <input
                              type="text"
                              value={editUserForm.code}
                              onChange={(e) => setEditUserForm({ ...editUserForm, code: e.target.value })}
                              placeholder="Code"
                              title="User Code"
                              className="w-full p-1 border border-cyan-500/35 rounded font-mono font-bold text-xs text-center bg-[#061520] text-white"
                            />
                            <input
                              type="text"
                              value={editUserForm.username || ''}
                              onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                              placeholder={`Login: ${editUserForm.code.toLowerCase()}`}
                              title="Login ID / Username"
                              className="w-full p-1 border border-cyan-500/35 rounded font-mono text-[11px] text-center bg-[#061520] text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editUserForm.name}
                              onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                              className="w-full p-1.5 border border-cyan-500/35 rounded font-bold text-xs bg-[#061520] text-white"
                            />
                          </td>
                          <td className="p-2 space-y-1">
                            <select
                              value={editUserForm.role || (editUserForm.userType === 'marketing' ? 'Marketing Officer' : 'Sales Center Staff')}
                              onChange={(e) => {
                                const val = e.target.value;
                                const isMkt = val.toLowerCase().includes('marketing');
                                const isAdminRole = val.includes('Admin') || val === 'Super Admin';
                                const isFactory = val === 'Factory';
                                const isInChargeRole = val === 'Sales Center In-Charge' || val === 'Showroom In-Charge';
                                setEditUserForm({
                                  ...editUserForm,
                                  role: val,
                                  userType: isMkt ? 'marketing' : 'user',
                                  isInCharge: isInChargeRole ? true : ((isAdminRole || isFactory) ? false : editUserForm.isInCharge),
                                  branchId: (isAdminRole || isFactory) ? undefined : editUserForm.branchId,
                                  branchName: (isAdminRole || isFactory) ? undefined : editUserForm.branchName
                                });
                              }}
                              className="w-full p-1 border border-cyan-500/35 rounded text-xs font-bold bg-[#061520] text-white"
                            >
                              <option value="Admin (Regional Admin)">Admin (Regional)</option>
                              <option value="Admin ( Accounts )">Admin ( Accounts )</option>
                              {isSuvroAdmin(currentUser) && (
                                <option value="Super Admin">Super Admin</option>
                              )}
                              <option value="Sales Center In-Charge">Sales Center In-Charge</option>
                              <option value="Marketing Officer">Marketing Officer</option>
                              <option value="Sales Center Staff">Sales Center Staff</option>
                              <option value="Accountant sales center">Accountant sales center</option>
                              <option value="Factory">Factory</option>
                              {editUserForm.role && ![
                                'Admin (Regional Admin)',
                                'Admin ( Accounts )',
                                'Super Admin',
                                'Sales Center In-Charge',
                                'Marketing Officer',
                                'Sales Center Staff',
                                'Accountant sales center',
                                'Factory'
                              ].includes(editUserForm.role) && (
                                <option value={editUserForm.role}>{editUserForm.role}</option>
                              )}
                            </select>
                            <select
                              value={editUserForm.designation || 'Executive'}
                              onChange={(e) => setEditUserForm({ ...editUserForm, designation: e.target.value })}
                              className="w-full p-1 border border-cyan-500/35 rounded text-[11px] font-semibold bg-[#061520] text-white"
                            >
                              {editUserForm.designation && !USER_DESIGNATIONS.includes(editUserForm.designation as any) && (
                                <option value={editUserForm.designation}>{editUserForm.designation}</option>
                              )}
                              {USER_DESIGNATIONS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            {(isEditAdmin || editUserForm.role?.includes('Admin') || editUserForm.role === 'Super Admin' || editUserForm.role === 'Factory') ? (
                              <span className="text-slate-400 font-bold text-xs" title="In-Charge is not applicable for this role">—</span>
                            ) : (
                              <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!editUserForm.isInCharge}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setEditUserForm({
                                      ...editUserForm,
                                      isInCharge: checked,
                                      role: checked ? 'Sales Center In-Charge' : (editUserForm.role === 'Sales Center In-Charge' ? 'Sales Center Staff' : editUserForm.role)
                                    });
                                  }}
                                  className="w-4 h-4 text-cyan-400 rounded border-cyan-500/40 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
                                />
                                <span className="text-xs font-bold">
                                  {editUserForm.isInCharge ? (
                                    <span className="text-emerald-300 font-extrabold">Yes</span>
                                  ) : (
                                    <span className="text-slate-400">No</span>
                                  )}
                                </span>
                              </label>
                            )}
                          </td>
                          <td className="p-2">
                            {isEditAdmin ? (
                              <div className="p-1.5 bg-[#0c2638] border border-cyan-500/25 rounded text-[11px] font-bold text-cyan-200 truncate">
                                No Sales Center (Admin)
                              </div>
                            ) : (
                              <select
                                value={editUserForm.branchId || ''}
                                onChange={(e) => {
                                  const targetB = branches.find((b) => b.id === e.target.value);
                                  setEditUserForm({
                                    ...editUserForm,
                                    branchId: e.target.value,
                                    branchName: targetB?.name || ''
                                  });
                                }}
                                className="w-full p-1.5 border border-cyan-500/35 rounded text-xs font-semibold bg-[#061520] text-white"
                              >
                                <option value="">-- No Sales Center --</option>
                                {cleanSortedBranches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {formatSalesCenterDisplayName(b.name)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <select
                              value={editUserForm.isApproved !== false ? 'approved' : 'pending'}
                              onChange={(e) =>
                                setEditUserForm({
                                  ...editUserForm,
                                  isApproved: e.target.value === 'approved',
                                  approvedBy: e.target.value === 'approved' ? (currentUser?.name || 'Admin') : undefined,
                                  approvedAt: e.target.value === 'approved' ? new Date().toISOString() : undefined
                                })
                              }
                              className="p-1 border border-cyan-500/35 rounded text-[11px] font-bold bg-[#061520] text-white"
                            >
                              <option value="approved">Approved</option>
                              <option value="pending">Pending</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editUserForm.phone || ''}
                              onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                              className="w-full p-1.5 border border-cyan-500/35 rounded text-xs bg-[#061520] text-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editUserForm.password || '123456'}
                              inputMode="numeric"
                              placeholder="Min 6 digits"
                              onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value.replace(/\D/g, '') })}
                              className="w-full p-1.5 border border-cyan-500/35 rounded text-xs font-mono font-bold text-center bg-[#061520] text-white tracking-widest"
                            />
                          </td>
                          <td className="p-2 text-center text-cyan-200 font-bold">
                            {assignedPartiesCount} Parties
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={handleSaveUserEdit}
                                className="bg-cyan-500 text-slate-950 px-2.5 py-1 rounded text-xs font-black hover:bg-cyan-400 cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditUserForm(null);
                                }}
                                className="bg-[#081b28] text-slate-200 border border-cyan-500/25 px-2.5 py-1 rounded text-xs hover:bg-[#0e2a3d] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const isAdmin = isAdminSalesperson(sp);
                    const isMarketing = isMarketingOfficer(sp);
                    const displayRole = isAdmin
                      ? 'Administrator'
                      : (sp.role === 'Showroom Staff' ? 'Sales Center Staff' : sp.role === 'Showroom In-Charge' ? 'Sales Center In-Charge' : sp.role) || (isMarketing ? 'Marketing Officer' : 'Sales Center Staff');
                    const isJustCreated = newlyCreatedUserId && (sp.id === newlyCreatedUserId || sp.code === newlyCreatedUserId);

                    return (
                      <tr
                        key={sp.id ? `${sp.id}-${idx}` : `sp-row-${idx}`}
                        className={`transition-colors ${
                          isJustCreated
                            ? 'bg-emerald-500/15 ring-2 ring-emerald-400/60'
                            : 'hover:bg-cyan-500/[0.06]'
                        }`}
                      >
                        <td className="p-3 text-center font-mono font-black text-cyan-300 bg-[#0c2638]/50">
                          {sp.code}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 font-bold text-white text-sm">
                              <UserCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                              <span>{sp.name}</span>
                              {isJustCreated && (
                                <span className="inline-flex items-center space-x-1 bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black animate-pulse shadow-xs">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>LIVE NOW</span>
                                </span>
                              )}
                            </div>
                            {inChargeOfBranch && (
                              <div className="inline-flex items-center space-x-1 bg-amber-500/20 text-amber-200 border border-amber-400/35 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <Sparkles className="w-3 h-3 text-amber-300" />
                                <span>In-Charge: {inChargeOfBranch.name}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-400/30">
                              {sp.designation || 'Executive'}
                            </span>
                            <span
                              className={`inline-block text-[11px] font-black px-2.5 py-0.5 rounded-md border uppercase tracking-tight ${
                                isMarketing
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                                  : 'bg-purple-500/15 text-purple-200 border-purple-400/35'
                              }`}
                            >
                              {displayRole}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {sp.isInCharge || inChargeOfBranch ? (
                            <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 px-2.5 py-0.5 rounded-full font-extrabold text-[11px] shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Yes</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 bg-slate-800/80 text-slate-400 border border-slate-700 px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                              <span>No</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {sp.role === 'Admin' || sp.role === 'Super Admin' || sp.isSuperAdmin ? (() => {
                            const adminBranches = getAdminBranches(sp as any, branches, salespersons);
                            const isExpanded = expandedAdminId === sp.id;
                            const targetCluster: AdminClusterInfo = allAdminClusters.find((c) =>
                              c.adminId === sp.id ||
                              c.adminUsername?.toLowerCase() === sp.username?.toLowerCase() ||
                              c.adminName?.toLowerCase() === sp.name?.toLowerCase()
                            ) || {
                              adminId: sp.id,
                              adminName: sp.name,
                              adminUsername: sp.username || 'admin',
                              adminZone: (sp as any).zone || 'Central Zone',
                              branches: adminBranches,
                              branchCount: adminBranches.length,
                              staffCount: 0
                            };

                            return (
                              <div className="space-y-1.5">
                                <div className="flex items-center space-x-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAdminAssignModal(targetCluster)}
                                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer bg-cyan-500/15 text-cyan-200 border border-cyan-400/35 hover:bg-indigo-600 hover:text-white group shadow-2xs"
                                    title="Click to view & select or unselect sales centers with tik marks"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 group-hover:text-white" />
                                    <span className="font-mono">{adminBranches.length} Sales Centers</span>
                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-300 group-hover:text-white" />
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="p-2.5 bg-[#081c2a] border border-cyan-400/30 rounded-xl space-y-2 max-w-[280px] animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-black uppercase text-cyan-200 tracking-wider">
                                        Assigned Centers ({adminBranches.length})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAdminAssignModal(targetCluster)}
                                        className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline cursor-pointer"
                                      >
                                        Edit Set
                                      </button>
                                    </div>
                                    {adminBranches.length === 0 ? (
                                      <div className="space-y-1 text-center py-1">
                                        <p className="text-[11px] text-slate-400 italic">No sales centers assigned yet.</p>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenAdminAssignModal(targetCluster)}
                                          className="text-[10px] font-bold text-indigo-200 hover:text-white bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 rounded shadow-2xs cursor-pointer"
                                        >
                                          + Assign Sales Centers
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
                                        {adminBranches.map((b) => (
                                          <span
                                            key={b.id}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#0c2638] text-cyan-200 border border-cyan-500/30 px-2 py-0.5 rounded shadow-2xs"
                                            title={b.name}
                                          >
                                            <span className="truncate max-w-[120px]">{b.name}</span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveBranchFromAdmin(targetCluster, b.id);
                                              }}
                                              className="text-slate-400 hover:text-rose-400 ml-0.5 font-bold cursor-pointer"
                                              title={`Remove ${b.name}`}
                                            >
                                              &times;
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })() : userBranch ? (
                            <div className="flex items-center space-x-1.5 text-slate-200 font-semibold">
                              <Building2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{userBranch.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Unassigned / HO</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {sp.isApproved === false ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center space-x-1 bg-amber-500/20 text-amber-200 border border-amber-400/35 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                                <AlertCircle className="w-3 h-3 text-amber-300" />
                                <span>Pending</span>
                              </span>
                              {canApproveUsers && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <button
                                    onClick={() => handleApproveUser(sp)}
                                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shadow-2xs cursor-pointer"
                                    title="Approve User Registration"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectUser(sp)}
                                    className="px-1.5 py-0.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 rounded text-[10px] font-semibold border border-rose-400/35 cursor-pointer"
                                    title="Reject User Registration"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span
                              className="inline-flex items-center space-x-1 bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold text-[10px]"
                              title={sp.approvedBy ? `Approved by ${sp.approvedBy}` : 'Approved Profile'}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Approved</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 font-mono">
                          {sp.phone ? (
                            <div className="flex items-center space-x-1">
                              <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                              <span>{sp.phone}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="inline-flex items-center space-x-1.5 bg-[#0c2638] px-2 py-1 rounded font-mono text-xs font-bold text-cyan-200 border border-cyan-500/25">
                              <KeyRound className="w-3 h-3 text-cyan-400" />
                              <span>{isPasswordVisible ? currentPassword : '••••••••'}</span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(sp.id)}
                                className="text-slate-400 hover:text-white cursor-pointer ml-1"
                                title={isPasswordVisible ? 'Hide Password' : 'Show Password'}
                              >
                                {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleOpenPasswordModal(sp, 'change')}
                                className="text-cyan-300 hover:text-cyan-200 font-bold hover:underline cursor-pointer"
                                title="Change Password (requires old password)"
                              >
                                Change
                              </button>
                              <span className="text-slate-600">•</span>
                              <button
                                type="button"
                                onClick={() => handleOpenPasswordModal(sp, 'forgot')}
                                className="text-amber-300 hover:text-amber-200 font-bold hover:underline cursor-pointer"
                                title="Forgot Password / Reset PIN"
                              >
                                Forgot?
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setSelectedSpCode(selectedSpCode === sp.code ? null : sp.code)}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                              assignedPartiesCount > 0
                                ? 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 border border-cyan-400/35'
                                : 'bg-[#0c2638] text-slate-400 border border-slate-700'
                            }`}
                            title="Click to toggle connected party details"
                          >
                            <Users className="w-3.5 h-3.5 inline mr-1" />
                            {assignedPartiesCount} {assignedPartiesCount === 1 ? 'Party' : 'Parties'}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPasswordModal(sp, 'change')}
                              className="text-slate-400 hover:text-indigo-300 p-1.5 rounded-lg hover:bg-indigo-500/15 transition-colors cursor-pointer"
                              title="Change / Reset User Password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const cleanRole = (sp.role === 'Showroom Staff' ? 'Sales Center Staff' : sp.role === 'Showroom In-Charge' ? 'Sales Center In-Charge' : sp.role) || (sp.userType === 'user' ? 'Sales Center Staff' : 'Marketing Officer');
                                setEditingUserId(sp.id);
                                setEditUserForm({
                                  ...sp,
                                  password: sp.password || '123456',
                                  userType: sp.userType || (cleanRole.toLowerCase().includes('marketing') ? 'marketing' : 'user'),
                                  role: cleanRole,
                                  designation: sp.designation || 'Executive'
                                });
                              }}
                              className="text-slate-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-cyan-500/15 transition-colors cursor-pointer"
                              title="Edit User Details"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(sp.id)}
                              className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/15 transition-colors cursor-pointer"
                              title="Delete User Profile"
                            >
                              <Trash2 className="w-4 h-4" />
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

          {/* Connected Parties Drawer */}
          {selectedSpCode && (
            <div className="cyber-glass-subcard text-white p-5 rounded-2xl border border-cyan-400/30 shadow-xl animate-in fade-in space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                <div className="flex items-center space-x-2.5">
                  <Building2 className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="font-bold text-sm text-white">
                      Parties & Customer Accounts Assigned to Sales Code ({selectedSpCode}):
                    </h3>
                    <p className="text-xs text-slate-400">
                      Invoices created for these parties automatically credit this sales executive.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSpCode(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-cyan-500/15 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(() => {
                const currentSp = salespersons.find((s) => s.code === selectedSpCode);
                const spBranch = currentSp ? (branches.find((b) => b.id === currentSp.branchId) || (currentSp.branchName ? { name: currentSp.branchName } : null)) : null;
                const isSpStaffOrAcc = currentSp ? (isAccountsOrStaff(currentSp as any, salespersons) || !isMarketingOfficer(currentSp)) : false;
                const connected = isSpStaffOrAcc && spBranch && currentSp
                  ? parties.filter((p) => {
                      if (p.salesmanCode && p.salesmanCode.toLowerCase() === selectedSpCode.toLowerCase()) return true;
                      const pCenter = (p.salesCenter || '').toLowerCase().trim();
                      const bName = (spBranch.name || '').toLowerCase().trim();
                      if (pCenter && bName && (pCenter === bName || pCenter.includes(bName.replace('sales center', '').trim()))) return true;
                      const pSp = salespersons.find(
                        (s) =>
                          (p.salesmanCode && s.code.toLowerCase() === p.salesmanCode.toLowerCase()) ||
                          (p.salespersonName && s.name.toLowerCase() === p.salespersonName.toLowerCase())
                      );
                      if (pSp && (pSp.branchId === currentSp.branchId || (pSp.branchName && spBranch.name && pSp.branchName.toLowerCase().trim() === bName))) {
                        return true;
                      }
                      return false;
                    })
                  : parties.filter(
                      (p) =>
                        (p.salesmanCode && p.salesmanCode.toLowerCase() === selectedSpCode.toLowerCase()) ||
                        (currentSp && p.salespersonName && p.salespersonName.toLowerCase() === currentSp.name.toLowerCase())
                    );

                if (connected.length === 0) {
                  return (
                    <div className="text-slate-400 text-xs italic py-4 text-center">
                      No customer parties are currently linked to this salesperson code. Assign parties in the Party Directory!
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {connected.map((p, idx) => (
                      <div key={p.id ? `${p.id}-${idx}` : `party-${idx}`} className="bg-[#061520] p-3 rounded-xl border border-cyan-500/25 text-xs space-y-1.5">
                        <div className="font-bold text-white flex items-center justify-between">
                          <span className="truncate">{p.name}</span>
                          <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 px-2 py-0.5 rounded text-[10px] font-mono">
                            {p.salesmanCode || selectedSpCode}
                          </span>
                        </div>
                        <div className="text-slate-300 text-[11px] flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <span className="truncate">{p.address || 'No address registered'}</span>
                        </div>
                        {p.phone && (
                          <div className="text-slate-400 font-mono text-[11px] flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                            <span>{p.phone}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SHOWROOMS & BRANCHES DIRECTORY TAB */}
      {/* ========================================================================= */}
      {activeTab === 'showrooms' && (
        <div className="p-5 space-y-5">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="cyber-glass-subcard border-amber-400/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Total Outlets</p>
                <p className="text-xl font-black text-white mt-0.5">{cleanSortedBranches.length}</p>
              </div>
              <Building2 className="w-8 h-8 text-amber-400/70" />
            </div>

            <div className="cyber-glass-subcard border-emerald-400/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Sales Centers</p>
                <p className="text-xl font-black text-white mt-0.5">
                  {cleanSortedBranches.length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400/70" />
            </div>

            <div className="cyber-glass-subcard border-cyan-400/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">In-Charges Assigned</p>
                <p className="text-xl font-black text-white mt-0.5">{inChargeBranchMap.size}</p>
              </div>
              <UserCheck className="w-8 h-8 text-cyan-400/70" />
            </div>

            <div className="cyber-glass-subcard border-purple-400/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Stationed Staff</p>
                <p className="text-xl font-black text-white mt-0.5">
                  {salespersons.filter((s) => s.branchId || s.branchName).length}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-400/70" />
            </div>
          </div>

          {/* Admin & Sales Center Mapping Fast Access Banner */}
          <div className="cyber-glass-subcard text-white rounded-2xl p-4 border border-indigo-400/35 shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/25 border border-indigo-400/35 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-white flex items-center space-x-2">
                  <span>Admin & Sales Center Assignment Matrix</span>
                  <span className="text-[10px] bg-indigo-500/25 text-indigo-200 px-2 py-0.5 rounded-full font-mono border border-indigo-400/35">
                    4-5 Centers per Admin
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Assign sales centers to Managing Admins and configure Requisition Approvers and In-Charges.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('admin_set')}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
            >
              <Network className="w-4 h-4" />
              <span>Open Admin & Sales Center Set Tab</span>
            </button>
          </div>

          {/* Search & Branch Type Filters */}
          <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  placeholder="Search sales center name, address, in-charge..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium"
                />
              </div>

              <div className="flex items-center space-x-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                <select
                  value={branchTypeFilter}
                  onChange={(e) => setBranchTypeFilter(e.target.value)}
                  className="p-2 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] font-semibold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                >
                  <option value="all">All Branch Types</option>
                  <option value="showroom">Sales Centers (In-Charge Required)</option>
                  <option value="head_office">Head Office</option>
                  <option value="power_market">Power Market</option>
                  <option value="other">Other Outlets</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <input
                type="file"
                ref={branchExcelFileInputRef}
                accept=".xlsx, .xls, .csv"
                onChange={handleImportBranchesFromXLSX}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => branchExcelFileInputRef.current?.click()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1 shadow-xs border border-emerald-400/35 transition-colors cursor-pointer"
                title="Import sales centers from XLSX file"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-100" />
                <span>Import (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleExportBranchesToXLSX}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-white text-xs px-3 py-2 rounded-lg font-bold flex items-center space-x-1 border border-cyan-500/30 transition-colors cursor-pointer"
                title="Export sales centers list to XLSX file"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export (.xlsx)</span>
              </button>
              <button
                onClick={() => setIsAddingBranch(true)}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Sales Center</span>
              </button>
            </div>
          </div>

          {/* Add Showroom Inline Form */}
          {isAddingBranch && (
            <form
              onSubmit={handleCreateBranchSubmit}
              className="p-5 cyber-glass-subcard border border-amber-400/35 rounded-2xl text-xs space-y-4 shadow-md animate-in fade-in"
            >
              <div className="flex items-center justify-between font-extrabold text-amber-300 border-b border-amber-400/25 pb-2">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span className="text-sm">Register New Sales Center / Branch Location</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingBranch(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Branch Name */}
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-200 block mb-1">Sales Center / Branch Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Madhupur Sales Center"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                {/* Branch Type */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Branch Type *</label>
                  <select
                    value={newBranchType}
                    onChange={(e) => setNewBranchType(e.target.value as BranchType)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="showroom">Sales Center (Requires In-Charge)</option>
                    <option value="head_office">Head Office (No In-Charge)</option>
                    <option value="power_market">Power Market (No In-Charge)</option>
                    <option value="other">Other Outlet</option>
                  </select>
                </div>

                {/* Assigned In-Charge */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">
                    Designated In-Charge {newBranchType === 'showroom' && <span className="text-amber-300 font-bold">*</span>}
                  </label>
                  <select
                    value={newBranchInChargeId}
                    onChange={(e) => setNewBranchInChargeId(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-semibold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="">-- Select In-Charge from Users --</option>
                    {salespersons
                      .filter((s) => s.code.toLowerCase() !== 'suvroadmin' && s.username?.toLowerCase() !== 'suvroadmin' && !s.isSuperAdmin)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} [{s.code}] - {s.phone || 'No Phone'}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Assigned Approver */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Assigned Requisition Approver</label>
                  <input
                    type="text"
                    placeholder="Enter Approver Name"
                    value={newBranchApprover}
                    onChange={(e) => setNewBranchApprover(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>

                {/* Managing Admin */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">
                    Managing Admin <span className="text-amber-300 font-normal">(Assigned Admin)</span>
                  </label>
                  <select
                    value={newBranchAdminId}
                    onChange={(e) => setNewBranchAdminId(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Select Assigned Admin --</option>
                    {adminUsersList.map((adm, admIdx) => (
                      <option key={`adm-add-${adm.id || admIdx}-${admIdx}`} value={adm.id}>
                        {adm.name} ({adm.code || adm.username || 'Admin'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <label className="font-bold text-slate-200 block mb-1">Official Sales Center Phone</label>
                  <input
                    type="text"
                    placeholder="01713-xxxxxx"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] text-white placeholder-slate-400 font-mono focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>

                {/* Address */}
                <div className="sm:col-span-3">
                  <label className="font-bold text-slate-200 block mb-1">Physical Address & Location</label>
                  <input
                    type="text"
                    placeholder="Holding No, Shop No, Market Name, Road, District"
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-amber-400/20">
                <button
                  type="button"
                  onClick={() => setIsAddingBranch(false)}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 px-4 py-2 rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl font-bold cursor-pointer shadow-md transition-all"
                >
                  Register Sales Center
                </button>
              </div>
            </form>
          )}

          {/* Top Control Strip with Approver Configuration, View Switcher & Add Sales Center Button */}
          <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 text-white font-bold">
                <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Sales Centers ({filteredBranches.length})</span>
              </div>

              {/* View Switcher: List View (default) vs Grid View */}
              <div className="flex items-center space-x-1 bg-[#061520] border border-cyan-500/30 rounded-lg p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowroomViewMode('list')}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    showroomViewMode === 'list'
                      ? 'bg-cyan-500 text-slate-950 shadow-2xs'
                      : 'text-slate-300 hover:text-white hover:bg-cyan-500/15'
                  }`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>List View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowroomViewMode('grid')}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    showroomViewMode === 'grid'
                      ? 'bg-cyan-500 text-slate-950 shadow-2xs'
                      : 'text-slate-300 hover:text-white hover:bg-cyan-500/15'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid View</span>
                </button>
              </div>

              {/* Expand / Collapse All Toggle */}
              <button
                type="button"
                onClick={() => {
                  const allExpanded = filteredBranches.length > 0 && filteredBranches.every((b) => expandedBranchIds[b.id]);
                  if (allExpanded) {
                    setExpandedBranchIds({});
                  } else {
                    const next: Record<string, boolean> = {};
                    filteredBranches.forEach((b) => {
                      next[b.id] = true;
                    });
                    setExpandedBranchIds(next);
                  }
                }}
                className="px-2.5 py-1 bg-[#061520] border border-cyan-500/30 hover:bg-[#0e2a3d] text-cyan-200 font-bold rounded-lg text-xs shadow-2xs transition-colors cursor-pointer"
              >
                {filteredBranches.length > 0 && filteredBranches.every((b) => expandedBranchIds[b.id])
                  ? 'Collapse All'
                  : 'Expand All'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-2 bg-cyan-500/15 border border-cyan-400/30 px-3 py-1.5 rounded-lg text-cyan-100">
                <UserCheck className="w-3.5 h-3.5 text-cyan-300" />
                <span className="text-slate-300 font-medium">Default Approver:</span>
                <strong className="font-bold text-white">{currentDefaultApprover || 'Not Assigned'}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setApproverModalBranch('ALL');
                    setApproverInput(currentDefaultApprover);
                  }}
                  className="ml-2 px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded font-black text-[11px] cursor-pointer flex items-center space-x-1 shadow-2xs transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  <span>Set Option</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAddingBranch(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Sales Center / Branch</span>
              </button>
            </div>
          </div>

          {/* Showroom & Sales Centers: List View or Grid View */}
          {showroomViewMode === 'list' ? (
            <div className="space-y-2.5">
              {filteredBranches.map((branch, idx) => {
                const isExpanded = Boolean(expandedBranchIds[branch.id]);
                const inChargeUser = salespersons.find(
                  (s) => s.id === branch.inChargeId || (branch.inChargeName && branch.inChargeName.includes(s.name))
                );

                const stationedStaff = salespersons.filter(
                  (s) => s.branchId === branch.id || (s.branchName && s.branchName.trim().toLowerCase() === branch.name.trim().toLowerCase())
                );

                // Collapsed View: ONLY show Showroom Name ("remove all only show Madhupur Sales Center / Showroom")
                if (!isExpanded) {
                  return (
                    <div
                      key={branch.id}
                      onClick={() => toggleBranchExpand(branch.id)}
                      className="cyber-glass-subcard border-cyan-500/25 hover:border-cyan-400/60 hover:bg-cyan-500/[0.06] rounded-xl px-4 py-3 transition-all duration-150 shadow-2xs cursor-pointer flex items-center justify-between group"
                      title={`Click to view details for ${branch.name}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-[#0c2638] text-cyan-200 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-cyan-500/30 group-hover:bg-cyan-500/25 transition-colors">
                          {idx + 1}
                        </span>
                        <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="text-sm sm:text-base font-black text-white truncate group-hover:text-cyan-200 transition-colors">
                          {branch.name}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {/* Prominently show Sales Center Approver */}
                        <div className="hidden sm:flex items-center space-x-1.5 bg-cyan-500/15 border border-cyan-400/30 px-2.5 py-1 rounded-lg text-xs">
                          <UserCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                          <span className="text-slate-300 font-medium">Approver:</span>
                          <strong className="text-white font-bold">{branch.approverName || currentDefaultApprover || 'Not Assigned'}</strong>
                        </div>

                        {branch.adminName && (
                          <div className="hidden md:flex items-center space-x-1 bg-indigo-500/20 border border-indigo-400/35 px-2 py-0.5 rounded text-[11px] text-indigo-200 font-semibold">
                            <ShieldCheck className="w-3 h-3 text-indigo-300 shrink-0" />
                            <span>Admin: {branch.adminName.replace('(Admin)', '').trim()}</span>
                          </div>
                        )}

                        {isProtectedSalesCenter(branch, salespersons) ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-200 border border-amber-400/35 rounded-lg text-[10px] font-bold"
                            title="Core Sales Center assigned to Default Admin (Cannot be removed)"
                          >
                            <Lock className="w-3 h-3 text-amber-300" />
                            <span>Core Center</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAttemptDeleteBranch(branch);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                            title={`Delete ${branch.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-xs font-bold text-cyan-200 bg-cyan-500/15 group-hover:bg-cyan-500/25 px-2.5 py-1 rounded-lg border border-cyan-400/30 flex items-center space-x-1 transition-colors">
                          <span>View Details</span>
                          <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                }

                // Expanded View: Full details
                return (
                  <div
                    key={branch.id}
                    className="cyber-glass-subcard border-2 border-cyan-400/50 rounded-2xl p-4 sm:p-5 transition-all duration-200 shadow-md space-y-4"
                  >
                    {/* Top Row: Showroom Name, Type, Address, Phone, Approver, and Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-3.5">
                      <div className="flex items-start space-x-3">
                        <span className="w-7 h-7 rounded-xl bg-cyan-500 text-slate-950 font-mono font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              onClick={() => toggleBranchExpand(branch.id)}
                              className="text-base sm:text-lg font-black text-white leading-snug cursor-pointer hover:text-cyan-300 transition-colors"
                              title="Click to collapse"
                            >
                              {branch.name}
                            </h3>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                branch.type === 'showroom'
                                  ? 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                                  : branch.type === 'power_market'
                                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
                                  : 'bg-purple-500/20 text-purple-200 border-purple-400/35'
                              }`}
                            >
                              {branch.type.replace('_', ' ')}
                            </span>
                            {branch.isActive !== false && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 font-bold px-1.5 py-0.5 rounded">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 pt-1.5 font-medium">
                            {branch.address && (
                              <span className="flex items-center space-x-1">
                                <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span>{branch.address}</span>
                              </span>
                            )}
                            {branch.phone && (
                              <span className="flex items-center space-x-1 font-mono">
                                <Phone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span>{branch.phone}</span>
                              </span>
                            )}
                            {branch.email && (
                              <span className="flex items-center space-x-1">
                                <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span>{branch.email}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Approver Pill & Showroom Edit/Delete & Collapse Button */}
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1.5 bg-cyan-500/15 border border-cyan-400/30 px-3 py-1.5 rounded-xl text-xs">
                          <UserCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                          <span className="text-slate-300 font-medium">Approver:</span>
                          <strong className="text-white font-bold">{branch.approverName || currentDefaultApprover || 'Not Assigned'}</strong>
                          <button
                            type="button"
                            onClick={() => {
                              setApproverModalBranch(branch);
                              setApproverInput(branch.approverName || currentDefaultApprover || '');
                            }}
                            className="ml-1.5 px-2 py-0.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded font-black text-[10px] cursor-pointer flex items-center space-x-1 transition-colors shadow-2xs"
                            title="Set Requisition Approver"
                          >
                            <Settings className="w-2.5 h-2.5" />
                            <span>Set Option</span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-1 pl-1">
                          <button
                            onClick={() => {
                              setEditingBranchId(branch.id);
                              setEditBranchForm(branch);
                            }}
                            className="p-1.5 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded-lg transition-colors cursor-pointer"
                            title="Edit Sales Center"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {isProtectedSalesCenter(branch, salespersons) ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-200 border border-amber-400/35 rounded-lg text-[10px] font-bold"
                              title="Core Sales Center assigned to Default Admin (Cannot be removed)"
                            >
                              <Lock className="w-3 h-3 text-amber-300" />
                              <span>Core Center</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAttemptDeleteBranch(branch)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                              title={`Delete ${branch.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleBranchExpand(branch.id)}
                            className="p-1.5 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded-lg transition-colors cursor-pointer"
                            title="Collapse Sales Center Details"
                          >
                            <ChevronUp className="w-4 h-4 text-cyan-400" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Grid: In-Charge & Stationed Staff List */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
                      {/* Left: In-Charge Section (4 cols on lg) */}
                      <div className="lg:col-span-4 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center space-x-1 text-amber-300 font-extrabold text-[11px] uppercase tracking-wider">
                            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>In-Charge (Branch Head)</span>
                          </span>
                          {inChargeUser && (
                            <button
                              type="button"
                              onClick={() => setSelectedSpCode(inChargeUser.code)}
                              className="text-[10px] bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold px-2 py-0.5 rounded hover:bg-amber-500/30 transition-colors cursor-pointer"
                            >
                              Parties ({parties.filter((p) => p.salesmanCode === inChargeUser.code).length})
                            </button>
                          )}
                        </div>

                        {inChargeUser ? (
                          <div className="space-y-1">
                            <div className="font-black text-white text-xs flex items-center space-x-1.5">
                              <span>{inChargeUser.name}</span>
                              <span className="font-mono text-[10px] bg-amber-500/25 text-amber-200 px-1.5 py-0.2 rounded font-bold border border-amber-400/30">
                                #{inChargeUser.code}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300">
                              {(inChargeUser.role === 'Showroom In-Charge' ? 'Sales Center In-Charge' : inChargeUser.role) || 'Sales Center In-Charge'} • {inChargeUser.phone}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 pt-0.5">
                              🎯 Monthly Target: <strong className="text-amber-200">৳{(inChargeUser.monthlyTargetSales || 0).toLocaleString()}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-200/80 italic bg-[#061520] p-2 rounded-lg border border-amber-400/25">
                            No designated In-Charge assigned to this Sales Center.
                          </div>
                        )}
                      </div>

                      {/* Right: Stationed Users & Staff List (8 cols on lg) */}
                      <div className="lg:col-span-8 bg-[#071824]/80 border border-cyan-500/20 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-cyan-200 flex items-center space-x-1.5 text-[11px] uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>Stationed Staff & Marketing Personnel ({stationedStaff.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setNewUserBranchId(branch.id);
                              setIsAddingUser(true);
                              setActiveTab('users');
                            }}
                            className="text-[11px] font-bold text-cyan-200 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer"
                          >
                            + Add Staff to Sales Center
                          </button>
                        </div>

                        {stationedStaff.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                            {stationedStaff.map((staff) => {
                              const isHead = staff.id === inChargeUser?.id;
                              const isStaffOrAcc = isAccountsOrStaff(staff as any, salespersons) || !isMarketingOfficer(staff);
                              const staffParties = isStaffOrAcc
                                ? parties.filter((p) => {
                                    if (p.branchId && p.branchId === branch.id) return true;
                                    if (p.branchName && cleanBranchName(p.branchName).toLowerCase() === cleanBranchName(branch.name).toLowerCase()) return true;
                                    if (p.salesmanCode && stationedStaff.some((st) => st.code.toLowerCase() === p.salesmanCode?.toLowerCase())) return true;
                                    return false;
                                  })
                                : parties.filter((p) => p.salesmanCode && p.salesmanCode.toLowerCase() === staff.code.toLowerCase());
                              return (
                                <div
                                  key={staff.id}
                                  className={`bg-[#0b2334]/85 border rounded-xl p-2.5 shadow-2xs space-y-1 transition-all ${
                                    isHead ? 'border-amber-400/40 bg-amber-500/10' : 'border-cyan-500/25 hover:border-cyan-400/50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div>
                                      <div className="font-bold text-white text-xs flex items-center space-x-1.5">
                                        <span className={`w-2 h-2 rounded-full ${isHead ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                                        <span>{staff.name}</span>
                                        <span className="font-mono text-[10px] text-cyan-200 bg-cyan-500/20 px-1 rounded font-bold">
                                          #{staff.code}
                                        </span>
                                        {isHead && (
                                          <span className="text-[9px] bg-amber-500/25 text-amber-200 px-1 rounded font-extrabold border border-amber-400/30">
                                            HEAD
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-300 mt-0.5 font-medium">
                                        {staff.role || 'Staff'} • 📞 {staff.phone}
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                        🎯 ৳{(staff.monthlyTargetSales || 0).toLocaleString()}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSpCode(staff.code)}
                                      className="text-[10px] bg-[#061520] hover:bg-[#0e2a3d] border border-cyan-500/30 text-cyan-200 font-bold px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0"
                                    >
                                      Parties ({staffParties.length})
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic bg-[#061520] p-3 rounded-lg border border-cyan-500/20 text-center">
                            No staff members currently assigned to this sales center. Click "+ Add Staff to Sales Center" to register staff.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBranches.map((branch) => {
              const inChargeUser = salespersons.find(
                (s) => s.id === branch.inChargeId || (branch.inChargeName && branch.inChargeName.includes(s.name))
              );

              // Find all staff members stationed at this branch
              const stationedStaff = salespersons.filter(
                (s) => s.branchId === branch.id || (s.branchName && s.branchName.trim().toLowerCase() === branch.name.trim().toLowerCase())
              );

              // Marketing personnel excluding in-charge if in-charge is also in list
              const marketingStaff = stationedStaff.filter((s) => s.id !== inChargeUser?.id);

              return (
                <div
                  key={branch.id}
                  className="cyber-glass-subcard border border-cyan-500/25 hover:border-cyan-400/60 hover:shadow-md rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="space-y-3">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span
                          className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            branch.type === 'showroom'
                              ? 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                              : branch.type === 'power_market'
                              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
                              : 'bg-purple-500/20 text-purple-200 border-purple-400/35'
                          }`}
                        >
                          {branch.type.replace('_', ' ')}
                        </span>

                        <h3 className="text-base font-black text-white leading-snug pt-0.5">
                          {branch.name}
                        </h3>
                      </div>

                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingBranchId(branch.id);
                            setEditBranchForm(branch);
                          }}
                          className="p-1.5 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded-lg transition-colors cursor-pointer"
                          title="Edit Sales Center"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Address & Phone */}
                    {branch.address && (
                      <div className="text-xs text-slate-300 flex items-start space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{branch.address}</span>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="text-xs text-slate-300 flex items-center space-x-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span>{branch.phone}</span>
                      </div>
                    )}

                    {/* Approver Row with Set Option */}
                    <div className="flex items-center justify-between bg-cyan-500/15 border border-cyan-400/30 rounded-xl px-3 py-2 text-xs">
                      <div className="flex items-center space-x-2">
                        <UserCheck className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />
                        <span className="text-slate-300 font-medium">Approver:</span>
                        <strong className="text-white font-bold">{branch.approverName || currentDefaultApprover || 'Not Assigned'}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setApproverModalBranch(branch);
                          setApproverInput(branch.approverName || currentDefaultApprover || '');
                        }}
                        className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg font-black text-[11px] cursor-pointer flex items-center space-x-1 shadow-2xs transition-colors"
                        title="Set Requisition Approver"
                      >
                        <Settings className="w-3 h-3" />
                        <span>Set</span>
                      </button>
                    </div>

                    {/* Designated In-Charge Section */}
                    <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center space-x-1 bg-amber-500/25 text-amber-200 border border-amber-400/35 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          <Crown className="w-3 h-3 text-amber-300" />
                          <span>(In-Charge)</span>
                        </span>
                        <span className="text-[10px] text-amber-300 font-bold font-mono">
                          Branch Head
                        </span>
                      </div>

                      {inChargeUser ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-black text-white text-xs flex items-center space-x-1.5">
                              <span>{inChargeUser.name}</span>
                              <span className="font-mono text-[10px] bg-amber-500/25 text-amber-200 px-1.5 py-0.2 rounded font-bold border border-amber-400/30">
                                #{inChargeUser.code}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedSpCode(inChargeUser.code)}
                              className="text-[10px] bg-amber-500/20 border border-amber-400/35 text-amber-200 font-bold px-2 py-0.5 rounded hover:bg-amber-500/30 transition-colors cursor-pointer"
                            >
                              Parties ({parties.filter((p) => p.salesmanCode === inChargeUser.code).length})
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {(inChargeUser.role === 'Showroom In-Charge' ? 'Sales Center In-Charge' : inChargeUser.role) || 'Sales Center In-Charge'} • {inChargeUser.areaGroup || branch.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-2 pt-0.5">
                            <span>📞 {inChargeUser.phone}</span>
                            <span>🎯 Target: ৳{(inChargeUser.monthlyTargetSales || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-200/80 italic bg-[#061520] p-2 rounded-lg border border-amber-400/25">
                          No designated In-Charge assigned to this Sales Center.
                        </div>
                      )}
                    </div>

                    {/* Marketing Personnel Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-cyan-200 bg-[#0c2638] border border-cyan-500/25 p-2 rounded-lg">
                        <span className="flex items-center space-x-1.5">
                          <Users className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Marketing Personnel ({marketingStaff.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewUserBranchId(branch.id);
                            setIsAddingUser(true);
                            setActiveTab('users');
                          }}
                          className="text-[10px] font-bold text-cyan-200 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 px-2 py-0.5 rounded transition-colors cursor-pointer"
                        >
                          + Add Person
                        </button>
                      </div>

                      {marketingStaff.length > 0 ? (
                        <div className="space-y-2">
                          {marketingStaff.map((staff) => {
                            const staffParties = parties.filter((p) => p.salesmanCode === staff.code);
                            return (
                              <div
                                key={staff.id}
                                className="bg-[#071824]/80 border border-cyan-500/20 hover:border-cyan-400/50 rounded-xl p-2.5 shadow-2xs space-y-1 transition-all"
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div>
                                    <div className="font-bold text-white text-xs flex items-center space-x-1.5">
                                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                      <span>{staff.name}</span>
                                      <span className="font-mono text-[10px] text-cyan-200 bg-cyan-500/20 px-1.5 rounded">
                                        #{staff.code}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 mt-0.5">
                                      {staff.role || 'Marketing Officer'} • {staff.areaGroup || 'Area'}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex flex-wrap gap-2">
                                      <span>📞 {staff.phone}</span>
                                      <span>🎯 ৳{(staff.monthlyTargetSales || 0).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSpCode(staff.code)}
                                    className="text-[10px] bg-[#061520] hover:bg-[#0e2a3d] border border-cyan-500/30 text-cyan-200 font-bold px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0"
                                  >
                                    Parties ({staffParties.length})
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic bg-[#061520] p-2.5 rounded-lg border border-cyan-500/20 text-center">
                          No additional marketing personnel assigned to this Sales Center.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

          {/* Set Approver Modal */}
          {approverModalBranch && (
            <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white animate-in zoom-in-95">
                <div className="flex items-center justify-between pb-3 border-b border-cyan-500/25">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-base font-black text-white">
                      {approverModalBranch === 'ALL'
                        ? 'Set Global Approver'
                        : `Set Approver for ${approverModalBranch.name}`}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApproverModalBranch(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-200 block mb-1">
                      Approver Name & Designation *
                    </label>
                    <input
                      type="text"
                      value={approverInput}
                      onChange={(e) => setApproverInput(e.target.value)}
                      placeholder="Enter Approver Name"
                      className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-sm font-bold text-white placeholder-slate-400 bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      This approver will review and authorize store requisitions before forwarding to Audit Directory.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                  <button
                    type="button"
                    onClick={() => setApproverModalBranch(null)}
                    className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 font-bold rounded-xl cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSetApprover(
                        approverModalBranch === 'ALL' ? 'ALL' : approverModalBranch.id,
                        approverInput
                      );
                      setApproverModalBranch(null);
                    }}
                    className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl cursor-pointer shadow-md transition-all flex items-center space-x-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Approver</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Showroom Modal */}
          {editingBranchId && editBranchForm && (
            <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
              <form
                onSubmit={handleSaveBranchEdit}
                className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white animate-in zoom-in-95"
              >
                <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Edit Sales Center / Branch Details</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranchId(null);
                      setEditBranchForm(null);
                    }}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-200 mb-1">Sales Center / Branch Name *</label>
                    <input
                      type="text"
                      value={editBranchForm.name}
                      onChange={(e) => setEditBranchForm({ ...editBranchForm, name: e.target.value })}
                      className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Branch Type *</label>
                      <select
                        value={editBranchForm.type}
                        onChange={(e) =>
                          setEditBranchForm({ ...editBranchForm, type: e.target.value as BranchType })
                        }
                        className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      >
                        <option value="showroom">Sales Center (Requires In-Charge)</option>
                        <option value="head_office">Head Office</option>
                        <option value="power_market">Power Market</option>
                        <option value="other">Other Outlet</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Assigned In-Charge</label>
                      <select
                        value={editBranchForm.inChargeId || ''}
                        onChange={(e) => {
                          const sp = salespersons.find((s) => s.id === e.target.value);
                          setEditBranchForm({
                            ...editBranchForm,
                            inChargeId: sp?.id || '',
                            inChargeName: sp ? `${sp.name} (${sp.code})` : '',
                            inChargePhone: sp?.phone || ''
                          });
                        }}
                        className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      >
                        <option value="">-- Select In-Charge --</option>
                        {salespersons
                          .filter((sp) => sp.code.toLowerCase() !== 'suvroadmin' && sp.username?.toLowerCase() !== 'suvroadmin' && !sp.isSuperAdmin)
                          .map((sp, spIdx) => (
                            <option key={sp.id ? `${sp.id}-${spIdx}` : `sp-opt-${spIdx}`} value={sp.id}>
                              {sp.name} [{sp.code}] - {sp.phone}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Assigned Approver</label>
                      <input
                        type="text"
                        value={editBranchForm.approverName || ''}
                        onChange={(e) => setEditBranchForm({ ...editBranchForm, approverName: e.target.value })}
                        className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        placeholder="Enter Approver Name"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Sales Center Phone</label>
                      <input
                        type="text"
                        value={editBranchForm.phone || ''}
                        onChange={(e) => setEditBranchForm({ ...editBranchForm, phone: e.target.value })}
                        className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-200 mb-1">
                        Managing Admin <span className="text-amber-300 font-normal">(Assigned Admin)</span>
                      </label>
                      <select
                        value={editBranchForm.adminId || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) {
                            setEditBranchForm({
                              ...editBranchForm,
                              adminId: undefined,
                              adminName: undefined,
                              adminUsername: undefined,
                              assignedAdminId: undefined
                            });
                            return;
                          }
                          const adm = adminUsersList.find((a) => a.id === val || a.code === val);
                          setEditBranchForm({
                            ...editBranchForm,
                            adminId: val,
                            adminName: adm ? adm.name : editBranchForm.adminName,
                            adminUsername: adm?.username || (adm?.code ? adm.code.toLowerCase() : editBranchForm.adminUsername)
                          });
                        }}
                        className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
                      >
                        <option value="">-- Select Assigned Admin --</option>
                        {adminUsersList.map((adm, admIdx) => (
                          <option key={`adm-edit-${adm.id || admIdx}-${admIdx}`} value={adm.id}>
                            {adm.name} ({adm.code || adm.username || 'Admin'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-200 mb-1">Address & Location</label>
                    <input
                      type="text"
                      value={editBranchForm.address || ''}
                      onChange={(e) => setEditBranchForm({ ...editBranchForm, address: e.target.value })}
                      className="w-full border border-cyan-500/30 bg-[#061520] rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-cyan-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranchId(null);
                      setEditBranchForm(null);
                    }}
                    className="px-4 py-2 text-xs text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ADMIN & SALES CENTER SET TAB                                           */}
      {/* ========================================================================= */}
      {activeTab === 'admin_set' && (
        <div className="p-5 space-y-6">
          {/* Live Sync Toast */}
          {adminMappingSuccessToast && (
            <div className="bg-emerald-600/90 border border-emerald-400/40 text-white px-4 py-3 rounded-xl font-bold text-xs shadow-lg flex items-center justify-between animate-in fade-in">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>{adminMappingSuccessToast}</span>
              </div>
              <button
                onClick={() => setAdminMappingSuccessToast('')}
                className="text-emerald-200 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Header Banner */}
          <div className="cyber-glass-subcard text-white rounded-2xl p-5 border border-indigo-400/35 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="p-3 bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 rounded-2xl shadow-md">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg flex items-center space-x-2 text-white">
                    <span>Admin & Sales Center Assignment Matrix</span>
                    <span className="text-xs bg-indigo-500/25 text-indigo-200 font-mono px-2.5 py-0.5 rounded-full border border-indigo-400/35">
                      4-5 Centers per Admin
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Every sales center belongs under a Managing Admin. Super Admin has complete oversight across all clusters; Regional Admins have isolated access to their designated 4 to 5 sales centers. Requisition Approvers are displayed and configurable for each sales center.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setApproverModalBranch('ALL');
                    setApproverInput(currentDefaultApprover);
                  }}
                  className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-md cursor-pointer transition-all"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Set Default Approver</span>
                </button>
              </div>
            </div>
          </div>

          {/* Metric Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="cyber-glass-subcard border-indigo-400/30 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Managing Admins</p>
                <p className="text-xl font-black text-white mt-0.5">{allAdminClusters.length}</p>
              </div>
              <Users className="w-7 h-7 text-indigo-400/70" />
            </div>

            <div className="cyber-glass-subcard border-emerald-400/30 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Total Sales Centers</p>
                <p className="text-xl font-black text-white mt-0.5">{branches.length}</p>
              </div>
              <Building2 className="w-7 h-7 text-emerald-400/70" />
            </div>

            <div className="cyber-glass-subcard border-cyan-400/30 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Default Approver</p>
                <p className="text-xs font-black text-white mt-1 truncate max-w-[150px]" title={currentDefaultApprover}>
                  {currentDefaultApprover}
                </p>
              </div>
              <UserCheck className="w-7 h-7 text-cyan-400/70" />
            </div>

            <div className="cyber-glass-subcard border-amber-400/30 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Live Isolation</p>
                <p className="text-xs font-black text-white mt-1">Admin-Wise Protected</p>
              </div>
              <Lock className="w-7 h-7 text-amber-400/70" />
            </div>
          </div>

          {/* Search & Control Strip */}
          <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={adminSetFilterSearch}
                onChange={(e) => setAdminSetFilterSearch(e.target.value)}
                placeholder="Search admin, sales center, approver..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {adminSetFilterSearch && (
                <button
                  onClick={() => setAdminSetFilterSearch('')}
                  className="px-2.5 py-1 text-cyan-200 hover:text-white font-bold bg-[#061520] border border-cyan-500/30 rounded-lg cursor-pointer"
                >
                  Clear Filter
                </button>
              )}

              {isStrictSuperAdminUser && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingUser(true);
                    setSelectedRoleOption('Admin');
                    setActiveTab('users');
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Create New Admin</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsAddingBranch(true);
                  setActiveTab('showrooms');
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Sales Center</span>
              </button>
            </div>
          </div>

          {/* Admin Clusters List */}
          <div className="space-y-6">
            {allAdminClusters
              .filter((cluster) => {
                if (!adminSetFilterSearch.trim()) return true;
                const q = adminSetFilterSearch.toLowerCase();
                return (
                  cluster.adminName.toLowerCase().includes(q) ||
                  cluster.adminUsername.toLowerCase().includes(q) ||
                  (cluster.adminZone && cluster.adminZone.toLowerCase().includes(q)) ||
                  cluster.branches.some(
                    (b) =>
                      b.name.toLowerCase().includes(q) ||
                      (b.approverName && b.approverName.toLowerCase().includes(q)) ||
                      (b.inChargeName && b.inChargeName.toLowerCase().includes(q))
                  )
                );
              })
              .map((cluster, cIdx) => {
                const isTargetCount = cluster.branches.length >= 4 && cluster.branches.length <= 5;
                return (
                  <div
                    key={cluster.adminId || `cluster-${cIdx}`}
                    className="cyber-glass-subcard border border-indigo-400/30 rounded-2xl overflow-hidden shadow-sm hover:border-cyan-400/50 transition-all space-y-4 p-5"
                  >
                    {/* Admin Profile Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 flex items-center justify-center font-black text-base shadow-sm shrink-0">
                          {cIdx + 1}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-black text-white text-base sm:text-lg">
                              {cluster.adminName}
                            </h4>
                            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/35">
                              {cluster.adminUsername || cluster.adminId}
                            </span>
                            {isTargetCount ? (
                              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/35">
                                Target Met (4-5 Centers)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/35">
                                {cluster.branches.length} Centers Assigned
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">
                            Managing Territory: <strong className="text-cyan-200">{cluster.adminZone || 'General Sales Territory'}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAdminAssignModal(cluster)}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Set Sales Centers ({cluster.branches.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdminCluster(cluster)}
                          className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-400/40 hover:border-rose-500 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                          title={`Delete Admin "${cluster.adminName}" and unassign all managed sales centers`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Admin</span>
                        </button>
                      </div>
                    </div>

                    {/* Sales Centers List under this Admin */}
                    {cluster.branches.length === 0 ? (
                      <div className="p-6 bg-[#071824]/70 border border-dashed border-cyan-500/30 rounded-xl text-center space-y-2">
                        <Building2 className="w-8 h-8 text-cyan-400/60 mx-auto" />
                        <p className="text-xs font-bold text-slate-200">No Sales Centers currently assigned to this Admin</p>
                        <p className="text-[11px] text-slate-400">Every admin manages 4 to 5 sales centers across Bangladesh.</p>
                        <button
                          type="button"
                          onClick={() => handleOpenAdminAssignModal(cluster)}
                          className="mt-2 px-3.5 py-1.5 bg-cyan-500 text-slate-950 text-xs font-black rounded-lg shadow-2xs hover:bg-cyan-400 cursor-pointer"
                        >
                          + Assign Sales Centers
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {cluster.branches.map((b, bIdx) => {
                          const inChargeUser = salespersons.find(
                            (s) => s.id === b.inChargeId || (b.inChargeName && b.inChargeName.includes(s.name))
                          );
                          const approverNameDisplay = b.approverName || currentDefaultApprover || 'Not Assigned';

                          return (
                            <div
                              key={b.id || `b-${bIdx}`}
                              className="bg-[#071824]/80 hover:bg-[#0c2638]/90 border border-cyan-500/25 hover:border-cyan-400/50 rounded-xl p-3.5 transition-all shadow-2xs space-y-3"
                            >
                              {/* Top row: Sales Center Name & Type */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center space-x-2 min-w-0">
                                  <div className="p-1.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-lg shrink-0">
                                    <Building2 className="w-4 h-4" />
                                  </div>
                                  <span className="font-black text-white text-xs sm:text-sm truncate">
                                    {formatSalesCenterDisplayName(b.name)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-bold bg-[#0c2638] text-cyan-200 border border-cyan-500/25 uppercase px-2 py-0.5 rounded-full shrink-0">
                                    {b.type.replace('_', ' ')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBranchFromAdmin(cluster, b.id)}
                                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-md transition-colors cursor-pointer"
                                    title={`Unassign "${b.name}" from ${cluster.adminName}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Sales Center Approver */}
                              <div className="bg-cyan-500/15 border border-cyan-400/30 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                                <div className="flex items-center space-x-2 min-w-0">
                                  <UserCheck className="w-4 h-4 text-cyan-300 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                                      Sales Center Approver
                                    </div>
                                    <div className="text-xs font-black text-white truncate">
                                      {approverNameDisplay}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setApproverModalBranch(b);
                                    setApproverInput(approverNameDisplay);
                                  }}
                                  className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-[10px] font-black shrink-0 cursor-pointer shadow-2xs transition-colors flex items-center space-x-1"
                                  title="Change Requisition Approver for this Sales Center"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>Set Option</span>
                                </button>
                              </div>

                              {/* Details: In-Charge & Address */}
                              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-cyan-500/15">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                                    In-Charge
                                  </span>
                                  <span className="font-semibold text-emerald-300 text-[11px] block truncate">
                                    {b.inChargeName || inChargeUser?.name || 'Unassigned'}
                                  </span>
                                  {b.phone && (
                                    <span className="font-mono text-[10px] text-slate-400 block truncate">
                                      {b.phone}
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                                    Address
                                  </span>
                                  <span className="text-slate-300 text-[11px] block truncate" title={b.address || ''}>
                                    {b.address || 'Address registered'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SHOWROOM & STAFF MAPPING MATRIX TAB */}
      {/* ========================================================================= */}
      {activeTab === 'mapping' && (
        <div className="p-5 space-y-6">
          <div className="cyber-glass-subcard text-white rounded-2xl p-5 border border-purple-400/35 shadow-md">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-purple-500/25 border border-purple-400/40 rounded-xl">
                <GitMerge className="w-5 h-5 text-purple-200" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Sales Center to Staff Organizational Matrix</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Full visibility of sales center in-charges, stationed sales representatives, and party customer accounts across Bangladesh outlets.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {cleanSortedBranches.map((b) => {
              const inCharge = salespersons.find((s) => s.id === b.inChargeId);
              const branchStaff = salespersons.filter((s) => s.branchId === b.id || s.branchName === b.name);
              const branchParties = parties.filter((p) =>
                branchStaff.some(
                  (s) =>
                    (p.salesmanCode && p.salesmanCode.toLowerCase() === s.code.toLowerCase()) ||
                    (p.salespersonName && p.salespersonName.toLowerCase() === s.name.toLowerCase())
                )
              );

              return (
                <div
                  key={b.id}
                  className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-purple-400/50 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-500/20 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-amber-500/20 border border-amber-400/35 rounded-lg text-amber-300">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-black text-white text-base">{b.name}</h4>
                          <span className="bg-[#0c2638] text-cyan-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-cyan-500/30">
                            {b.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{b.address || 'Address not listed'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 text-xs">
                      <div>
                        <span className="text-slate-400">In-Charge: </span>
                        <strong className="text-emerald-300">{b.inChargeName || inCharge?.name || 'Unassigned'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Approver: </span>
                        <strong className="text-cyan-300">{b.approverName || 'DGM Sales'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Staff & Parties Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Staff List */}
                    <div className="bg-[#071824]/80 rounded-xl p-3.5 border border-cyan-500/20 space-y-2">
                      <div className="font-bold text-cyan-200 flex items-center justify-between">
                        <span className="flex items-center space-x-1.5">
                          <Users className="w-4 h-4 text-purple-400" />
                          <span>Stationed Users & Staff ({branchStaff.length})</span>
                        </span>
                      </div>

                      {branchStaff.length > 0 ? (
                        <div className="divide-y divide-cyan-500/15 bg-[#061520] rounded-lg border border-cyan-500/20">
                          {branchStaff.map((staff) => (
                            <div key={staff.id} className="p-2.5 flex items-center justify-between">
                              <div>
                                <div className="font-bold text-white flex items-center space-x-1.5">
                                  <span>{staff.name}</span>
                                  <span className="font-mono text-[10px] bg-cyan-500/20 px-1.5 py-0.5 rounded text-cyan-200">
                                    {staff.code}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">{staff.role || 'Staff'}</div>
                              </div>
                              {staff.phone && <div className="font-mono text-slate-300 text-[11px]">{staff.phone}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic text-[11px] py-1">No staff members assigned to this branch.</p>
                      )}
                    </div>

                    {/* Connected Parties */}
                    <div className="bg-[#071824]/80 rounded-xl p-3.5 border border-cyan-500/20 space-y-2">
                      <div className="font-bold text-cyan-200 flex items-center justify-between">
                        <span className="flex items-center space-x-1.5">
                          <Briefcase className="w-4 h-4 text-cyan-400" />
                          <span>Connected Parties ({branchParties.length})</span>
                        </span>
                      </div>

                      {branchParties.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto divide-y divide-cyan-500/15 bg-[#061520] rounded-lg border border-cyan-500/20">
                          {branchParties.map((p, idx) => (
                            <div key={p.id ? `${p.id}-${idx}` : `party-${idx}`} className="p-2 flex items-center justify-between">
                              <span className="font-semibold text-white truncate max-w-[200px]">{p.name}</span>
                              <span className="text-[10px] text-cyan-200 font-mono">{p.salesmanCode || 'Direct'}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic text-[11px] py-1">No customer accounts registered under this branch staff.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Action Footer Bar */}
      <div className="bg-[#081c2a]/90 px-5 py-3 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2">
        {activeTab === 'users' ? (
          <>
            <button
              onClick={() => {
                setIsAddingUser(true);
                setIsAddingBranch(false);
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs px-4 py-2 rounded-xl font-black flex items-center space-x-2 shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>

            <button
              onClick={() => handleOpenPasswordModal(null, 'change')}
              className="bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 border border-indigo-400/30 shadow-md transition-all cursor-pointer"
              title="Change user login password (requires old password)"
            >
              <KeyRound className="w-4 h-4" />
              <span>Change Password</span>
            </button>

            <button
              onClick={() => handleOpenPasswordModal(null, 'forgot')}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-amber-300 border border-amber-500/35 text-xs px-3 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              title="Reset password for forgotten credentials"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Forgot Password</span>
            </button>
          </>
        ) : activeTab === 'showrooms' ? (
          <>
            <button
              type="button"
              onClick={() => branchExcelFileInputRef.current?.click()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              title="Import sales centers from Excel file (.xlsx)"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-100" />
              <span>Import (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportBranchesToXLSX}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 border border-cyan-500/30 shadow-md transition-all cursor-pointer"
              title="Export sales centers list to Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export (.xlsx)</span>
            </button>
            <button
              onClick={() => {
                setIsAddingBranch(true);
                setIsAddingUser(false);
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Add Sales Center</span>
            </button>
          </>
        ) : activeTab === 'admin_set' ? (
          <>
            <button
              onClick={() => {
                setApproverModalBranch('ALL');
                setApproverInput(currentDefaultApprover);
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs px-3.5 py-2 rounded-xl font-black flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Set Default Approver</span>
            </button>
            {isStrictSuperAdminUser && (
              <button
                onClick={() => {
                  setIsAddingBranch(true);
                  setActiveTab('showrooms');
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <Building2 className="w-4 h-4" />
                <span>Add Sales Center</span>
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => setActiveTab('users')}
            className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Manage Users</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PASSWORD MANAGEMENT MODAL (CHANGE & FORGOT PASSWORD)                      */}
      {/* ========================================================================= */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full overflow-hidden border border-cyan-400/35 text-white">
            {/* Modal Header */}
            <div
              className={`p-4 text-white flex items-center justify-between border-b border-cyan-500/25 ${
                passwordModalMode === 'change'
                  ? 'bg-[#0c2638]/90'
                  : 'bg-amber-950/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl border ${passwordModalMode === 'change' ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-300' : 'bg-amber-500/20 border-amber-400/30 text-amber-300'}`}>
                  {passwordModalMode === 'change' ? <KeyRound className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                    {passwordModalMode === 'change' ? 'Change User Password' : 'Forgot Password / Reset PIN'}
                  </h3>
                  <p className="text-[11px] text-cyan-200/80">
                    {passwordModalUser.name} ({passwordModalUser.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1 rounded-lg hover:bg-cyan-500/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch tabs in modal */}
            <div className="flex border-b border-cyan-500/25 bg-[#071824]/90 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setPasswordModalMode('change');
                  setPasswordModalError('');
                  setPasswordModalSuccess('');
                  setOldPasswordVerified(false);
                  setOldPasswordInput('');
                  setNewPasswordInput('');
                  setConfirmPasswordInput('');
                }}
                className={`flex-1 py-2.5 text-center transition-colors cursor-pointer ${
                  passwordModalMode === 'change'
                    ? 'bg-[#0e2d42] text-cyan-200 border-b-2 border-cyan-400 font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Change Password (Old Pass Required)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordModalMode('forgot');
                  setPasswordModalError('');
                  setPasswordModalSuccess('');
                  setOldPasswordVerified(false);
                }}
                className={`flex-1 py-2.5 text-center transition-colors cursor-pointer ${
                  passwordModalMode === 'forgot'
                    ? 'bg-[#0e2d42] text-amber-300 border-b-2 border-amber-400 font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Forgot Password? (Admin Reset)
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveNewPassword} className="p-5 space-y-4 text-xs">
              {/* User Selector */}
              <div>
                <label className="block font-bold text-cyan-200/90 mb-1">Target User / Staff</label>
                <select
                  value={passwordModalUser.id}
                  onChange={(e) => {
                    const found = salespersons.find((s) => s.id === e.target.value);
                    if (found) {
                      setPasswordModalUser(found);
                      setOldPasswordVerified(false);
                      setOldPasswordInput('');
                      setPasswordModalError('');
                      setPasswordModalSuccess('');
                    }
                  }}
                  className="w-full p-2 border border-cyan-500/30 rounded-xl bg-[#061520] font-bold text-white"
                >
                  {salespersons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({s.role || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Alert */}
              {passwordModalError && (
                <div className="p-3 bg-rose-500/15 border border-rose-400/35 text-rose-200 rounded-xl flex items-start space-x-2 text-[11px] font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{passwordModalError}</span>
                </div>
              )}
              {passwordModalSuccess && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 rounded-xl flex items-start space-x-2 text-[11px] font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{passwordModalSuccess}</span>
                </div>
              )}

              {/* MODE: CHANGE PASSWORD (REQUIRES OLD PASSWORD FIRST) */}
              {passwordModalMode === 'change' && (
                <>
                  {!oldPasswordVerified ? (
                    <div className="p-4 bg-[#071824]/80 border border-cyan-500/25 rounded-xl space-y-3">
                      <div className="text-slate-200 font-bold flex items-center justify-between">
                        <span>Enter Current / Old Password:</span>
                        <span className="text-[10px] text-slate-400 font-normal">Verification required</span>
                      </div>
                      <div className="relative">
                        <input
                          type={showOldPassword ? 'text' : 'password'}
                          value={oldPasswordInput}
                          onChange={(e) => {
                            setOldPasswordInput(e.target.value);
                            setPasswordModalError('');
                          }}
                          placeholder="Enter old password..."
                          className="w-full p-2.5 pr-10 border border-cyan-500/30 rounded-xl bg-[#061520] font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none text-center text-sm"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowOldPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-200 cursor-pointer"
                        >
                          {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyOldPassword}
                        className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                      >
                        Verify Old Password
                      </button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordModalMode('forgot');
                            setPasswordModalError('');
                            setPasswordModalSuccess('');
                          }}
                          className="text-amber-300 hover:text-amber-200 font-bold text-[11px] hover:underline cursor-pointer"
                        >
                          Forgot Old Password? Click here to reset
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Once verified, reveal new password & confirm password */
                    <div className="space-y-3 p-4 bg-emerald-500/10 border border-emerald-400/30 rounded-xl">
                      <div className="flex items-center space-x-1.5 text-emerald-300 font-bold text-[11px]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Old Password Verified! Enter New Password:</span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-200 mb-1">New Password (min 6 digits) *</label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPasswordInput}
                            onChange={(e) => {
                              setNewPasswordInput(e.target.value.replace(/\D/g, ''));
                              setPasswordModalError('');
                            }}
                            placeholder="Enter minimum 6-digit PIN (e.g. 123456)..."
                            inputMode="numeric"
                            className="w-full p-2.5 pr-10 border border-cyan-500/30 rounded-xl bg-[#061520] font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none tracking-widest text-center"
                            autoFocus
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((prev) => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-200 cursor-pointer"
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-200 mb-1">Confirm New Password (min 6 digits) *</label>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={confirmPasswordInput}
                          inputMode="numeric"
                          onChange={(e) => {
                            setConfirmPasswordInput(e.target.value.replace(/\D/g, ''));
                            setPasswordModalError('');
                          }}
                          placeholder="Re-type minimum 6-digit PIN..."
                          className="w-full p-2.5 border border-cyan-500/30 rounded-xl bg-[#061520] font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none tracking-widest text-center"
                          required
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* MODE: FORGOT PASSWORD */}
              {passwordModalMode === 'forgot' && (
                <div className="space-y-3 p-4 bg-amber-500/10 border border-amber-400/30 rounded-xl">
                  <div className="space-y-1">
                    <div className="font-bold text-amber-200 text-xs flex items-center space-x-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Admin Password Reset / Recovery</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      As an authorized user, you can set a new PIN (min 6 digits) directly or reset to default{' '}
                      <strong className="font-mono bg-[#061520] text-amber-200 px-1.5 py-0.5 rounded border border-amber-400/30">123456</strong>.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewPasswordInput('123456');
                        setConfirmPasswordInput('123456');
                        setPasswordModalSuccess('Default password "123456" pre-filled. Click "Save New Password" below to apply.');
                      }}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 font-bold rounded-lg transition-colors cursor-pointer text-[11px]"
                    >
                      ⚡ Quick Reset to "123456"
                    </button>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-200 mb-1">Set New Password (min 6 digits) *</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPasswordInput}
                        inputMode="numeric"
                        onChange={(e) => {
                          setNewPasswordInput(e.target.value.replace(/\D/g, ''));
                          setPasswordModalError('');
                        }}
                        placeholder="Enter minimum 6-digit PIN..."
                        className="w-full p-2.5 pr-10 border border-cyan-500/30 rounded-xl bg-[#061520] font-mono font-bold text-white focus:ring-2 focus:ring-amber-400 focus:outline-none tracking-widest text-center"
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-200 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-200 mb-1">Confirm New Password (min 6 digits) *</label>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPasswordInput}
                      inputMode="numeric"
                      onChange={(e) => {
                        setConfirmPasswordInput(e.target.value.replace(/\D/g, ''));
                        setPasswordModalError('');
                      }}
                      placeholder="Confirm minimum 6-digit PIN..."
                      className="w-full p-2.5 border border-cyan-500/30 rounded-xl bg-[#061520] font-mono font-bold text-white focus:ring-2 focus:ring-amber-400 focus:outline-none tracking-widest text-center"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex justify-end items-center space-x-2 pt-2 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                {(passwordModalMode === 'forgot' || oldPasswordVerified) && (
                  <button
                    type="submit"
                    className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl shadow-md cursor-pointer transition-all flex items-center space-x-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save & Store Password</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sales Center Deletion Blocked (Why & How to Delete) Modal */}
      {blockedBranchDeletion && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full p-6 space-y-5 border border-amber-400/35 text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-400/35 shrink-0">
                  <Building2 className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Sales Center Cannot Be Deleted Directly
                  </h3>
                  <p className="text-xs text-amber-300 font-semibold">
                    Protected by active staff assignments & customer accounts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockedBranchDeletion(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-cyan-500/15 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Branch Info */}
            <div className="bg-[#071824]/80 rounded-xl p-3 border border-cyan-500/25 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Sales Center:</span>
                <span className="font-extrabold text-white text-sm">{blockedBranchDeletion.branch.name}</span>
              </div>
              {blockedBranchDeletion.branch.address && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Location:</span>
                  <span className="text-slate-200 font-semibold">{blockedBranchDeletion.branch.address}</span>
                </div>
              )}
              {blockedBranchDeletion.branch.inChargeName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">In-Charge:</span>
                  <span className="text-cyan-300 font-bold">{blockedBranchDeletion.branch.inChargeName}</span>
                </div>
              )}
            </div>

            {/* WHY CANNOT BE DELETED */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-rose-300 font-bold text-xs uppercase tracking-wide">
                <AlertCircle className="w-4 h-4" />
                <span>Why this sales center cannot be deleted:</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 bg-rose-500/15 border border-rose-400/30 rounded-xl">
                  <Users className="w-4 h-4 text-rose-400 mx-auto mb-1" />
                  <div className="font-black text-rose-200 text-sm">{blockedBranchDeletion.staffCount}</div>
                  <div className="text-[10px] text-rose-300 font-bold">Stationed Staff & Users</div>
                </div>

                <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/30 rounded-xl">
                  <Building2 className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <div className="font-black text-cyan-200 text-sm">{blockedBranchDeletion.partiesCount}</div>
                  <div className="text-[10px] text-cyan-300 font-bold">Connected Customers</div>
                </div>
              </div>

              {blockedBranchDeletion.staffCount > 0 && (
                <div className="p-2.5 bg-[#071824]/80 rounded-xl border border-cyan-500/25 text-xs">
                  <div className="font-bold text-slate-200 mb-1 text-[11px]">Stationed Personnel ({blockedBranchDeletion.staffCount}):</div>
                  <div className="flex flex-wrap gap-1">
                    {blockedBranchDeletion.staffNames.map((name, i) => (
                      <span key={i} className="px-2 py-0.5 bg-[#0c2638] rounded border border-cyan-500/30 text-cyan-100 text-[10px] font-semibold">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {blockedBranchDeletion.isHeadOffice && (
                <div className="p-2 bg-amber-500/15 rounded-lg border border-amber-400/35 text-[11px] text-amber-200 font-semibold flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>This branch is designated as the Head Office showroom.</span>
                </div>
              )}

              <p className="text-[11px] text-amber-100/90 leading-relaxed bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/25">
                Deleting an active sales center directly is restricted because stationed staff would lose their workspace assignment and customer profiles connected to this location would become orphaned.
              </p>
            </div>

            {/* HOW TO DELETE */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-cyan-300 font-bold text-xs uppercase tracking-wide">
                <Info className="w-4 h-4" />
                <span>How to delete this sales center:</span>
              </div>

              <ol className="text-xs text-slate-200 space-y-1.5 list-decimal list-inside bg-[#071824]/80 p-3 rounded-xl border border-cyan-500/25 leading-relaxed font-medium">
                {blockedBranchDeletion.staffCount > 0 && (
                  <li>
                    Switch to the <strong>Users Directory</strong> tab. Click <strong>Edit</strong> on each stationed user and change their assigned <em>Sales Center</em> to another location.
                  </li>
                )}
                {blockedBranchDeletion.partiesCount > 0 && (
                  <li>
                    Open <strong>Customer & Party Directory</strong>, filter by <em>{blockedBranchDeletion.branch.name}</em>, and reassign customers to another active sales center.
                  </li>
                )}
                <li>
                  Once all staff and customer accounts are cleared (0 stationed users, 0 connected customers), return here and click <strong>Delete</strong>. The system will allow permanent deletion.
                </li>
              </ol>

              <div className="p-2.5 bg-cyan-500/10 border border-cyan-400/30 rounded-lg text-[11px] text-cyan-100 flex items-start space-x-2">
                <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> If this showroom is only temporarily inactive or closed, click <strong>Edit Sales Center</strong> and set its status to Inactive instead of deleting.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => {
                  setBlockedBranchDeletion(null);
                  setActiveTab('users');
                }}
                className="px-3.5 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs"
              >
                <Users className="w-3.5 h-3.5 text-cyan-300" />
                <span>Go to Users Tab to Reassign</span>
              </button>

              <button
                type="button"
                onClick={() => setBlockedBranchDeletion(null)}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-xs"
              >
                Understood / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Empty Branch Deletion Modal */}
      {confirmDeleteBranch && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 border border-rose-400/35 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 rounded-xl border border-rose-400/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Delete Sales Center</h3>
                <p className="text-xs text-slate-400">Permanent removal of empty showroom</p>
              </div>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              Are you sure you want to permanently delete <strong>{confirmDeleteBranch.name}</strong>? This showroom has 0 stationed staff and 0 connected customer accounts.
            </p>

            <div className="flex justify-end space-x-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setConfirmDeleteBranch(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmDeleteBranch}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic In-App Confirmation Modal (iframe-safe, replaces window.confirm) */}
      {salesDirConfirmModal && salesDirConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 border border-rose-400/35 text-white animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 rounded-xl border border-rose-400/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">{salesDirConfirmModal.title}</h3>
                <p className="text-xs text-slate-400">Action Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              {salesDirConfirmModal.description}
            </p>

            <div className="flex justify-end space-x-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setSalesDirConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = salesDirConfirmModal.onConfirm;
                  setSalesDirConfirmModal(null);
                  cb();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm ${
                  salesDirConfirmModal.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{salesDirConfirmModal.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Modal: Set Sales Centers for Admin (Tik Mark System) */}
      {selectedAdminForMapping && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="bg-[#0c2638]/90 p-5 border-b border-cyan-500/25 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-cyan-500/20 border border-cyan-400/30 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    Assigned Sales Centers: {selectedAdminForMapping.adminName}
                  </h3>
                  <p className="text-xs text-cyan-200/80 mt-0.5">
                    Click checkboxes to select or unselect sales centers under this Admin with live tik marks.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAdminForMapping(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Header & Search & Quick Select / Deselect */}
            <div className="bg-[#071824]/85 p-3.5 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-200">
                  Selected: <strong className="text-cyan-300 font-mono text-sm">{adminMappingBranchIds.length}</strong> / {cleanSortedBranches.length} Centers
                </span>
                <button
                  type="button"
                  onClick={() => setAdminMappingBranchIds(cleanSortedBranches.map((b) => b.id))}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                  title="Select all sales centers"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Select All</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdminMappingBranchIds([])}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-rose-500/20 text-rose-300 border border-rose-400/30 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                  title="Unselect all sales centers"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              </div>

              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={adminMappingSearch}
                  onChange={(e) => setAdminMappingSearch(e.target.value)}
                  placeholder="Search sales centers..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>

            {/* Branch Selection List with Tik Marks */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {cleanSortedBranches
                .filter((b) => {
                  if (!adminMappingSearch.trim()) return true;
                  const q = adminMappingSearch.toLowerCase();
                  return (
                    b.name.toLowerCase().includes(q) ||
                    (b.approverName && b.approverName.toLowerCase().includes(q)) ||
                    (b.inChargeName && b.inChargeName.toLowerCase().includes(q))
                  );
                })
                .map((b) => {
                  const isChecked = adminMappingBranchIds.includes(b.id);
                  const currentAssignedAdmin = allAdminClusters.find((c) =>
                    c.branches.some((cb) => cb.id === b.id)
                  );
                  const approverNameDisplay = b.approverName || currentDefaultApprover || 'Not Assigned';

                  return (
                    <label
                      key={b.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-cyan-500/15 border-cyan-400/50 shadow-2xs ring-1 ring-cyan-400/30'
                          : 'bg-[#071824]/70 border-cyan-500/20 hover:border-cyan-400/40 hover:bg-[#0c2638]/70'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAdminMappingBranchIds((prev) => [...prev, b.id]);
                            } else {
                              setAdminMappingBranchIds((prev) => prev.filter((id) => id !== b.id));
                            }
                          }}
                          className="w-5 h-5 text-cyan-500 rounded border-cyan-500/40 focus:ring-cyan-400 cursor-pointer accent-cyan-400"
                        />

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className={`font-black text-xs sm:text-sm ${isChecked ? 'text-cyan-200' : 'text-white'}`}>
                              {b.name}
                            </span>
                            <span className="text-[10px] bg-[#0c2638] text-cyan-200/80 border border-cyan-500/25 uppercase px-1.5 py-0.5 rounded font-mono">
                              {b.type.replace('_', ' ')}
                            </span>
                            {isChecked && (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/35">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Assigned</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3">
                            <span>
                              In-Charge: <strong className="text-emerald-300">{b.inChargeName || 'Not Assigned'}</strong>
                            </span>
                            {currentAssignedAdmin && currentAssignedAdmin.adminId !== selectedAdminForMapping.adminId && (
                              <span className="text-amber-300 font-semibold">
                                Currently: {currentAssignedAdmin.adminName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Sales Center Approver */}
                      <div className="flex items-center space-x-2 shrink-0 pl-3">
                        <div className="bg-[#0c2638]/80 border border-cyan-500/25 px-3 py-1.5 rounded-xl text-xs text-right">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center space-x-1 justify-end">
                            <UserCheck className="w-3 h-3 text-cyan-400" />
                            <span>Approver</span>
                          </div>
                          <div className="font-black text-cyan-200 text-xs">
                            {approverNameDisplay}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setApproverModalBranch(b);
                            setApproverInput(approverNameDisplay);
                          }}
                          className="p-1.5 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/15 rounded-lg cursor-pointer transition-colors"
                          title="Set Approver Option"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </label>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#071824]/90 p-4 border-t border-cyan-500/20 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedAdminForMapping(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveAdminMapping}
                className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-md cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" />
                <span>Save & Live Sync ({adminMappingBranchIds.length} Sales Centers)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
