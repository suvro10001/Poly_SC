import React, { useState, useEffect } from 'react';
import { X, UserPlus, Building2, User, Phone, MapPin, DollarSign, Check } from 'lucide-react';
import { Party, Salesperson, BranchLocation, AuthUser } from '../types';
import { isMarketingOfficer, isUnwantedSalesCenter } from '../utils/branchAccess';

interface AddPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newParty: Party) => void;
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  defaultBranchId?: string;
  defaultBranchName?: string;
  initialPartyName?: string;
}

export const AddPartyModal: React.FC<AddPartyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  salespersons = [],
  branches = [],
  currentUser,
  defaultBranchId,
  defaultBranchName,
  initialPartyName = '',
}) => {
  const [name, setName] = useState(initialPartyName);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedSpCode, setSelectedSpCode] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranchId || '');
  const [openingBalance, setOpeningBalance] = useState<number | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialPartyName || '');
      setAddress('');
      setPhone('');
      setSelectedSpCode(salespersons.find(isMarketingOfficer)?.code || '');
      setSelectedBranchId(defaultBranchId || branches[0]?.id || '');
      setOpeningBalance('');
      setError('');
    }
  }, [isOpen, initialPartyName, defaultBranchId, salespersons, branches]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Party / Customer Name is required.');
      return;
    }
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }

    const matchedSp = salespersons.find((s) => s.code === selectedSpCode && isMarketingOfficer(s));
    const matchedBranch = branches.find((b) => b.id === selectedBranchId);

    const newParty: Party = {
      id: `party_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim() || undefined,
      salesmanCode: matchedSp?.code || undefined,
      salespersonName: matchedSp?.name || undefined,
      openingBalance: typeof openingBalance === 'number' ? openingBalance : undefined,
      branchId: matchedBranch?.id || defaultBranchId || undefined,
      branchName: matchedBranch?.name || defaultBranchName || undefined,
      createdBy: currentUser?.name || 'System',
    };

    onSave(newParty);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3">
          <div className="flex items-center space-x-2 text-cyan-300">
            <UserPlus className="w-5 h-5" />
            <h2 className="text-base font-bold text-white">Add New Party / Customer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-cyan-500/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-200 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Party Name */}
          <div>
            <label className="block text-cyan-200 font-bold mb-1">
              Party / Customer Name <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Bhai Bhai Electric"
                className="w-full p-2.5 bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 font-semibold focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-cyan-200 font-bold mb-1">
              Address <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Sagordighi, Ghatail"
                className="w-full p-2.5 pl-9 bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 font-semibold focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Phone */}
            <div>
              <label className="block text-cyan-200 font-bold mb-1">Phone (Optional)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="w-full p-2.5 pl-9 bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 font-semibold focus:border-cyan-400 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Opening Balance */}
            <div>
              <label className="block text-cyan-200 font-bold mb-1">Opening Balance (Tk)</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="number"
                  value={openingBalance === '' ? '' : openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full p-2.5 pl-9 bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 font-semibold focus:border-cyan-400 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assigned Marketing Officer */}
            <div>
              <label className="block text-cyan-200 font-bold mb-1">Marketing Officer</label>
              <div className="relative">
                <User className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
                <select
                  value={selectedSpCode}
                  onChange={(e) => setSelectedSpCode(e.target.value)}
                  className="w-full p-2.5 pl-9 bg-[#061520] border border-cyan-500/30 rounded-xl text-white font-semibold focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {salespersons.filter(isMarketingOfficer).map((s) => (
                    <option key={s.id || s.code} value={s.code}>
                      {s.code ? `[${s.code}] ` : ''}{s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assigned Sales Center */}
            <div>
              <label className="block text-cyan-200 font-bold mb-1">Sales Center</label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full p-2.5 pl-9 bg-[#061520] border border-cyan-500/30 rounded-xl text-white font-semibold focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  {branches
                    .filter((b) => !isUnwantedSalesCenter(b))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-cyan-500/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl flex items-center space-x-1.5 shadow-lg transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save & Select Party</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
