import React, { useState } from 'react';
import { X, Plus, Minus, Check, MapPin, Sparkles, Leaf, AlertCircle } from 'lucide-react';
import { Product } from '../types/store';

interface ProductModalProps {
  product: Product | null;
  quantityInCart: number;
  onClose: () => void;
  onAddToCart: (product: Product, quantityToAdd: number) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  quantityInCart,
  onClose,
  onAddToCart,
}) => {
  const [selectedQty, setSelectedQty] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);

  if (!product) return null;

  const handleAdd = () => {
    onAddToCart(product, selectedQty);
    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-zinc-600 hover:text-zinc-950 flex items-center justify-center shadow-sm border border-zinc-200 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Gallery / Image Left */}
          <div className="relative aspect-square bg-zinc-100 flex items-center justify-center overflow-hidden">
            <img
              src={product.image}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>

          {/* Contiguous Purchase Module Right */}
          <div className="p-6 md:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                  <span className="uppercase tracking-wider font-semibold text-zinc-700">
                    {product.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{product.weight}</span>
                </div>
                <h2 className="text-xl font-bold text-zinc-950 leading-snug">
                  {product.name}
                </h2>
              </div>

              {/* Price & Savings */}
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-bold text-zinc-950">
                  ${product.price.toFixed(2)}
                </span>
                {product.originalPrice && (
                  <span className="text-sm text-zinc-400 line-through">
                    ${product.originalPrice.toFixed(2)}
                  </span>
                )}
                {product.originalPrice && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Save ${(product.originalPrice - product.price).toFixed(2)}
                  </span>
                )}
              </div>

              <p className="text-sm text-zinc-600 leading-relaxed">
                {product.description}
              </p>

              {/* Origin & Specs */}
              <div className="space-y-2 pt-2 border-t border-zinc-100 text-xs text-zinc-600">
                {product.origin && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Origin: <strong className="font-medium text-zinc-800">{product.origin}</strong></span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Inventory: <strong className="font-medium text-zinc-800">{product.stockCount} units in hub</strong></span>
                </div>
                {product.nutrition?.organic && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Leaf className="w-3.5 h-3.5 shrink-0" />
                    <span>Certified Organic · Non-GMO verified</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Purchase Bar */}
            <div className="pt-4 border-t border-zinc-200 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center border border-zinc-300 rounded-lg p-1 bg-zinc-50">
                  <button
                    onClick={() => setSelectedQty(Math.max(1, selectedQty - 1))}
                    disabled={selectedQty <= 1}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 disabled:opacity-40 text-zinc-700 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-sm font-bold px-3 tabular-nums text-zinc-900">
                    {selectedQty}
                  </span>
                  <button
                    onClick={() => setSelectedQty(Math.min(product.stockCount, selectedQty + 1))}
                    disabled={selectedQty >= product.stockCount}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 disabled:opacity-40 text-zinc-700 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right">
                  <div className="text-xs text-zinc-400">Total</div>
                  <div className="font-mono font-bold text-lg text-zinc-950 tabular-nums">
                    ${(product.price * selectedQty).toFixed(2)}
                  </div>
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!product.inStock || product.stockCount === 0}
                className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  addedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-950 hover:bg-zinc-800 text-white active:scale-98'
                } disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed`}
              >
                {addedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added to Bag</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>
                      Add {selectedQty} to Bag · ${(product.price * selectedQty).toFixed(2)}
                    </span>
                  </>
                )}
              </button>

              {quantityInCart > 0 && (
                <div className="text-center text-xs text-zinc-500">
                  You already have {quantityInCart} in your bag.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
