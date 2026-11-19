import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  Clock,
  Phone,
  MessageSquare,
  Bike,
  Package,
  Home,
  RotateCcw,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import { Order, OrderStatus } from '../types/store';

interface OrderTrackerModalProps {
  order: Order | null;
  onClose: () => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onReorder: (order: Order) => void;
}

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  order,
  onClose,
  onUpdateOrderStatus,
  onReorder,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(14 * 60 + 30);
  const [courierChatOpen, setCourierChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<string[]>([
    'Courier Marcus: "Hi! I just picked up your insulated bag from Hub #04. Heading your way now on e-bike!"',
  ]);

  useEffect(() => {
    if (!order || order.status === 'delivered') return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onUpdateOrderStatus(order.id, 'delivered');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [order, onUpdateOrderStatus]);

  if (!order) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const stages: { key: OrderStatus; label: string; desc: string; icon: React.ElementType }[] = [
    {
      key: 'confirmed',
      label: 'Order Confirmed',
      desc: 'Hub #04 received ticket',
      icon: Clock,
    },
    {
      key: 'packing',
      label: 'Picking & Thermal Bagging',
      desc: 'Packing cold & dry items',
      icon: Package,
    },
    {
      key: 'out_for_delivery',
      label: 'Courier En Route',
      desc: `${order.courier.name} on ${order.courier.vehicle}`,
      icon: Bike,
    },
    {
      key: 'delivered',
      label: 'Arrived at Doorstep',
      desc: 'Package handed over or on porch',
      icon: Home,
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.key === order.status);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setChatHistory((prev) => [
      ...prev,
      `You: "${chatMessage.trim()}"`,
      `Courier Marcus: "Got it! Thanks for the note."`,
    ]);
    setChatMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-zinc-950 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold uppercase tracking-wider">
              <Zap className="w-4 h-4 fill-current" />
              <span>15-Minute Blitz Tracking</span>
            </div>
            <h2 className="text-xl font-bold mt-1">Order #{order.id.slice(-6).toUpperCase()}</h2>
            <div className="text-xs text-zinc-400 font-mono mt-0.5">
              Placed {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live ETA Banner */}
        <div className="bg-emerald-50 border-b border-emerald-100 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              {order.status === 'delivered' ? 'Status' : 'Estimated Arrival'}
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950 font-mono tabular-nums">
              {order.status === 'delivered' ? 'Delivered!' : `${timeDisplay} Remaining`}
            </div>
          </div>

          {/* Secure Delivery PIN */}
          <div className="flex items-center gap-2.5 bg-white border border-emerald-200 px-3.5 py-2 rounded-xl shadow-2xs">
            <KeyRound className="w-4 h-4 text-emerald-700" />
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-500">Delivery PIN</div>
              <div className="font-mono text-base font-extrabold text-zinc-950 tracking-wider">
                {order.deliveryPin}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Stepper */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="relative">
            {/* Connecting Track Line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-zinc-200" />

            <div className="space-y-6">
              {stages.map((stage, idx) => {
                const isPassed = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;
                const IconComponent = stage.icon;

                return (
                  <div key={stage.key} className="relative flex items-start gap-4">
                    <div
                      className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isPassed
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-zinc-950 text-white ring-4 ring-emerald-100'
                          : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <IconComponent className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4
                          className={`text-sm font-semibold ${
                            isCurrent
                              ? 'text-zinc-950'
                              : isPassed
                              ? 'text-zinc-800'
                              : 'text-zinc-400'
                          }`}
                        >
                          {stage.label}
                        </h4>
                        {isCurrent && order.status !== 'delivered' && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            In Progress
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Courier Card */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-sm">
                {order.courier.name.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-950">{order.courier.name}</div>
                <div className="text-xs text-zinc-500">{order.courier.vehicle} · {order.courier.rating} ★</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCourierChatOpen(!courierChatOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg text-xs font-semibold text-zinc-800 transition-colors shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
                <span>Message</span>
              </button>
              <a
                href={`tel:${order.courier.phone}`}
                className="p-2 bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg text-zinc-700 hover:text-zinc-950 transition-colors"
                title="Call driver"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Quick Courier Chat Toggle */}
          {courierChatOpen && (
            <div className="p-4 bg-zinc-100 rounded-xl space-y-3 text-xs">
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {chatHistory.map((msg, i) => (
                  <div key={i} className="p-2 rounded bg-white text-zinc-800 border border-zinc-200">
                    {msg}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="e.g. Ring bottom buzzer #12"
                  className="flex-1 px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-zinc-950 text-white font-semibold rounded-lg text-xs"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* Testing / Simulator Controls */}
          <div className="p-3 bg-zinc-100/60 rounded-xl border border-zinc-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Simulation Controls (Advance delivery stage):</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onUpdateOrderStatus(order.id, 'packing')}
                className="px-2.5 py-1 text-xs bg-white border border-zinc-300 hover:border-zinc-400 rounded font-medium text-zinc-800"
              >
                1. Hub Packing
              </button>
              <button
                onClick={() => onUpdateOrderStatus(order.id, 'out_for_delivery')}
                className="px-2.5 py-1 text-xs bg-white border border-zinc-300 hover:border-zinc-400 rounded font-medium text-zinc-800"
              >
                2. On E-Bike
              </button>
              <button
                onClick={() => onUpdateOrderStatus(order.id, 'delivered')}
                className="px-2.5 py-1 text-xs bg-white border border-zinc-300 hover:border-zinc-400 rounded font-medium text-zinc-800"
              >
                3. Delivered
              </button>
            </div>
          </div>

          {/* Itemized Order Recap */}
          <div className="space-y-2 pt-2 border-t border-zinc-200 text-xs">
            <div className="font-semibold text-zinc-900">Items in this Delivery</div>
            <div className="space-y-1">
              {order.items.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between text-zinc-600 font-mono tabular-nums">
                  <span className="font-sans truncate max-w-[280px]">
                    {quantity}x {product.name}
                  </span>
                  <span>${(product.price * quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-zinc-950 pt-2 border-t border-zinc-100 text-sm font-mono tabular-nums">
                <span className="font-sans">Grand Total</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Re-Order Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => onReorder(order)}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>1-Tap Re-Order Bag</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
