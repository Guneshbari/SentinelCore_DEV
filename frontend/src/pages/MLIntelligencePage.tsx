/**
 * MLIntelligencePage — dedicated ML Intelligence tab.
 *
 * Layout:
 *   ┌─ Title bar (ML INTELLIGENCE · model info · last updated · ↗ Prometheus) ┐
 *   ├─ KPI strip: Systems · Anomalies · Normal · Clusters · Model · At Risk ───┤
 *   ├─ FailureRiskPanel (full width, collapsible) ────────────────────────────┤
 *   ├─┬─────────────────────────────┬──────────────────────────────────────┬──┤
 *   │ │   AnomalyPanel (8fr)         │   ClusterPanel (4fr)                 │  │
 *   └─┴─────────────────────────────┴──────────────────────────────────────┴──┘
 */
import { useEffect, useMemo, useState } from 'react';
import AnomalyPanel from '../components/soc/AnomalyPanel';
import ClusterPanel from '../components/soc/ClusterPanel';
import { useMLStore } from '../store/mlStore';
import type { MLFailureRisk } from '../types/telemetry';
import { API_BASE } from '../lib/api';

// ── Risk level helpers ─────────────────────────────────────────────────────

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function getRiskLevel(prob: number): RiskLevel {
  if (prob >= 0.8) return 'CRITICAL';
  if (prob >= 0.6) return 'HIGH';
  if (prob >= 0.3) return 'MEDIUM';
  return 'LOW';
}

const RISK_COLOR: Record<RiskLevel, string> = {
  CRITICAL: '#DC2626',
  HIGH:     '#F97316',
  MEDIUM:   '#F59E0B',
  LOW:      '#22C55E',
};

const RISK_BG: Record<RiskLevel, string> = {
  CRITICAL: 'rgba(220,38,38,0.15)',
  HIGH:     'rgba(249,115,22,0.12)',
  MEDIUM:   'rgba(245,158,11,0.12)',
  LOW:      'rgba(34,197,94,0.10)',
};

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

// ── Risk bar row ───────────────────────────────────────────────────────────

interface RiskRowProps {
  risk: MLFailureRisk;
  index: number;
}

const RiskRow = ({ risk, index }: RiskRowProps) => {
  const level = getRiskLevel(risk.failure_probability);
  const color = RISK_COLOR[level];
  const pct   = (risk.failure_probability * 100).toFixed(1);
  const updatedAt = risk.prediction_time
    ? new Date(risk.prediction_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 border-b border-[#0F172A] hover:bg-[#0F172A]/60 transition-colors"
      style={{ minHeight: 32 }}
    >
      {/* Rank */}
      <span className="font-mono text-[9px] w-5 text-[#334155] flex-shrink-0 text-right">{index + 1}</span>

      {/* System ID */}
      <span className="font-mono text-[10px] text-[#94A3B8] w-32 flex-shrink-0 truncate">{risk.system_id}</span>

      {/* Risk bar */}
      <div
        className="flex-1 h-3 rounded-sm overflow-hidden"
        style={{ background: '#0F172A', minWidth: 80 }}
        title={`Failure probability: ${pct}% — ${risk.predicted_fault}`}
      >
        <div
          className={`h-full rounded-sm transition-all${level === 'CRITICAL' ? ' animate-pulse' : ''}`}
          style={{ width: `${risk.failure_probability * 100}%`, background: color }}
        />
      </div>

      {/* Percentage */}
      <span className="font-mono text-[10px] w-12 text-right flex-shrink-0" style={{ color }}>{pct}%</span>

      {/* Level badge */}
      <span
        className="font-mono text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 w-16 text-center"
        style={{ color, background: RISK_BG[level] }}
      >
        {level}
      </span>

      {/* Predicted fault */}
      <span className="font-mono text-[10px] text-[#475569] flex-1 truncate">{risk.predicted_fault}</span>

      {/* Updated */}
      <span className="font-mono text-[9px] text-[#334155] flex-shrink-0 w-12 text-right">{updatedAt}</span>
    </div>
  );
};

// ── Failure Risk Panel ─────────────────────────────────────────────────────

interface FailureRiskPanelProps {
  risks: MLFailureRisk[];
  atRiskCount: number;
  isLoading: boolean;
}

function FailureRiskPanel({ risks, atRiskCount, isLoading }: FailureRiskPanelProps) {
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(
    () => [...risks].sort((a, b) =>
      sortAsc
        ? a.failure_probability - b.failure_probability
        : b.failure_probability - a.failure_probability
    ),
    [risks, sortAsc],
  );

  const top5 = useMemo(() => sorted.slice(0, 5), [sorted]);

  if (isLoading && risks.length === 0) {
    return (
      <div
        className="border border-[#1E293B] flex items-center justify-center font-mono text-[10px] text-[#334155]"
        style={{ height: 48, background: '#0A0A0A' }}
      >
        Loading failure risk data…
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div
        className="border border-[#1E293B] flex items-center justify-center font-mono text-[10px] text-[#334155]"
        style={{ height: 48, background: '#0A0A0A' }}
      >
        No failure risk data available — ML engine may not have run yet
      </div>
    );
  }

  return (
    <div className="border border-[#1E293B] flex-shrink-0" style={{ background: '#0A0A0A' }}>
      {/* Panel header */}
      <div
        className="flex items-center gap-4 px-3 border-b border-[#1E293B]"
        style={{ height: 24, background: '#0A0A0A' }}
      >
        <span className="font-mono text-[9px] text-[#E2E8F0] font-semibold uppercase tracking-wider">
          Failure Risk
        </span>
        <span className="font-mono text-[9px] text-[#334155]">per system · sorted by probability</span>
        {atRiskCount > 0 && (
          <span
            className="font-mono text-[9px] font-bold px-2 py-0.5 rounded"
            style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}
          >
            {atRiskCount} at risk
          </span>
        )}
        <button
          className="ml-auto font-mono text-[9px] text-[#475569] hover:text-[#94A3B8] transition-colors"
          onClick={() => setSortAsc((v) => !v)}
          title="Toggle sort order"
        >
          {sortAsc ? '↑ Lowest first' : '↓ Highest first'}
        </button>
      </div>

      {/* Top-5 highlight cards */}
      {top5.length > 0 && (
        <div className="flex gap-1 px-3 py-2 border-b border-[#0F172A]">
          {top5.map((r) => {
            const level = getRiskLevel(r.failure_probability);
            const color = RISK_COLOR[level];
            return (
              <div
                key={r.system_id}
                className="flex flex-col gap-0.5 px-3 py-1.5 rounded border"
                style={{
                  background: RISK_BG[level],
                  borderColor: color + '40',
                  minWidth: 110,
                }}
                title={`${r.system_id}: ${(r.failure_probability * 100).toFixed(1)}% failure probability`}
              >
                <span className="font-mono text-[9px] truncate" style={{ color: '#94A3B8' }}>
                  {r.system_id}
                </span>
                <span className="font-mono text-[14px] font-bold" style={{ color }}>
                  {(r.failure_probability * 100).toFixed(0)}%
                </span>
                <span className="font-mono text-[8px] uppercase font-bold" style={{ color }}>
                  {level}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Risk table */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {/* Table header */}
        <div
          className="flex items-center gap-3 px-3 py-1 border-b border-[#1E293B] sticky top-0"
          style={{ background: '#0A0A0A' }}
        >
          <span className="font-mono text-[8px] text-[#334155] w-5 flex-shrink-0 text-right">#</span>
          <span className="font-mono text-[8px] text-[#334155] w-32 flex-shrink-0">SYSTEM</span>
          <span className="font-mono text-[8px] text-[#334155] flex-1">RISK</span>
          <span className="font-mono text-[8px] text-[#334155] w-12 text-right flex-shrink-0">%</span>
          <span className="font-mono text-[8px] text-[#334155] w-16 text-center flex-shrink-0">LEVEL</span>
          <span className="font-mono text-[8px] text-[#334155] flex-1">PREDICTED FAULT</span>
          <span className="font-mono text-[8px] text-[#334155] w-12 text-right flex-shrink-0">UPDATED</span>
        </div>

        {sorted.map((r, i) => (
          <RiskRow key={r.system_id} risk={r} index={i} />
        ))}
      </div>
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────

export default function MLIntelligencePage() {
  const {
    anomalies, clusters, failureRisks, atRiskCount,
    isLoading, error, lastUpdated, showOnlyAnomalies,
    setShowOnlyAnomalies, startAutoRefresh, load,
  } = useMLStore();

  useEffect(() => {
    const cleanup = startAutoRefresh();
    return cleanup;
  }, [startAutoRefresh]);

  const { anomalyCount, normalCount, modelVersion, uniqueModels } = useMemo(() => {
    const anomalyCount = anomalies.filter((a) => a.is_anomaly === true).length;
    const normalCount  = anomalies.length - anomalyCount;
    const models = [...new Set(anomalies.map((a) => a.model_version).filter(Boolean))];
    return { anomalyCount, normalCount, modelVersion: models[0] ?? '—', uniqueModels: models };
  }, [anomalies]);

  const clusterCount = useMemo(
    () => new Set(clusters.map((c) => c.cluster_id)).size,
    [clusters],
  );

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';

  const prometheusUrl = `${typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:8000'}/metrics-export`;

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

        {/* Prometheus metrics export link */}
        <a
          href={prometheusUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] hover:text-[#94A3B8] transition-colors"
          style={{ color: '#334155' }}
          title="Open Prometheus-compatible metrics export"
        >
          ↗ Prometheus Metrics
        </a>

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
        <KpiItem label="Systems monitored" value={anomalies.length} color="#E2E8F0" />
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
        <KpiItem label="Model" value={modelVersion} color="#8B5CF6" />
        <KpiItem
          label="At Risk (≥60%)"
          value={atRiskCount > 0 ? atRiskCount : '—'}
          color={atRiskCount > 0 ? '#DC2626' : '#475569'}
          dimColor={atRiskCount > 0 ? '#ff3b3040' : undefined}
        />
        {uniqueModels.length > 1 && (
          <div className="flex items-center px-3 font-mono text-[9px] ml-auto" style={{ color: '#475569' }}>
            {uniqueModels.length} model versions in window
          </div>
        )}
      </div>

      {/* ── Failure Risk Panel ── */}
      <FailureRiskPanel
        risks={failureRisks}
        atRiskCount={atRiskCount}
        isLoading={isLoading}
      />

      {/* ── Main grid: AnomalyPanel 8fr + ClusterPanel 4fr ── */}
      <div
        className="grid gap-1 flex-1 min-h-0"
        style={{ gridTemplateColumns: '8fr 4fr', minHeight: 0 }}
      >
        <AnomalyPanel
          anomalies={anomalies}
          isLoading={isLoading}
          error={error}
          lastUpdated={lastUpdated}
          showOnlyAnomalies={showOnlyAnomalies}
          onToggleFilter={setShowOnlyAnomalies}
        />
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
