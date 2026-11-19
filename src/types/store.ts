export interface Product {
  id: string;
  name: string;
  category: 'Produce' | 'Bakery' | 'Beverages' | 'Pantry' | 'Snacks' | 'Dairy & Eggs' | 'Household';
  price: number;
  originalPrice?: number;
  weight: string;
  description: string;
  image: string;
  tags: string[];
  inStock: boolean;
  stockCount: number;
  origin?: string;
  nutrition?: {
    calories?: number;
    organic?: boolean;
    glutenFree?: boolean;
    vegan?: boolean;
  };
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type DeliverySpeed = 'blitz' | 'eco';

export type OrderStatus = 'confirmed' | 'packing' | 'out_for_delivery' | 'delivered';

export interface Order {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tip: number;
  packingFee: number;
  total: number;
  status: OrderStatus;
  createdAt: number;
  estimatedDeliveryTimestamp: number;
  deliverySpeed: DeliverySpeed;
  courier: {
    name: string;
    vehicle: string;
    phone: string;
    rating: number;
  };
  deliveryPin: string;
  address: {
    street: string;
    unit?: string;
    city: string;
    zip: string;
    instructions?: string;
  };
  paymentMethod: 'apple_pay' | 'card' | 'cod';
  promoCode?: string;
}
