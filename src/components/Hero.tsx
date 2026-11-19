import React from 'react';
import { Search, Zap, ShieldCheck, Sparkles, X } from 'lucide-react';

interface HeroProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onApplyPromoPrompt: (code: string) => void;
}

export const Hero: React.FC<HeroProps> = ({
  searchQuery,
  setSearchQuery,
  onApplyPromoPrompt,
}) => {
  return (
    <section className="bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Value Proposition & Search */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <span className="uppercase tracking-wider">Neighborhood Micro-Hub Network</span>
                <span className="text-zinc-300">·</span>
                <span className="text-zinc-600 font-normal">Active within 1.8 mi radius</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-zinc-950 tracking-tight leading-[1.15]" style={{ textWrap: 'balance' }}>
                Everyday essentials, delivered in 15 minutes.
              </h1>
              <p className="text-base sm:text-lg text-zinc-600 max-w-xl leading-relaxed">
                Handcrafted sourdough, single-origin cold brew, crisp organic produce, and daily pantry staples picked and packed from your local micro-hub.
              </p>
            </div>

            {/* Quick Search Bar */}
            <div className="relative max-w-xl">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sourdough, cold brew, avocados, eggs, pasta..."
                className="w-full pl-11 pr-10 py-3.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 transition-all shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Micro Promo Coupon Card */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onApplyPromoPrompt('QUICK15')}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 hover:bg-emerald-100 transition-colors text-left"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>
                  First blitz order? Use code <strong className="font-mono underline underline-offset-2">QUICK15</strong> for $15 off $35+
                </span>
              </button>
              <button
                onClick={() => onApplyPromoPrompt('FREESHIP')}
                className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2 font-medium"
              >
                Free Delivery over $35
              </button>
            </div>

            {/* 3 Proof Adjacency Points */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-zinc-100 text-xs text-zinc-600">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-zinc-900 font-mono tabular-nums">12–15 Min</div>
                  <div className="text-zinc-500 text-[11px]">Average delivery time</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-zinc-800 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-zinc-900 font-mono tabular-nums">100% Guaranteed</div>
                  <div className="text-zinc-500 text-[11px]">Cold chain preserved</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-[10px] mt-0.5">
                  0
                </div>
                <div>
                  <div className="font-semibold text-zinc-900">Zero Substitutions</div>
                  <div className="text-zinc-500 text-[11px]">Live inventory accuracy</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Showcase Visual */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-200/90 shadow-sm bg-zinc-100 aspect-[16/10] lg:aspect-square flex items-center justify-center group">
              <img
                src="/src/assets/images/hero_market_groceries_1791869378085.jpg"
                alt="Fresh market essentials curated at StoreQuick"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500 ease-out"
                onError={(e) => {
                  // Fallback container if local image fails
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const fallback = target.parentElement?.querySelector('.image-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <div className="image-fallback hidden absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-100">
                <Zap className="w-10 h-10 text-emerald-600 mb-2" />
                <h3 className="font-bold text-zinc-900">StoreQuick Micro-Hub</h3>
                <p className="text-xs text-zinc-500">Fresh daily essentials, 15-minute blitz courier</p>
              </div>

              {/* Bottom Scrim Caption */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 sm:p-5 text-white">
                <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                  Hub Stock Updated Just Now
                </div>
                <div className="text-sm font-medium text-white/95 truncate">
                  Farm-fresh produce & small-batch bakeries
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
