import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';
import { timeAgo } from '../data/mockData';
import { useDashboard } from '../context/DashboardContext';
import type { SystemStatus, SystemInfo } from '../types/telemetry';

type SortKey = 'hostname' | 'status' | 'cpu' | 'memory' | 'disk' | 'alerts' | 'last_event' | 'last_seen';
type SortDir = 'asc' | 'desc';

const statusConfig: Record<SystemStatus, { color: string; bg: string; label: string }> = {
  online: { color: 'text-signal-highlight', bg: 'bg-signal-highlight', label: 'Online' },
  degraded: { color: 'text-accent-amber', bg: 'bg-accent-amber', label: 'Degraded' },
  offline: { color: 'text-accent-red', bg: 'bg-accent-red', label: 'Offline' },
};

interface SortHeaderProps {
  label: string;
  sortId: SortKey;
  activeSortKey: SortKey;
  onToggleSort: (sortKey: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}

function SortHeader({ label, sortId, activeSortKey, onToggleSort, align = 'left' }: SortHeaderProps) {
  return (
    <th
      onClick={() => onToggleSort(sortId)}
      className={`text-${align} text-[10px] font-semibold text-text-muted uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-text-primary transition-colors select-none`}
    >
      <span className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${activeSortKey === sortId ? 'text-signal-primary' : 'opacity-30'}`} />
      </span>
    </th>
  );
}

export default function SystemsPage() {
  const navigate = useNavigate();
  const { filteredSystems, filteredSystemEventSummaries } = useDashboard();
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const onlineCount = filteredSystems.filter((s) => s.status === 'online').length;
  const degradedCount = filteredSystems.filter((s) => s.status === 'degraded').length;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedSystems = useMemo(() => {
    return [...filteredSystems].sort((a, b) => {
      let aVal: any = a[sortKey as keyof SystemInfo];
      let bVal: any = b[sortKey as keyof SystemInfo];

      const aSummary = filteredSystemEventSummaries[a.system_id];
      const bSummary = filteredSystemEventSummaries[b.system_id];

      if (sortKey === 'status') {
        const order = { offline: 0, degraded: 1, online: 2 };
        aVal = order[a.status];
        bVal = order[b.status];
      } else if (sortKey === 'cpu') {
        aVal = a.cpu_usage_percent;
        bVal = b.cpu_usage_percent;
      } else if (sortKey === 'memory') {
        aVal = a.memory_usage_percent;
        bVal = b.memory_usage_percent;
      } else if (sortKey === 'disk') {
        aVal = a.disk_free_percent;
        bVal = b.disk_free_percent;
      } else if (sortKey === 'alerts') {
        aVal = aSummary ? aSummary.criticalCount + aSummary.errorCount : 0;
        bVal = bSummary ? bSummary.criticalCount + bSummary.errorCount : 0;
      } else if (sortKey === 'last_event') {
        aVal = aSummary?.latestEvent ? new Date(aSummary.latestEvent.event_time).getTime() : 0;
        bVal = bSummary?.latestEvent ? new Date(bSummary.latestEvent.event_time).getTime() : 0;
      } else if (sortKey === 'last_seen') {
        aVal = new Date(a.last_seen).getTime();
        bVal = new Date(b.last_seen).getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredSystems, filteredSystemEventSummaries, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary tracking-tight">Systems Monitor</h2>
          <p className="text-[11px] text-text-muted mt-0.5">Fleet health and resource utilization</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-highlight" />
            <span className="font-semibold text-text-primary">{onlineCount}</span> Online
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
            <span className="font-semibold text-text-primary">{degradedCount}</span> Degraded
          </span>
          <span className="px-2 py-0.5 rounded bg-bg-surface border border-border text-text-secondary text-[11px] font-medium">
            {filteredSystems.length} Total
          </span>
        </div>
      </div>

      {/* Systems Table */}
      <div className="glass-panel-solid rounded-md overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-bg-surface border-b border-border/60">
                <SortHeader label="Hostname" sortId="hostname" activeSortKey={sortKey} onToggleSort={handleSort} />
                <SortHeader label="Status" sortId="status" activeSortKey={sortKey} onToggleSort={handleSort} />
                <SortHeader label="Last Seen" sortId="last_seen" activeSortKey={sortKey} onToggleSort={handleSort} />
                <SortHeader label="CPU" sortId="cpu" activeSortKey={sortKey} onToggleSort={handleSort} align="right" />
                <SortHeader label="Memory" sortId="memory" activeSortKey={sortKey} onToggleSort={handleSort} align="right" />
                <SortHeader label="Disk" sortId="disk" activeSortKey={sortKey} onToggleSort={handleSort} align="right" />
                <SortHeader label="Active Alerts" sortId="alerts" activeSortKey={sortKey} onToggleSort={handleSort} align="right" />
                <SortHeader label="Last Event" sortId="last_event" activeSortKey={sortKey} onToggleSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sortedSystems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-text-muted">
                    No systems reporting in the selected criteria.
                  </td>
                </tr>
              ) : (
                sortedSystems.map((system) => {
                  const status = statusConfig[system.status];
                  const eventSummary = filteredSystemEventSummaries[system.system_id];
                  const activeAlerts = eventSummary ? eventSummary.criticalCount + eventSummary.errorCount : 0;
                  const recentEvent = eventSummary?.latestEvent;
                  const isDegraded = system.status !== 'online';
                  
                  return (
                    <tr
                      key={system.system_id}
                      onClick={() => navigate(`/events?system=${system.system_id}`)}
                      className={`hover:bg-bg-hover cursor-pointer transition-colors ${isDegraded ? 'bg-accent-red/5' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-semibold text-text-primary">{system.hostname}</span>
                          <span className="text-[10px] font-mono text-text-muted">{system.system_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${status.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.bg}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary">
                        {timeAgo(system.last_seen)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">
                        {system.cpu_usage_percent.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">
                        {system.memory_usage_percent.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">
                        {system.disk_free_percent.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {activeAlerts > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-accent-red/10 text-accent-red text-xs font-bold">
                            {activeAlerts}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-text-secondary w-40 truncate">
                        {recentEvent ? recentEvent.fault_type : <span className="text-text-muted">None</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
