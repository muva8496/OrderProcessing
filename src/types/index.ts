export type OrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED';
export type PaymentStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface Customer {
  customer_id: string; // UUID
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  created_at: string;
}

export interface Address {
  street: string;
  city: string;
  postal_code: string;
  country_code: string;
}

export interface Product {
  product_id: string; // UUID
  sku: string;
  title: string;
  price: number;
  stock_quantity: number; // Available unreserved stock
  reserved_quantity: number; // Currently reserved during checkout
  category: string;
  description?: string;
  imageUrl?: string;
}

export interface Order {
  order_id: string; // UUID
  customer_id: string;
  status: OrderStatus;
  total_amount: number;
  shipping_address: Address;
  created_at: string;
  updated_at: string;
  cancellation_reason?: string;
  provider_tx_id?: string;
}

export interface OrderItem {
  order_item_id: string; // UUID
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number; // Captured price at order time
  created_at: string;
}

export interface PaymentTransaction {
  transaction_id: string; // UUID
  order_id: string;
  provider_transaction_id: string;
  amount: number;
  status: PaymentStatus;
  payload: Record<string, any>; // JSONB raw gateway response
  created_at: string;
}

export interface SequenceStepLog {
  id: string;
  stepIndex: number;
  timestamp: string;
  from: 'Client' | 'OrderService' | 'InventoryService' | 'PaymentGateway';
  to: 'Client' | 'OrderService' | 'InventoryService' | 'PaymentGateway' | 'Internal';
  action: string;
  direction: 'forward' | 'backward' | 'internal';
  status: 'pending' | 'success' | 'failed' | 'skipped';
  summary: string;
  details: {
    protocol?: string;
    endpoint?: string;
    sqlQuery?: string;
    sqlParams?: Record<string, any>;
    rowsAffected?: number;
    requestPayload?: any;
    responsePayload?: any;
    explanation?: string;
  };
}

export interface DomainEvent {
  eventId: string;
  eventType: 'OrderCreated' | 'StockReserved' | 'StockReservationFailed' | 'PaymentIntentCreated' | 'PaymentSucceeded' | 'PaymentFailed' | 'OrderPaidEvent' | 'StockCommitted' | 'StockRolledBack' | 'OrderCancelled';
  aggregateId: string;
  timestamp: string;
  payload: Record<string, any>;
}
