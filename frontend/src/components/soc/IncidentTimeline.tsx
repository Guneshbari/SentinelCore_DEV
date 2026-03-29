/**
 * IncidentTimeline — ordered event sequence for a selected incident
 *
 * Pulls events from the signal store that match the incident's systems
 * within a ±10 min window, ordered by event_time.
 * Detects causal sequence: A before B → shows arrow hint.
 */
import { useMemo } from 'react';
import { useSignalStore } from '../../store/signalStore';
import type { Incident } from '../../store/incidentStore';
import type { Severity } from '../../types/telemetry';

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#DC2626',
  ERROR:    '#F97316',
  WARNING:  '#FACC15',
  INFO:     '#38BDF8',
};

const WINDOW_MS = 10 * 60 * 1000; // ±10 min around incident created_at

interface TimelineEntry {
  time:     string;   // HH:MM
  system:   string;
  fault:    string;
  severity: Severity;
  isCausal: boolean;  // first in a detected A→B causal pair
}

export default function IncidentTimeline({ incident }: { incident: Incident }) {
  const events = useSignalStore((s) => s.events);

  const entries: TimelineEntry[] = useMemo(() => {
    const incidentMs = new Date(incident.created_at).getTime();
    const systemSet  = new Set(incident.systems);

    const relevant = events.filter((ev) => {
      const evMs = new Date(ev.event_time).getTime();
      return (
        (systemSet.has(ev.system_id) || systemSet.has(ev.hostname)) &&
        Math.abs(evMs - incidentMs) <= WINDOW_MS
      );
    });

    // Sort chronologically
    const sorted = [...relevant].sort(
      (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime(),
    );

    // Causal pair detection: if fault_type changes between consecutive events, mark first as causal
    return sorted.slice(0, 12).map((ev, idx, arr) => {
      const next = arr[idx + 1];
      const isCausal = !!next && ev.fault_type !== next.fault_type &&
        new Date(next.event_time).getTime() - new Date(ev.event_time).getTime() < 120_000;

      const d = new Date(ev.event_time);
      const hhmm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

      return {
        time:     hhmm,
        system:   (ev.hostname ?? ev.system_id).split('.')[0],
        fault:    ev.fault_type,
        severity: ev.severity,
        isCausal,
      };
    });
  }, [events, incident]);

  if (entries.length === 0) {
    return (
      <div style={{ padding: '6px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#475569' }}>
        No matching events in ±10 min window
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {entries.map((entry, idx) => (
        <div key={idx}>
          <div
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        8,
              padding:    '2px 0',
            }}
          >
            {/* Timestamp */}
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   10,
              color:      '#475569',
              width:      36,
              flexShrink: 0,
            }}>
              {entry.time}
            </span>

            {/* Severity dot */}
            <span style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   SEV_COLOR[entry.severity],
              flexShrink:   0,
            }} />

            {/* System */}
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   10,
              color:      '#6B7C93',
              width:      80,
              flexShrink: 0,
              overflow:   'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {entry.system}
            </span>

            {/* Fault type */}
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize:   10,
              color:      SEV_COLOR[entry.severity],
              flex:       1,
            }}>
              {entry.fault} ↑
            </span>
          </div>

          {/* Causal arrow between entries */}
          {entry.isCausal && (
            <div style={{
              paddingLeft:  44,
              fontFamily:   'JetBrains Mono, monospace',
              fontSize:     9,
              color:        '#334155',
              lineHeight:   '14px',
            }}>
              ↳ caused
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
