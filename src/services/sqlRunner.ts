import { db } from './dbStore';

export interface SqlQueryResult {
  query: string;
  success: boolean;
  rowsAffected: number;
  data?: any[];
  executionTimeMs: number;
  error?: string;
  queryPlan?: string;
}

export const DDL_SCHEMA_SQL = `-- Customers Table
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_customers_email ON customers(email);

-- Orders Table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED')),
    total_amount NUMERIC(12, 2) NOT NULL,
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Order Items Table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0), -- Captured price at order time
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (order_id, product_id)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Payment Status Enum & Transactions Table
CREATE TYPE payment_status AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED');

CREATE TABLE payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    provider_transaction_id VARCHAR(128) UNIQUE, -- E.g., Stripe/PayPal reference ID
    amount NUMERIC(12, 2) NOT NULL,
    status payment_status NOT NULL,
    payload JSONB,                               -- Raw gateway response for audit/reconciliation
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_payments_order_id ON payment_transactions(order_id);
CREATE INDEX idx_payments_provider_tx ON payment_transactions(provider_transaction_id);

-- Products Table with Stock & Reservation
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    stock_quantity INT NOT NULL CHECK (stock_quantity >= 0),
    reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0)
);

CREATE INDEX idx_products_sku ON products(sku);`;

export const PRESET_QUERIES = [
  {
    name: '1. Atomic Stock Reservation',
    description: 'Atomically decrements stock and increments reserved only if stock >= :qty. Returns 0 rows if insufficient!',
    sql: `-- Atomic stock reservation (returns number of updated rows; 0 means insufficient stock)
UPDATE products
SET 
    stock_quantity = stock_quantity - :qty,
    reserved_quantity = reserved_quantity + :qty
WHERE product_id = :product_id 
  AND stock_quantity >= :qty;`,
    defaultParams: {
      qty: 1,
      product_id: 'p100-0000-0000-0000-000000000001',
    },
  },
  {
    name: '2. Commit Reserved Inventory',
    description: 'Called after successful payment webhook to finalize deduction of reserved inventory.',
    sql: `-- Commit reserved inventory
UPDATE products
SET reserved_quantity = reserved_quantity - :qty
WHERE product_id = :product_id;`,
    defaultParams: {
      qty: 1,
      product_id: 'p100-0000-0000-0000-000000000001',
    },
  },
  {
    name: '3. Roll Back Reservation',
    description: 'Triggered upon payment failure or cart abandonment to release reserved stock back into available stock.',
    sql: `-- Roll back reservation
UPDATE products
SET 
    stock_quantity = stock_quantity + :qty,
    reserved_quantity = reserved_quantity - :qty
WHERE product_id = :product_id;`,
    defaultParams: {
      qty: 1,
      product_id: 'p100-0000-0000-0000-000000000001',
    },
  },
  {
    name: '4. Inspect Inventory Status',
    description: 'Select all products showing available stock and currently reserved quantities.',
    sql: `SELECT product_id, sku, title, price, stock_quantity, reserved_quantity, (stock_quantity + reserved_quantity) as total_physical_stock FROM products;`,
    defaultParams: {},
  },
  {
    name: '5. Audit Orders & Transactions Join',
    description: 'Relational join between orders, customers, and payment gateway transactions.',
    sql: `SELECT 
    o.order_id,
    c.first_name || ' ' || c.last_name AS customer_name,
    o.status AS order_status,
    o.total_amount,
    pt.provider_transaction_id,
    pt.status AS payment_status,
    o.created_at
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN payment_transactions pt ON o.order_id = pt.order_id
ORDER BY o.created_at DESC;`,
    defaultParams: {},
  },
];

export function executeSql(sql: string, params: Record<string, any> = {}): SqlQueryResult {
  const startTime = performance.now();
  const trimmed = sql.trim();

  try {
    // 1. Handle Atomic Reservation query
    if (trimmed.includes('stock_quantity = stock_quantity - :qty') && trimmed.includes('stock_quantity >= :qty')) {
      const productId = params.product_id;
      const qty = Number(params.qty) || 1;
      const result = db.atomicReserveStock(productId, qty);
      const executionTime = performance.now() - startTime;
      return {
        query: sql,
        success: result.success,
        rowsAffected: result.rowsAffected,
        data: result.updatedProduct ? [result.updatedProduct] : [],
        executionTimeMs: Math.round(executionTime * 100) / 100,
        error: result.error,
        queryPlan: `Bitmap Index Scan on idx_products_pkey -> Filter: (stock_quantity >= ${qty}) -> Update tuple [Rows Affected: ${result.rowsAffected}]`,
      };
    }

    // 2. Handle Commit Reservation
    if (trimmed.includes('UPDATE products') && trimmed.includes('reserved_quantity = reserved_quantity - :qty') && !trimmed.includes('stock_quantity + :qty')) {
      const productId = params.product_id;
      const qty = Number(params.qty) || 1;
      const result = db.commitReservedInventory(productId, qty);
      const executionTime = performance.now() - startTime;
      return {
        query: sql,
        success: result.success,
        rowsAffected: result.rowsAffected,
        data: result.updatedProduct ? [result.updatedProduct] : [],
        executionTimeMs: Math.round(executionTime * 100) / 100,
        queryPlan: `Index Scan using idx_products_pkey on products -> Update tuple [Rows Affected: ${result.rowsAffected}]`,
      };
    }

    // 3. Handle Rollback Reservation
    if (trimmed.includes('stock_quantity = stock_quantity + :qty') && trimmed.includes('reserved_quantity = reserved_quantity - :qty')) {
      const productId = params.product_id;
      const qty = Number(params.qty) || 1;
      const result = db.rollbackReservation(productId, qty);
      const executionTime = performance.now() - startTime;
      return {
        query: sql,
        success: result.success,
        rowsAffected: result.rowsAffected,
        data: result.updatedProduct ? [result.updatedProduct] : [],
        executionTimeMs: Math.round(executionTime * 100) / 100,
        queryPlan: `Index Scan using idx_products_pkey on products -> Update tuple [Rows Affected: ${result.rowsAffected}]`,
      };
    }

    // 4. Select Products
    if (/SELECT.*FROM\s+products/i.test(trimmed)) {
      const products = db.getProducts().map(p => ({
        ...p,
        total_physical_stock: p.stock_quantity + p.reserved_quantity,
      }));
      return {
        query: sql,
        success: true,
        rowsAffected: products.length,
        data: products,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: `Seq Scan on products (cost=0.00..1.04 rows=${products.length} width=142)`,
      };
    }

    // 5. Select Customers
    if (/SELECT.*FROM\s+customers/i.test(trimmed)) {
      const customers = db.getCustomers();
      return {
        query: sql,
        success: true,
        rowsAffected: customers.length,
        data: customers,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: `Seq Scan on customers (cost=0.00..1.04 rows=${customers.length} width=110)`,
      };
    }

    // 6. Select Orders & Transactions Join
    if (trimmed.includes('orders') && trimmed.includes('customers')) {
      const orders = db.getOrders();
      const customers = db.getCustomers();
      const txs = db.getPaymentTransactions();

      const joined = orders.map(o => {
        const cust = customers.find(c => c.customer_id === o.customer_id);
        const tx = txs.find(t => t.order_id === o.order_id);
        return {
          order_id: o.order_id,
          customer_name: cust ? `${cust.first_name} ${cust.last_name}` : 'Unknown',
          customer_email: cust?.email || '',
          order_status: o.status,
          total_amount: `$${o.total_amount.toFixed(2)}`,
          provider_transaction_id: tx?.provider_transaction_id || 'none',
          payment_status: tx?.status || 'PENDING',
          created_at: o.created_at,
        };
      });

      return {
        query: sql,
        success: true,
        rowsAffected: joined.length,
        data: joined,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: `Hash Left Join (orders -> customers on customer_id -> payment_transactions on order_id)`,
      };
    }

    // Fallback for general selects
    if (trimmed.startsWith('--') || trimmed.toUpperCase().startsWith('CREATE')) {
      return {
        query: sql,
        success: true,
        rowsAffected: 0,
        data: [],
        executionTimeMs: 1.2,
        queryPlan: 'DDL DDL_SCHEMA compiled successfully into relation catalog.',
      };
    }

    return {
      query: sql,
      success: true,
      rowsAffected: 1,
      data: [{ message: 'Query parsed and executed successfully in virtual database.' }],
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      queryPlan: 'Direct in-memory index evaluation',
    };
  } catch (err: any) {
    return {
      query: sql,
      success: false,
      rowsAffected: 0,
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      error: err.message || 'SQL Execution error',
    };
  }
}
