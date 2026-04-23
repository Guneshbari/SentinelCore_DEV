/**
 * ClusterPanel — SOC-style widget for KMeans cluster assignments.
 *
 * Groups systems by cluster_id and renders each cluster as a labelled section.
 * Cluster colours cycle through a fixed SOC palette (blue → cyan → amber → …).
 *
 * When cluster_id is null (heuristic-scored), those systems are shown in a
 * separate "Unclassified" group at the bottom.
 *
 * Shows:
 *  - Cluster ID header + system count per cluster
 *  - Per-system: system_id, anomaly_score bar, is_anomaly indicator
 *  - "KMeans not yet run" idle-state if no cluster data
 *  - Loading skeleton + error banner
 */
import { useMemo } from 'react';
import type { MLCluster } from '../../types/telemetry';

// ── Cluster colour palette ─────────────────────────────────────────────────
// Cycling SOC colours: blue, cyan, amber, violet, green
const CLUSTER_COLORS = [
  '#3B82F6',  // 0 — blue
  '#06B6D4',  // 1 — cyan
  '#F59E0B',  // 2 — amber
  '#8B5CF6',  // 3 — violet
  '#10B981',  // 4 — emerald
  '#F97316',  // 5 — orange
];

function clusterColor(id: number | null): string {
  if (id === null) return '#64748b'; // slate-500
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

function scoreColor(score: number): string {
  if (score >= 0.75) return 'var(--soc-critical)';
  if (score >= 0.50) return 'var(--soc-error)';
  if (score >= 0.30) return 'var(--soc-warning)';
  return 'var(--soc-success)';
}

function shortId(systemId: string): string {
  const base = systemId.split('.')[0];
  return base.length > 20 ? base.slice(0, 19) + '…' : base;
}

function fmtTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch {
    return '—';
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-2 py-1">
      {[3, 2, 4].map((count, gi) => (
        <div key={gi} className="mb-2">
          <div style={{ height: 18, background: '#111', borderBottom: '1px solid #1E293B', marginBottom: 2 }} />
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[#151f2e]" style={{ opacity: 1 - i * 0.2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#262626', flexShrink: 0 }} />
              <div style={{ flex: 1, height: 8, background: '#1A1A1A', borderRadius: 2 }} />
              <div style={{ width: 48, height: 8, background: '#1A1A1A', borderRadius: 2 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
      <span style={{ fontSize: 20, opacity: 0.4 }}>⬡</span>
      <span className="font-mono text-[11px]" style={{ color: 'var(--soc-text-muted)' }}>
        No cluster data yet
      </span>
      <span className="font-mono text-[9px] text-center" style={{ color: 'var(--soc-text-muted)', maxWidth: 180, lineHeight: 1.6 }}>
        KMeans runs after the first ML pipeline cycle (60s after ingestion starts). Run{' '}
        <code style={{ color: '#94A3B8' }}>ml_engine.py</code> to populate manually.
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface ClusterPanelProps {
  clusters: MLCluster[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export default function ClusterPanel({
  clusters,
  isLoading,
  error,
  lastUpdated,
}: ClusterPanelProps) {
  // Group systems by cluster_id
  const grouped = useMemo(() => {
    const map = new Map<number | null, MLCluster[]>();
    for (const row of clusters) {
      const id = row.cluster_id;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row);
    }
    // Sort clusters numerically, put null (Unclassified) at the bottom
    return [...map.entries()].sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
  }, [clusters]);

  const totalSystems = clusters.length;
  const numClusters  = grouped.length;

  return (
    <div className="soc-panel flex flex-col h-full overflow-hidden">
      {/* ── Panel header ── */}
      <div className="soc-panel-header">
        <span className="soc-panel-title">KMeans Cluster Map</span>
        <div className="flex items-center gap-3">
          {numClusters > 0 && (
            <span className="font-mono text-[10px]" style={{ color: 'var(--soc-info)' }}>
              {numClusters} cluster{numClusters !== 1 ? 's' : ''} · {totalSystems} system{totalSystems !== 1 ? 's' : ''}
            </span>
          )}
          {lastUpdated && (
            <span className="font-mono text-[9px]" style={{ color: 'var(--soc-text-muted)' }}>
              {fmtTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          className="px-3 py-1.5 font-mono text-[10px] flex-shrink-0"
          style={{ background: '#1A0A0A', color: 'var(--soc-error)', borderBottom: '1px solid #2A1010' }}
        >
          {error}
        </div>
      )}

      {/* ── Body ── */}
      {isLoading && clusters.length === 0 ? (
        <LoadingSkeleton />
      ) : clusters.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {grouped.map(([clusterId, systems]) => {
            const color = clusterColor(clusterId);
            const anomCount = systems.filter((s) => s.is_anomaly === true).length;
            // Sort within cluster: anomalies first, then by score DESC
            const sorted = [...systems].sort((a, b) => {
              if (a.is_anomaly && !b.is_anomaly) return -1;
              if (!a.is_anomaly && b.is_anomaly) return 1;
              return b.anomaly_score - a.anomaly_score;
            });

            return (
              <div key={clusterId ?? 'unclassified'}>
                {/* Cluster header row */}
                <div
                  className="flex items-center gap-2 px-2"
                  style={{
                    height: 22,
                    background: `${color}10`,
                    borderBottom: `1px solid ${color}33`,
                    borderLeft: `3px solid ${color}`,
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="font-mono text-[9px] font-bold uppercase tracking-wider"
                    style={{ color }}
                  >
                    {clusterId === null ? 'UNCLASSIFIED' : `Cluster ${clusterId}`}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--soc-text-muted)' }}>
                    {systems.length} system{systems.length !== 1 ? 's' : ''}
                  </span>
                  {anomCount > 0 && (
                    <span
                      className="font-mono text-[8px] font-bold px-1 ml-auto"
                      style={{ color: '#fff', background: 'var(--soc-critical)' }}
                    >
                      {anomCount} ANOMAL{anomCount !== 1 ? 'IES' : 'Y'}
                    </span>
                  )}
                </div>

                {/* System rows */}
                {sorted.map((sys) => {
                  const sc = scoreColor(sys.anomaly_score);
                  const isAnom = sys.is_anomaly === true;
                  return (
                    <div
                      key={sys.system_id}
                      className="flex items-center px-2 border-b border-[#151f2e] hover:bg-[#0D1826] transition-colors"
                      style={{
                        height: 30,
                        background: isAnom ? '#130707' : undefined,
                        paddingLeft: 12,
                      }}
                    >
                      {/* Anomaly dot */}
                      <span
                        className={`soc-dot mr-2 ${isAnom ? 'soc-dot-critical' : ''}`}
                        style={isAnom ? {} : { background: color, opacity: 0.6 }}
                      />

                      {/* System ID */}
                      <span
                        className="font-mono text-[10px] flex-1 truncate"
                        style={{ color: isAnom ? '#E2E8F0' : 'var(--soc-text-dim)' }}
                        title={sys.system_id}
                      >
                        {shortId(sys.system_id)}
                      </span>

                      {/* Score bar */}
                      <div className="flex items-center gap-1 w-[64px]">
                        <div className="soc-bar-track" style={{ width: 36 }}>
                          <div
                            className="soc-bar-fill"
                            style={{ width: `${Math.min(sys.anomaly_score * 100, 100)}%`, background: sc }}
                          />
                        </div>
                        <span className="font-mono text-[9px] w-[22px] text-right" style={{ color: sc }}>
                          {(sys.anomaly_score * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* Anomaly flag */}
                      {isAnom && (
                        <span
                          className="font-mono text-[8px] font-bold ml-2 px-1"
                          style={{ color: '#fff', background: 'var(--soc-critical)', flexShrink: 0 }}
                        >
                          !
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div
        className="flex items-center justify-between px-3 flex-shrink-0"
        style={{ height: 20, background: '#050810', borderTop: '1px solid #1E293B' }}
      >
        <span className="font-mono text-[9px]" style={{ color: 'var(--soc-text-muted)' }}>
          {numClusters} cluster{numClusters !== 1 ? 's' : ''} · sklearn KMeans v2-isof
        </span>
        <span className="font-mono text-[9px]" style={{ color: 'var(--soc-text-muted)' }}>
          auto-refresh 60s
        </span>
      </div>
    </div>
  );
}
