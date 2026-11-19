import React, { useState, useEffect, useMemo } from 'react';
import { Salesperson, AuthUser, BranchLocation, USER_DESIGNATIONS } from '../types';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  AlertCircle,
  LogIn,
  Lock,
  CheckCircle2,
  Zap,
  UserPlus,
  Phone,
  MapPin,
  Briefcase,
  Target
} from 'lucide-react';
import { WelcomeLoadingScreen } from './WelcomeLoadingScreen';
import { formatSalesCenterDisplayName, isUnwantedSalesCenter } from '../utils/branchAccess';

interface LoginPageProps {
  salespersons: Salesperson[];
  branches?: BranchLocation[];
  onLogin: (user: AuthUser) => void;
  onRegisterSalesperson?: (newSalesperson: Salesperson) => void;
  sessionExpiredMsg?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  salespersons,
  branches = [],
  onLogin,
  onRegisterSalesperson,
  sessionExpiredMsg
}) => {
  // Mode toggle: 'signin' | 'register'
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');

  // Sign In State
  const [customUsername, setCustomUsername] = useState<string>('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [pendingWelcomeUser, setPendingWelcomeUser] = useState<AuthUser | null>(null);

  // Sign-In: Active Sales Center selection for Admin login
  const [loginSelectedBranchId, setLoginSelectedBranchId] = useState<string>('all');

  // Registration State
  const [regName, setRegName] = useState('');
  const [regBranchId, setRegBranchId] = useState('');
  const [regAdminBranchIds, setRegAdminBranchIds] = useState<string[]>([]);
  const [regCode, setRegCode] = useState(() => {
    // Auto-suggest next user code (e.g. S04, S05)
    const existingNums = salespersons
      .map((s) => {
        const match = s.code.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum = (existingNums.length > 0 ? Math.max(...existingNums) : 0) + 1;
    return `S${nextNum.toString().padStart(2, '0')}`;
  });
  const [regRole, setRegRole] = useState('');
  const [regDesignation, setRegDesignation] = useState<string>('Executive');
  const [regIsInCharge, setRegIsInCharge] = useState<boolean>(false);
  const [regPhone, setRegPhone] = useState('');
  const [regArea, setRegArea] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Detect if user entering credentials has an Admin profile to offer Choose Sales Center on login
  const detectedAdminSp = useMemo(() => {
    const cleanUser = customUsername.trim().toLowerCase();
    if (!cleanUser) return null;
    return salespersons.find(
      (s) =>
        (s.role === 'Admin' || s.role === 'admin' || s.isSuperAdmin || (s.code && s.code.toUpperCase().startsWith('ADM')) || s.username === 'admin1' || s.username === 'admin2' || s.username === 'admin3') &&
        ((s.username && s.username.toLowerCase() === cleanUser) ||
         s.code.toLowerCase() === cleanUser ||
         s.name.toLowerCase() === cleanUser ||
         (s.phone && s.phone.trim() === customUsername.trim()))
    ) || null;
  }, [salespersons, customUsername]);

  const isSuperAdminInput = useMemo(() => {
    const cleanUser = customUsername.trim().toLowerCase();
    return cleanUser === 'suvroadmin' || cleanUser === 'admin';
  }, [customUsername]);

  const isAdminLoginDetected = Boolean(detectedAdminSp || isSuperAdminInput);

  const sortedBranches = useMemo(() => {
    return (branches || [])
      .filter((b) => b && !isUnwantedSalesCenter(b))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [branches]);

  // Available sales centers for detected admin
  const availableBranchesForAdminLogin = useMemo(() => {
    if (detectedAdminSp?.assignedBranchIds && detectedAdminSp.assignedBranchIds.length > 0) {
      return sortedBranches.filter((b) => detectedAdminSp.assignedBranchIds!.includes(b.id));
    }
    return sortedBranches;
  }, [sortedBranches, detectedAdminSp]);

  const executeLogin = (user: AuthUser) => {
    // Clear input credentials from component state immediately
    setPassword('');
    setCustomUsername('');

    // Ensure no passwords are saved in localStorage
    try {
      localStorage.removeItem('app_saved_username');
      localStorage.removeItem('app_saved_password');
      localStorage.removeItem('polycables_remember_user');
      localStorage.removeItem('polycables_saved_pin');
    } catch {}

    localStorage.setItem('app_current_user', JSON.stringify(user));
    // Update last activity timestamp on successful login
    try {
      localStorage.setItem('polycables_last_activity', String(Date.now()));
    } catch {}

    // Launch the Welcome Screen with smooth waiting bar
    setPendingWelcomeUser(user);
  };

  if (pendingWelcomeUser) {
    return (
      <WelcomeLoadingScreen
        user={pendingWelcomeUser}
        durationSeconds={2.0}
        onComplete={() => {
          const userToLogin = pendingWelcomeUser;
          setPendingWelcomeUser(null);
          onLogin(userToLogin);
        }}
      />
    );
  }

  // Handle Login Submit
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const inputUser = customUsername.trim();
    const inputUserLower = inputUser.toLowerCase();
    const trimmedPassword = password.trim();

    if (!inputUser) {
      setError('Please enter your username, code, or name.');
      return;
    }

    if (!trimmedPassword) {
      setError('Please enter your password / PIN (minimum 6 digits).');
      return;
    }

    if (trimmedPassword.length < 6) {
      setError('Password must be a minimum of 6 digits.');
      return;
    }

    const storedAdminPassword = localStorage.getItem('app_admin_password') || '123456';

    // 1. Check Super Admin / AGM / Manager credentials
    if (
      inputUserLower === 'suvroadmin' ||
      inputUserLower === 'admin' ||
      inputUserLower === 'manager' ||
      inputUserLower === 'suvro' ||
      inputUserLower === 'director' ||
      inputUserLower.includes('polycables') ||
      inputUserLower.includes('pcil') ||
      inputUserLower === 'pcildomestic@gmail.com' ||
      inputUserLower === 'domestic.pcil@gmail.com'
    ) {
      if (
        trimmedPassword === storedAdminPassword ||
        trimmedPassword === '123456' ||
        trimmedPassword === 'suvroadmin' ||
        trimmedPassword === '1234'
      ) {
        const chosenBranch = (loginSelectedBranchId && loginSelectedBranchId !== 'all')
          ? branches.find(b => b.id === loginSelectedBranchId)
          : undefined;
        const user: AuthUser = {
          username: inputUserLower || 'suvroadmin',
          name: 'Super Admin',
          role: 'admin',
          isSuperAdmin: true,
          isAgm: true,
          userRole: 'Super Admin',
          branchId: chosenBranch ? chosenBranch.id : 'all',
          branchName: chosenBranch ? chosenBranch.name : 'All Sales Centers'
        };
        executeLogin(user);
        return;
      } else {
        setError('Incorrect administrator password. Access denied.');
        return;
      }
    }

    // Always merge fresh salespersons from localStorage and props to guarantee newly changed user login id / code / name are immediately recognized
    let currentSalespersons = [...salespersons];
    try {
      const saved = localStorage.getItem('polycables_salespersons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const idMap = new Map<string, Salesperson>();
          currentSalespersons.forEach(s => { if (s && s.id) idMap.set(s.id, s); });
          parsed.forEach(s => { if (s && s.id) idMap.set(s.id, s); });
          currentSalespersons = Array.from(idMap.values());
        }
      }
    } catch {}

    // 2. Check Sales Representative / Regional Admin / Registered User
    const matchedSp = currentSalespersons.find((s) => {
      if (!s) return false;
      const sUsername = (s.username || '').trim().toLowerCase();
      const sCode = (s.code || '').trim().toLowerCase();
      const sName = (s.name || '').trim().toLowerCase();
      const sId = (s.id || '').trim().toLowerCase();
      const sPhone = (s.phone || '').trim();

      return (
        (sUsername && sUsername === inputUserLower) ||
        (sCode && sCode === inputUserLower) ||
        (sName && sName === inputUserLower) ||
        (sId && sId === inputUserLower) ||
        (sPhone && sPhone === inputUser)
      );
    });

    if (matchedSp) {
      if (matchedSp.isActive === false || (matchedSp as any).isBlocked) {
        setError(`User "${matchedSp.name}" (${matchedSp.code}) is blocked or inactive in Users & Staff. Access blocked.`);
        return;
      }

      const expectedPassword = (matchedSp.password || '').trim();
      if (!expectedPassword || trimmedPassword !== expectedPassword) {
        setError(`Password does not match Users & Staff for user code "${matchedSp.code}". Access blocked.`);
        return;
      }

      const roleLower = (matchedSp.role || '').toLowerCase();
      const isAdminRole = roleLower === 'admin' || matchedSp.role === 'Admin' || (matchedSp.code && matchedSp.code.startsWith('ADM'));
      const isAgmRole = roleLower.includes('agm') || roleLower.includes('director') || roleLower.includes('general manager');
      const isStrictSuper = Boolean(matchedSp.isSuperAdmin);

      const chosenBranch = (isAdminRole && loginSelectedBranchId && loginSelectedBranchId !== 'all')
        ? branches.find((b) => b.id === loginSelectedBranchId)
        : undefined;

      const branchId = chosenBranch
        ? chosenBranch.id
        : (isAdminRole
            ? (loginSelectedBranchId === 'all' ? 'ALL' : (matchedSp.assignedBranchIds?.[0] || matchedSp.branchId || 'ALL'))
            : matchedSp.branchId);

      const branchName = chosenBranch
        ? chosenBranch.name
        : (isAdminRole
            ? (loginSelectedBranchId === 'all' ? 'All Sales Centers' : (matchedSp.assignedBranchNames?.[0] || matchedSp.branchName || 'All Sales Centers'))
            : matchedSp.branchName);

      const user: AuthUser = {
        username: matchedSp.username || matchedSp.code,
        name: matchedSp.name,
        role: isAdminRole ? 'admin' : (isAgmRole ? 'agm' : 'salesperson'),
        salespersonCode: matchedSp.code,
        branchId,
        branchName,
        userRole: matchedSp.role || (isAdminRole ? 'Admin' : 'Sales Representative'),
        designation: matchedSp.designation || matchedSp.role || '',
        isInCharge: matchedSp.isInCharge,
        isAgm: isAgmRole,
        isSuperAdmin: isStrictSuper,
        assignedBranchIds: matchedSp.assignedBranchIds,
        assignedBranchNames: matchedSp.assignedBranchNames,
        adminZone: matchedSp.adminZone,
        isApproved: true
      };
      executeLogin(user);
      return;
    }

    setError('User ID does not match any active record in Users & Staff. Access blocked.');
  };

  // Handle Registration Submit
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanName = regName.trim();
    const cleanCode = regCode.trim().toUpperCase();
    const cleanPhone = regPhone.trim();
    const cleanPass = regPassword.trim();

    if (!regRole) {
      setError('Please select a Role (Account Type).');
      return;
    }

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }

    const isAdmin = regRole === 'Admin' || regRole === 'Admin (Regional Admin)' || regRole === 'Admin ( Accounts )' || regRole.toLowerCase().includes('admin');
    const isFactory = regRole === 'Factory' || regRole.toLowerCase() === 'factory';

    if (isAdmin) {
      if (regAdminBranchIds.length === 0) {
        setError('Please select at least one Sales Center for Admin registration.');
        return;
      }
    } else if (!isFactory && !regBranchId) {
      setError('Please select your assigned Showroom / Sales Center.');
      return;
    }

    if (!cleanCode) {
      setError('Please provide a user or marketing code (e.g. S05).');
      return;
    }

    if (!/^\d{6,}$/.test(cleanPass)) {
      setError('Password / PIN must be a minimum of 6 digits (numeric only, e.g. 123456).');
      return;
    }

    if (cleanPass !== regConfirmPassword.trim()) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    // Check if user code already exists
    const codeExists = salespersons.some((s) => s.code.toLowerCase() === cleanCode.toLowerCase());
    if (codeExists) {
      setError(`User code "${cleanCode}" is already registered. Please choose a different user code.`);
      return;
    }

    // Multi-branch resolution for Admin, or single branch for showroom staff
    const selectedAdminBranches = isAdmin
      ? branches.filter((b) => regAdminBranchIds.includes(b.id))
      : [];
    const selectedAdminBranchNames = selectedAdminBranches.map((b) => b.name);

    const firstBranch = branches.find(b => b.type === 'head_office') || (branches.length > 0 ? branches[0] : undefined);
    const selectedBranch = isAdmin
      ? (selectedAdminBranches[0] || firstBranch)
      : branches.find((b) => b.id === regBranchId);
    const branchName = isAdmin
      ? (selectedAdminBranchNames.length > 0 ? selectedAdminBranchNames.join(', ') : 'All Sales Centers')
      : (selectedBranch ? selectedBranch.name : undefined);
    const branchId = isAdmin
      ? (selectedAdminBranches[0]?.id || 'ALL')
      : (selectedBranch ? selectedBranch.id : undefined);

    // Create the new Salesperson entity with auto-approval
    const newSalesperson: Salesperson = {
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: cleanCode,
      username: cleanCode.toLowerCase(),
      name: cleanName,
      phone: cleanPhone || selectedBranch?.phone || '01700-000000',
      areaGroup: regArea.trim() || (isAdmin ? (selectedAdminBranchNames.slice(0, 3).join(', ') + (selectedAdminBranchNames.length > 3 ? ` (+${selectedAdminBranchNames.length - 3})` : '')) : (branchName || 'Central / Head Office')),
      password: cleanPass,
      branchId: branchId,
      branchName: branchName,
      assignedBranchIds: isAdmin ? regAdminBranchIds : undefined,
      assignedBranchNames: isAdmin ? selectedAdminBranchNames : undefined,
      userType: isAdmin || isFactory ? 'user' : 'marketing',
      role: regIsInCharge ? 'Sales Center In-Charge' : regRole,
      designation: regDesignation,
      isInCharge: (isAdmin || isFactory) ? false : regIsInCharge,
      isApproved: true, // Auto-approved: new user no need approve
      monthlyTargetSales: 0,
      monthlyTargetCollection: 0,
      monthlyTargetCoils: 0
    };

    // Store in global state & cloud via handler
    if (onRegisterSalesperson) {
      onRegisterSalesperson(newSalesperson);
    }

    // Reset registration form and switch to sign in
    setAuthMode('signin');
    setCustomUsername(newSalesperson.code);
    setRegName('');
    setRegRole('');
    setRegBranchId('');
    setRegAdminBranchIds([]);
    setRegPassword('');
    setRegConfirmPassword('');
    setSuccessMsg(
      `Registration Successful! Account "${newSalesperson.code}" (${newSalesperson.name}) is active and ready. You can log in immediately!`
    );
  };

  return (
    <div className="min-h-screen aurora-app-canvas flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card - Cyber Teal Frosted Glassmorphism */}
      <div className="w-full max-w-md cyber-glass-card rounded-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 text-slate-100">
        
        {/* Top Header Card - Pure solid white background matching logo canvas */}
        <div
          className="bg-white px-4 py-4 sm:px-6 sm:py-5 text-center border-b border-cyan-500/30 flex items-center justify-center"
          style={{ backgroundColor: '#ffffff' }}
        >
          <img
            src="/poly-cables-logo.svg?v=2"
            alt="POLY CABLES"
            className="w-full h-auto max-h-20 object-contain select-none"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Tab Selector: Sign In vs Create Account */}
        <div className="flex border-b border-cyan-500/20 bg-[#061824]/70 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin');
              setError('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer border ${
              authMode === 'signin'
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setError('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer border ${
              authMode === 'register'
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/50 shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-amber-300" />
            <span>New User</span>
          </button>
        </div>

        {/* Inactivity / Session Expired Notification */}
        {sessionExpiredMsg && (
          <div className="m-4 mb-0 p-3 bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded-xl text-xs flex items-center space-x-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-300 shrink-0" />
            <span>{sessionExpiredMsg}</span>
          </div>
        )}

        {/* Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/15 border border-rose-400/40 text-rose-200 rounded-xl text-xs flex items-center space-x-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 rounded-xl text-xs flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SIGN IN FORM */}
        {authMode === 'signin' && (
          <form
            onSubmit={handleLoginSubmit}
            className="p-6 space-y-4"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            data-lpignore="true"
          >
            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">
                Username / User Code *:
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 absolute left-3 top-3 text-cyan-400/70" />
                <input
                  type="text"
                  name="polycables_login_user"
                  id="polycables_login_user"
                  value={customUsername}
                  onChange={(e) => {
                    setCustomUsername(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. S01, S02, Kabir Hossain"
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  className="w-full pl-9 pr-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Enter your registered code (e.g. S01, S02) or administrative ID
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">
                Password / Login PIN *:
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-3 text-cyan-400/70" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="polycables_login_token"
                  id="polycables_login_token"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter password (min 6 digits)"
                  required
                  inputMode="numeric"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  className="w-full pl-9 pr-10 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 tracking-widest text-center"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-cyan-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] border border-cyan-400/40 transition-all flex items-center justify-center space-x-2 cursor-pointer mt-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to System</span>
            </button>
          </form>
        )}

        {/* CREATE REGISTER FORM */}
        {authMode === 'register' && (
          <form
            onSubmit={handleRegisterSubmit}
            className="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto"
            autoComplete="off"
          >
            {/* 1. Role in 1st Position */}
            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">
                Role * (Select Account Type):
              </label>
              <select
                value={regRole}
                onChange={(e) => {
                  const val = e.target.value;
                  setRegRole(val);
                  if (val.includes('Admin') || val === 'Factory') {
                    setRegIsInCharge(false);
                  }
                  if (val.includes('Admin')) {
                    setRegBranchId('');
                    setRegArea('');
                    // Deselect All at startup for Admin registration
                    setRegAdminBranchIds([]);
                  }
                }}
                required
                className="w-full px-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-bold bg-[#061520]/90 text-white focus:ring-2 focus:ring-cyan-400 cursor-pointer shadow-2xs"
              >
                <option value="">-- Select Role --</option>
                <option value="Admin (Regional)">Admin (Regional)</option>
                <option value="Admin ( Accounts )">Admin ( Accounts )</option>
                <option value="Marketing Officer">Marketing Officer</option>
                <option value="Sales Center Staff">Sales Center Staff</option>
                <option value="Accountant sales center">Accountant sales center</option>
                <option value="Factory">Factory</option>
              </select>
            </div>

            {/* 2. Sales Center Multi-Selection - Open ONLY for Regional Admin registration */}
            {(regRole === 'Admin (Regional)' || regRole === 'Admin (Regional Admin)') ? (
              <div className="cyber-glass-subcard border border-amber-400/40 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-300" />
                    <span>Choose Sales Center (Regional Admin Registration):</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/20 text-amber-200 border border-amber-400/40 rounded-full font-bold">
                      Multiple Selection
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-500/20 text-cyan-200 rounded-full border border-cyan-400/40">
                      {regAdminBranchIds.length} / {branches.length} Selected
                    </span>
                  </div>
                </div>

                {/* Quick action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRegAdminBranchIds(branches.map((b) => b.id))}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition cursor-pointer shadow-2xs"
                  >
                    Select All ({branches.length} Centers)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegAdminBranchIds([])}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white/10 text-slate-200 hover:bg-white/20 transition cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>

                {/* Scrollable multi-select checkbox list */}
                <div className="max-h-48 overflow-y-auto p-2 bg-[#061520]/80 rounded-xl border border-cyan-500/25 shadow-inner grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {sortedBranches.map((branch) => {
                    const isSelected = regAdminBranchIds.includes(branch.id);
                    return (
                      <label
                        key={branch.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition text-xs ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 font-bold shadow-2xs'
                            : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRegAdminBranchIds((prev) => [...prev, branch.id]);
                            } else {
                              setRegAdminBranchIds((prev) => prev.filter((id) => id !== branch.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500 shrink-0"
                        />
                        <span className="truncate flex-1 font-semibold" title={branch.name}>
                          {formatSalesCenterDisplayName(branch.name)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  Admins can manage multiple sales centers. Select 1 or more sales centers for this admin account.
                </p>
              </div>
            ) : !(regRole.includes('Admin') || regRole === 'Factory') ? (
              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Assign to Sales Center *:
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-3 text-cyan-400/70" />
                  <select
                    value={regBranchId}
                    onChange={(e) => {
                      setRegBranchId(e.target.value);
                      const b = sortedBranches.find((branch) => branch.id === e.target.value);
                      if (b) setRegArea(b.name);
                      else setRegArea('');
                    }}
                    required
                    className="w-full pl-9 pr-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-bold bg-[#061520]/90 text-white focus:ring-2 focus:ring-cyan-400"
                  >
                    <option value="">-- Select Sales Center --</option>
                    {sortedBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {formatSalesCenterDisplayName(branch.name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {/* 3. Designation & In-Charge Tik Mark (Hidden for Admin & Factory) */}
            <div className={`grid ${(regRole.includes('Admin') || regRole === 'Factory') ? 'grid-cols-1' : 'grid-cols-2'} gap-2.5`}>
              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Designation *:
                </label>
                <select
                  value={regDesignation}
                  onChange={(e) => setRegDesignation(e.target.value)}
                  className="w-full px-2.5 py-2 border border-cyan-500/30 rounded-xl text-xs font-bold bg-[#061520]/90 text-white focus:ring-2 focus:ring-cyan-400 cursor-pointer"
                >
                  {USER_DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {!(regRole.includes('Admin') || regRole === 'Factory') && (
                <div>
                  <label className="text-xs font-bold text-cyan-200 block mb-1">
                    In-Charge:
                  </label>
                  <label className="flex items-center space-x-2 px-2.5 py-2 bg-[#061520]/90 border border-cyan-500/30 rounded-xl cursor-pointer hover:bg-[#0c2638] transition-colors h-[38px]">
                    <input
                      type="checkbox"
                      checked={regIsInCharge}
                      onChange={(e) => setRegIsInCharge(e.target.checked)}
                      className="w-4 h-4 text-cyan-500 rounded border-cyan-500/40 focus:ring-cyan-400 cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs font-bold select-none">
                      {regIsInCharge ? (
                        <span className="text-emerald-300 font-extrabold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Tik Mark: Yes (Auto: In-Charge)
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">
                          Tik Mark: No
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* 4. Staff Id & Full Name in 2 columns */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Staff Id (Office ID Card) *:
                </label>
                <input
                  type="text"
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value.toUpperCase())}
                  placeholder="e.g. S05, ST-101"
                  required
                  className="w-full px-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Full Name *:
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 absolute left-3 top-3 text-cyan-400/70" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Subrata Sutradar"
                    required
                    className="w-full pl-9 pr-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* Mobile Phone & Territory */}
            {regRole.includes('Admin') ? (
              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Mobile Phone:
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-2.5 top-3 text-cyan-400/70" />
                  <input
                    type="text"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="017xx-xxxxxx"
                    className="w-full pl-8 pr-2 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-cyan-200 block mb-1">
                    Mobile Phone:
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-2.5 top-3 text-cyan-400/70" />
                    <input
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="017xx-xxxxxx"
                      className="w-full pl-8 pr-2 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-cyan-200 block mb-1">
                    Territory / Zone:
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-3 text-cyan-400/70" />
                    <input
                      type="text"
                      value={regArea}
                      onChange={(e) => setRegArea(e.target.value)}
                      placeholder="e.g. Madhupur Zone"
                      className="w-full pl-8 pr-2 py-2 border border-cyan-500/30 rounded-xl text-xs bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Password PIN (min 6 digits) *:
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value.replace(/\D/g, ''))}
                    placeholder="Min 6-digit PIN"
                    required
                    inputMode="numeric"
                    className="w-full px-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 text-center tracking-widest"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-cyan-200 block mb-1">
                  Confirm Password *:
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value.replace(/\D/g, ''))}
                    placeholder="Confirm PIN"
                    required
                    inputMode="numeric"
                    className="w-full px-3 py-2 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold bg-[#061520]/90 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 text-center tracking-widest"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all flex items-center justify-center space-x-2 cursor-pointer mt-3"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create User & Assign to Sales Center</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
