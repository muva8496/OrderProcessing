import { Customer, Product, Order, OrderItem, PaymentTransaction, DomainEvent, OrderStatus, PaymentStatus } from '../types';
import { INITIAL_CUSTOMERS, INITIAL_PRODUCTS, INITIAL_ORDERS, INITIAL_ORDER_ITEMS, INITIAL_PAYMENT_TRANSACTIONS } from '../data/seedData';

class InMemoryDatabase {
  private customers: Customer[] = [];
  private products: Product[] = [];
  private orders: Order[] = [];
  private orderItems: OrderItem[] = [];
  private paymentTransactions: PaymentTransaction[] = [];
  private domainEvents: DomainEvent[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.reset();
  }

  public reset() {
    this.customers = JSON.parse(JSON.stringify(INITIAL_CUSTOMERS));
    this.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    this.orders = JSON.parse(JSON.stringify(INITIAL_ORDERS));
    this.orderItems = JSON.parse(JSON.stringify(INITIAL_ORDER_ITEMS));
    this.paymentTransactions = JSON.parse(JSON.stringify(INITIAL_PAYMENT_TRANSACTIONS));
    this.domainEvents = [
      {
        eventId: 'evt-init-001',
        eventType: 'OrderPaidEvent',
        aggregateId: 'ord-8f92-411a-942b-5813f0a00001',
        timestamp: '2026-10-04T10:15:09Z',
        payload: { order_id: 'ord-8f92-411a-942b-5813f0a00001', total_amount: 189.00 },
      },
      {
        eventId: 'evt-init-002',
        eventType: 'StockCommitted',
        aggregateId: 'p100-0000-0000-0000-000000000001',
        timestamp: '2026-10-04T10:15:10Z',
        payload: { product_id: 'p100-0000-0000-0000-000000000001', committed_qty: 1 },
      },
    ];
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // Getters
  public getCustomers(): Customer[] {
    return [...this.customers];
  }

  public getProducts(): Product[] {
    return [...this.products];
  }

  public getOrders(): Order[] {
    return [...this.orders];
  }

  public getOrderItems(): OrderItem[] {
    return [...this.orderItems];
  }

  public getPaymentTransactions(): PaymentTransaction[] {
    return [...this.paymentTransactions];
  }

  public getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }

  public publishEvent(event: Omit<DomainEvent, 'eventId' | 'timestamp'>): DomainEvent {
    const fullEvent: DomainEvent = {
      ...event,
      eventId: `evt-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.domainEvents.unshift(fullEvent);
    this.notify();
    return fullEvent;
  }

  /**
   * Atomic Stock Reservation
   * Matches the exact SQL statement:
   * UPDATE products
   * SET stock_quantity = stock_quantity - :qty,
   *     reserved_quantity = reserved_quantity + :qty
   * WHERE product_id = :product_id
   *   AND stock_quantity >= :qty;
   */
  public atomicReserveStock(productId: string, qty: number): {
    success: boolean;
    rowsAffected: number;
    updatedProduct?: Product;
    error?: string;
  } {
    const index = this.products.findIndex(p => p.product_id === productId);
    if (index === -1) {
      return { success: false, rowsAffected: 0, error: 'Product not found' };
    }

    const current = this.products[index];
    // Atomic check: stock_quantity >= qty
    if (current.stock_quantity >= qty) {
      this.products[index] = {
        ...current,
        stock_quantity: current.stock_quantity - qty,
        reserved_quantity: current.reserved_quantity + qty,
      };
      this.publishEvent({
        eventType: 'StockReserved',
        aggregateId: productId,
        payload: { product_id: productId, qty, remaining_stock: this.products[index].stock_quantity, reserved: this.products[index].reserved_quantity },
      });
      this.notify();
      return {
        success: true,
        rowsAffected: 1,
        updatedProduct: this.products[index],
      };
    } else {
      this.publishEvent({
        eventType: 'StockReservationFailed',
        aggregateId: productId,
        payload: { product_id: productId, requested_qty: qty, available_stock: current.stock_quantity, reason: 'stock_quantity < :qty (Constraint Violated)' },
      });
      return {
        success: false,
        rowsAffected: 0,
        error: `Insufficient stock: requested ${qty}, available ${current.stock_quantity}`,
      };
    }
  }

  /**
   * Commit Reserved Inventory
   * Matches:
   * UPDATE products
   * SET reserved_quantity = reserved_quantity - :qty
   * WHERE product_id = :product_id;
   */
  public commitReservedInventory(productId: string, qty: number): {
    success: boolean;
    rowsAffected: number;
    updatedProduct?: Product;
  } {
    const index = this.products.findIndex(p => p.product_id === productId);
    if (index === -1) {
      return { success: false, rowsAffected: 0 };
    }

    const current = this.products[index];
    const newReserved = Math.max(0, current.reserved_quantity - qty);
    this.products[index] = {
      ...current,
      reserved_quantity: newReserved,
    };
    this.publishEvent({
      eventType: 'StockCommitted',
      aggregateId: productId,
      payload: { product_id: productId, committed_qty: qty, remaining_reserved: newReserved },
    });
    this.notify();
    return {
      success: true,
      rowsAffected: 1,
      updatedProduct: this.products[index],
    };
  }

  /**
   * Roll Back Reservation
   * Matches:
   * UPDATE products
   * SET stock_quantity = stock_quantity + :qty,
   *     reserved_quantity = reserved_quantity - :qty
   * WHERE product_id = :product_id;
   */
  public rollbackReservation(productId: string, qty: number): {
    success: boolean;
    rowsAffected: number;
    updatedProduct?: Product;
  } {
    const index = this.products.findIndex(p => p.product_id === productId);
    if (index === -1) {
      return { success: false, rowsAffected: 0 };
    }

    const current = this.products[index];
    const restoreReserved = Math.min(qty, current.reserved_quantity);
    this.products[index] = {
      ...current,
      stock_quantity: current.stock_quantity + restoreReserved,
      reserved_quantity: current.reserved_quantity - restoreReserved,
    };
    this.publishEvent({
      eventType: 'StockRolledBack',
      aggregateId: productId,
      payload: { product_id: productId, rolled_back_qty: restoreReserved, restored_stock: this.products[index].stock_quantity },
    });
    this.notify();
    return {
      success: true,
      rowsAffected: 1,
      updatedProduct: this.products[index],
    };
  }

  public createCustomer(customer: Omit<Customer, 'customer_id' | 'created_at'>): Customer {
    const newCustomer: Customer = {
      customer_id: crypto.randomUUID(),
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      created_at: new Date().toISOString(),
    };
    this.customers.unshift(newCustomer);
    this.notify();
    return newCustomer;
  }

  public createOrder(order: Omit<Order, 'order_id' | 'created_at' | 'updated_at'>): Order {
    const now = new Date().toISOString();
    const newOrder: Order = {
      ...order,
      order_id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    };
    this.orders.unshift(newOrder);
    this.publishEvent({
      eventType: 'OrderCreated',
      aggregateId: newOrder.order_id,
      payload: { order_id: newOrder.order_id, customer_id: newOrder.customer_id, total_amount: newOrder.total_amount, status: newOrder.status },
    });
    this.notify();
    return newOrder;
  }

  public addOrderItem(item: Omit<OrderItem, 'order_item_id' | 'created_at'>): OrderItem {
    const newItem: OrderItem = {
      ...item,
      order_item_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.orderItems.push(newItem);
    this.notify();
    return newItem;
  }

  public updateOrderStatus(orderId: string, status: OrderStatus, reason?: string): Order | undefined {
    const index = this.orders.findIndex(o => o.order_id === orderId);
    if (index === -1) return undefined;
    const now = new Date().toISOString();
    const prev = this.orders[index];
    this.orders[index] = {
      ...prev,
      status,
      updated_at: now,
      cancellation_reason: reason || prev.cancellation_reason,
    };

    if (status === 'PAID') {
      this.publishEvent({
        eventType: 'OrderPaidEvent',
        aggregateId: orderId,
        payload: { order_id: orderId, status: 'PAID', updated_at: now },
      });
    } else if (status === 'CANCELLED') {
      this.publishEvent({
        eventType: 'OrderCancelled',
        aggregateId: orderId,
        payload: { order_id: orderId, reason: reason || 'Unknown' },
      });
    }

    this.notify();
    return this.orders[index];
  }

  public createPaymentTransaction(tx: Omit<PaymentTransaction, 'transaction_id' | 'created_at'>): PaymentTransaction {
    const newTx: PaymentTransaction = {
      ...tx,
      transaction_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.paymentTransactions.unshift(newTx);
    if (tx.status === 'SUCCESS') {
      this.publishEvent({
        eventType: 'PaymentSucceeded',
        aggregateId: newTx.transaction_id,
        payload: { transaction_id: newTx.transaction_id, order_id: newTx.order_id, amount: newTx.amount, provider_tx_id: newTx.provider_transaction_id },
      });
    } else if (tx.status === 'FAILED') {
      this.publishEvent({
        eventType: 'PaymentFailed',
        aggregateId: newTx.transaction_id,
        payload: { transaction_id: newTx.transaction_id, order_id: newTx.order_id, amount: newTx.amount },
      });
    }
    this.notify();
    return newTx;
  }

  public updatePaymentTransactionStatus(txId: string, status: PaymentStatus, payload?: Record<string, any>) {
    const index = this.paymentTransactions.findIndex(t => t.transaction_id === txId || t.provider_transaction_id === txId);
    if (index !== -1) {
      this.paymentTransactions[index] = {
        ...this.paymentTransactions[index],
        status,
        payload: payload || this.paymentTransactions[index].payload,
      };
      this.notify();
    }
  }

  public updateProductStockDirectly(productId: string, stockQty: number, reservedQty: number) {
    const index = this.products.findIndex(p => p.product_id === productId);
    if (index !== -1) {
      this.products[index] = {
        ...this.products[index],
        stock_quantity: Math.max(0, stockQty),
        reserved_quantity: Math.max(0, reservedQty),
      };
      this.notify();
    }
  }
}

export const db = new InMemoryDatabase();
