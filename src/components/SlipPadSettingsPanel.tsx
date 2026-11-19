import React, { useState } from 'react';
import { Scroll, ChevronDown, ChevronUp, Sliders, Building, FileText, CheckCircle2, RotateCcw } from 'lucide-react';
import { SlipPadSettings } from '../types';

interface SlipPadSettingsPanelProps {
  settings: SlipPadSettings;
  onChange: (updated: SlipPadSettings) => void;
  onReset: () => void;
  documentTypeLabel?: string;
  defaultExpanded?: boolean;
}

export const SlipPadSettingsPanel: React.FC<SlipPadSettingsPanelProps> = ({
  settings,
  onChange,
  onReset,
  documentTypeLabel = 'Document',
  defaultExpanded = false
}) => {
  // Requirement: "if clicked 📜 Slip Pad Settings then show all option else hide all time."
  const [isOpen, setIsOpen] = useState<boolean>(defaultExpanded);

  const update = (key: keyof SlipPadSettings, val: any) => {
    onChange({
      ...settings,
      [key]: val
    });
  };

  return (
    <div id="slip-pad-settings-wrapper" className="cyber-glass-card rounded-2xl border border-cyan-500/25 shadow-lg mb-6 overflow-hidden transition-all text-white">
      {/* Clickable Header Button to reveal or hide options */}
      <button
        type="button"
        id="btn-toggle-slip-pad-settings"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-3.5 cyber-glass-header hover:bg-cyan-500/10 border-b border-cyan-500/25 transition-colors text-left font-semibold text-white cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300 shadow-xs">
            <Scroll className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              📜 Slip Pad Settings
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-400/30">
                {isOpen ? 'Options Visible' : 'Click to Configure Layout'}
              </span>
            </span>
            <p className="text-xs font-normal text-slate-300 mt-0.5">
              Customize company memo headers, copy mode, signature boxes, and pad margins for {documentTypeLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-cyan-200 text-sm font-medium">
          <span className="hidden sm:inline text-xs text-slate-300">
            {isOpen ? 'Hide Options' : 'Show All Options'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-cyan-300 bg-cyan-500/15 border border-cyan-400/30 rounded-md p-0.5" />
          ) : (
            <ChevronDown className="w-5 h-5 text-cyan-300 bg-[#061520] border border-cyan-500/30 rounded-md p-0.5" />
          )}
        </div>
      </button>

      {/* ALL OPTIONS - ONLY VISIBLE WHEN CLICKED */}
      {isOpen && (
        <div id="slip-pad-expanded-options" className="p-5 sm:p-6 bg-[#071824]/70 space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-200">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Memo Pad & Print Parameters</span>
            </div>
            <button
              type="button"
              id="btn-reset-pad-settings"
              onClick={onReset}
              className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1 font-medium underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reset to Defaults
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Section 1: Company Header details */}
            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 space-y-3">
              <h3 className="text-xs font-bold text-cyan-200 flex items-center gap-1.5 uppercase">
                <Building className="w-3.5 h-3.5 text-cyan-400" /> Company Info & Logo
              </h3>
              
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  id="chk-pad-logo"
                  checked={settings.showCompanyLogo}
                  onChange={(e) => update('showCompanyLogo', e.target.checked)}
                  className="rounded text-cyan-400 focus:ring-cyan-400"
                />
                <span>Include Company Emblem / Header</span>
              </label>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Company Pad Title</label>
                <input
                  type="text"
                  id="input-pad-title"
                  value={settings.companyTitle}
                  onChange={(e) => update('companyTitle', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Subtitle / Slogan</label>
                <input
                  type="text"
                  id="input-pad-subtitle"
                  value={settings.companySubtitle}
                  onChange={(e) => update('companySubtitle', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Factory / Office Address</label>
                <textarea
                  id="input-pad-address"
                  rows={2}
                  value={settings.companyAddress}
                  onChange={(e) => update('companyAddress', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400 resize-none"
                />
              </div>
            </div>

            {/* Section 2: Contact, Reg & Bank Info */}
            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 space-y-3">
              <h3 className="text-xs font-bold text-cyan-200 flex items-center gap-1.5 uppercase">
                <FileText className="w-3.5 h-3.5 text-emerald-400" /> Header Notes & Banking
              </h3>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Header Reg / VAT Notice</label>
                <input
                  type="text"
                  id="input-pad-header-note"
                  value={settings.customHeaderNote}
                  onChange={(e) => update('customHeaderNote', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Phone / Helpline</label>
                <input
                  type="text"
                  id="input-pad-phone"
                  value={settings.companyPhone}
                  onChange={(e) => update('companyPhone', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  id="chk-pad-bank"
                  checked={settings.showBankDetails}
                  onChange={(e) => update('showBankDetails', e.target.checked)}
                  className="rounded text-cyan-400 focus:ring-cyan-400"
                />
                <span>Print Bank Wire Instructions</span>
              </label>

              {settings.showBankDetails && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Bank Wire String</label>
                  <textarea
                    id="input-pad-bank-info"
                    rows={2}
                    value={settings.bankInfo}
                    onChange={(e) => update('bankInfo', e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400 resize-none"
                  />
                </div>
              )}
            </div>

            {/* Section 3: Copy Type, Signatures & Spacing */}
            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 space-y-3">
              <h3 className="text-xs font-bold text-cyan-200 flex items-center gap-1.5 uppercase">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> Slip Pad Typography & Copy
              </h3>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Pad Copy Classification</label>
                <select
                  id="select-pad-copy-type"
                  value={settings.copyType}
                  onChange={(e) => update('copyType', e.target.value as any)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                >
                  <option value="Original Customer Copy">Original Customer Copy</option>
                  <option value="Duplicate Office Copy">Duplicate Office Copy</option>
                  <option value="Triplicate Transport Copy">Triplicate Transport Copy</option>
                  <option value="Gate Pass">Gate Pass / Security Copy</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Paper Format</label>
                  <select
                    id="select-pad-paper"
                    value={settings.paperSize}
                    onChange={(e) => update('paperSize', e.target.value as any)}
                    className="w-full text-xs px-2 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                  >
                    <option value="A4">A4 (Standard)</option>
                    <option value="A5">A5 (Half Pad)</option>
                    <option value="Letter">Letter</option>
                    <option value="POS-80mm">POS Thermal 80mm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Font Sizing</label>
                  <select
                    id="select-pad-font-scale"
                    value={settings.fontSizeScale}
                    onChange={(e) => update('fontSizeScale', e.target.value as any)}
                    className="w-full text-xs px-2 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400"
                  >
                    <option value="compact">Compact (Tight)</option>
                    <option value="standard">Standard (Clear)</option>
                    <option value="large">Large (High Contrast)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    id="chk-pad-border"
                    checked={settings.showBorder}
                    onChange={(e) => update('showBorder', e.target.checked)}
                    className="rounded text-cyan-400 focus:ring-cyan-400"
                  />
                  <span>Outer Frame</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    id="chk-pad-signatures"
                    checked={settings.showSignatureSection}
                    onChange={(e) => update('showSignatureSection', e.target.checked)}
                    className="rounded text-cyan-400 focus:ring-cyan-400"
                  />
                  <span>Signature Blocks</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Bottom Terms & Warranty</label>
                <textarea
                  id="input-pad-footer-terms"
                  rows={2}
                  value={settings.footerTerms}
                  onChange={(e) => update('footerTerms', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400 resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
