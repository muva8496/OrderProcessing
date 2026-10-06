import React from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Zap, 
  Workflow, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Lock,
  ArrowRight,
  Cpu
} from 'lucide-react';

export const ArchitectureDocs: React.FC = () => {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono">
          <FileText className="w-3.5 h-3.5" /> Experiment Whitepaper &amp; System Architecture
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
          Distributed Order Lifecycle &amp; Atomic Inventory Reservation Experiment
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
          This experiment models and benchmarks a high-throughput, fault-tolerant e-commerce order processing system. It addresses two classic distributed systems challenges: <strong>preventing inventory overselling under high concurrency</strong> without distributed locks, and <strong>orchestrating asynchronous third-party payments</strong> with guaranteed eventual consistency.
        </p>
      </div>

      {/* Section 1: The Core Problem */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2>1. The Problem: Concurrency Hazards &amp; Long-Running Locks</h2>
        </div>
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
          In high-volume e-commerce (such as flash sales or limited sneaker drops), multiple customers attempt to purchase the exact same item within the same millisecond. Traditional architectures often fail due to two opposing design extremes:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
            <h3 className="font-bold text-sm text-rose-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Failure Mode A: The Naive Race Condition
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Applications perform a <code className="text-rose-300">SELECT stock</code>, check <code className="text-rose-300">stock &gt; 0</code> in application memory, and then issue an <code className="text-rose-300">UPDATE</code>. If two workers read <code className="text-rose-300">stock = 1</code> concurrently, both proceed to update, reducing inventory to <code className="text-rose-300">-1</code>. This results in severe overselling and customer disputes.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Failure Mode B: Two-Phase Commit (2PC) Bottleneck
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Attempting to hold a database row lock (<code className="text-amber-300">SELECT ... FOR UPDATE</code>) across an external HTTP call to a Payment Gateway (Stripe/PayPal) holds the database connection open for hundreds of milliseconds. Under heavy load, the database connection pool is quickly exhausted, bringing down the entire cluster.
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: The Solution Architecture */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-lg">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h2>2. The Architecture: Saga Pattern + Atomic Conditional SQL</h2>
        </div>
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
          The experiment implements an orchestrator-based <strong>Saga Pattern</strong> decoupled through a dual-pool inventory schema (<code className="text-amber-300">stock_quantity</code> and <code className="text-amber-300">reserved_quantity</code>) and atomic row-level SQL operations.
        </p>

        {/* Phase Breakdown */}
        <div className="space-y-4">
          {/* Phase 1 */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <span className="font-mono text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">Phase 1</span>
                Atomic Stock Reservation (Pre-Payment Fast-Fail)
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Latency: &lt; 2ms</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Before contacting the payment gateway, the OrderService asks InventoryService to atomically shift stock from available into reserved.
            </p>
            <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs text-emerald-300 overflow-x-auto">
              UPDATE products<br />
              SET stock_quantity = stock_quantity - :qty,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;reserved_quantity = reserved_quantity + :qty<br />
              WHERE product_id = :product_id<br />
              &nbsp;&nbsp;<strong>AND stock_quantity &gt;= :qty;</strong>
            </div>
            <p className="text-xs text-zinc-400">
              <strong>Key Benefit:</strong> The <code className="text-amber-300">WHERE stock_quantity &gt;= :qty</code> condition evaluates directly at the storage engine level. If stock is insufficient, PostgreSQL updates <strong>0 rows</strong>. The application receives <code className="text-zinc-200">rows_affected === 0</code> and immediately returns <code className="text-rose-400">HTTP 409 Conflict</code>. No lock is held, and no payment is attempted.
            </p>
          </div>

          {/* Phase 2 */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <span className="font-mono text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">Phase 2</span>
                PCI-DSS Compliant Payment Flow
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Stripe / Adyen Protocol</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              OrderService prepares a <code className="text-sky-300">PaymentIntent</code> with the gateway and stores a transaction record with status <code className="text-sky-300">INITIATED</code>. It sends the <code className="text-sky-300">client_secret</code> back to the client. The browser communicates directly with the Payment Gateway to authorize the card, ensuring sensitive PAN/CVV data never touches your servers.
            </p>
          </div>

          {/* Phase 3 */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <span className="font-mono text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">Phase 3</span>
                Asynchronous Webhook &amp; Stock Commitment (Happy Path)
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Eventual Consistency</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Upon successful payment, the gateway triggers a signed webhook (<code className="text-emerald-300">payment_intent.succeeded</code>). The OrderService updates order status to <code className="text-emerald-300">PAID</code>, emits <code className="text-emerald-300">OrderPaidEvent</code> onto the event broker, and finalizes inventory:
            </p>
            <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs text-emerald-300 overflow-x-auto">
              UPDATE products<br />
              SET reserved_quantity = reserved_quantity - :qty<br />
              WHERE product_id = :product_id;
            </div>
          </div>

          {/* Phase 4 */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <span className="font-mono text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">Phase 4</span>
                Compensating Transaction on Failure (Rollback)
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Fault Recovery</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              If the card is declined, the customer abandons the checkout, or the session TTL expires, the saga triggers a compensating action:
            </p>
            <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs text-rose-300 overflow-x-auto">
              UPDATE products<br />
              SET stock_quantity = stock_quantity + :qty,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;reserved_quantity = reserved_quantity - :qty<br />
              WHERE product_id = :product_id;
            </div>
            <p className="text-xs text-zinc-400">
              The order transitions to <code className="text-rose-400">CANCELLED</code>, and reserved stock is immediately returned to the public pool for other shoppers.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Summary of Guarantees */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2.5 text-zinc-100 font-bold text-lg">
          <Cpu className="w-5 h-5 text-amber-400" />
          <h2>3. Summary of System Guarantees</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="font-bold text-amber-400">Zero Overselling</div>
            <p className="text-zinc-400 leading-relaxed">
              Storage-level condition checks guarantee inventory integrity even under extreme concurrency and race conditions.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="font-bold text-emerald-400">Lock-Free Scalability</div>
            <p className="text-zinc-400 leading-relaxed">
              No distributed locks or long-running database transactions across external network calls.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="font-bold text-sky-400">Audit &amp; Reconciliation</div>
            <p className="text-zinc-400 leading-relaxed">
              Every payment transaction stores its raw <code className="text-sky-300">JSONB</code> payload, enabling financial reconciliation and audit tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
