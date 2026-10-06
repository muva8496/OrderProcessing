import { SequenceStepLog, Customer, Product, Address } from '../types';
import { db } from './dbStore';

export type SimulationScenario = 'happy_path' | 'payment_declined' | 'insufficient_stock' | 'webhook_delayed';

export interface SequenceContext {
  scenario: SimulationScenario;
  customer: Customer;
  items: { product: Product; quantity: number }[];
  address: Address;
  createdOrderId?: string;
  paymentIntentId?: string;
  clientSecret?: string;
  totalAmount: number;
}

export function buildSequenceSteps(context: SequenceContext): SequenceStepLog[] {
  const { scenario, customer, items, address, totalAmount } = context;
  const targetProduct = items[0]?.product;
  const qty = items[0]?.quantity || 1;
  const orderId = context.createdOrderId || 'ord-new-sim-001';
  const txId = context.paymentIntentId || 'pi_sim_' + Math.random().toString(36).substring(2, 9);
  const clientSecret = context.clientSecret || `${txId}_secret_${Math.random().toString(36).substring(2, 8)}`;

  const steps: SequenceStepLog[] = [
    // Step 0: POST /orders
    {
      id: 'step-0',
      stepIndex: 0,
      timestamp: new Date().toLocaleTimeString(),
      from: 'Client',
      to: 'OrderService',
      action: 'POST /orders (items, address)',
      direction: 'forward',
      status: 'pending',
      summary: 'Client submits checkout request with cart items and delivery address.',
      details: {
        protocol: 'HTTP/2 REST',
        endpoint: '/api/v1/orders',
        requestPayload: {
          customer_id: customer.customer_id,
          email: customer.email,
          items: items.map(i => ({ product_id: i.product.product_id, sku: i.product.sku, quantity: i.quantity, unit_price: i.product.price })),
          shipping_address: address,
        },
        explanation: 'The frontend client initiates the order checkout. The OrderService acts as the saga orchestrator.',
      },
    },
    // Step 1: reserveStock
    {
      id: 'step-1',
      stepIndex: 1,
      timestamp: new Date().toLocaleTimeString(),
      from: 'OrderService',
      to: 'InventoryService',
      action: 'reserveStock(items) >',
      direction: 'forward',
      status: 'pending',
      summary: 'OrderService requests atomic stock reservation to prevent overselling.',
      details: {
        protocol: 'gRPC / Internal RPC',
        endpoint: 'inventory.v1.InventoryService/ReserveStock',
        requestPayload: {
          items: items.map(i => ({ product_id: i.product.product_id, quantity: i.quantity })),
          ttl_seconds: 900,
        },
        sqlQuery: `-- Atomic stock reservation (returns number of updated rows; 0 means insufficient stock)
UPDATE products
SET 
    stock_quantity = stock_quantity - :qty,
    reserved_quantity = reserved_quantity + :qty
WHERE product_id = :product_id 
  AND stock_quantity >= :qty;`,
        sqlParams: { product_id: targetProduct?.product_id, qty },
        explanation: 'Atomic conditional UPDATE prevents race conditions. If two users check out concurrently, only one succeeds without table locks.',
      },
    },
  ];

  // Scenario branch: Insufficient Stock
  if (scenario === 'insufficient_stock') {
    steps.push({
      id: 'step-2-fail',
      stepIndex: 2,
      timestamp: new Date().toLocaleTimeString(),
      from: 'InventoryService',
      to: 'OrderService',
      action: '<- stockReservationFailed (0 rows)',
      direction: 'backward',
      status: 'pending',
      summary: 'Inventory service returned 0 rows affected: stock_quantity < :qty constraint violated.',
      details: {
        protocol: 'gRPC',
        responsePayload: { error: 'INSUFFICIENT_STOCK', available: 0, requested: qty },
        rowsAffected: 0,
        explanation: 'Atomic query returned 0 rows affected because available stock was lower than requested quantity.',
      },
    });
    steps.push({
      id: 'step-3-fail',
      stepIndex: 3,
      timestamp: new Date().toLocaleTimeString(),
      from: 'OrderService',
      to: 'Client',
      action: '<- 409 Conflict: Insufficient stock',
      direction: 'backward',
      status: 'pending',
      summary: 'Order aborted gracefully without charging the customer.',
      details: {
        protocol: 'HTTP/2 REST',
        responsePayload: { status: 409, message: 'Item is out of stock. Order cancelled before payment.' },
        explanation: 'Fast-fail prevents orphan payment intents when inventory cannot be allocated.',
      },
    });
    return steps;
  }

  // Stock reserved successfully
  steps.push({
    id: 'step-2',
    stepIndex: 2,
    timestamp: new Date().toLocaleTimeString(),
    from: 'InventoryService',
    to: 'OrderService',
    action: '<- stockReserved',
    direction: 'backward',
    status: 'pending',
    summary: 'Inventory successfully reserved. stock_quantity decremented, reserved_quantity incremented.',
    details: {
      protocol: 'gRPC',
      rowsAffected: 1,
      responsePayload: {
        status: 'RESERVED',
        items: items.map(i => ({ product_id: i.product.product_id, reserved_qty: i.quantity })),
      },
      explanation: 'Stock is now temporarily locked with a 15-minute TTL while payment is pending.',
    },
  });

  // Step 3: createPaymentIntent
  steps.push({
    id: 'step-3',
    stepIndex: 3,
    timestamp: new Date().toLocaleTimeString(),
    from: 'OrderService',
    to: 'PaymentGateway',
    action: 'createPaymentIntent()',
    direction: 'forward',
    status: 'pending',
    summary: 'OrderService contacts Payment Gateway (Stripe/Adyen) to prepare payment intent.',
    details: {
      protocol: 'HTTPS REST (Outbound)',
      endpoint: 'https://api.stripe.com/v1/payment_intents',
      requestPayload: {
        amount: Math.round(totalAmount * 100),
        currency: 'usd',
        metadata: { order_id: orderId, customer_id: customer.customer_id },
        capture_method: 'automatic',
      },
      explanation: 'Server-side intent generation keeps private API secrets secure away from the client browser.',
    },
  });

  // Step 4: intentCreated
  steps.push({
    id: 'step-4',
    stepIndex: 4,
    timestamp: new Date().toLocaleTimeString(),
    from: 'PaymentGateway',
    to: 'OrderService',
    action: '<- intentCreated(client_secret, tx_id)',
    direction: 'backward',
    status: 'pending',
    summary: 'Gateway responds with transaction ID and client_secret for browser payment.',
    details: {
      protocol: 'HTTPS REST Response',
      responsePayload: {
        id: txId,
        object: 'payment_intent',
        client_secret: clientSecret,
        status: 'requires_payment_method',
      },
      sqlQuery: `INSERT INTO payment_transactions (transaction_id, order_id, provider_transaction_id, amount, status, payload)
VALUES (gen_random_uuid(), '${orderId}', '${txId}', ${totalAmount.toFixed(2)}, 'INITIATED', '{...}');`,
      explanation: 'A payment_transactions record is created with status INITIATED.',
    },
  });

  // Step 5: 201 Created
  steps.push({
    id: 'step-5',
    stepIndex: 5,
    timestamp: new Date().toLocaleTimeString(),
    from: 'OrderService',
    to: 'Client',
    action: '<- 201 Created (order_id, secret)',
    direction: 'backward',
    status: 'pending',
    summary: 'Order created in PENDING state. Client receives client_secret to complete card confirmation.',
    details: {
      protocol: 'HTTP/2 201 Created',
      responsePayload: {
        order_id: orderId,
        status: 'PENDING',
        client_secret: clientSecret,
        total_amount: totalAmount,
      },
      sqlQuery: `INSERT INTO orders (order_id, customer_id, status, total_amount, shipping_address)
VALUES ('${orderId}', '${customer.customer_id}', 'PENDING', ${totalAmount.toFixed(2)}, '{...}');`,
      explanation: 'Order is created in database as PENDING. Total amount captured.',
    },
  });

  // Step 6: confirmPayment
  steps.push({
    id: 'step-6',
    stepIndex: 6,
    timestamp: new Date().toLocaleTimeString(),
    from: 'Client',
    to: 'PaymentGateway',
    action: 'confirmPayment (direct from client)',
    direction: 'forward',
    status: 'pending',
    summary: 'Client SDK communicates directly with Gateway to tokenize card & execute 3D-Secure.',
    details: {
      protocol: 'Browser SDK (Stripe.js)',
      endpoint: 'https://api.stripe.com/v1/payment_intents/confirm',
      requestPayload: {
        client_secret: clientSecret,
        payment_method: scenario === 'payment_declined' ? 'pm_card_chargeCustomerFail' : 'pm_card_visa',
      },
      explanation: 'PCI-DSS Compliance: Payment card numbers never touch your application servers.',
    },
  });

  // Scenario branch: Payment Declined
  if (scenario === 'payment_declined') {
    steps.push({
      id: 'step-7-declined',
      stepIndex: 7,
      timestamp: new Date().toLocaleTimeString(),
      from: 'PaymentGateway',
      to: 'OrderService',
      action: '<- Webhook: payment_failed(tx_id)',
      direction: 'forward',
      status: 'pending',
      summary: 'Asynchronous webhook arrives with payment failure reason (e.g., Insufficient Funds).',
      details: {
        protocol: 'HTTP POST Webhook (Signed HMAC-SHA256)',
        endpoint: '/api/v1/webhooks/stripe',
        requestPayload: {
          type: 'payment_intent.payment_failed',
          data: { object: { id: txId, last_payment_error: { code: 'card_declined', message: 'Your card has insufficient funds.' } } },
        },
        sqlQuery: `UPDATE payment_transactions SET status = 'FAILED' WHERE provider_transaction_id = '${txId}';`,
        explanation: 'Webhooks guarantee payment resolution even if customer closes browser prematurely.',
      },
    });
    steps.push({
      id: 'step-8-declined',
      stepIndex: 8,
      timestamp: new Date().toLocaleTimeString(),
      from: 'OrderService',
      to: 'Internal',
      action: 'updateOrderStatus(CANCELLED)',
      direction: 'internal',
      status: 'pending',
      summary: 'Order state transitions from PENDING to CANCELLED.',
      details: {
        sqlQuery: `UPDATE orders SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE order_id = '${orderId}';`,
        explanation: 'Failing order frees the cart and records cancellation for metrics.',
      },
    });
    steps.push({
      id: 'step-9-declined',
      stepIndex: 9,
      timestamp: new Date().toLocaleTimeString(),
      from: 'OrderService',
      to: 'InventoryService',
      action: 'rollbackStock(items) ->',
      direction: 'forward',
      status: 'pending',
      summary: 'OrderService issues compensating transaction to release reserved inventory back to available stock.',
      details: {
        protocol: 'gRPC Compensating Action',
        sqlQuery: `-- Roll back reservation
UPDATE products
SET 
    stock_quantity = stock_quantity + :qty,
    reserved_quantity = reserved_quantity - :qty
WHERE product_id = :product_id;`,
        sqlParams: { product_id: targetProduct?.product_id, qty },
        explanation: 'Compensating transaction ensures inventory consistency across distributed services.',
      },
    });
    steps.push({
      id: 'step-10-declined',
      stepIndex: 10,
      timestamp: new Date().toLocaleTimeString(),
      from: 'InventoryService',
      to: 'OrderService',
      action: '<- stockRolledBack',
      direction: 'backward',
      status: 'pending',
      summary: 'Stock restored into available pool for other shoppers.',
      details: {
        protocol: 'gRPC Response',
        responsePayload: { status: 'ROLLED_BACK', product_id: targetProduct?.product_id },
        rowsAffected: 1,
        explanation: 'Physical inventory is untouched; reservation is cleanly cleared.',
      },
    });
    return steps;
  }

  // Happy Path: payment_succeeded
  steps.push({
    id: 'step-7',
    stepIndex: 7,
    timestamp: new Date().toLocaleTimeString(),
    from: 'PaymentGateway',
    to: 'OrderService',
    action: '<- Webhook: payment_succeeded(tx_id)',
    direction: 'forward',
    status: 'pending',
    summary: 'Gateway sends cryptographically signed webhook confirming successful charge.',
    details: {
      protocol: 'HTTP POST Webhook (Stripe-Signature)',
      endpoint: '/api/v1/webhooks/stripe',
      requestPayload: {
        id: `evt_hook_${Math.random().toString(36).substring(2, 8)}`,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: txId,
            amount: Math.round(totalAmount * 100),
            currency: 'usd',
            status: 'succeeded',
          },
        },
      },
      sqlQuery: `UPDATE payment_transactions 
SET status = 'SUCCESS', payload = '{"status": "succeeded"}'::jsonb 
WHERE provider_transaction_id = '${txId}';`,
      explanation: 'OrderService validates HMAC signature and marks payment transaction SUCCESS.',
    },
  });

  // Step 8: updateOrderStatus(PAID)
  steps.push({
    id: 'step-8',
    stepIndex: 8,
    timestamp: new Date().toLocaleTimeString(),
    from: 'OrderService',
    to: 'Internal',
    action: 'updateOrderStatus(PAID)',
    direction: 'internal',
    status: 'pending',
    summary: 'Order state transitions from PENDING -> PAID.',
    details: {
      sqlQuery: `UPDATE orders SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE order_id = '${orderId}';`,
      explanation: 'Order is locked in as PAID. Ready for fulfillment queue.',
    },
  });

  // Step 9: publish(OrderPaidEvent)
  steps.push({
    id: 'step-9',
    stepIndex: 9,
    timestamp: new Date().toLocaleTimeString(),
    from: 'OrderService',
    to: 'Internal',
    action: 'publish(OrderPaidEvent)',
    direction: 'internal',
    status: 'pending',
    summary: 'OrderPaidEvent is published to Kafka / Cloud PubSub topic for downstream subscribers.',
    details: {
      protocol: 'Cloud PubSub / Kafka Broker',
      endpoint: 'topic: orders.v1.paid',
      requestPayload: {
        eventType: 'OrderPaidEvent',
        orderId,
        customerId: customer.customer_id,
        amount: totalAmount,
        timestamp: new Date().toISOString(),
      },
      explanation: 'Decoupled event notifies warehouse dispatch, email notifications, and accounting services.',
    },
  });

  // Step 10: commitStock
  steps.push({
    id: 'step-10',
    stepIndex: 10,
    timestamp: new Date().toLocaleTimeString(),
    from: 'OrderService',
    to: 'InventoryService',
    action: 'commitStock(items) ->',
    direction: 'forward',
    status: 'pending',
    summary: 'Finalize inventory deduction by decrementing reserved_quantity.',
    details: {
      protocol: 'gRPC / Internal RPC',
      endpoint: 'inventory.v1.InventoryService/CommitStock',
      sqlQuery: `-- Commit reserved inventory
UPDATE products
SET reserved_quantity = reserved_quantity - :qty
WHERE product_id = :product_id;`,
      sqlParams: { product_id: targetProduct?.product_id, qty },
      explanation: 'Reserved stock was already removed from available stock in Step 2; commit clears the reservation flag.',
    },
  });

  // Step 11: stockCommitted
  steps.push({
    id: 'step-11',
    stepIndex: 11,
    timestamp: new Date().toLocaleTimeString(),
    from: 'InventoryService',
    to: 'OrderService',
    action: '<- stockCommitted',
    direction: 'backward',
    status: 'pending',
    summary: 'InventoryService acknowledges commitment. Order cycle complete!',
    details: {
      protocol: 'gRPC Response',
      rowsAffected: 1,
      responsePayload: {
        status: 'COMMITTED',
        committed_at: new Date().toISOString(),
      },
      explanation: 'Inventory lifecycle cleanly closed. Physical item is packed for shipment.',
    },
  });

  return steps;
}

/**
 * Execute real side-effects in dbStore when a step is processed
 */
export function executeStepSideEffect(step: SequenceStepLog, context: SequenceContext) {
  const targetProduct = context.items[0]?.product;
  const qty = context.items[0]?.quantity || 1;

  if (step.id === 'step-1' || step.id === 'step-2') {
    // reserve stock
    if (context.scenario !== 'insufficient_stock' && targetProduct) {
      db.atomicReserveStock(targetProduct.product_id, qty);
    }
  } else if (step.id === 'step-4') {
    // payment intent created
    if (context.createdOrderId && context.paymentIntentId) {
      db.createPaymentTransaction({
        order_id: context.createdOrderId,
        provider_transaction_id: context.paymentIntentId,
        amount: context.totalAmount,
        status: 'INITIATED',
        payload: { id: context.paymentIntentId, client_secret: context.clientSecret, status: 'requires_payment_method' },
      });
    }
  } else if (step.id === 'step-5') {
    // order created
    if (context.createdOrderId) {
      db.createOrder({
        customer_id: context.customer.customer_id,
        status: 'PENDING',
        total_amount: context.totalAmount,
        shipping_address: context.address,
        provider_tx_id: context.paymentIntentId,
      });
      if (targetProduct) {
        db.addOrderItem({
          order_id: context.createdOrderId,
          product_id: targetProduct.product_id,
          quantity: qty,
          unit_price: targetProduct.price,
        });
      }
    }
  } else if (step.id === 'step-7' || step.id === 'step-8') {
    // payment succeeded
    if (context.createdOrderId && context.paymentIntentId) {
      db.updatePaymentTransactionStatus(context.paymentIntentId, 'SUCCESS', { status: 'succeeded' });
      db.updateOrderStatus(context.createdOrderId, 'PAID');
    }
  } else if (step.id === 'step-7-declined' || step.id === 'step-8-declined') {
    if (context.createdOrderId && context.paymentIntentId) {
      db.updatePaymentTransactionStatus(context.paymentIntentId, 'FAILED', { status: 'declined', message: 'Insufficient funds' });
      db.updateOrderStatus(context.createdOrderId, 'CANCELLED', 'Payment declined by card issuer');
    }
  } else if (step.id === 'step-9-declined' || step.id === 'step-10-declined') {
    // rollback stock
    if (targetProduct) {
      db.rollbackReservation(targetProduct.product_id, qty);
    }
  } else if (step.id === 'step-10' || step.id === 'step-11') {
    // commit stock
    if (targetProduct) {
      db.commitReservedInventory(targetProduct.product_id, qty);
    }
  }
}
