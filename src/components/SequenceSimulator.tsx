import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Database, 
  ArrowRight, 
  ArrowLeft,
  ShieldCheck,
  Send,
  Zap,
  Code,
  Terminal,
  Clock
} from 'lucide-react';
import { SequenceStepLog, Customer, Product, Address } from '../types';
import { db } from '../services/dbStore';
import { buildSequenceSteps, executeStepSideEffect, SimulationScenario, SequenceContext } from '../services/sequenceEngine';
import confetti from 'canvas-confetti';

interface SequenceSimulatorProps {
  customers: Customer[];
  products: Product[];
}

export const SequenceSimulator: React.FC<SequenceSimulatorProps> = ({ customers, products }) => {
  const [scenario, setScenario] = useState<SimulationScenario>('happy_path');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.customer_id || '');
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.product_id || '');
  const [quantity, setQuantity] = useState<number>(1);

  // Stepper state
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1800); // ms per step
  const [selectedStepLog, setSelectedStepLog] = useState<SequenceStepLog | null>(null);

  const selectedCustomer = customers.find(c => c.customer_id === selectedCustomerId) || customers[0];
  const selectedProduct = products.find(p => p.product_id === selectedProductId) || products[0];

  const address: Address = {
    street: '100 Market St, Floor 14',
    city: 'San Francisco',
    postal_code: '94105',
    country_code: 'US',
  };

  const context: SequenceContext = {
    scenario,
    customer: selectedCustomer,
    items: [{ product: selectedProduct, quantity }],
    address,
    createdOrderId: 'ord-' + Math.random().toString(36).substring(2, 8),
    paymentIntentId: 'pi_' + Math.random().toString(36).substring(2, 10),
    totalAmount: (selectedProduct?.price || 100) * quantity,
  };

  const [steps, setSteps] = useState<SequenceStepLog[]>(() => buildSequenceSteps(context));

  // Rebuild steps when scenario or item selection changes
  useEffect(() => {
    resetSimulation();
  }, [scenario, selectedProductId, quantity, selectedCustomerId]);

  const resetSimulation = () => {
    setIsPlaying(false);
    setCurrentStepIndex(-1);
    const newSteps = buildSequenceSteps(context);
    setSteps(newSteps);
    setSelectedStepLog(newSteps[0]);
  };

  // Step forward
  const advanceStep = () => {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      const stepToExecute = steps[nextIndex];
      stepToExecute.status = 'success';
      
      // Execute side effect in database
      executeStepSideEffect(stepToExecute, context);

      setCurrentStepIndex(nextIndex);
      setSelectedStepLog(stepToExecute);

      // Check if finished
      if (nextIndex === steps.length - 1) {
        setIsPlaying(false);
        if (scenario === 'happy_path') {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.8 },
          });
        }
      }
    } else {
      setIsPlaying(false);
    }
  };

  // Step backward
  const stepBack = () => {
    if (currentStepIndex >= 0) {
      const prevIndex = currentStepIndex - 1;
      setCurrentStepIndex(prevIndex);
      if (prevIndex >= 0) {
        setSelectedStepLog(steps[prevIndex]);
      } else {
        setSelectedStepLog(steps[0]);
      }
    }
  };

  // Auto-play timer
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setTimeout(() => {
        advanceStep();
      }, playbackSpeed);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, steps.length, playbackSpeed]);

  const lifelines = [
    { id: 'Client', label: 'Client', role: 'Frontend App / Browser', color: 'border-sky-500/50 bg-sky-500/10 text-sky-400' },
    { id: 'OrderService', label: 'OrderService', role: 'Saga Orchestrator API', color: 'border-amber-500/50 bg-amber-500/10 text-amber-400' },
    { id: 'InventoryService', label: 'InventoryService', role: 'Stock Reservation DB', color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' },
    { id: 'PaymentGateway', label: 'PaymentGateway', role: 'Stripe / Adyen Gateway', color: 'border-purple-500/50 bg-purple-500/10 text-purple-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Configuration & Control Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scenario & Inputs */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
                Execution Scenario
              </label>
              <select
                value={scenario}
                onChange={e => setScenario(e.target.value as SimulationScenario)}
                className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-amber-500"
              >
                <option value="happy_path">🟢 Happy Path (Payment Succeeded + Commit)</option>
                <option value="payment_declined">🔴 Payment Declined (Rollback Compensating Tx)</option>
                <option value="insufficient_stock">⚠️ Insufficient Stock (Atomic Fast-Fail 0 rows)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
                Product
              </label>
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 max-w-[210px] truncate"
              >
                {products.map(p => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.title} (${p.price.toFixed(2)}) [Stock: {p.stock_quantity}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
                Quantity (:qty)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Stepper Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={currentStepIndex >= steps.length - 1 && !isPlaying}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Auto-Run'}</span>
            </button>

            <button
              onClick={advanceStep}
              disabled={currentStepIndex >= steps.length - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Step Next</span>
            </button>

            <button
              onClick={resetSimulation}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700 transition"
              title="Reset Sequence"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800 ml-1">
              Step {currentStepIndex + 1} / {steps.length}
            </div>
          </div>
        </div>

        {/* Live status banner */}
        <div className="mt-3 pt-3 border-t border-zinc-800/70 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Target: <strong className="text-zinc-200">{selectedProduct.title}</strong></span>
            <span className="text-zinc-600">|</span>
            <span>Available Stock: <strong className="text-amber-400 font-mono">{selectedProduct.stock_quantity}</strong></span>
            <span className="text-zinc-600">|</span>
            <span>Reserved: <strong className="text-emerald-400 font-mono">{selectedProduct.reserved_quantity}</strong></span>
          </div>

          <div className="text-[11px] text-zinc-500 hidden sm:block">
            Matching Diagram 1: Client · OrderService · InventoryService · PaymentGateway
          </div>
        </div>
      </div>

      {/* Main Grid: Lifeline Sequence Diagram (Left) + Step Inspector (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Sequence Diagram Lifeline Canvas */}
        <div className="xl:col-span-7 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Lifeline Column Headers */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {lifelines.map(col => (
                <div
                  key={col.id}
                  className={`border rounded-xl p-2.5 text-center transition ${col.color}`}
                >
                  <div className="font-bold text-xs tracking-tight">{col.label}</div>
                  <div className="text-[10px] opacity-80 truncate">{col.role}</div>
                </div>
              ))}
            </div>

            {/* Sequence Steps Stack */}
            <div className="space-y-3 relative">
              {/* Background vertical guideline tracks */}
              <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20">
                <div className="border-r border-dashed border-sky-400 h-full mx-auto w-0"></div>
                <div className="border-r border-dashed border-amber-400 h-full mx-auto w-0"></div>
                <div className="border-r border-dashed border-emerald-400 h-full mx-auto w-0"></div>
                <div className="border-r border-dashed border-purple-400 h-full mx-auto w-0"></div>
              </div>

              {steps.map((step, idx) => {
                const isCurrent = idx === currentStepIndex;
                const isPast = idx < currentStepIndex;
                const isSelected = selectedStepLog?.id === step.id;

                // Determine start and end columns for arrow positioning
                const colMap: Record<string, number> = {
                  Client: 0,
                  OrderService: 1,
                  InventoryService: 2,
                  PaymentGateway: 3,
                  Internal: 1,
                };

                const fromCol = colMap[step.from];
                const toCol = colMap[step.to];
                const isInternal = step.to === 'Internal' || step.from === step.to;

                return (
                  <div
                    key={step.id}
                    onClick={() => setSelectedStepLog(step)}
                    className={`relative p-2.5 rounded-xl border transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-md ring-1 ring-amber-500/30'
                        : isCurrent
                        ? 'border-zinc-500 bg-zinc-800/80'
                        : isPast
                        ? 'border-zinc-800/80 bg-zinc-950/40 opacity-90'
                        : 'border-zinc-800/40 bg-zinc-950/20 opacity-45'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isPast || isCurrent ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-zinc-200">{step.action}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        {isPast && (
                          <span className="flex items-center gap-1 text-emerald-400 font-mono">
                            <CheckCircle2 className="w-3 h-3" /> executed
                          </span>
                        )}
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-amber-400 font-mono animate-pulse">
                            <Zap className="w-3 h-3" /> active
                          </span>
                        )}
                        {!isPast && !isCurrent && (
                          <span className="text-zinc-500 font-mono">queued</span>
                        )}
                      </div>
                    </div>

                    {/* Visual directional arrow lane */}
                    <div className="h-6 relative flex items-center">
                      {!isInternal ? (
                        <div
                          className={`absolute h-0.5 rounded transition-all duration-300 ${
                            isCurrent
                              ? 'bg-amber-400 shadow-sm shadow-amber-400'
                              : isPast
                              ? 'bg-zinc-400'
                              : 'bg-zinc-700'
                          }`}
                          style={{
                            left: `${(Math.min(fromCol, toCol) / 4) * 100 + 12}%`,
                            width: `${(Math.abs(toCol - fromCol) / 4) * 100}%`,
                          }}
                        >
                          {/* Arrow head */}
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 ${
                              isCurrent ? 'border-amber-400' : isPast ? 'border-zinc-400' : 'border-zinc-700'
                            }`}
                            style={{
                              right: toCol > fromCol ? 0 : 'auto',
                              left: toCol < fromCol ? 0 : 'auto',
                              transform: toCol > fromCol ? 'translateY(-50%) rotate(45deg)' : 'translateY(-50%) rotate(-135deg)',
                            }}
                          />
                        </div>
                      ) : (
                        /* Internal processing loop */
                        <div
                          className="absolute h-5 border-2 border-amber-400/80 rounded-r-lg"
                          style={{
                            left: '37%',
                            width: '40px',
                          }}
                        />
                      )}

                      <div className="w-full flex justify-between text-[10px] text-zinc-400 px-2 font-mono">
                        <span className="text-zinc-500">{step.from}</span>
                        <span className="text-zinc-500">{step.to}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 truncate mt-1">
                      {step.summary}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Step Technical Inspector */}
        <div className="xl:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-zinc-100">Packet &amp; Query Inspector</h3>
            </div>
            {selectedStepLog && (
              <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                Step #{selectedStepLog.stepIndex + 1}
              </span>
            )}
          </div>

          {selectedStepLog ? (
            <div className="space-y-4 text-xs">
              {/* Action summary badge */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <div className="font-semibold text-zinc-200 text-sm">
                  {selectedStepLog.action}
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  {selectedStepLog.summary}
                </p>
                <div className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-900 mt-2">
                  {selectedStepLog.details.explanation}
                </div>
              </div>

              {/* Protocol / Routing metadata */}
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px]">ROUTE / PROTOCOL</div>
                  <div className="text-amber-300 font-semibold truncate mt-0.5">
                    {selectedStepLog.details.protocol || 'HTTP/2 REST'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80">
                  <div className="text-zinc-500 text-[10px]">LIFELINE FLOW</div>
                  <div className="text-zinc-300 font-semibold truncate mt-0.5">
                    {selectedStepLog.from} → {selectedStepLog.to}
                  </div>
                </div>
              </div>

              {/* SQL Query execution (if applicable) */}
              {selectedStepLog.details.sqlQuery && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <Database className="w-3.5 h-3.5" /> Executed SQL Query
                    </span>
                    {selectedStepLog.details.rowsAffected !== undefined && (
                      <span className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                        Rows Affected: <strong>{selectedStepLog.details.rowsAffected}</strong>
                      </span>
                    )}
                  </div>
                  <div className="bg-zinc-950 p-3 rounded-xl border border-emerald-500/20 font-mono text-[11px] text-emerald-300/90 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                    {selectedStepLog.details.sqlQuery}
                  </div>
                  {selectedStepLog.details.sqlParams && (
                    <div className="text-[11px] font-mono text-zinc-400 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60 flex items-center gap-2">
                      <span className="text-zinc-500">Bound Parameters:</span>
                      <code className="text-amber-300">
                        {JSON.stringify(selectedStepLog.details.sqlParams)}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Request / Response JSON Payload */}
              {(selectedStepLog.details.requestPayload || selectedStepLog.details.responsePayload) && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                    <span>
                      {selectedStepLog.details.requestPayload ? 'Request Payload' : 'Response Payload'}
                    </span>
                    <span className="text-zinc-500 text-[10px]">JSON Payload</span>
                  </div>
                  <pre className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-48 scrollbar-thin">
                    {JSON.stringify(
                      selectedStepLog.details.requestPayload || selectedStepLog.details.responsePayload,
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}

              {/* Microservices Architecture Insights */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-zinc-300 space-y-1">
                <div className="font-semibold text-amber-400 text-[11px] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> High-Throughput Guarantee
                </div>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  Notice how inventory is reserved <em>before</em> calling the payment gateway. If payment fails or times out, an asynchronous compensating transaction rolls the stock back without locks or long-running transactions.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Select a step or click "Auto-Run" to inspect message payloads and SQL statements.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
