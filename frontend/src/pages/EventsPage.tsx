import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, AlertCircle } from 'lucide-react';
import SeverityBadge from '../components/shared/SeverityBadge';
import LiveEventStream from '../components/shared/LiveEventStream';
import EventDetailInspector from '../components/shared/EventDetailInspector';
import { formatTimestamp } from '../data/mockData';
import { useDashboard } from '../context/DashboardContext';
import type { TelemetryEvent, Severity } from '../types/telemetry';

const PAGE_SIZE = 50;
const severityOrder: Record<Severity, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
type SortKey = 'event_time' | 'severity' | 'system_id' | 'fault_type';
type SortDir = 'asc' | 'desc';

interface SortHeaderProps {
  label: string;
  sortId: SortKey;
  activeSortKey: SortKey;
  onToggleSort: (sortKey: SortKey) => void;
}

function SortHeader({ label, sortId, activeSortKey, onToggleSort }: SortHeaderProps) {
  return (
    <th
      onClick={() => onToggleSort(sortId)}
      className="text-left text-[10px] bg-bg-surface sticky top-0 z-10 font-semibold text-text-muted uppercase tracking-wider py-2.5 px-3 cursor-pointer hover:text-text-primary transition-colors select-none"
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${activeSortKey === sortId ? 'text-signal-primary' : 'opacity-30'}`} />
      </span>
    </th>
  );
}

export default function EventsPage() {
  const { filteredEvents } = useDashboard();
  const [searchParams] = useSearchParams();
  const systemFilter = searchParams.get('system');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('event_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedEvent, setSelectedEvent] = useState<TelemetryEvent | null>(null);

  const sorted = useMemo(() => {
    const baseEvents = systemFilter
      ? filteredEvents.filter((e) => e.system_id === systemFilter)
      : filteredEvents;

    return [...baseEvents].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'event_time') cmp = new Date(a.event_time).getTime() - new Date(b.event_time).getTime();
      else if (sortKey === 'severity') cmp = severityOrder[a.severity] - severityOrder[b.severity];
      else if (sortKey === 'system_id') cmp = a.system_id.localeCompare(b.system_id);
      else if (sortKey === 'fault_type') cmp = a.fault_type.localeCompare(b.fault_type);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredEvents, systemFilter, sortKey, sortDir]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-text-primary tracking-tight">
            {systemFilter ? `Event Console: ${systemFilter}` : 'Event Console'}
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">Raw telemetry inspection and correlation</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-secondary">
            {sorted.length.toLocaleString()} matching events
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Main Event Table */}
        <div className="flex-1 flex flex-col min-w-0 glass-panel-solid border border-border rounded-md overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/80">
                  <SortHeader label="Time" sortId="event_time" activeSortKey={sortKey} onToggleSort={toggleSort} />
                  <SortHeader label="Severity" sortId="severity" activeSortKey={sortKey} onToggleSort={toggleSort} />
                  <SortHeader label="System" sortId="system_id" activeSortKey={sortKey} onToggleSort={toggleSort} />
                  <th className="text-left text-[10px] bg-bg-surface sticky top-0 z-10 font-semibold text-text-muted uppercase tracking-wider py-2.5 px-3">Provider</th>
                  <SortHeader label="Fault Type" sortId="fault_type" activeSortKey={sortKey} onToggleSort={toggleSort} />
                  <th className="text-left text-[10px] bg-bg-surface sticky top-0 z-10 font-semibold text-text-muted uppercase tracking-wider py-2.5 px-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted">
                      <div className="flex justify-center mb-2"><AlertCircle className="w-6 h-6 opacity-30" /></div>
                      <p className="text-xs">No events matching the criteria</p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((e) => (
                    <tr
                      key={e.event_record_id}
                      onClick={() => setSelectedEvent(e)}
                      className={`cursor-pointer transition-colors ${
                        selectedEvent?.event_record_id === e.event_record_id ? 'bg-signal-primary/10' : 'hover:bg-bg-hover'
                      } ${e.severity === 'CRITICAL' && selectedEvent?.event_record_id !== e.event_record_id ? 'bg-accent-red/5' : ''}`}
                    >
                      <td className="py-2 px-3 text-[11px] text-text-secondary whitespace-nowrap">{formatTimestamp(e.event_time)}</td>
                      <td className="py-2 px-3"><SeverityBadge severity={e.severity} /></td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-text-primary">{e.hostname}</span>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-text-secondary truncate max-w-[120px]">{e.provider_name}</td>
                      <td className="py-2 px-3 text-[11px] font-semibold text-text-primary">{e.fault_type}</td>
                      <td className="py-2 px-3 text-[11px] text-text-muted truncate max-w-[200px]">{e.fault_description || e.fault_type}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Strip */}
          <div className="flex items-center justify-between px-3 py-2 bg-bg-surface border-t border-border/80 shrink-0">
            <span className="text-[10px] text-text-muted">
              {sorted.length > 0 ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}` : ''}
            </span>
            <div className="flex gap-1 border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 bg-bg-primary hover:bg-bg-hover text-[10px] font-semibold text-text-secondary border-r border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 bg-bg-primary hover:bg-bg-hover text-[10px] font-semibold text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Right Detail Pane */}
        {selectedEvent && (
          <div className="w-[480px] shrink-0">
            <EventDetailInspector event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        )}
      </div>

      {/* Optional Live Event Stream at bottom if explicitly enabled or standard log view */}
      <div className="shrink-0 max-h-[160px]">
         <LiveEventStream />
      </div>
    </div>
  );
}
