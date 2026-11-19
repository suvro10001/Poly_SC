import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, LogIn } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary] Uncaught Application Boot Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    try {
      const expendableKeys = [
        'polycables_stored_bills_cache',
        'polycables_pdf_cache',
        'polycables_print_preview_cache',
        'polycables_temp_backup',
        'polycables_auto_draft',
        'polycables_open_tabs',
        'app_current_user',
        'polycables_last_activity'
      ];
      expendableKeys.forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
    window.location.reload();
  };

  private handleResetLogin = () => {
    try {
      localStorage.removeItem('app_current_user');
      localStorage.removeItem('polycables_last_activity');
      localStorage.removeItem('polycables_open_tabs');
    } catch (_) {}
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 text-center space-y-6">
            <div className="flex justify-center">
              <img
                src="/poly-cables-logo.svg"
                alt="Poly Cables"
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="inline-flex p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full">
              <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Application Load Recovery
              </h1>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                The application encountered an unexpected issue while loading data or rendering. Your stored data is safely preserved.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-left">
                <p className="text-[11px] font-mono text-rose-400 break-all">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetLogin}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Reset Session</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-300 bg-slate-700/80 hover:bg-slate-700 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
