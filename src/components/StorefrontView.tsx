import React, { useState } from 'react';
import { 
  ShoppingBag, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight,
  ShieldCheck,
  Package
} from 'lucide-react';
import { Product, Customer, Address } from '../types';
import { db } from '../services/dbStore';
import confetti from 'canvas-confetti';

interface StorefrontViewProps {
  products: Product[];
  customers: Customer[];
  onOrderCompleted?: () => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  products,
  customers,
  onOrderCompleted,
}) => {
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([
    { product: products[0], quantity: 1 },
  ]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.customer_id || '');
  const [paymentOutcome, setPaymentOutcome] = useState<'success' | 'declined'>('success');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastOrderMessage, setLastOrderMessage] = useState<{ type: 'success' | 'error'; text: string; details?: string } | null>(null);

  const selectedCustomer = customers.find(c => c.customer_id === selectedCustomerId) || customers[0];

  const [address, setAddress] = useState<Address>({
    street: '500 Howard Street, Suite 400',
    city: 'San Francisco',
    postal_code: '94105',
    country_code: 'US',
  });

  const cartTotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.product_id === product.product_id);
      if (existing) {
        return prev.map(i =>
          i.product.product_id === product.product_id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.product_id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => {
          if (i.product.product_id === productId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as { product: Product; quantity: number }[]
    );
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setLastOrderMessage(null);

    try {
      // Step 1: Microservice step - Reserve Stock for all items atomically
      for (const item of cart) {
        const reserveRes = db.atomicReserveStock(item.product.product_id, item.quantity);
        if (!reserveRes.success) {
          setLastOrderMessage({
            type: 'error',
            text: `Atomic stock reservation failed for ${item.product.title}!`,
            details: `Requested ${item.quantity}, but stock_quantity >= :qty condition returned 0 rows affected. Zero overselling occurred.`,
          });
          setIsProcessing(false);
          return;
        }
      }

      // Step 2: Create Order in database
      const order = db.createOrder({
        customer_id: selectedCustomer.customer_id,
        status: 'PENDING',
        total_amount: cartTotal,
        shipping_address: address,
      });

      // Add order items
      cart.forEach(item => {
        db.addOrderItem({
          order_id: order.order_id,
          product_id: item.product.product_id,
          quantity: item.quantity,
          unit_price: item.product.price,
        });
      });

      // Step 3: Gateway Intent & Direct client confirmation simulation
      const providerTxId = 'pi_' + Math.random().toString(36).substring(2, 10);
      const paymentTx = db.createPaymentTransaction({
        order_id: order.order_id,
        provider_transaction_id: providerTxId,
        amount: cartTotal,
        status: 'INITIATED',
        payload: { provider: 'stripe', status: 'initiated' },
      });

      await new Promise(r => setTimeout(r, 600));

      if (paymentOutcome === 'declined') {
        // Payment failed -> Compensating transaction (Rollback stock!)
        db.updatePaymentTransactionStatus(paymentTx.transaction_id, 'FAILED', { error: 'Card declined (insufficient_funds)' });
        db.updateOrderStatus(order.order_id, 'CANCELLED', 'Card declined during payment confirmation');
        
        // Rollback each reserved item
        for (const item of cart) {
          db.rollbackReservation(item.product.product_id, item.quantity);
        }

        setLastOrderMessage({
          type: 'error',
          text: `Payment Declined (Card Issuer Rejected).`,
          details: `Order #${order.order_id.slice(0, 8)} transitioned to CANCELLED. Compensating transaction rolled back all ${cart.length} reserved item(s) back into available stock.`,
        });
      } else {
        // Payment succeeded -> Webhook -> Commit stock!
        db.updatePaymentTransactionStatus(paymentTx.transaction_id, 'SUCCESS', { status: 'succeeded' });
        db.updateOrderStatus(order.order_id, 'PAID');

        // Commit stock
        for (const item of cart) {
          db.commitReservedInventory(item.product.product_id, item.quantity);
        }

        setLastOrderMessage({
          type: 'success',
          text: `Order Placed Successfully! (Order ID: ${order.order_id.slice(0, 8)})`,
          details: `Payment confirmed via webhook. OrderPaidEvent published. Inventory reservation committed permanently.`,
        });

        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.7 },
        });

        setCart([]);
      }
    } finally {
      setIsProcessing(false);
      onOrderCompleted?.();
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShoppingBag className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-base text-zinc-100">
                Interactive Storefront &amp; Order Checkout
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Experience the complete order saga from a shopper&apos;s perspective. Cart additions test real inventory updates and database transactions.
            </p>
          </div>
        </div>
      </div>

      {lastOrderMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
            lastOrderMessage.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
          }`}
        >
          {lastOrderMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-bold">{lastOrderMessage.text}</div>
            <div className="text-[11px] opacity-90 mt-1 leading-relaxed">
              {lastOrderMessage.details}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Product Catalog (Left) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" /> Catalog Products
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map(p => {
              const inCart = cart.find(i => i.product.product_id === p.product_id);
              const isOutOfStock = p.stock_quantity === 0;

              return (
                <div
                  key={p.product_id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-1">
                      <span>{p.sku}</span>
                      <span className="text-zinc-500">{p.category}</span>
                    </div>

                    <h4 className="font-semibold text-sm text-zinc-100">{p.title}</h4>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{p.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-zinc-100 font-mono">
                        ${p.price.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-mono mt-0.5">
                        Stock: <span className={isOutOfStock ? 'text-rose-400 font-bold' : 'text-emerald-400'}>{p.stock_quantity}</span>
                        {p.reserved_quantity > 0 && (
                          <span className="text-amber-400 ml-1.5 font-bold">({p.reserved_quantity} held)</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => addToCart(p)}
                      disabled={isOutOfStock}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {isOutOfStock ? 'Out of Stock' : '+ Add'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Checkout Drawer (Right) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" /> Checkout &amp; Saga Runner
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              {cart.reduce((s, i) => s + i.quantity, 0)} item(s)
            </span>
          </div>

          {/* Cart items list */}
          {cart.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
              Cart is currently empty. Add products from the catalog above.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
              {cart.map(item => (
                <div
                  key={item.product.product_id}
                  className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <div className="font-medium text-zinc-200 truncate">{item.product.title}</div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      ${item.product.price.toFixed(2)} each
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center border border-zinc-800 rounded-lg bg-zinc-900">
                      <button
                        onClick={() => updateQuantity(item.product.product_id, -1)}
                        className="p-1 hover:text-white text-zinc-400"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-mono text-xs">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.product_id, 1)}
                        className="p-1 hover:text-white text-zinc-400"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product.product_id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Customer Selection */}
          <div className="space-y-1 pt-2 border-t border-zinc-800">
            <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
              Customer Account
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg p-2 text-xs text-zinc-200 font-medium"
            >
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.first_name} {c.last_name} ({c.email})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Outcome Switcher */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
              Simulate Gateway Response
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentOutcome('success')}
                className={`p-2 rounded-lg text-xs font-medium border text-center transition ${
                  paymentOutcome === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                Payment Succeeded
              </button>
              <button
                type="button"
                onClick={() => setPaymentOutcome('declined')}
                className={`p-2 rounded-lg text-xs font-medium border text-center transition ${
                  paymentOutcome === 'declined'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                Card Declined (Rollback)
              </button>
            </div>
          </div>

          {/* Total & Checkout Button */}
          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Total Order Amount</span>
              <span className="font-mono font-bold text-base text-zinc-100">
                ${cartTotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isProcessing ? 'Orchestrating Order Saga...' : 'Submit Order & Authorize'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
