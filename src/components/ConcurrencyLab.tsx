import React, { useState } from 'react';
import { 
  Zap, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Database, 
  ShieldCheck, 
  Play, 
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Product, Customer } from '../types';
import { db } from '../services/dbStore';

interface ConcurrencyLabProps {
  products: Product[];
  customers: Customer[];
}

interface WorkerResult {
  id: string;
  customerName: string;
  timestamp: string;
  approach: 'naive' | 'atomic';
  status: 'won' | 'lost' | 'oversold';
  rowsAffected: number;
  initialReadStock?: number;
  message: string;
  durationMs: number;
}

export const ConcurrencyLab: React.FC<ConcurrencyLabProps> = ({ products, customers }) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products.find(p => p.sku === 'LIMITED-GPU-TITAN')?.product_id || products[0]?.product_id || ''
  );
  const [customStock, setCustomStock] = useState<number>(1); // 1 item left in flash sale!
  const [simulationMode, setSimulationMode] = useState<'atomic' | 'naive'>('atomic');
  const [workerCount, setWorkerCount] = useState<number>(2); // 2 or 5 concurrent shoppers
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<WorkerResult[]>([]);
  const [stockHistory, setStockHistory] = useState<{ time: string; stock: number; reserved: number }[]>([]);

  const targetProduct = products.find(p => p.product_id === selectedProductId) || products[0];

  const handleSetStock = (stock: number) => {
    setCustomStock(stock);
    db.updateProductStockDirectly(targetProduct.product_id, stock, 0);
  };

  const runRaceSimulation = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setResults([]);

    // Reset stock to the test baseline
    db.updateProductStockDirectly(targetProduct.product_id, customStock, 0);
    const baselineStock = customStock;

    // Simulate concurrent workers
    const activeCustomers = customers.slice(0, workerCount);
    const workerPromises = activeCustomers.map(async (cust, idx) => {
      // Add slight jitter (0 - 15ms) to simulate real concurrent network requests
      const jitter = Math.random() * 15;
      await new Promise(r => setTimeout(r, jitter));
      const startTime = performance.now();

      if (simulationMode === 'atomic') {
        // Run atomic SQL query
        const res = db.atomicReserveStock(targetProduct.product_id, 1);
        const duration = performance.now() - startTime;

        if (res.success && res.rowsAffected === 1) {
          return {
            id: `req-${idx + 1}`,
            customerName: `${cust.first_name} ${cust.last_name}`,
            timestamp: new Date().toLocaleTimeString(),
            approach: 'atomic' as const,
            status: 'won' as const,
            rowsAffected: 1,
            durationMs: Math.round(duration * 10) / 10,
            message: 'Stock allocated! Atomic condition (stock_quantity >= 1) satisfied. Rows affected = 1.',
          };
        } else {
          return {
            id: `req-${idx + 1}`,
            customerName: `${cust.first_name} ${cust.last_name}`,
            timestamp: new Date().toLocaleTimeString(),
            approach: 'atomic' as const,
            status: 'lost' as const,
            rowsAffected: 0,
            durationMs: Math.round(duration * 10) / 10,
            message: 'Gracefully rejected: 0 rows affected. stock_quantity was 0, zero overselling occurred.',
          };
        }
      } else {
        // NAIVE READ-MODIFY-WRITE (Simulate anti-pattern race bug)
        // Step 1: Read stock
        const currentInDb = db.getProducts().find(p => p.product_id === targetProduct.product_id);
        const readStock = currentInDb ? currentInDb.stock_quantity : 0;
        
        // Simulating context switch / processing delay before write
        await new Promise(r => setTimeout(r, 20));

        // Naive logic checks read stock
        if (readStock >= 1) {
          // Write without atomic WHERE check!
          const newStock = readStock - 1;
          db.updateProductStockDirectly(targetProduct.product_id, newStock, 1);
          const duration = performance.now() - startTime;
          return {
            id: `req-${idx + 1}`,
            customerName: `${cust.first_name} ${cust.last_name}`,
            timestamp: new Date().toLocaleTimeString(),
            approach: 'naive' as const,
            status: newStock < 0 ? ('oversold' as const) : ('won' as const),
            rowsAffected: 1,
            initialReadStock: readStock,
            durationMs: Math.round(duration * 10) / 10,
            message: newStock < 0 
              ? `FATAL BUG: Oversold! Read stock was ${readStock}, but another worker also decremented. Database stock is now negative (${newStock})!`
              : `Order placed, but vulnerable to concurrency collisions.`,
          };
        } else {
          const duration = performance.now() - startTime;
          return {
            id: `req-${idx + 1}`,
            customerName: `${cust.first_name} ${cust.last_name}`,
            timestamp: new Date().toLocaleTimeString(),
            approach: 'naive' as const,
            status: 'lost' as const,
            rowsAffected: 0,
            initialReadStock: readStock,
            durationMs: Math.round(duration * 10) / 10,
            message: 'Rejected after dirty read: stock appeared empty.',
          };
        }
      }
    });

    const simulationResults = await Promise.all(workerPromises);
    setResults(simulationResults);
    setIsRunning(false);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-base text-zinc-100">
                Concurrency Lab &amp; Atomic Stock Reservation
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-3xl">
              Demonstrating the prompt's SQL query: <code className="text-amber-300 font-mono text-[11px]">UPDATE products SET stock_quantity = stock_quantity - :qty ... WHERE stock_quantity &gt;= :qty</code>. Test how atomic row-level guarantees prevent overselling under high concurrency without explicit database locks.
            </p>
          </div>

          {/* Test Setup Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Stock Baseline</label>
              <div className="flex items-center gap-1">
                {[1, 2, 5].map(qty => (
                  <button
                    key={qty}
                    onClick={() => handleSetStock(qty)}
                    className={`px-2.5 py-1 text-xs rounded border transition font-mono ${
                      customStock === qty
                        ? 'bg-amber-500 text-zinc-950 font-bold border-amber-500'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {qty} {qty === 1 ? 'unit' : 'units'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Concurrent Shoppers</label>
              <select
                value={workerCount}
                onChange={e => setWorkerCount(Number(e.target.value))}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200"
              >
                <option value={2}>2 Shoppers (Race Condition)</option>
                <option value={4}>4 Shoppers (Flash Sale Stampede)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Mode comparison toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Atomic Mode Option */}
        <div
          onClick={() => setSimulationMode('atomic')}
          className={`p-4 rounded-xl border cursor-pointer transition select-none ${
            simulationMode === 'atomic'
              ? 'border-emerald-500/80 bg-emerald-950/20 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-sm text-zinc-100">
                Recommended: Atomic Conditional SQL
              </span>
            </div>
            {simulationMode === 'atomic' && (
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Single SQL statement checks and updates in a single atomic database engine operation.
          </p>
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-emerald-500/20 font-mono text-[11px] text-emerald-300 overflow-x-auto">
            UPDATE products<br />
            SET stock_quantity = stock_quantity - :qty,<br />
            &nbsp;&nbsp;&nbsp;&nbsp;reserved_quantity = reserved_quantity + :qty<br />
            WHERE product_id = :product_id<br />
            &nbsp;&nbsp;<strong>AND stock_quantity &gt;= :qty;</strong>
          </div>
        </div>

        {/* Naive Read-Modify-Write Option */}
        <div
          onClick={() => setSimulationMode('naive')}
          className={`p-4 rounded-xl border cursor-pointer transition select-none ${
            simulationMode === 'naive'
              ? 'border-rose-500/80 bg-rose-950/20 ring-1 ring-rose-500/30'
              : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-sm text-zinc-100">
                Anti-Pattern: Naive Read-Then-Write
              </span>
            </div>
            {simulationMode === 'naive' && (
              <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Code reads stock in step 1, checks <code className="text-rose-300">if (stock &gt;= 1)</code> in application memory, then issues UPDATE.
          </p>
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-rose-500/20 font-mono text-[11px] text-rose-300 overflow-x-auto">
            const item = await db.query('SELECT stock FROM products ...');<br />
            if (item.stock &gt;= 1) &#123;<br />
            &nbsp;&nbsp;await db.query('UPDATE products SET stock = stock - 1');<br />
            &#125; <span className="text-rose-400">// Vulnerable to dirty read!</span>
          </div>
        </div>
      </div>

      {/* Trigger Button & Live Metrics */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={runRaceSimulation}
              disabled={isRunning}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition ${
                isRunning
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>{isRunning ? 'Simulating Race...' : 'Fire Concurrent Requests'}</span>
            </button>

            <span className="text-xs text-zinc-400">
              Target: <strong className="text-zinc-200">{targetProduct.title}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-zinc-500">Live Stock: </span>
              <span className={`font-bold ${targetProduct.stock_quantity === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {targetProduct.stock_quantity}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Reserved: </span>
              <span className="font-bold text-amber-400">{targetProduct.reserved_quantity}</span>
            </div>
          </div>
        </div>

        {/* Results Stream */}
        <div className="mt-5 space-y-3">
          <div className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span>Race Execution Results</span>
            {results.length > 0 && (
              <span className="text-[11px] text-zinc-500 font-normal">
                {results.filter(r => r.status === 'won').length} Succeeded · {results.filter(r => r.status === 'lost').length} Rejected
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
              Click &quot;Fire Concurrent Requests&quot; to test the simultaneous arrival of checkout requests at the exact same millisecond.
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((res, index) => (
                <div
                  key={res.id}
                  className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    res.status === 'won'
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                      : res.status === 'oversold'
                      ? 'bg-rose-950/40 border-rose-500 text-rose-200'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold bg-zinc-800 text-zinc-200">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-200 flex items-center gap-2">
                        <span>{res.customerName}</span>
                        <span className="text-[10px] font-mono text-zinc-500">({res.durationMs}ms)</span>
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">
                        {res.message}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                      Rows Affected: <strong>{res.rowsAffected}</strong>
                    </span>

                    {res.status === 'won' ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Allocated
                      </span>
                    ) : res.status === 'oversold' ? (
                      <span className="flex items-center gap-1 text-rose-400 font-bold text-[11px]">
                        <XCircle className="w-3.5 h-3.5" /> Bug: Oversold!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-400 font-semibold text-[11px]">
                        <XCircle className="w-3.5 h-3.5" /> Out of Stock
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
