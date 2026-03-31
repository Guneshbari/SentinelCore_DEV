/**
 * RootCausePanel — correlation analysis + incident timeline
 *
 * Displayed inside IncidentBoard when an incident is selected.
 * Layout:
 *   ROOT CAUSE (dominant, bold, colored)
 *   Confidence bar
 *   Affected systems
 *   Evidence lines
 *   ─── TIMELINE ───
 *   IncidentTimeline
 *
 * Dominant correlation = highest confidence, always shown first + highlighted.
 */
import { useMemo } from 'react';
import { useIncidentStore } from '../../store/incidentStore';
import type { Incident } from '../../store/incidentStore';
import type { Correlation } from '../../lib/correlationEngine';
import IncidentTimeline     from './IncidentTimeline';
import ForecastBadge        from './ForecastBadge';
import RemediationControls  from './RemediationControls';

function confidenceColor(c: number): string {
  if (c >= 0.80) return '#DC2626';
  if (c >= 0.65) return '#F97316';
  if (c >= 0.50) return '#FACC15';
  return '#94A3B8';
}

function ConfidenceBar({ value }: { value: number }) {
  const color = confidenceColor(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <div style={{
        flex:        1,
        height:      4,
        background:  '#1E293B',
        borderRadius: 2,
        overflow:    'hidden',
      }}>
        <div style={{
          width:      `${Math.round(value * 100)}%`,
          height:     '100%',
          background: color,
          transition: 'width 300ms ease',
        }} />
      </div>
      <span style={{
        fontFamily: 'Inter, monospace',
        fontSize:   12,
        fontWeight: 700,
        color,
        width:      36,
        textAlign:  'right',
        flexShrink: 0,
      }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function CorrelationBlock({
  correlation,
  isDominant,
}: {
  correlation: Correlation;
  isDominant: boolean;
}) {
  const color = confidenceColor(correlation.confidence);

  return (
    <div style={{
      marginBottom:  isDominant ? 12 : 4,
      padding:       isDominant ? '8px 10px' : '4px 6px',
      background:    isDominant ? '#111111' : 'transparent',
      borderLeft:    isDominant ? `3px solid ${color}` : '1px solid #262626',
      opacity:       isDominant ? 1 : 0.6,
      borderRadius:  isDominant ? 4 : 0,
    }}>
      {/* Root cause label */}
      <div style={{
        fontFamily:  'Inter, monospace',
        fontSize:    isDominant ? 14 : 11,
        fontWeight:  isDominant ? 700 : 500,
        color:       isDominant ? color : '#737373',
        marginBottom: 6,
        lineHeight:  '1.4',
      }}>
        {isDominant && <span style={{ marginRight: 6 }}>●</span>}
        {correlation.root_cause}
      </div>

      {/* Confidence bar */}
      <ConfidenceBar value={correlation.confidence} />

      {/* Affected systems */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        marginBottom: 6,
        flexWrap:     'wrap',
      }}>
        <span className="soc-label" style={{ marginRight: 4, fontSize: 10 }}>
          AFFECTED
        </span>
        {correlation.affected_systems.slice(0, 4).map((sys) => (
          <span
            key={sys}
            style={{
              fontFamily:    'Inter, monospace',
              fontSize:      11,
              color:         '#9CA3AF',
              background:    '#1A1A1A',
              padding:       '2px 6px',
              borderRadius:  2,
              border:        '1px solid #262626',
            }}
          >
            {sys.split('.')[0]}
          </span>
        ))}
        {correlation.affected_systems.length > 4 && (
          <span style={{ fontFamily: 'Inter, monospace', fontSize: 11, color: '#737373' }}>
            +{correlation.affected_systems.length - 4}
          </span>
        )}
      </div>

      {/* Evidence lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {correlation.evidence.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: 'Inter, monospace',
              fontSize:   11,
              color:      '#737373',
              paddingLeft: 8,
              borderLeft: '1px solid #262626',
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RootCausePanel({ incident }: { incident: Incident }) {
  const correlations = useIncidentStore((s) => s.correlations);

  // Filter correlations relevant to this incident's systems
  const relevant = useMemo(() => {
    const sysSet = new Set(incident.systems);
    return correlations.filter((c) =>
      c.affected_systems.some((s) => sysSet.has(s)) ||
      (c.root_system !== null && sysSet.has(c.root_system)),
    );
    // Already sorted by confidence desc from the store
  }, [correlations, incident.systems]);

  return (
    <div style={{ padding: '8px 12px', background: '#0A0A0A', borderBottom: '1px solid #111111' }}>

      {/* Forecast badge — hidden for nominal systems */}
      {incident.systems[0] && (
        <div style={{ marginBottom: 6 }}>
          <ForecastBadge systemId={incident.systems[0]} />
        </div>
      )}

      {/* ROOT CAUSE section */}
      <h4 className="soc-label" style={{ marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #1A1A1A' }}>
        Root Cause Analysis
      </h4>

      {relevant.length === 0 ? (
        <div style={{ fontFamily: 'Inter, monospace', fontSize: 11, color: '#737373', marginBottom: 8 }}>
          No correlated pattern detected — isolating single incident
        </div>
      ) : (
        relevant.map((corr, idx) => (
          <CorrelationBlock
            key={corr.correlation_id}
            correlation={corr}
            isDominant={idx === 0}   // Top correlation by confidence = dominant
          />
        ))
      )}

      {/* REMEDIATION section */}
      <RemediationControls incident={incident} />

      {/* TIMELINE section */}
      <div style={{
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      9,
        color:         '#334155',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin:        '8px 0 6px',
        borderTop:     '1px solid #1E293B',
        paddingTop:    6,
      }}>
        Event Timeline
      </div>
      <IncidentTimeline incident={incident} />
    </div>
  );
}
