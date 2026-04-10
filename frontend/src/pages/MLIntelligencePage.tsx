/**
 * MLIntelligencePage — dedicated ML Intelligence tab.
 *
 * Layout:
 *   ┌─ Title bar (ML INTELLIGENCE · model info · last updated) ──────────┐
 *   ├─ KPI strip: Total Systems · Anomalies (red) · Normal (green) ───────┤
 *   ├─┬─────────────────────────────┬──────────────────────────────────┬──┤
 *   │ │   AnomalyPanel (8fr)         │   ClusterPanel (4fr)             │  │
 *   │ │   top-10 systems by score    │   systems grouped by cluster     │  │
 *   └─┴─────────────────────────────┴──────────────────────────────────┴──┘
 *
 * Data contract:
 *  - All data comes from useMLStore (Zustand, 60s auto-refresh).
 *  - No prop drilling, no prop dependency on dashboardStore.
 *  - Starts auto-refresh on mount, cleans up on unmount.
 */
import { useEffect, useMemo } from 'react';
import AnomalyPanel from '../components/soc/AnomalyPanel';
import ClusterPanel from '../components/soc/ClusterPanel';
import { useMLStore } from '../store/mlStore';

// ── KPI strip item ─────────────────────────────────────────────────────────

interface KpiItemProps {
  label: string;
  value: string | number;
  color?: string;
  dimColor?: string;
}

function KpiItem({ label, value, color = '#E2E8F0', dimColor }: KpiItemProps) {
  return (
    <div
      className="flex flex-col justify-center px-4 border-r border-[#1E293B]"
      style={{ height: '100%', minWidth: 90 }}
    >
      <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: dimColor ?? '#475569' }}>
        {label}
      </span>
      <span
        className="font-mono font-bold leading-none mt-0.5"
        style={{ fontSize: 20, color, letterSpacing: '-0.5px' }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────

export default function MLIntelligencePage() {
  const { anomalies, clusters, isLoading, error, lastUpdated, showOnlyAnomalies, setShowOnlyAnomalies, startAutoRefresh, load } =
    useMLStore();

  // Start auto-refresh on mount, stop on unmount
  useEffect(() => {
    const cleanup = startAutoRefresh();
    return cleanup;
  }, [startAutoRefresh]);

  // KPI computations
  const { anomalyCount, normalCount, modelVersion, uniqueModels } = useMemo(() => {
    const anomalyCount = anomalies.filter((a) => a.is_anomaly === true).length;
    const normalCount  = anomalies.length - anomalyCount;
    const models = [...new Set(anomalies.map((a) => a.model_version).filter(Boolean))];
    return {
      anomalyCount,
      normalCount,
      modelVersion: models[0] ?? '—',
      uniqueModels: models,
    };
  }, [anomalies]);

  const clusterCount = useMemo(
    () => new Set(clusters.map((c) => c.cluster_id)).size,
    [clusters],
  );

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';

  return (
    <div className="flex flex-col h-full gap-1" style={{ minHeight: 0 }}>
      {/* ── Title bar ── */}
      <div
        className="flex items-center px-3 border border-[#1E293B] flex-shrink-0 gap-4"
        style={{ height: 28, background: '#0A0A0A' }}
      >
        <span className="font-mono text-[10px] text-[#E2E8F0] font-semibold uppercase tracking-wider">
          ML Intelligence
        </span>
        <span className="font-mono text-[10px]" style={{ color: '#334155' }}>
          Model: {modelVersion}
        </span>
        <span className="font-mono text-[10px]" style={{ color: '#334155' }}>
          Last updated: {lastUpdatedStr}
        </span>
        {isLoading && (
          <span className="font-mono text-[9px]" style={{ color: '#475569' }}>
            Refreshing…
          </span>
        )}

        {/* Manual refresh button */}
        <button
          className="soc-btn ml-auto"
          onClick={() => load()}
          style={{ height: 18, fontSize: 9, padding: '0 8px' }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div
        className="flex flex-shrink-0 border border-[#1E293B]"
        style={{ height: 52, background: '#0A0A0A' }}
      >
        <KpiItem
          label="Systems monitored"
          value={anomalies.length}
          color="#E2E8F0"
        />
        <KpiItem
          label="Anomalies detected"
          value={anomalyCount}
          color={anomalyCount > 0 ? 'var(--soc-critical)' : 'var(--soc-success)'}
          dimColor={anomalyCount > 0 ? '#ff3b3040' : undefined}
        />
        <KpiItem
          label="Normal systems"
          value={normalCount}
          color={normalCount > 0 ? 'var(--soc-success)' : '#475569'}
        />
        <KpiItem
          label="Clusters"
          value={clusterCount > 0 ? clusterCount : '—'}
          color="#3B82F6"
        />
        <KpiItem
          label="Model"
          value={modelVersion}
          color="#8B5CF6"
        />
        {uniqueModels.length > 1 && (
          <div
            className="flex items-center px-3 font-mono text-[9px] ml-auto"
            style={{ color: '#475569' }}
          >
            {uniqueModels.length} model versions in window
          </div>
        )}
      </div>

      {/* ── Main grid: AnomalyPanel 8fr + ClusterPanel 4fr ── */}
      <div
        className="grid gap-1 flex-1 min-h-0"
        style={{ gridTemplateColumns: '8fr 4fr', minHeight: 0 }}
      >
        {/* LEFT: Anomaly detection */}
        <AnomalyPanel
          anomalies={anomalies}
          isLoading={isLoading}
          error={error}
          lastUpdated={lastUpdated}
          showOnlyAnomalies={showOnlyAnomalies}
          onToggleFilter={setShowOnlyAnomalies}
        />

        {/* RIGHT: Cluster map */}
        <ClusterPanel
          clusters={clusters}
          isLoading={isLoading}
          error={error}
          lastUpdated={lastUpdated}
        />
      </div>
    </div>
  );
}
