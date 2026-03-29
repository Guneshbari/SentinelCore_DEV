/**
 * ActionSuggestions — heuristic operator playbook
 *
 * Maps fault_type → actionable remediation steps.
 * Rendered below RootCausePanel for selected incidents.
 * Severity-gated: only shows steps matching incident severity.
 */
import type { Incident } from '../../store/incidentStore';

interface Action {
  step:        string;
  command?:    string;  // example CLI/query to run
  priority:    'immediate' | 'investigate' | 'monitor';
}

const PLAYBOOK: Record<string, Action[]> = {
  'Auth Failure': [
    { step: 'Lock affected accounts temporarily',          priority: 'immediate' },
    { step: 'Check IP blocklist for 192.168.0.0/24',      command: 'netstat -an | grep :443', priority: 'immediate' },
    { step: 'Review auth service logs for brute-force patterns', priority: 'investigate' },
    { step: 'Enable rate-limiting on auth endpoint',      priority: 'investigate' },
    { step: 'Monitor login success rate over next 15m',   priority: 'monitor' },
  ],
  'High CPU': [
    { step: 'Identify top CPU-consuming processes',  command: 'tasklist /FI "CPU gt 30"', priority: 'immediate' },
    { step: 'Check for runaway services — consider restart', priority: 'immediate' },
    { step: 'Scale out to additional app nodes',     priority: 'investigate' },
    { step: 'Review recent deployments for CPU regression', priority: 'investigate' },
  ],
  'Disk Space': [
    { step: 'Identify largest directories',  command: 'du -sh /* | sort -rh | head -20', priority: 'immediate' },
    { step: 'Rotate/compress old log files', command: 'find /var/log -name "*.log" -mtime +7 | xargs gzip', priority: 'immediate' },
    { step: 'Check DB data volume growth rate',       priority: 'investigate' },
    { step: 'Alert on disk > 90% via pipeline rule',  priority: 'monitor' },
  ],
  'Service Crash': [
    { step: 'Check OOM killer logs',         command: 'dmesg | grep -i "oom\\|killed"', priority: 'immediate' },
    { step: 'Restart affected service',      command: 'systemctl restart <service>', priority: 'immediate' },
    { step: 'Review crash dump / core files',         priority: 'investigate' },
    { step: 'Check memory limits in service config',  priority: 'investigate' },
    { step: 'Monitor restart loop (> 3 restarts/h)',  priority: 'monitor' },
  ],
  'Network Drop': [
    { step: 'Verify physical/virtual NIC link state', command: 'ip link show', priority: 'immediate' },
    { step: 'Check BGP peer reachability',   command: 'ping -c 5 203.0.113.1', priority: 'immediate' },
    { step: 'Validate MTU settings (expect 1500)',    priority: 'investigate' },
    { step: 'Check for upstream ISP/DC status page',  priority: 'investigate' },
    { step: 'Monitor packet loss rate for 10m',       priority: 'monitor' },
  ],
};

const FALLBACK_ACTIONS: Action[] = [
  { step: 'Capture current system state snapshot',    priority: 'immediate' },
  { step: 'Review recent changes in change log',      priority: 'investigate' },
  { step: 'Escalate if not resolved within 15 min',   priority: 'monitor' },
];

const PRIORITY_COLOR = {
  immediate:   '#DC2626',
  investigate: '#F97316',
  monitor:     '#FACC15',
};

const PRIORITY_DOT_LABEL = {
  immediate:   '●',
  investigate: '●',
  monitor:     '○',
};

export default function ActionSuggestions({ incident }: { incident: Incident }) {
  // Match fault type — try exact first, then partial
  const actions = PLAYBOOK[incident.fault_type]
    ?? Object.entries(PLAYBOOK).find(([key]) =>
        incident.fault_type.toLowerCase().includes(key.toLowerCase())
      )?.[1]
    ?? FALLBACK_ACTIONS;

  // Filter: for LOW priority show only monitor; for HIGH show all; for MEDIUM skip monitor
  const filtered = actions.filter((a) => {
    if (incident.priority_label === 'LOW')    return a.priority === 'monitor';
    if (incident.priority_label === 'MEDIUM') return a.priority !== 'monitor';
    return true; // CRITICAL / HIGH → all steps
  });

  return (
    <div style={{ padding: '8px 12px 10px', background: '#06090f', borderBottom: '1px solid #1E293B' }}>
      {/* Header */}
      <div style={{
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      9,
        color:         '#334155',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom:  7,
        display:       'flex',
        alignItems:    'center',
        gap:           6,
      }}>
        <span>Action Playbook</span>
        <span style={{
          padding:      '0 5px',
          background:   '#0F172A',
          border:       '1px solid #1E293B',
          borderRadius: 2,
          fontSize:     8,
          color:        '#475569',
        }}>
          {incident.fault_type}
        </span>
      </div>

      {/* Action rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((action, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              {/* Priority indicator */}
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   9,
                color:      PRIORITY_COLOR[action.priority],
                flexShrink: 0,
                marginTop:  1,
              }}>
                {PRIORITY_DOT_LABEL[action.priority]}
              </span>

              {/* Step text */}
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize:   10,
                color:      '#94A3B8',
                lineHeight: '1.35',
                flex:       1,
              }}>
                {action.step}
              </span>

              {/* Priority label */}
              <span style={{
                fontFamily:    'JetBrains Mono, monospace',
                fontSize:      8,
                color:         PRIORITY_COLOR[action.priority],
                textTransform: 'uppercase',
                flexShrink:    0,
                opacity:       0.7,
              }}>
                {action.priority}
              </span>
            </div>

            {/* Command hint */}
            {action.command && (
              <div style={{
                marginLeft:  16,
                fontFamily:  'JetBrains Mono, monospace',
                fontSize:    9,
                color:       '#22C55E',
                background:  '#0A1208',
                padding:     '1px 6px',
                borderLeft:  '2px solid #166534',
                borderRadius: 1,
                overflow:    'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:  'nowrap',
              }}>
                $ {action.command}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
