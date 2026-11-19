import React, { useState } from 'react';
import { X, MapPin, Check, Plus, Home, Building2, Briefcase } from 'lucide-react';

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAddress: string;
  onSelectAddress: (address: string) => void;
}

const PRESET_ADDRESSES = [
  {
    label: 'Home',
    address: '742 Evergreen Terrace, Apt 4B, Downtown Central',
    icon: Home,
  },
  {
    label: 'Studio / Office',
    address: '1048 Market St, Suite 300, Design District',
    icon: Briefcase,
  },
  {
    label: 'Loft',
    address: '224 Pine Valley Road, North Park',
    icon: Building2,
  },
];

export const AddressModal: React.FC<AddressModalProps> = ({
  isOpen,
  onClose,
  currentAddress,
  onSelectAddress,
}) => {
  const [customAddress, setCustomAddress] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customAddress.trim()) {
      onSelectAddress(customAddress.trim());
      setCustomAddress('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-zinc-200 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">Delivery Address</h3>
            <p className="text-xs text-zinc-500">Pick where your 15-minute blitz courier will arrive</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Saved Addresses */}
        <div className="space-y-2">
          {PRESET_ADDRESSES.map((item) => {
            const Icon = item.icon;
            const isSelected = currentAddress.includes(item.label) || currentAddress === item.address;

            return (
              <button
                key={item.label}
                onClick={() => {
                  onSelectAddress(item.address);
                  onClose();
                }}
                className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  isSelected
                    ? 'border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950'
                    : 'border-zinc-200 hover:border-zinc-300 bg-white'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5 text-zinc-700">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900">{item.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-xs text-zinc-600 truncate mt-0.5">{item.address}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Address Form */}
        <form onSubmit={handleCustomSubmit} className="space-y-2 pt-2 border-t border-zinc-100">
          <label className="text-xs font-semibold text-zinc-700">Add New Drop-Off Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder="e.g. 500 Howard St, Apt 2"
              className="flex-1 px-3 py-2 text-xs bg-zinc-50 border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-900"
            />
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
