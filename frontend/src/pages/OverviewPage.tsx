/**
 * OverviewPage — 12-column SOC grid
 *
 * Layout:
 *   [col-3] SmartEventStream  |  [col-6] IncidentBoard  |  [col-3] HealthScorePanel
 *   [col-12] MetricsCharts (ECharts, zoomable)
 *   [col-12] KpiStrip
 *
 * This page initializes the Zustand signal store from mock/API data on mount.
 */
import { useEffect, useRef } from 'react';
import SmartEventStream from '../components/soc/SmartEventStream';
import IncidentBoard    from '../components/soc/IncidentBoard';
import HealthScorePanel from '../components/soc/HealthScorePanel';
import MetricsCharts    from '../components/soc/MetricsCharts';
import KpiStrip         from '../components/soc/KpiStrip';
import { useSignalStore } from '../store/signalStore';
import { fetchEvents } from '../lib/api';

export default function OverviewPage() {
  const setEvents   = useSignalStore((s) => s.setEvents);
  const lastUpdated = useSignalStore((s) => s.lastUpdated);
  const initialized = useRef(false);

  // Initialize signal store from mock / API data on first mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchEvents({ limit: 1000 })
      .then((events) => setEvents(events))
      .catch(console.error);
  }, [setEvents]);

  // Periodic recompute to roll time windows (every 60s)
  const recompute = useSignalStore((s) => s.recompute);
  useEffect(() => {
    const id = setInterval(recompute, 60_000);
    return () => clearInterval(id);
  }, [recompute]);

  return (
    <div
      className="flex flex-col gap-1 h-full"
      style={{ minHeight: 0 }}
    >
      {/* KPI Strip — top */}
      <KpiStrip />

      {/* Main 3-column SOC grid */}
      <div
        className="grid gap-1 flex-1 min-h-0"
        style={{ gridTemplateColumns: '3fr 6fr 3fr', minHeight: 0 }}
      >
        {/* LEFT — Signal stream */}
        <SmartEventStream />

        {/* CENTER — Incident board */}
        <IncidentBoard />

        {/* RIGHT — Health scores */}
        <HealthScorePanel />
      </div>

      {/* Bottom — Event frequency chart */}
      <MetricsCharts />

      {lastUpdated && (
        <div className="flex items-center px-2" style={{ height: 16, flexShrink: 0 }}>
          <span className="font-mono text-[9px] text-[#334155]">
            signals updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
