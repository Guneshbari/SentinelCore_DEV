/**
 * IncidentBoard — Operator Intelligence Dashboard
 *
 * Sources: incidentStore (priority-sorted, lifecycle-aware)
 * Features:
 *  - Priority labels (CRITICAL/HIGH/MEDIUM/LOW) + score
 *  - Trend indicators (↑ rising / → stable / ↓ falling)
 *  - Lifecycle controls (ACK / RESOLVE / REOPEN)
 *  - Noise reduction: LOW priority incidents collapsed unless toggled
 *  - Impact summary in expanded row
 *  - RootCausePanel + ActionSuggestions on expand
 */
import React, { useCallback, useMemo } from 'react';
import { useIncidentStore, type Incident, type IncidentTrigger, type PriorityLabel, type TrendDirection, type IncidentLifecycle } from '../../store/incidentStore';
import { useUIStore }  from '../../store/uiStore';
import type { Severity } from '../../types/telemetry';
import RootCausePanel   from './RootCausePanel';
import ActionSuggestions from './ActionSuggestions';
import { ENABLE_PRETEXT_OPTIMIZATION, measureText, useDebouncedElementWidth } from '../../utils/textLayout';

// ── Style maps ───────────────────────────────────────────────────────



const SEV_BORDER: Record<Severity, string> = {
  CRITICAL: '#DC2626', ERROR: '#F97316', WARNING: '#FACC15', INFO: '#38BDF8',
};

const PRIORITY_COLOR: Record<PriorityLabel, string> = {
  CRITICAL: '#DC2626', HIGH: '#F97316', MEDIUM: '#FACC15', LOW: '#475569',
};

const TRIGGER_LABEL: Record<IncidentTrigger, string> = {
  signal: 'SIG', anomaly: 'ML·A', failure_prob: 'ML·R',
};

const TRIGGER_COLOR: Record<IncidentTrigger, string> = {
  signal: '#38BDF8', anomaly: '#A855F7', failure_prob: '#EC4899',
};

const TREND_GLYPH: Record<TrendDirection, string>  = { rising: '↑', stable: '→', falling: '↓' };
const TREND_COLOR: Record<TrendDirection, string>   = { rising: '#DC2626', stable: '#475569', falling: '#22C55E' };

const LIFECYCLE_LABEL: Record<IncidentLifecycle, string> = {
  OPEN: 'OPEN', ACKNOWLEDGED: 'ACK', RESOLVED: 'RES',
};

const LIFECYCLE_COLOR: Record<IncidentLifecycle, string> = {
  OPEN: '#F97316', ACKNOWLEDGED: '#38BDF8', RESOLVED: '#22C55E',
};
const INCIDENT_ROW_MIN_HEIGHT = 40;
const INCIDENT_TITLE_FONT = '13px Inter';
const INCIDENT_TITLE_LINE_HEIGHT = 18;

// ── Sub-components ───────────────────────────────────────────────────

function SevBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`soc-badge soc-badge-${severity.toLowerCase()} w-[64px] justify-center`}>
      {severity}
    </span>
  );
}

function PriorityBadge({ label, score }: { label: PriorityLabel; score: number }) {
  const color = PRIORITY_COLOR[label];
  return (
    <span style={{
      fontFamily: 'Inter, monospace', fontSize: 11, color,
      background: `${color}18`, border: `1px solid ${color}44`,
      padding: '2px 6px', borderRadius: 2, flexShrink: 0, letterSpacing: '0.04em',
      display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700,
    }}>
      {label === 'CRITICAL' ? '⚡' : label === 'HIGH' ? '▲' : label === 'MEDIUM' ? '■' : '▽'}
      {label}
      <span style={{ color: `${color}`, fontSize: 11, opacity: 0.8 }}>{score}</span>
    </span>
  );
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  if (trend === 'stable') return null;
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      color: TREND_COLOR[trend], flexShrink: 0, lineHeight: 1,
    }} title={`Trend: ${trend}`}>
      {TREND_GLYPH[trend]}
    </span>
  );
}

// Compact impact row shown inside expanded incident
function ImpactRow({ incident }: { incident: Incident }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '6px 12px',
      background: '#0A1018', borderBottom: '1px solid #1E293B',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span className="soc-label" style={{ alignSelf: 'center' }}>IMPACT</span>
      <ImpactKpi label="SYSTEMS" value={String(incident.impact.systems_affected)}
        color={incident.impact.systems_affected > 2 ? '#F97316' : '#94A3B8'} />
      <ImpactKpi label="AVG CPU" value={incident.impact.avg_cpu}
        color={parseInt(incident.impact.avg_cpu) > 80 ? '#DC2626' : '#F97316'} />
      <ImpactKpi label="ERR DELTA" value={incident.impact.error_rate_delta}
        color={parseInt(incident.impact.error_rate_delta) > 20 ? '#DC2626' : '#FACC15'} />
      <ImpactKpi label="FAULT" value={incident.impact.dominant_fault} color="#6B7C93" />
    </div>
  );
}

function ImpactKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span className="soc-label">{label}</span>
      <span className="soc-value" style={{ color }}>{value}</span>
    </div>
  );
}

// Lifecycle action buttons
function LifecycleControls({ incident }: { incident: Incident }) {
  const acknowledge = useIncidentStore((s) => s.acknowledgeIncident);
  const resolve     = useIncidentStore((s) => s.resolveIncident);
  const reopen      = useIncidentStore((s) => s.reopenIncident);

  const btn = (label: string, onClick: () => void, color: string) => (
    <button
      key={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      9,
        fontWeight:    600,
        color,
        background:    'transparent',
        border:        `1px solid ${color}55`,
        borderRadius:  2,
        padding:       '2px 8px',
        cursor:        'pointer',
        letterSpacing: '0.04em',
        transition:    'background 80ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${color}22`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      display: 'flex', gap: 6, padding: '5px 12px',
      background: '#08101a', borderBottom: '1px solid #1E293B',
      alignItems: 'center',
    }}>
      <span className="soc-label" style={{ marginRight: 4 }}>
        LIFECYCLE
      </span>
      {/* Status pill */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700,
        color: LIFECYCLE_COLOR[incident.lifecycle], marginRight: 8,
      }}>
        {LIFECYCLE_LABEL[incident.lifecycle]}
        {incident.acknowledged_at && incident.lifecycle === 'ACKNOWLEDGED' && (
          <span style={{ color: '#334155', fontWeight: 400, marginLeft: 4 }}>
            {new Date(incident.acknowledged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        )}
      </span>

      {incident.lifecycle === 'OPEN' && (
        <>
          {btn('ACK', () => acknowledge(incident.incident_id), '#38BDF8')}
          {btn('RESOLVE', () => resolve(incident.incident_id), '#22C55E')}
        </>
      )}
      {incident.lifecycle === 'ACKNOWLEDGED' && (
        <>
          {btn('RESOLVE', () => resolve(incident.incident_id), '#22C55E')}
          {btn('REOPEN',  () => reopen(incident.incident_id),  '#F97316')}
        </>
      )}
      {incident.lifecycle === 'RESOLVED' && (
        btn('REOPEN', () => reopen(incident.incident_id), '#F97316')
      )}
    </div>
  );
}

// Main incident row
const IncidentRow = React.memo(({
  incident,
  isSelected,
  onClick,
  rowHeight,
}: {
  incident:   Incident;
  isSelected: boolean;
  onClick:    () => void;
  rowHeight: number;
}) => {
  const lifecycleOpacity = incident.lifecycle === 'RESOLVED' ? 0.45 : 1;
  return (
    <div
      id={`incident-${incident.incident_id}`}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px', minHeight: rowHeight, flexShrink: 0,
        borderBottom: '1px solid #151f2e',
        borderLeft: `2px solid ${SEV_BORDER[incident.severity]}`,
        background: isSelected ? '#1E3A5F' : 'transparent',
        cursor: 'pointer', transition: 'background 80ms',
        opacity: lifecycleOpacity,
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#162032'; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <SevBadge severity={incident.severity} />
      <PriorityBadge label={incident.priority_label} score={incident.priority_score} />

      {/* Trigger badge */}
      <span style={{
        fontFamily: 'Inter, monospace', fontSize: 10, fontWeight: 600,
        color: TRIGGER_COLOR[incident.trigger],
        background: `${TRIGGER_COLOR[incident.trigger]}1A`, border: `1px solid ${TRIGGER_COLOR[incident.trigger]}40`,
        padding: '3px 8px', borderRadius: 2, flexShrink: 0, letterSpacing: '0.05em'
      }}>
        {TRIGGER_LABEL[incident.trigger]}
      </span>

      {/* Title */}
      <span style={{
        fontFamily: 'Inter, monospace', fontSize: 13, fontWeight: 500,
        color: '#FFFFFF', flex: 1, overflow: 'hidden', paddingLeft: 8,
        whiteSpace: 'normal', lineHeight: '18px',
      }}>
        {incident.title}
      </span>

      {/* Trend */}
      <TrendBadge trend={incident.trend} />

      {/* Lifecycle */}
      <span style={{
        fontFamily: 'Inter, monospace', fontSize: 11, fontWeight: 600,
        color: LIFECYCLE_COLOR[incident.lifecycle], flexShrink: 0, width: 32,
      }}>
        {LIFECYCLE_LABEL[incident.lifecycle]}
      </span>

      {/* Confidence */}
      <span style={{
        fontFamily: 'Inter, monospace', fontSize: 13,
        fontWeight: incident.confidence >= 0.75 ? 700 : 500,
        color: incident.confidence >= 0.75 ? '#FF3B30' : incident.confidence >= 0.5 ? '#FF8A00' : '#9CA3AF',
        flexShrink: 0, width: 36, textAlign: 'right',
      }}>
        {(incident.confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────

export default function IncidentBoard() {
  const allIncidents    = useIncidentStore((s) => s.incidents);
  const correlations    = useIncidentStore((s) => s.correlations);
  const healthIndex     = useIncidentStore((s) => s.systemHealthIndex);
  const showLow         = useIncidentStore((s) => s.showLowPriority);
  const toggleLow       = useIncidentStore((s) => s.toggleLowPriority);
  const selectedId      = useUIStore((s) => s.selectedIncidentId);
  const setSelectedId   = useUIStore((s) => s.setSelectedIncidentId);
  const setHighlighted  = useUIStore((s) => s.setHighlightedSystems);
  const [listRef, listWidth] = useDebouncedElementWidth<HTMLDivElement>(90);

  // Noise reduction: collapse LOW priority unless toggled
  const incidents = useMemo(
    () => showLow ? allIncidents : allIncidents.filter((i) => i.priority_label !== 'LOW'),
    [allIncidents, showLow],
  );

  const lowCount = useMemo(() => allIncidents.filter((i) => i.priority_label === 'LOW').length, [allIncidents]);
  const incidentTitleWidth = Math.max(listWidth - 360, 180);
  const incidentRowHeights = useMemo(
    () => incidents.reduce<Record<string, number>>((acc, incident) => {
      if (!ENABLE_PRETEXT_OPTIMIZATION) {
        acc[incident.incident_id] = INCIDENT_ROW_MIN_HEIGHT;
        return acc;
      }
      const measured = measureText(incident.title, incidentTitleWidth, {
        font: INCIDENT_TITLE_FONT,
        lineHeight: INCIDENT_TITLE_LINE_HEIGHT,
      });
      acc[incident.incident_id] = Math.max(INCIDENT_ROW_MIN_HEIGHT, measured.height + 16);
      return acc;
    }, {}),
    [incidentTitleWidth, incidents],
  );

  const handleClick = useCallback((incident: Incident) => {
    const newId = selectedId === incident.incident_id ? null : incident.incident_id;
    setSelectedId(newId);
    setHighlighted(newId ? incident.systems : []);
  }, [selectedId, setSelectedId, setHighlighted]);

  const selectedIncident = selectedId ? incidents.find((i) => i.incident_id === selectedId) ?? null : null;

  const critCount = incidents.filter((i) => i.severity === 'CRITICAL').length;
  const mlCount   = incidents.filter((i) => i.trigger !== 'signal').length;
  const risingCount = incidents.filter((i) => i.trend === 'rising').length;

  // Health index color
  const hiColor = healthIndex >= 80 ? '#22C55E' : healthIndex >= 55 ? '#FACC15' : healthIndex >= 30 ? '#F97316' : '#DC2626';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden', background: '#0A0F14', border: '1px solid #1E293B',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: 28, flexShrink: 0,
        borderBottom: '1px solid #1E293B', background: '#0F172A',
      }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#E2E8F0', fontWeight: 700, letterSpacing: '0.08em' }}>
          INCIDENT BOARD
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* System Health Index */}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: hiColor, fontWeight: 700 }} title="System Health Index">
            SHI:{healthIndex}
          </span>
          {critCount > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#DC2626', fontWeight: 700 }}>
              {critCount} CRIT
            </span>
          )}
          {risingCount > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#DC2626' }}>
              {risingCount}↑
            </span>
          )}
          {mlCount > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#A855F7' }}>
              {mlCount} ML
            </span>
          )}
          {correlations.length > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#38BDF8' }}>
              {correlations.length} corr
            </span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto auto 1fr auto auto auto',
        gap: 6, padding: '0 10px', height: 20, alignItems: 'center',
        background: '#080d16', flexShrink: 0, borderBottom: '1px solid #1E293B',
      }}>
        {['SEV', 'PRI', 'SRC', 'TITLE', '↑', 'LC', 'CONF'].map((h) => (
          <span key={h} className="soc-label">
            {h}
          </span>
        ))}
      </div>

      {/* Incident rows */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
        {incidents.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#22C55E' }}>● NO ACTIVE INCIDENTS</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#334155' }}>All systems nominal</span>
          </div>
        ) : (
          incidents.map((incident) => (
            <div key={incident.incident_id}>
              <IncidentRow
                incident={incident}
                isSelected={selectedId === incident.incident_id}
                onClick={() => handleClick(incident)}
                rowHeight={incidentRowHeights[incident.incident_id] ?? INCIDENT_ROW_MIN_HEIGHT}
              />
              {selectedId === incident.incident_id && selectedIncident && (
                <>
                  <ImpactRow incident={selectedIncident} />
                  <LifecycleControls incident={selectedIncident} />
                  <RootCausePanel incident={selectedIncident} />
                  <ActionSuggestions incident={selectedIncident} />
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer with noise reduction toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: 22, flexShrink: 0,
        borderTop: '1px solid #1E293B', background: '#080d16',
      }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#334155' }}>
          {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
          {mlCount > 0 && ` · ${mlCount} ML`}
        </span>

        {lowCount > 0 && (
          <button
            onClick={toggleLow}
            style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
              color: showLow ? '#FACC15' : '#475569',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {showLow ? `▼ hide ${lowCount} low-pri` : `▶ +${lowCount} low-pri`}
          </button>
        )}
      </div>
    </div>
  );
}
