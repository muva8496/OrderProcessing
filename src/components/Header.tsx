import React from 'react';
import { 
  GitFork, 
  Database, 
  Workflow, 
  Zap, 
  Boxes, 
  RotateCcw,
  ShoppingBag
} from 'lucide-react';
import { db } from '../services/dbStore';

export type ActiveTab = 'sequence' | 'concurrency' | 'domain_model' | 'sql_workbench' | 'storefront' | 'docs';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onResetDb: () => void;
  orderCount: number;
  totalReserved: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onResetDb,
  orderCount,
  totalReserved,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-zinc-100 tracking-tight">OrderPulse</span>
                <span className="text-[10px] font-mono uppercase tracking-wider bg-zinc-800 text-amber-400 border border-zinc-700/80 px-1.5 py-0.5 rounded">
                  Microservices Architecture
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Order Lifecycle · Atomic Stock Reservation · Payment Webhooks
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-zinc-950/70 p-1 rounded-xl border border-zinc-800/80 text-xs font-medium">
            <button
              onClick={() => onTabChange('sequence')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'sequence'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Sequence Trace</span>
            </button>

            <button
              onClick={() => onTabChange('concurrency')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'concurrency'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Concurrency Lab</span>
            </button>

            <button
              onClick={() => onTabChange('domain_model')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'domain_model'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>UML Domain Model</span>
            </button>

            <button
              onClick={() => onTabChange('sql_workbench')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'sql_workbench'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQL Workbench</span>
            </button>

            <button
              onClick={() => onTabChange('storefront')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'storefront'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </button>

            <button
              onClick={() => onTabChange('docs')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'docs'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span>Architecture Docs</span>
            </button>
          </nav>

          {/* Live System Stats & Reset */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-3 text-xs text-zinc-400 border-r border-zinc-800 pr-3">
              <div>
                <span className="text-zinc-500">Orders: </span>
                <span className="font-mono text-zinc-200 font-semibold">{orderCount}</span>
              </div>
              <div>
                <span className="text-zinc-500">Reserved Units: </span>
                <span className={`font-mono font-semibold ${totalReserved > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {totalReserved}
                </span>
              </div>
            </div>

            <button
              onClick={onResetDb}
              title="Reset in-memory database to seed state"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white text-xs border border-zinc-700 transition"
            >
              <RotateCcw className="w-3 h-3 text-zinc-400" />
              <span>Reset State</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
