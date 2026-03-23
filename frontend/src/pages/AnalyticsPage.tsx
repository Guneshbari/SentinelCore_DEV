import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Download, Calendar, Plus, X } from 'lucide-react';
import { formatTimeShort, getTopFaultTypes, getTopFailingSystems } from '../data/mockData';
import { useDashboard } from '../context/DashboardContext';
import { fetchMetrics } from '../lib/api';
import type { MetricPoint } from '../types/telemetry';

const FAULT_COLORS = ['#00e5ff', '#22c55e', '#ffd60a', '#ff3b30', '#8b5cf6', '#ff7a18'];

export default function AnalyticsPage() {
  const {
    allEvents,
    metrics,
    systemFailures,
    faultDistribution,
    canUseAggregateViews,
  } = useDashboard();

  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [localMetrics, setLocalMetrics] = useState<MetricPoint[]>([]);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customWidgets, setCustomWidgets] = useState<string[]>([]);
  
  useEffect(() => {
    try { setCustomWidgets(JSON.parse(localStorage.getItem('sentinel_custom_widgets') || '[]')); } catch {}
  }, []);

  const handleAddWidget = () => {
    const name = prompt("Enter custom widget name:");
    if (name) {
      const updated = [...customWidgets, name];
      setCustomWidgets(updated);
      localStorage.setItem('sentinel_custom_widgets', JSON.stringify(updated));
    }
  };

  const removeWidget = (index: number) => {
    const updated = [...customWidgets];
    updated.splice(index, 1);
    setCustomWidgets(updated);
    localStorage.setItem('sentinel_custom_widgets', JSON.stringify(updated));
  };

  const applyCustomRange = async () => {
    if (!customStart || !customEnd) {
      setUseCustomRange(false);
      return;
    }
    try {
      setUseCustomRange(true);
      const data = await fetchMetrics(new Date(customStart).toISOString(), new Date(customEnd).toISOString());
      setLocalMetrics(data);
    } catch(e) { console.error(e); }
  };

  const targetMetrics = useCustomRange ? localMetrics : metrics;

  const freqData = targetMetrics.map((m) => ({
    time: formatTimeShort(m.timestamp),
    Total: m.event_count,
    Errors: m.error_count,
    Warnings: m.warning_count,
    Critical: m.critical_count,
  }));

  const exportAnalytics = () => {
    const csvContent = "Time,Total,Errors,Warnings,Critical\n" + 
      freqData.map(d => `${d.time},${d.Total},${d.Errors},${d.Warnings},${d.Critical}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const failingSystems = canUseAggregateViews ? systemFailures : getTopFailingSystems(allEvents);
  const faultTypes = canUseAggregateViews ? faultDistribution.slice(0, 6) : getTopFaultTypes(allEvents, 6);
  const faultSubtitle = canUseAggregateViews
    ? 'Server-backed breakdown for the selected time range'
    : 'Derived from the recent event sample';
  const systemsSubtitle = canUseAggregateViews
    ? 'Ranked by critical + error events in the selected time range'
    : 'Ranked from the recent event sample';

  const scatterData = metrics.map((m) => ({
    cpu: m.avg_cpu,
    memory: m.avg_memory,
    events: m.event_count,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Analytics</h2>
          <p className="text-xs text-text-muted mt-0.5">Analyze telemetry trends & patterns</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-surface border border-border rounded px-2 py-1.5 focus-within:border-signal-primary/50 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-text-muted" />
            <input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-[10px] text-text-primary outline-none max-w-[125px]" />
            <span className="text-text-muted text-[10px]">to</span>
            <input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-[10px] text-text-primary outline-none max-w-[125px]" />
            <button onClick={applyCustomRange} className="px-2 py-0.5 bg-signal-primary/20 text-signal-primary hover:bg-signal-primary/30 transition-colors text-[10px] font-bold rounded">Apply</button>
            <button onClick={() => { setCustomStart(''); setCustomEnd(''); setUseCustomRange(false); }} title="Clear Date Range" className="text-text-muted hover:text-accent-red transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
          
          <button onClick={exportAnalytics} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg-surface text-xs font-semibold text-text-primary hover:bg-bg-hover transition-colors">
            <Download className="w-3.5 h-3.5 text-signal-primary" /> Export
          </button>
          <button onClick={handleAddWidget} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg-surface text-xs font-semibold text-text-primary hover:bg-bg-hover transition-colors">
            <Plus className="w-3.5 h-3.5 text-signal-primary" /> Add Widget
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event Frequency */}
        <div className="glass-panel panel-glow hover-lift rounded-xl p-5 animate-fade-in">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">Event Frequency Timeline</h3>
          <p className="text-[10px] text-text-muted mb-4">Event counts by severity over time</p>
          <div className="neon-cyan">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={freqData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2230" strokeOpacity={0.25} vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#556171', fontSize: 10 }} axisLine={{ stroke: '#1a2230' }} tickLine={false} />
                <YAxis tick={{ fill: '#556171', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#05080f', border: '1px solid #1a2230', borderRadius: 8, fontSize: 11, color: '#e6edf3' }} />
                <Legend verticalAlign="bottom" height={36} formatter={(v: string) => <span className="text-[10px] text-text-secondary">{v}</span>} />
                <Line type="monotone" dataKey="Total" stroke="#00e5ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Errors" stroke="#ff7a18" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="Warnings" stroke="#ffd60a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="Critical" stroke="#ff3b30" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Failing Systems */}
        <div className="glass-panel panel-glow hover-lift rounded-xl p-5 animate-fade-in">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">Top Failing Systems</h3>
          <p className="text-[10px] text-text-muted mb-4">{systemsSubtitle}</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={failingSystems} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="failGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2230" strokeOpacity={0.25} horizontal={false} />
              <XAxis type="number" tick={{ fill: '#556171', fontSize: 10 }} axisLine={{ stroke: '#1a2230' }} tickLine={false} />
              <YAxis type="category" dataKey="hostname" tick={{ fill: '#556171', fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ backgroundColor: '#05080f', border: '1px solid #1a2230', borderRadius: 8, fontSize: 11, color: '#e6edf3' }} />
              <Bar dataKey="failure_count" fill="url(#failGrad)" radius={[0, 4, 4, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fault Type Distribution */}
        <div className="glass-panel panel-glow hover-lift rounded-xl p-5 animate-fade-in">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">Fault Type Distribution</h3>
          <p className="text-[10px] text-text-muted mb-4">{faultSubtitle}</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={faultTypes} dataKey="count" nameKey="fault_type" cx="50%" cy="50%" innerRadius={50} outerRadius={90} strokeWidth={2} stroke="#000000">
                {faultTypes.map((_, i) => <Cell key={i} fill={FAULT_COLORS[i % FAULT_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#05080f', border: '1px solid #1a2230', borderRadius: 8, fontSize: 11, color: '#e6edf3' }} />
              <Legend verticalAlign="bottom" height={36} formatter={(v: string) => <span className="text-[10px] text-text-secondary">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Resource Correlations */}
        <div className="glass-panel panel-glow hover-lift rounded-xl p-5 animate-fade-in">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">Resource Correlations</h3>
          <p className="text-[10px] text-text-muted mb-4">CPU vs Memory — color by event volume</p>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2230" strokeOpacity={0.25} />
              <XAxis type="number" dataKey="cpu" name="CPU %" tick={{ fill: '#556171', fontSize: 10 }} axisLine={{ stroke: '#1a2230' }} tickLine={false} domain={[0, 100]} />
              <YAxis type="number" dataKey="memory" name="Memory %" tick={{ fill: '#556171', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#05080f', border: '1px solid #1a2230', borderRadius: 8, fontSize: 11, color: '#e6edf3' }} />
              <Scatter data={scatterData} fill="#00e5ff">
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={entry.events > 100 ? '#ff3b30' : entry.events > 50 ? '#ffd60a' : '#22c55e'} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        
        {/* Custom Widgets */}
        {customWidgets.map((widget, i) => (
          <div key={i} className="glass-panel panel-glow hover-lift rounded-xl p-5 animate-fade-in flex flex-col items-center justify-center min-h-[300px] relative">
            <button onClick={() => removeWidget(i)} className="absolute top-4 right-4 text-text-muted hover:text-accent-red transition-colors"><X className="w-4 h-4" /></button>
            <h3 className="text-sm font-semibold text-text-primary mb-2">{widget}</h3>
            <p className="text-xs text-text-secondary">Custom Widget Placeholder</p>
          </div>
        ))}
      </div>
    </div>
  );
}
