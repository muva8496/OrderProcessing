import React, { useState } from 'react';
import { 
  Activity, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle, 
  Radio, 
  Clock 
} from 'lucide-react';
import { DomainEvent } from '../types';

interface EventAuditLogProps {
  events: DomainEvent[];
}

export const EventAuditLog: React.FC<EventAuditLogProps> = ({ events }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-sm text-zinc-100">Domain Event Stream &amp; Webhook Audit Log</h3>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">
          {events.length} emitted events
        </span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
        {events.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs">
            No events emitted yet. Run a sequence step or place an order to trigger events.
          </div>
        ) : (
          events.map(evt => {
            const isExpanded = expandedId === evt.eventId;
            const isSuccess = evt.eventType.includes('Paid') || evt.eventType.includes('Committed') || evt.eventType.includes('Succeeded');
            const isFailure = evt.eventType.includes('Failed') || evt.eventType.includes('Cancelled') || evt.eventType.includes('RolledBack');

            return (
              <div
                key={evt.eventId}
                className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden text-xs transition"
              >
                <div
                  onClick={() => toggleExpand(evt.eventId)}
                  className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-900/60 select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-zinc-500">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>

                    <span
                      className={`font-mono font-bold text-[11px] ${
                        isSuccess
                          ? 'text-emerald-400'
                          : isFailure
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {evt.eventType}
                    </span>

                    <span className="text-zinc-500 font-mono text-[10px] hidden sm:inline">
                      ID: {evt.aggregateId.slice(0, 12)}...
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3 bg-zinc-950/80 border-t border-zinc-900 font-mono text-[11px]">
                    <div className="text-zinc-500 mb-1">Payload:</div>
                    <pre className="text-zinc-300 overflow-x-auto bg-zinc-900/70 p-2.5 rounded-lg border border-zinc-800">
                      {JSON.stringify(evt.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
