import React from 'react';
import { MapPin, Zap, ChevronRight } from 'lucide-react';

interface DeliveryBannerProps {
  address: string;
  onOpenAddressModal: () => void;
  blitzMinutes?: number;
}

export const DeliveryBanner: React.FC<DeliveryBannerProps> = ({
  address,
  onOpenAddressModal,
  blitzMinutes = 15,
}) => {
  return (
    <div className="bg-zinc-100/80 border-b border-zinc-200 text-xs text-zinc-700 py-2 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded text-[11px]">
            <Zap className="w-3 h-3 fill-emerald-700 text-emerald-700" />
            <span>{blitzMinutes} MIN BLITZ</span>
          </div>
          <span className="hidden sm:inline text-zinc-400">·</span>
          <span className="text-zinc-600">
            Fulfilling from Micro-Hub #04 (Downtown Central)
          </span>
        </div>

        <button
          onClick={onOpenAddressModal}
          className="flex items-center gap-1.5 hover:text-zinc-950 transition-colors font-medium text-zinc-800 group focus-visible:outline-none"
        >
          <MapPin className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-900" />
          <span className="truncate max-w-[220px] sm:max-w-none">{address}</span>
          <span className="text-emerald-700 text-[11px] font-semibold underline underline-offset-2">Change</span>
          <ChevronRight className="w-3 h-3 text-zinc-400" />
        </button>
      </div>
    </div>
  );
};
