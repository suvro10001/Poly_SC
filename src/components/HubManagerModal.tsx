import React, { useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Package,
  CheckCircle,
  Truck,
  PlusCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Product, Order, OrderStatus } from '../types/store';

interface HubManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  orders: Order[];
  onUpdateProductStock: (productId: string, newStock: number) => void;
  onToggleProductInStock: (productId: string) => void;
  onAddProduct: (product: Product) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onResetCatalog: () => void;
}

export const HubManagerModal: React.FC<HubManagerModalProps> = ({
  isOpen,
  onClose,
  products,
  orders,
  onUpdateProductStock,
  onToggleProductInStock,
  onAddProduct,
  onUpdateOrderStatus,
  onResetCatalog,
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'add'>('inventory');

  // Add product form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Product['category']>('Produce');
  const [newPrice, setNewPrice] = useState('4.99');
  const [newWeight, setNewWeight] = useState('400g');
  const [newStock, setNewStock] = useState('25');
  const [newOrigin, setNewOrigin] = useState('Local Micro-Hub Farm');
  const [newDescription, setNewDescription] = useState('');

  if (!isOpen) return null;

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newProd: Product = {
      id: `prod-custom-${Date.now()}`,
      name: newName.trim(),
      category: newCategory,
      price: parseFloat(newPrice) || 3.99,
      weight: newWeight.trim() || 'Unit',
      description: newDescription.trim() || 'Freshly picked daily essential item.',
      image: '/src/assets/images/product_organic_berries_1791869380694.jpg',
      tags: ['New Arrival', 'Local Hub'],
      inStock: true,
      stockCount: parseInt(newStock, 10) || 20,
      origin: newOrigin.trim() || 'Local Micro-Hub',
    };

    onAddProduct(newProd);
    setNewName('');
    setNewDescription('');
    setActiveTab('inventory');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hub Header */}
        <div className="p-6 bg-zinc-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-bold">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs text-emerald-400 font-mono font-semibold uppercase">
                Operations Console
              </div>
              <h2 className="text-lg font-bold">Micro-Hub #04 (Downtown Central)</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onResetCatalog}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors"
              title="Reset inventory to default sample products"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-zinc-200 bg-zinc-50 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'inventory'
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Live Hub Inventory ({products.length} SKUs)
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <span>Fulfillment Pipeline</span>
            {orders.length > 0 && (
              <span className="bg-emerald-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'add'
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add New SKU</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Manage current shelf levels and item availability for instant delivery.</span>
                <span>{products.filter((p) => p.inStock).length} Active Online</span>
              </div>

              <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-200">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 hover:bg-zinc-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={product.image}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover bg-zinc-100 shrink-0 border border-zinc-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-zinc-900 truncate">
                          {product.name}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {product.category} · ${product.price.toFixed(2)} · {product.weight}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Stock Stepper */}
                      <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
                        <button
                          onClick={() => onUpdateProductStock(product.id, Math.max(0, product.stockCount - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded text-zinc-700 hover:bg-zinc-200"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-xs font-bold px-2 tabular-nums min-w-[32px] text-center">
                          {product.stockCount}
                        </span>
                        <button
                          onClick={() => onUpdateProductStock(product.id, product.stockCount + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded text-zinc-700 hover:bg-zinc-200"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Stock Status Button */}
                      <button
                        onClick={() => onToggleProductInStock(product.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          product.inStock && product.stockCount > 0
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                        }`}
                      >
                        {product.inStock && product.stockCount > 0 ? 'In Stock' : 'Out of Stock'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 space-y-2">
                  <Package className="w-8 h-8 mx-auto text-zinc-300" />
                  <p className="text-sm">No customer orders placed yet.</p>
                  <p className="text-xs">Place an order from the store to test fulfillment actions!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                        <div>
                          <span className="font-mono font-bold text-sm text-zinc-950">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="text-zinc-400 text-xs ml-2">
                            {new Date(order.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-semibold text-zinc-800">
                          ${order.total.toFixed(2)} · {order.items.length} items
                        </div>
                      </div>

                      <div className="text-xs text-zinc-600 space-y-1">
                        <div><strong>Address:</strong> {order.address.street}, {order.address.city}</div>
                        {order.address.instructions && (
                          <div className="text-zinc-500">Note: {order.address.instructions}</div>
                        )}
                        <div className="font-mono text-zinc-700">
                          {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                        <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded">
                          Current Status: <span className="capitalize">{order.status.replace('_', ' ')}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.status !== 'packing' && order.status !== 'out_for_delivery' && order.status !== 'delivered' && (
                            <button
                              onClick={() => onUpdateOrderStatus(order.id, 'packing')}
                              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-lg flex items-center gap-1"
                            >
                              <Package className="w-3.5 h-3.5" />
                              <span>Mark Packed</span>
                            </button>
                          )}
                          {order.status !== 'out_for_delivery' && order.status !== 'delivered' && (
                            <button
                              onClick={() => onUpdateOrderStatus(order.id, 'out_for_delivery')}
                              className="px-3 py-1.5 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg flex items-center gap-1"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Dispatch Courier</span>
                            </button>
                          )}
                          {order.status !== 'delivered' && (
                            <button
                              onClick={() => onUpdateOrderStatus(order.id, 'delivered')}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Mark Delivered</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <form onSubmit={handleCreateProduct} className="max-w-xl mx-auto space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Product Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Organic Blood Orange"
                  className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as Product['category'])}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900"
                  >
                    <option value="Produce">Produce</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Dairy & Eggs">Dairy & Eggs</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Household">Household</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Price ($ USD)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Unit / Weight</label>
                  <input
                    type="text"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="e.g. 500g or 4-pack"
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Shelf Stock Quantity</label>
                  <input
                    type="number"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Source / Origin</label>
                <input
                  type="text"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  placeholder="e.g. Valley Orchard, Hood River OR"
                  className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Description</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Gourmet product details..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
              >
                Add SKU to Hub Catalog
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
