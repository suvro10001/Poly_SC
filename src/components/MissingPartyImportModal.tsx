import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  UserPlus,
  Search,
  Check,
  X,
  Building2,
  Phone,
  MapPin,
  UserCheck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Party, Salesperson, BranchLocation, AuthUser } from '../types';

export interface MissingPartyImportModalProps {
  isOpen: boolean;
  partyName: string;
  address?: string;
  phone?: string;
  salesmanCode?: string;
  salespersonName?: string;
  branchId?: string;
  branchName?: string;
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  parties?: Party[];
  onCreateAndImport?: (newParty: Party, isExisting?: boolean) => void;
  onPartyCreated?: (newParty: Party) => void;
  onImportWithoutCreating: () => void;
  onCancel: () => void;
}

export const MissingPartyImportModal: React.FC<MissingPartyImportModalProps> = ({
  isOpen,
  partyName,
  address = '',
  phone = '',
  salesmanCode = '',
  salespersonName = '',
  branchId = '',
  branchName = '',
  salespersons = [],
  branches = [],
  currentUser = null,
  parties = [],
  onCreateAndImport,
  onPartyCreated,
  onImportWithoutCreating,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'create'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExistingParty, setSelectedExistingParty] = useState<Party | null>(null);

  // New Party Form State
  const [newName, setNewName] = useState(partyName);
  const [newAddress, setNewAddress] = useState(address);
  const [newPhone, setNewPhone] = useState(phone);
  const [newSalesmanCode, setNewSalesmanCode] = useState(salesmanCode);
  const [newSalespersonName, setNewSalespersonName] = useState(salespersonName);
  const [openingBalance, setOpeningBalance] = useState<number>(0);

  // Filter existing parties dynamically based on search query
  const filteredParties = useMemo(() => {
    if (!parties || parties.length === 0) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      // If query is empty, show up to 10 stored parties
      return parties.slice(0, 15);
    }
    return parties
      .filter((p) => {
        const nameMatch = (p.name || '').toLowerCase().includes(query);
        const addressMatch = (p.address || '').toLowerCase().includes(query);
        const phoneMatch = (p.phone || '').toLowerCase().includes(query);
        const codeMatch = (p.salesmanCode || '').toLowerCase().includes(query);
        return nameMatch || addressMatch || phoneMatch || codeMatch;
      })
      .slice(0, 25);
  }, [parties, searchQuery]);

  if (!isOpen) return null;

  const handleSelectExisting = (party: Party) => {
    setSelectedExistingParty(party);
    if (onCreateAndImport) {
      onCreateAndImport(party, true);
    } else if (onPartyCreated) {
      onPartyCreated(party);
    }
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const finalParty: Party = {
      id: `party-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: newName.trim() || partyName,
      address: newAddress.trim(),
      phone: newPhone.trim() || undefined,
      salesmanCode: newSalesmanCode.trim() || undefined,
      salespersonName: newSalespersonName.trim() || undefined,
      branchId: branchId || undefined,
      branchName: branchName || undefined,
      openingBalance: openingBalance || 0,
      createdBy: currentUser?.name || currentUser?.username || 'System'
    };

    if (onCreateAndImport) {
      onCreateAndImport(finalParty, false);
    } else if (onPartyCreated) {
      onPartyCreated(finalParty);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-xl overflow-hidden animate-fade-in my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-800/60 rounded-xl border border-amber-500/40">
              <AlertCircle className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>Customer Not In Directory</span>
              </h3>
              <p className="text-xs text-amber-100">
                Match with an existing stored customer or register as a new one
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-amber-200 hover:text-white p-1.5 rounded-lg hover:bg-amber-800/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Imported Notice Bar */}
        <div className="bg-amber-50 border-b border-amber-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Customer in Imported Bill:</span>
            <div className="font-extrabold text-slate-900 font-mono text-sm mt-0.5">
              "{partyName}"
            </div>
            {address && <div className="text-[11px] text-slate-600 mt-0.5">📍 {address}</div>}
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            <span className="text-[11px] bg-amber-200/80 text-amber-900 px-2.5 py-1 rounded-full font-bold">
              Unmatched
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-100 p-1.5 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-indigo-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-indigo-600" />
            <span>Search Previously Stored Customer ({parties.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-amber-900 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-amber-600" />
            <span>Create New Customer</span>
          </button>
        </div>

        {/* Tab 1: Dynamic Search Previous Stored Customer */}
        {activeTab === 'search' && (
          <div className="p-4 space-y-3 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type customer name, market, district, phone or salesman code..."
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-slate-800"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
              <span>Select an existing customer to link this bill:</span>
              <span className="font-mono text-slate-400">{filteredParties.length} found</span>
            </div>

            {/* List of Stored Parties */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
              {filteredParties.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <p className="font-semibold text-slate-700">No stored customers found matching "{searchQuery}"</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try another search term or click "Create New Customer" above.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="mt-3 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold hover:bg-amber-100 cursor-pointer"
                  >
                    + Switch to Create New Customer
                  </button>
                </div>
              ) : (
                filteredParties.map((p, idx) => {
                  return (
                    <div
                      key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                      onClick={() => handleSelectExisting(p)}
                      className="p-3 hover:bg-indigo-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 group-hover:text-indigo-900 text-xs flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.salesmanCode && (
                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.2 rounded text-[10px] font-mono">
                              Code: {p.salesmanCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          {p.address && <span>📍 {p.address}</span>}
                          {p.phone && <span>📞 {p.phone}</span>}
                          {p.salespersonName && <span>👤 {p.salespersonName}</span>}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectExisting(p);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 group-hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center space-x-1 shrink-0 transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Select</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Create New Customer */}
        {activeTab === 'create' && (
          <div className="p-4 space-y-3 text-xs">
            <form onSubmit={handleCreateNew} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Customer / Party Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="Enter customer name..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Market, District, Area..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="01..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Salesman Code</label>
                  <input
                    type="text"
                    value={newSalesmanCode}
                    onChange={(e) => setNewSalesmanCode(e.target.value)}
                    placeholder="e.g. D1, CTG1"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Opening Balance (Tk)</label>
                <input
                  type="number"
                  value={openingBalance || ''}
                  onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-800 font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Save to Customer Directory & Import Bill</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={onImportWithoutCreating}
            className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
            title="Keep party name as written in file without saving to directory"
          >
            Import Bill Only (Don't Save to Directory)
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold transition-colors cursor-pointer text-xs"
          >
            Cancel Import
          </button>
        </div>
      </div>
    </div>
  );
};
