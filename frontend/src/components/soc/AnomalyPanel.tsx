/**
 * AnomalyPanel — SOC-style widget for ML anomaly detection results.
 *
 * Shows:
 *  - Summary header: total anomalies / total systems, last updated
 *  - Per-system rows sorted by anomaly_score DESC (top 10 shown)
 *  - Score bar + ANOMALY / NORMAL badge per row
 *  - Fallback "No anomalies detected" idle state
 *  - Loading skeleton + error banner
 *
 * Uses soc-panel / soc-panel-header classes to match the existing design
 * system exactly. No re-renders unless props actually change (useMemo).
 */
import { useMemo } from 'react';
import type { MLAnomaly } from '../../types/telemetry';

// ── Score thresholds ───────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 0.75) return 'var(--soc-critical)';
  if (score >= 0.50) return 'var(--soc-error)';
  if (score >= 0.30) return 'var(--soc-warning)';
  return 'var(--soc-success)';
}

function scoreLabel(score: number): string {
  if (score >= 0.75) return 'CRITICAL';
  if (score >= 0.50) return 'HIGH';
  if (score >= 0.30) return 'MEDIUM';
  return 'LOW';
}

// Short display name — strip domain suffixes, keep max 18 chars
function shortId(systemId: string): string {
  const base = systemId.split('.')[0];
  return base.length > 18 ? base.slice(0, 17) + '…' : base;
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
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 border-b border-[#1E293B] py-2"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#262626', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 8, background: '#1A1A1A', borderRadius: 2 }} />
          <div style={{ width: 48, height: 8, background: '#1A1A1A', borderRadius: 2 }} />
          <div style={{ width: 40, height: 14, background: '#1A1A1A', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
      <span style={{ fontSize: 22 }}>✓</span>
      <span className="font-mono text-[11px]" style={{ color: 'var(--soc-success)' }}>
        No anomalies detected
      </span>
      {filtered && (
        <span className="font-mono text-[9px] text-center" style={{ color: 'var(--soc-text-muted)', maxWidth: 160 }}>
          All systems scored within normal range.
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface AnomalyPanelProps {
  anomalies: MLAnomaly[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  showOnlyAnomalies: boolean;
  onToggleFilter: (v: boolean) => void;
}

export default function AnomalyPanel({
  anomalies,
  isLoading,
  error,
  lastUpdated,
  showOnlyAnomalies,
  onToggleFilter,
}: AnomalyPanelProps) {
  // Sort by anomaly_score DESC, slice top 10 for display
  const sorted = useMemo(
    () => [...anomalies].sort((a, b) => b.anomaly_score - a.anomaly_score).slice(0, 10),
    [anomalies],
  );

  const anomalyCount = useMemo(() => anomalies.filter((a) => a.is_anomaly === true).length, [anomalies]);
  const totalCount   = anomalies.length;

  const headerStatus =
    anomalyCount > 0
      ? { label: `${anomalyCount} FLAGGED`, color: 'var(--soc-critical)' }
      : { label: 'NORMAL', color: 'var(--soc-success)' };

  return (
    <div className="soc-panel flex flex-col h-full overflow-hidden">
      {/* ── Panel header ── */}
      <div className="soc-panel-header">
        <span className="soc-panel-title">ML Anomaly Detection</span>
        <div className="flex items-center gap-3">
          {/* Live anomaly count badge */}
          <span className="font-mono text-[10px]" style={{ color: headerStatus.color }}>
            {headerStatus.label}
          </span>

          {/* Toggle: all / anomalies-only */}
          <button
            onClick={() => onToggleFilter(!showOnlyAnomalies)}
            className="soc-btn"
            style={{
              height: 18,
              fontSize: 9,
              padding: '0 6px',
              ...(showOnlyAnomalies
                ? { borderColor: 'var(--soc-critical)', color: 'var(--soc-critical)', background: '#2A0F10' }
                : {}),
            }}
            title={showOnlyAnomalies ? 'Showing anomalies only — click to show all' : 'Show anomalies only'}
          >
            {showOnlyAnomalies ? 'Anomalies only' : 'All systems'}
          </button>

          {/* Refresh timestamp */}
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

      {/* ── Column labels ── */}
      <div
        className="flex items-center px-2 flex-shrink-0"
        style={{ height: 20, background: '#050810', borderBottom: '1px solid #1E293B' }}
      >
        <span className="font-mono text-[9px] tracking-wider uppercase flex-1" style={{ color: '#334155' }}>
          System
        </span>
        <span className="font-mono text-[9px] tracking-wider uppercase w-[52px]" style={{ color: '#334155' }}>
          Score
        </span>
        <span className="font-mono text-[9px] tracking-wider uppercase w-[60px] text-center" style={{ color: '#334155' }}>
          Risk
        </span>
        <span className="font-mono text-[9px] tracking-wider uppercase w-[54px] text-center" style={{ color: '#334155' }}>
          Status
        </span>
      </div>

      {/* ── Body ── */}
      {isLoading && sorted.length === 0 ? (
        <LoadingSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState filtered={showOnlyAnomalies} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sorted.map((row) => {
            const color = scoreColor(row.anomaly_score);
            const isAnom = row.is_anomaly === true;
            return (
              <div
                key={row.system_id}
                className="flex items-center px-2 border-b border-[#151f2e] hover:bg-[#0D1826] transition-colors"
                style={{
                  height: 34,
                  background: isAnom ? '#140707' : undefined,
                  borderLeft: isAnom ? `3px solid var(--soc-critical)` : '3px solid transparent',
                }}
              >
                {/* Status dot */}
                <span
                  className={`soc-dot mr-2 ${isAnom ? 'soc-dot-critical' : 'soc-dot-online'}`}
                />

                {/* System ID */}
                <span
                  className="font-mono text-[10px] flex-1 truncate"
                  style={{ color: isAnom ? '#E2E8F0' : 'var(--soc-text-dim)' }}
                  title={row.system_id}
                >
                  {shortId(row.system_id)}
                </span>

                {/* Score bar */}
                <div className="w-[52px] flex items-center gap-1">
                  <div className="soc-bar-track" style={{ width: 36 }}>
                    <div
                      className="soc-bar-fill"
                      style={{ width: `${Math.min(row.anomaly_score * 100, 100)}%`, background: color }}
                    />
                  </div>
                  <span className="font-mono text-[9px]" style={{ color, width: 28, textAlign: 'right' }}>
                    {(row.anomaly_score * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Risk level */}
                <div className="w-[60px] flex justify-center">
                  <span
                    className="font-mono text-[8px] font-bold px-1"
                    style={{ color, border: `1px solid ${color}`, background: `${color}15` }}
                  >
                    {scoreLabel(row.anomaly_score)}
                  </span>
                </div>

                {/* Anomaly / Normal badge */}
                <div className="w-[54px] flex justify-center">
                  <span
                    className="font-mono text-[8px] font-bold px-1"
                    style={
                      isAnom
                        ? { color: '#fff', background: 'var(--soc-critical)' }
                        : { color: 'var(--soc-success)', border: '1px solid var(--soc-success)', background: 'transparent' }
                    }
                  >
                    {isAnom ? 'ANOMALY' : 'NORMAL'}
                  </span>
                </div>
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
          {totalCount} system{totalCount !== 1 ? 's' : ''} · top 10 shown · auto-refresh 60s
        </span>
        <span className="font-mono text-[9px]" style={{ color: anomalyCount > 0 ? 'var(--soc-critical)' : 'var(--soc-text-muted)' }}>
          {anomalyCount} anomal{anomalyCount !== 1 ? 'ies' : 'y'}
        </span>
      </div>
    </div>
  );
}
