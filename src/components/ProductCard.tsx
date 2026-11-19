import React, { useState } from 'react';
import { Plus, Minus, Check, Package } from 'lucide-react';
import { Product } from '../types/store';

interface ProductCardProps {
  product: Product;
  quantityInCart: number;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onSelectProduct: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantityInCart,
  onAddToCart,
  onUpdateQuantity,
  onSelectProduct,
}) => {
  const [imgError, setImgError] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 800);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateQuantity(product.id, quantityInCart + 1);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateQuantity(product.id, quantityInCart - 1);
  };

  return (
    <div
      onClick={() => onSelectProduct(product)}
      className="group relative flex flex-col bg-white border border-zinc-200/80 rounded-xl overflow-hidden hover:border-zinc-300 hover:shadow-md transition-all duration-200 cursor-pointer text-left"
    >
      {/* Product Image Stage (65%–75% height) */}
      <div className="relative aspect-[4/3] bg-zinc-100 overflow-hidden flex items-center justify-center">
        {!imgError ? (
          <img
            src={product.image}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-[1.03] transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-zinc-100 text-zinc-400">
            <Package className="w-8 h-8 mb-1 text-zinc-300" />
            <span className="text-xs font-medium text-zinc-500">{product.name}</span>
          </div>
        )}

        {/* Quiet in-stock or origin tag (Anti-pill: clean text with subtle backdrop) */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-sm shadow-2xs">
          <span>{product.stockCount > 0 ? `${product.stockCount} in hub` : 'Out of stock'}</span>
        </div>

        {product.originalPrice && (
          <div className="absolute top-2.5 right-2.5 text-[11px] font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded-sm">
            Save ${(product.originalPrice - product.price).toFixed(2)}
          </div>
        )}
      </div>

      {/* Card Content & Metadata */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {/* Metadata with typographic separator */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
            <span className="uppercase tracking-wider text-[11px] font-semibold text-zinc-600">
              {product.category}
            </span>
            <span aria-hidden="true" className="text-zinc-300">·</span>
            <span>{product.weight}</span>
          </div>

          <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>

          <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-base font-bold text-zinc-950">
              ${product.price.toFixed(2)}
            </span>
            {product.originalPrice && (
              <span className="text-xs text-zinc-400 line-through">
                ${product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>

          {/* Stepper or Add Button */}
          {quantityInCart === 0 ? (
            <button
              onClick={handleAdd}
              disabled={!product.inStock || product.stockCount === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                product.inStock && product.stockCount > 0
                  ? justAdded
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95'
                  : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              }`}
              aria-label={`Add ${product.name} to bag`}
            >
              {justAdded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </>
              )}
            </button>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 bg-zinc-900 text-white rounded-lg p-0.5 shadow-2xs"
            >
              <button
                onClick={handleDecrement}
                className="w-6 h-6 flex items-center justify-center hover:bg-zinc-800 rounded transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono text-xs font-bold px-1 tabular-nums min-w-[16px] text-center">
                {quantityInCart}
              </span>
              <button
                onClick={handleIncrement}
                disabled={quantityInCart >= product.stockCount}
                className="w-6 h-6 flex items-center justify-center hover:bg-zinc-800 rounded transition-colors disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
