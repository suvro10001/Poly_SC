import React, { useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Trash2,
  Zap,
  Clock,
  Sparkles,
  CreditCard,
  Banknote,
  Check,
  MapPin,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { CartItem, DeliverySpeed } from '../types/store';
import { PROMO_CODES } from '../data/products';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  deliverySpeed: DeliverySpeed;
  setDeliverySpeed: (speed: DeliverySpeed) => void;
  appliedPromo: string | null;
  onApplyPromo: (code: string) => { success: boolean; message: string };
  onRemovePromo: () => void;
  tip: number;
  setTip: (tip: number) => void;
  deliveryAddress: string;
  deliveryNotes: string;
  setDeliveryNotes: (notes: string) => void;
  paymentMethod: 'apple_pay' | 'card' | 'cod';
  setPaymentMethod: (method: 'apple_pay' | 'card' | 'cod') => void;
  onPlaceOrder: () => void;
  isPlacingOrder: boolean;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  deliverySpeed,
  setDeliverySpeed,
  appliedPromo,
  onApplyPromo,
  onRemovePromo,
  tip,
  setTip,
  deliveryAddress,
  deliveryNotes,
  setDeliveryNotes,
  paymentMethod,
  setPaymentMethod,
  onPlaceOrder,
  isPlacingOrder,
}) => {
  const [promoInput, setPromoInput] = useState('');
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const packingFee = items.length > 0 ? 0.99 : 0;
  
  // Delivery fee logic
  const isFreeDelivery = subtotal >= 35 || appliedPromo === 'FREESHIP';
  const deliveryFee = deliverySpeed === 'blitz' ? (isFreeDelivery ? 0 : 1.99) : 0;

  // Discount logic
  let discount = 0;
  if (appliedPromo && PROMO_CODES[appliedPromo]) {
    const promo = PROMO_CODES[appliedPromo];
    if (promo.discountFixed) {
      discount = promo.discountFixed;
    }
  }

  const grandTotal = Math.max(0, subtotal + packingFee + deliveryFee + tip - discount);
  const freeShippingThreshold = 35;
  const progressPercent = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  const handleApplyPromoCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    const res = onApplyPromo(promoInput.trim().toUpperCase());
    setPromoFeedback(res.message);
    if (res.success) {
      setPromoInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-950">Your Shopping Bag</h2>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">
              ({items.reduce((sum, i) => sum + i.quantity, 0)} items)
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 flex items-center justify-center transition-colors"
            aria-label="Close bag"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Delivery Bar */}
        <div className="bg-emerald-50/70 px-6 py-2.5 border-b border-emerald-100 text-xs">
          <div className="flex items-center justify-between text-emerald-900 font-medium mb-1.5">
            <span>
              {subtotal >= freeShippingThreshold
                ? 'Unlocked Free 15-Minute Blitz Delivery!'
                : `Add $${(freeShippingThreshold - subtotal).toFixed(2)} more for Free Delivery`}
            </span>
            <span className="font-mono tabular-nums">{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-emerald-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-100 mx-auto flex items-center justify-center text-zinc-400">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900">Your bag is empty</h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                Add farm-fresh sourdough, cold brew, or pantry favorites to start your 15-minute blitz order.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800"
              >
                Browse Essentials
              </button>
            </div>
          ) : (
            <>
              {/* Itemized List */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Items from Micro-Hub
                </div>
                <div className="divide-y divide-zinc-100">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="py-3 flex items-center gap-3">
                      <img
                        src={product.image}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-lg object-cover bg-zinc-100 shrink-0 border border-zinc-100"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 truncate">
                          {product.name}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono tabular-nums">
                          ${product.price.toFixed(2)} · {product.weight}
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 bg-zinc-100 rounded-lg p-0.5">
                        <button
                          onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono text-xs font-bold px-1 tabular-nums min-w-[18px] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                          disabled={quantity >= product.stockCount}
                          className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right font-mono font-semibold text-sm tabular-nums text-zinc-950 min-w-[50px]">
                        ${(product.price * quantity).toFixed(2)}
                      </div>

                      <button
                        onClick={() => onRemoveItem(product.id)}
                        className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Speed Selector */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Delivery Speed
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliverySpeed('blitz')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      deliverySpeed === 'blitz'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600 text-zinc-950'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        15-Min Blitz
                      </span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        {isFreeDelivery ? 'FREE' : '+$1.99'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Direct e-bike courier dispatch
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliverySpeed('eco')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      deliverySpeed === 'eco'
                        ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 text-zinc-950'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-600" />
                        30-Min Eco
                      </span>
                      <span className="font-mono tabular-nums text-zinc-600">FREE</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Batched neighborhood route
                    </p>
                  </button>
                </div>
              </div>

              {/* Promo Code Input */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Promo / Coupon Code
                </div>
                {appliedPromo ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-xs text-emerald-900">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <div>
                        <strong className="font-mono">{appliedPromo}</strong> applied
                        <div className="text-[11px] text-emerald-700">
                          {PROMO_CODES[appliedPromo]?.description}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={onRemovePromo}
                      className="text-xs text-emerald-800 hover:text-emerald-950 underline font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyPromoCode} className="flex gap-2">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoFeedback(null);
                      }}
                      placeholder="Try QUICK15 or FLASH5"
                      className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-zinc-50 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 text-xs font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      Apply
                    </button>
                  </form>
                )}
                {promoFeedback && !appliedPromo && (
                  <p className="text-xs text-amber-700">{promoFeedback}</p>
                )}
              </div>

              {/* Courier Tip */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>Courier Blitz Tip</span>
                  <span className="text-[11px] text-zinc-500 font-normal">100% goes to driver</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1.5, 3.0, 5.0].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTip(amount)}
                      className={`py-2 px-1 text-xs font-mono font-semibold rounded-lg border text-center transition-all ${
                        tip === amount
                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white'
                      }`}
                    >
                      {amount === 0 ? 'None' : `$${amount.toFixed(2)}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Address & Delivery Notes */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Drop-Off Location
                </div>
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                    <span className="font-medium text-zinc-800">{deliveryAddress}</span>
                  </div>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="Drop notes: (e.g. Leave on porch, ring doorbell, gate #401)"
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-zinc-200 rounded-md focus:outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Payment Method
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('apple_pay')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      paymentMethod === 'apple_pay'
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 text-zinc-700 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-semibold">Apple Pay</div>
                    <div className="text-[10px] opacity-75">1-Touch</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      paymentMethod === 'card'
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 text-zinc-700 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-center gap-1">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Card</span>
                    </div>
                    <div className="text-[10px] opacity-75">•• 4022</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      paymentMethod === 'cod'
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 text-zinc-700 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-center gap-1">
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Cash</span>
                    </div>
                    <div className="text-[10px] opacity-75">On delivery</div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Checkout Summary */}
        {items.length > 0 && (
          <div className="p-6 bg-zinc-50 border-t border-zinc-200 space-y-4">
            <div className="space-y-1.5 text-xs text-zinc-600 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="font-sans text-zinc-500">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-zinc-500">Micro-Hub Packing</span>
                <span>${packingFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-zinc-500">
                  {deliverySpeed === 'blitz' ? '15-Min Blitz Delivery' : 'Eco Delivery'}
                </span>
                <span>
                  {deliveryFee === 0 ? (
                    <span className="text-emerald-700 font-sans font-semibold">FREE</span>
                  ) : (
                    `$${deliveryFee.toFixed(2)}`
                  )}
                </span>
              </div>
              {tip > 0 && (
                <div className="flex justify-between">
                  <span className="font-sans text-zinc-500">Courier Tip</span>
                  <span>${tip.toFixed(2)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span className="font-sans">Discount ({appliedPromo})</span>
                  <span>-${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-zinc-950 pt-2 border-t border-zinc-200">
                <span className="font-sans">Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={onPlaceOrder}
              disabled={isPlacingOrder}
              className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 disabled:opacity-60"
            >
              {isPlacingOrder ? (
                <span>Dispatching to Micro-Hub...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>
                    Place 15-Min Blitz Order · ${grandTotal.toFixed(2)}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Contactless hand-off · 100% fresh guarantee</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
