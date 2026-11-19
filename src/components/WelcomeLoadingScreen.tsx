import React, { useState, useEffect, useRef } from 'react';
import { AuthUser } from '../types';
import { PolyCablesEmblem, PolyCablesLogo } from './PolyCablesLogo';
import { ShieldCheck, Sparkles, ArrowRight, Zap, Database, Server } from 'lucide-react';

interface WelcomeLoadingScreenProps {
  user: AuthUser;
  durationSeconds?: number; // 3s default
  onComplete: () => void;
}

const LOADING_STAGES = [
  { threshold: 18, message: '🔐 Verifying security credentials & session tokens...', detail: 'Authentication verified' },
  { threshold: 40, message: '📦 Loading Poly Cables master inventory & rate catalogs...', detail: 'Stock registers indexed' },
  { threshold: 65, message: '📊 Synchronizing customer ledgers, cash collections & bank deposits...', detail: 'Ledger records synced' },
  { threshold: 88, message: '⚡ Calibrating invoice generator & financial report engines...', detail: 'Workspace optimized' },
  { threshold: 100, message: '✨ System ready! Launching Poly Cables workspace...', detail: 'Redirecting now...' }
];

export const WelcomeLoadingScreen: React.FC<WelcomeLoadingScreenProps> = ({
  user,
  durationSeconds = 2.0,
  onComplete
}) => {
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const displayName = user.username === 'suvroadmin' || user.isSuperAdmin ? 'Super Admin' : (user.name || user.username);
  const isSuvro = false;

  useEffect(() => {
    const durationMs = (durationSeconds || 2.0) * 1000;
    const stepSize = 1; // Strictly increment +1: 0, 1, 2, 3, 4, ... 100
    const totalSteps = 100 / stepSize; // 100 steps
    const stepIntervalMs = Math.max(10, durationMs / totalSteps); // Smooth, fine-grained intervals
    let isDone = false;

    const finish = () => {
      if (isDone) return;
      isDone = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setProgress(100);
      setIsCompleted(true);
      setTimeout(() => {
        onComplete();
      }, 80);
    };

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + stepSize;
        if (next >= 100) {
          finish();
          return 100;
        }
        return next;
      });
    }, stepIntervalMs);

    // Safety fallback: guaranteed completion even if interval gets throttled
    const safetyTimer = setTimeout(() => {
      finish();
    }, durationMs + 350);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearTimeout(safetyTimer);
    };
  }, [durationSeconds, onComplete]);

  // Current active stage
  const currentStage = LOADING_STAGES.find((s) => progress <= s.threshold) || LOADING_STAGES[LOADING_STAGES.length - 1];

  const handleSkip = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setProgress(100);
    setIsCompleted(true);
    setTimeout(() => {
      onComplete();
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14] flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none font-sans">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#0b3b4e_0%,#030d14_100%)]" />
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-teal-400/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -top-10 right-1/3 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      {/* Main Welcome Container */}
      <div className="relative z-10 w-full max-w-xl bg-[#091e2c]/90 backdrop-blur-2xl border border-cyan-400/35 rounded-3xl p-6 sm:p-10 shadow-[0_0_64px_rgba(6,182,212,0.22)] text-center text-white flex flex-col items-center">
        
        {/* Top Header Badge */}
        <div className="w-full flex items-center justify-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 text-xs font-mono font-bold uppercase tracking-wider shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Poly Cables</span>
            <span className="text-slate-400">•</span>
            <span className="text-emerald-300">Live Secure Access</span>
          </div>
        </div>

        {/* LOGO SYMBOL with Animated Glow Rings */}
        <div className="relative mb-6">
          {/* Pulsing Backlight */}
          <div className="absolute -inset-4 bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 rounded-full blur-xl opacity-40 animate-pulse" />

          {/* Rotating Outer Tech Ring */}
          <div className="absolute -inset-3 rounded-full border border-dashed border-cyan-400/40 animate-[spin_12s_linear_infinite]" />
          <div className="absolute -inset-1.5 rounded-full border border-dotted border-emerald-400/30 animate-[spin_8s_linear_infinite_reverse]" />

          {/* Core Logo Container */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white/95 border border-white/30 p-2.5 shadow-2xl flex items-center justify-center overflow-hidden">
            <PolyCablesEmblem size="2xl" />
          </div>
        </div>

        {/* COMPANY NAME & BRANDING */}
        <div className="mb-2">
          <PolyCablesLogo size="xl" variant="dark" showSubtitle={false} showEmblem={false} />
        </div>
        <p className="text-xs sm:text-sm font-bold text-slate-300 tracking-wide mb-5">
          Store, Inventory & Bill Management System
        </p>

        {/* PERSONALIZED USER WELCOME BOX */}
        <div className="w-full cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-4 mb-6 relative overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-2 text-left">
            <div>
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider block">
                {getGreeting()}
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-white flex items-center space-x-2">
                <span>Welcome, {displayName}</span>
                {isSuvro && <Sparkles className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/35 text-cyan-200 text-xs font-bold font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span>{user.role === 'admin' ? 'System Admin' : `Representative (${user.salespersonCode || 'Sales'})`}</span>
            </div>
          </div>
        </div>

        {/* LATEST STYLE WAITING BAR (PROGRESS BAR) */}
        <div className="w-full space-y-2.5 mb-6 text-left">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-slate-200 text-xs tracking-wide">
                {currentStage.message}
              </span>
            </div>
            <span className="font-mono font-black text-sm text-emerald-300">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Futuristic Glowing Progress Track */}
          <div className="relative w-full h-3.5 bg-[#061520] rounded-full p-0.5 border border-cyan-500/30 shadow-inner overflow-hidden">
            {/* Progress Fill with Multi-color Gradient */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 relative will-change-[width] transition-all duration-75 ease-out"
              style={{ width: `${progress}%` }}
            >
              {/* Shimmer Wave Animation */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]"
                style={{
                  backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%)',
                  backgroundSize: '200% 100%'
                }}
              />
              
              {/* Glowing Lead Light Beacon */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#38bdf8] border border-cyan-200" />
            </div>
          </div>

          {/* Sub-info Line: Detail + Session Status (No Remaining Seconds Display) */}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
            <span className="text-slate-300 flex items-center space-x-1">
              <Zap className="w-3 h-3 text-amber-300 shrink-0" />
              <span>{currentStage.detail}</span>
            </span>
            <span className="text-emerald-300 flex items-center space-x-1 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Verified Session</span>
            </span>
          </div>
        </div>

        {/* Live Diagnostics & Action Bottom Bar */}
        <div className="w-full pt-4 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
          {/* Status Badges */}
          <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-300">
            <span className="flex items-center space-x-1">
              <Server className="w-3 h-3 text-emerald-300" />
              <span>Server: 99.9%</span>
            </span>
            <span className="flex items-center space-x-1">
              <Database className="w-3 h-3 text-cyan-300" />
              <span>Cloud DB: Ready</span>
            </span>
          </div>

          {/* Skip / Enter Immediately Button */}
          <button
            type="button"
            onClick={handleSkip}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-cyan-500/25 border border-cyan-300/40 transition-all cursor-pointer hover:scale-105 active:scale-95"
            title="Skip loading animation and enter workspace directly"
          >
            <span>Enter Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
