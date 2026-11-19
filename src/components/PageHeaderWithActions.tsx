import React from 'react';
import { ArrowLeft, X, LucideIcon } from 'lucide-react';

interface PageHeaderWithActionsProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  icon?: LucideIcon;
  onBack: () => void;
  onClose: () => void;
  extraActions?: React.ReactNode;
  idPrefix?: string;
}

export const PageHeaderWithActions: React.FC<PageHeaderWithActionsProps> = ({
  title,
  subtitle,
  badge,
  badgeColor = 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  icon: Icon,
  onBack,
  onClose,
  extraActions,
  idPrefix = 'header'
}) => {
  return (
    <div 
      id={`${idPrefix}-container`} 
      className="cyber-glass-card px-4 py-3 sm:px-6 sm:py-4 mb-6 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-white"
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0 shadow-xs">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
            {badge && (
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-cyan-200/75 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {extraActions && (
        <div className="flex items-center gap-2 self-end md:self-center">
          {extraActions}
        </div>
      )}
    </div>
  );
};
