import { X } from 'lucide-react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import SeverityBadge from './SeverityBadge';
import { formatTimestamp } from '../../data/mockData';
import { useDashboard } from '../../context/DashboardContext';
import type { TelemetryEvent } from '../../types/telemetry';

interface EventDetailInspectorProps {
  readonly event: TelemetryEvent | null;
  readonly onClose: () => void;
}

export default function EventDetailInspector({ event, onClose }: EventDetailInspectorProps) {
  const { filteredEventsBySystemId } = useDashboard();
  if (!event) return null;

  const systemEvents = filteredEventsBySystemId[event.system_id] ?? [];

  const correlationData = systemEvents.map((e) => ({
    time: formatTimestamp(e.event_time).split(', ')[1] || formatTimestamp(e.event_time),
    cpu: e.cpu_usage_percent,
    memory: e.memory_usage_percent,
    disk: e.disk_free_percent,
  }));

  const fields = [
    { label: 'System ID', value: event.system_id, mono: true },
    { label: 'Hostname', value: event.hostname },
    { label: 'Event ID', value: String(event.event_id), mono: true },
    { label: 'Provider', value: event.provider_name },
    { label: 'Fault Type', value: event.fault_type },
    { label: 'Event Hash', value: event.event_hash || '—', mono: true },
  ];

  return (
    <div className="flex flex-col h-full glass-panel-solid rounded-md border border-border animate-slide-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border shrink-0">
        <h3 className="text-[11px] font-bold text-text-primary uppercase tracking-wider">Event Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Core Description + Severity */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SeverityBadge severity={event.severity} />
            <span className="text-[10px] text-text-muted font-mono">{formatTimestamp(event.event_time)}</span>
          </div>
          <p className="text-[13px] font-medium text-text-primary leading-relaxed">
            {event.fault_description || event.fault_type}
          </p>
        </div>

        {/* Diagnostics Table */}
        <div className="space-y-1 bg-bg-surface border border-border/60 rounded p-2">
          {fields.map((f) => (
            <div key={f.label} className="flex justify-between py-1 border-b border-border/30 last:border-0 text-[11px]">
              <span className="text-text-muted">{f.label}</span>
              <span className={`text-text-primary ${f.mono ? 'font-mono text-[10px]' : 'font-medium'}`}>
                {f.value}
              </span>
            </div>
          ))}
        </div>

        {/* Correlation Chart */}
        {correlationData.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Resource Activity</h4>
            <div className="h-[140px] w-full border border-border/60 rounded bg-bg-surface p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={correlationData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, fontSize: 10, color: '#f8fafc' }}
                  />
                  <Line type="stepAfter" dataKey="cpu" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="CPU %" />
                  <Line type="stepAfter" dataKey="memory" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Memory %" />
                  <Area type="monotone" dataKey="disk" fill="#10b981" fillOpacity={0.1} stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" name="Disk %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* JSON Payload */}
        {event.diagnostic_context && Object.keys(event.diagnostic_context).length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Raw Payload</h4>
            <pre className="text-[10px] text-text-secondary font-mono bg-bg-primary border border-border rounded p-3 overflow-x-auto">
              {JSON.stringify(event.diagnostic_context, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
