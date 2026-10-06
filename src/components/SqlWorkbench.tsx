import React, { useState } from 'react';
import { 
  Database, 
  Play, 
  Copy, 
  Check, 
  Code, 
  Clock, 
  Terminal, 
  Sparkles,
  Table as TableIcon
} from 'lucide-react';
import { executeSql, PRESET_QUERIES, DDL_SCHEMA_SQL, SqlQueryResult } from '../services/sqlRunner';
import { Product } from '../types';

interface SqlWorkbenchProps {
  products: Product[];
}

export const SqlWorkbench: React.FC<SqlWorkbenchProps> = ({ products }) => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [sqlQuery, setSqlQuery] = useState<string>(PRESET_QUERIES[0].sql);
  const [paramQty, setParamQty] = useState<number>(1);
  const [paramProductId, setParamProductId] = useState<string>(products[0]?.product_id || '');
  const [lastResult, setLastResult] = useState<SqlQueryResult | null>(() => {
    return executeSql(PRESET_QUERIES[0].sql, {
      qty: 1,
      product_id: products[0]?.product_id || '',
    });
  });
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'editor' | 'ddl'>('editor');

  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    setSqlQuery(PRESET_QUERIES[idx].sql);
  };

  const handleRunQuery = () => {
    const res = executeSql(sqlQuery, {
      qty: paramQty,
      product_id: paramProductId,
    });
    setLastResult(res);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Database className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-base text-zinc-100">
                PostgreSQL Engine &amp; SQL Query Console
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Live execution sandbox for the prompt&apos;s DDL schemas and atomic conditional inventory updates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                viewMode === 'editor'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              Interactive Query Runner
            </button>
            <button
              onClick={() => setViewMode('ddl')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                viewMode === 'ddl'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              Complete DDL Schema
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'ddl' ? (
        /* DDL Schema View */
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-100">Complete Database DDL Schema</h3>
              <p className="text-xs text-zinc-400">
                Includes Customers, Orders, Order Items, Payment Transactions, Products, Indexes, and Constraints.
              </p>
            </div>
            <button
              onClick={() => copyToClipboard(DDL_SCHEMA_SQL)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy DDL'}</span>
            </button>
          </div>

          <pre className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-amber-200/90 overflow-x-auto leading-relaxed max-h-[550px] scrollbar-thin">
            {DDL_SCHEMA_SQL}
          </pre>
        </div>
      ) : (
        /* Interactive Query Runner View */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Query Editor & Parameters (Left) */}
          <div className="xl:col-span-6 space-y-4">
            {/* Presets Bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-2">
              <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                Load Preset Statement:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_QUERIES.map((preset, idx) => (
                  <button
                    key={preset.name}
                    onClick={() => handleSelectPreset(idx)}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-mono transition text-left ${
                      selectedPresetIndex === idx
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 pt-1">
                {PRESET_QUERIES[selectedPresetIndex].description}
              </p>
            </div>

            {/* SQL Editor Area */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="flex items-center gap-1.5 text-zinc-200">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" /> SQL Query Console
                </span>
                <span className="text-[10px] text-zinc-500">PostgreSQL 16 syntax</span>
              </div>

              <textarea
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                rows={7}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl p-3 font-mono text-xs text-amber-200 focus:outline-none focus:border-amber-500 leading-relaxed"
                spellCheck={false}
              />

              {/* Parameter bindings */}
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">:qty =</span>
                  <input
                    type="number"
                    min={1}
                    value={paramQty}
                    onChange={e => setParamQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-xs font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">:product_id =</span>
                  <select
                    value={paramProductId}
                    onChange={e => setParamProductId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-xs font-mono max-w-[200px] truncate"
                  >
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.sku} ({p.title.slice(0, 20)}...) [Stock: {p.stock_quantity}]
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleRunQuery}
                  className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute SQL</span>
                </button>
              </div>
            </div>
          </div>

          {/* Execution Results & Plan (Right) */}
          <div className="xl:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-zinc-100">Query Output &amp; Results</h3>
              </div>

              {lastResult && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                  <span>Time: <strong className="text-zinc-200">{lastResult.executionTimeMs}ms</strong></span>
                  <span>Rows Affected: <strong className={lastResult.rowsAffected > 0 ? 'text-emerald-400' : 'text-rose-400'}>{lastResult.rowsAffected}</strong></span>
                </div>
              )}
            </div>

            {lastResult?.error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono">
                Error: {lastResult.error}
              </div>
            )}

            {lastResult?.queryPlan && (
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px] block mb-0.5">EXPLAIN Execution Plan</span>
                <span className="text-amber-300/80">{lastResult.queryPlan}</span>
              </div>
            )}

            {/* Results Table */}
            {lastResult?.data && lastResult.data.length > 0 ? (
              <div className="overflow-x-auto max-h-[380px] scrollbar-thin">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950 text-zinc-400 text-[11px] border-b border-zinc-800 sticky top-0">
                    <tr>
                      {Object.keys(lastResult.data[0]).map(col => (
                        <th key={col} className="p-2 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-200 text-[11px]">
                    {lastResult.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-zinc-800/40">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="p-2 whitespace-nowrap text-zinc-300">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                {lastResult?.rowsAffected === 0
                  ? 'Query completed with 0 rows affected (Constraint condition was false).'
                  : 'Execute a SELECT or UPDATE statement to inspect results.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
