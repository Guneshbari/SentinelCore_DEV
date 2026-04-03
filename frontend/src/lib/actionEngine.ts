import { executeSystemCommand } from './api';

/**
 * actionEngine - Heuristic operator playbook (extended)
 *
 * Maps fault patterns to actionable remediation steps.
 * Includes executable remediation hooks and effectiveness-based ranking.
 */

export interface RemediationHook {
  id: string;
  label: string;
  confirm: string;
}

export interface Action {
  step: string;
  command?: string;
  priority: 'immediate' | 'investigate' | 'monitor';
  remediation?: RemediationHook;
}

export interface RemediationResult {
  success: boolean;
  log: string;
}

const HOOKS: Record<string, RemediationHook> = {
  'restart-service': {
    id: 'restart-service',
    label: 'Restart Service',
    confirm: 'Restart the affected service? Ensure no active transactions are currently in flight.',
  },
  'scale-instance': {
    id: 'scale-instance',
    label: 'Scale Instance',
    confirm: 'Scale compute capacity for this system? This will add resources to the cluster.',
  },
  'check-db-connections': {
    id: 'check-db-connections',
    label: 'Check DB Connections',
    confirm: 'Run a DB connection health check? This is a read-only diagnostic - no writes will occur.',
  },
};

const PLAYBOOK: Record<string, Action[]> = {
  cpu: [
    { step: 'Scale instance / add nodes to cluster', priority: 'immediate', remediation: HOOKS['scale-instance'] },
    { step: 'Identify top CPU-consuming processes', command: 'top -b -n 1 | head -n 15', priority: 'immediate' },
    { step: 'Review recent deployments for regression', priority: 'investigate' },
  ],
  db: [
    { step: 'Check active database connections', command: 'show processlist;', priority: 'immediate', remediation: HOOKS['check-db-connections'] },
    { step: 'Verify connection pool limits', priority: 'investigate' },
    { step: 'Monitor slow queries', priority: 'monitor' },
  ],
  network: [
    { step: 'Check upstream physical connectivity', command: 'ping -c 4 8.8.8.8', priority: 'immediate' },
    { step: 'Verify firewall drop rules', priority: 'investigate' },
    { step: 'Monitor packet loss rate', priority: 'monitor' },
  ],
  auth: [
    { step: 'Review auth service brute-force logs', priority: 'immediate' },
    { step: 'Check token validity expiration metrics', priority: 'investigate' },
  ],
  crash: [
    { step: 'Check system logs for OOM killer', command: 'dmesg -T | grep -i oom', priority: 'immediate' },
    { step: 'Restart affected service', command: 'systemctl restart service', priority: 'immediate', remediation: HOOKS['restart-service'] },
  ],
  anomaly: [
    { step: 'Investigate ML-detected spike context', priority: 'immediate', remediation: HOOKS['restart-service'] },
    { step: 'Compare feature snapshots against baseline', priority: 'investigate' },
  ],
  disk: [
    { step: 'Identify large files / log growth', command: 'du -sh /* | sort -rh | head -20', priority: 'immediate' },
    { step: 'Rotate or archive aged logs', priority: 'investigate' },
    { step: 'Monitor disk write rate', priority: 'monitor' },
  ],
};

const FALLBACK_ACTIONS: Action[] = [
  { step: 'Capture current system state snapshot', priority: 'immediate' },
  { step: 'Review recent changes in change log', priority: 'investigate' },
  { step: 'Escalate if not resolved within 15 min', priority: 'monitor' },
];

export function getSuggestedActions(
  faultType: string,
  isAnomaly: boolean,
  effectivenessRates?: Record<string, number>,
): Action[] {
  const faultLower = faultType.toLowerCase();
  let actions: Action[];

  if (isAnomaly) {
    actions = PLAYBOOK.anomaly;
  } else {
    const match = Object.entries(PLAYBOOK).find(([key]) => faultLower.includes(key));
    actions = match ? match[1] : FALLBACK_ACTIONS;
  }

  if (effectivenessRates && Object.keys(effectivenessRates).length > 0) {
    return [...actions].sort((a, b) => {
      const rateA = a.remediation ? (effectivenessRates[a.remediation.id] ?? 0) : 0;
      const rateB = b.remediation ? (effectivenessRates[b.remediation.id] ?? 0) : 0;
      return rateB - rateA;
    });
  }

  return actions;
}

const COOLDOWN_MS = 30_000;

export async function executeRemediation(
  systemId: string,
  hookId: string,
  cooldownMap: Map<string, number>,
  inFlightSet: Set<string>,
  onComplete?: (hookId: string, result: RemediationResult) => void,
): Promise<RemediationResult> {
  const lastRun = cooldownMap.get(hookId);
  if (lastRun !== undefined) {
    const elapsed = Date.now() - lastRun;
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return { success: false, log: `Cooldown active - ready in ${remaining}s` };
    }
  }

  if (inFlightSet.has(hookId)) {
    return { success: false, log: 'Already executing - please wait' };
  }

  const hook = HOOKS[hookId];
  if (!hook) {
    return { success: false, log: `Unknown remediation hook: ${hookId}` };
  }

  if (!systemId) {
    return { success: false, log: 'No target system available for this remediation' };
  }

  inFlightSet.add(hookId);

  const commandMap: Record<string, string> = {
    'restart-service': 'Restart-Service -Name SentinelCoreAgent',
    'scale-instance': 'Scale-Out SentinelCore workload',
    'check-db-connections': 'Invoke-SentinelDbHealthCheck',
  };

  try {
    const response = await executeSystemCommand(systemId, commandMap[hookId] ?? hook.label);
    const result: RemediationResult = {
      success: response.success,
      log: response.output,
    };
    cooldownMap.set(hookId, Date.now());
    onComplete?.(hookId, result);
    return result;
  } catch (error) {
    const result: RemediationResult = {
      success: false,
      log: error instanceof Error ? error.message : `${hook.label} failed`,
    };
    onComplete?.(hookId, result);
    return result;
  } finally {
    inFlightSet.delete(hookId);
  }
}
