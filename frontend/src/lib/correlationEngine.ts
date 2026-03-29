/**
 * correlationEngine — Multi-system causal pattern detection
 *
 * Pure functional module. No side effects. No network calls.
 * Input: incidents + system_metrics + feature_snapshots + ml_predictions
 * Output: Correlation[] sorted by confidence descending
 *
 * Pattern rules:
 *  1. DB + API failure co-occurrence → DB root
 *  2. CPU spike in snapshot precedes failure cluster → CPU exhaustion root
 *  3. Network errors on ≥ 2 systems → upstream/external cause
 *  4. All incidents share 1 system_id → isolated node failure
 *  5. Auth failures follow Service Crash in time → restart auth token invalidation
 */

import type { MLPrediction, FeatureSnapshot } from '../types/telemetry';

// ── Typed interfaces ─────────────────────────────────────────────────

/**
 * Minimal Incident shape for correlation — keeps this module free of circular imports.
 * incidentStore.Incident satisfies this shape.
 */
export interface CorrelationIncident {
  incident_id:      string;
  title:            string;
  fault_type:       string;
  systems:          string[];
  confidence:       number;
  predicted_fault?: string;
  anomaly_score?:   number;
  failure_prob?:    number;
  created_at:       string;
}

export interface Correlation {
  correlation_id:   string;
  root_cause:       string;
  root_system:      string | null;
  affected_systems: string[];
  confidence:       number;           // 0–1
  evidence:         string[];         // human-readable explanation lines
  pattern:          string;           // internal pattern tag
}

export interface CorrelationInputs {
  incidents:        CorrelationIncident[];
  mlPredictions:    MLPrediction[];
  featureSnapshots: FeatureSnapshot[];
  /** Average CPU across all systems — used for fleet-wide CPU spike detection */
  avgCpu:           number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

function hasType(incidents: CorrelationIncident[], ...keywords: string[]): CorrelationIncident[] {
  return incidents.filter((i) =>
    keywords.some((kw) =>
      i.fault_type.toLowerCase().includes(kw.toLowerCase()) ||
      (i.predicted_fault ?? '').toLowerCase().includes(kw.toLowerCase()),
    ),
  );
}

function sortByTime(incidents: CorrelationIncident[], dir: 'asc' | 'desc' = 'asc'): CorrelationIncident[] {
  return [...incidents].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return dir === 'asc' ? diff : -diff;
  });
}

// ── Pattern matchers ─────────────────────────────────────────────────

function detectDbApiCascade(inputs: CorrelationInputs): Correlation | null {
  const { incidents, featureSnapshots } = inputs;
  const dbInc  = hasType(incidents, 'db', 'disk');
  const apiInc = hasType(incidents, 'api', 'service', 'crash');

  if (dbInc.length === 0 || apiInc.length === 0) return null;

  const earliestDb  = sortByTime(dbInc)[0];
  const earliestApi = sortByTime(apiInc)[0];
  const isOrdered   = new Date(earliestDb.created_at).getTime() <= new Date(earliestApi.created_at).getTime();

  const dbSnap = featureSnapshots.find(
    (s) => earliestDb.systems.includes(s.system_id) && s.critical_count > 5,
  );

  const baseConf   = isOrdered ? 0.72 : 0.48;
  const snapBoost  = dbSnap ? 0.10 : 0;
  const confidence = Math.min(baseConf + snapBoost, 1);

  const evidence: string[] = [
    `${earliestDb.fault_type} on [${earliestDb.systems.join(', ')}] started first`,
    `${earliestApi.fault_type} failures followed ${minutesBetween(earliestDb.created_at, earliestApi.created_at).toFixed(1)}m later`,
  ];
  if (dbSnap) evidence.push(`Feature snapshot: ${dbSnap.critical_count} critical events on ${dbSnap.system_id}`);

  return {
    correlation_id:   'corr-db-api-cascade',
    root_cause:       `${earliestDb.fault_type} on ${earliestDb.systems[0] ?? 'DB'} caused downstream API failures`,
    root_system:      earliestDb.systems[0] ?? null,
    affected_systems: [...new Set([...dbInc.flatMap((i) => i.systems), ...apiInc.flatMap((i) => i.systems)])],
    confidence,
    evidence,
    pattern:          'db_api_cascade',
  };
}

function detectCpuExhaustion(inputs: CorrelationInputs): Correlation | null {
  const { incidents, featureSnapshots, avgCpu } = inputs;
  if (avgCpu < 80) return null;

  const highCpuSnaps = featureSnapshots.filter(
    (s) => s.cpu_usage_percent > 85,
  );
  if (highCpuSnaps.length === 0) return null;

  const affectedIds = new Set(highCpuSnaps.map((s) => s.system_id));
  const incWithCpu  = incidents.filter((i: CorrelationIncident) =>
    i.systems.some((sys: string) => affectedIds.has(sys)),
  );
  if (incWithCpu.length === 0) return null;

  const evidence: string[] = [
    `Fleet avg CPU: ${avgCpu.toFixed(0)}% (threshold: 80%)`,
    ...highCpuSnaps.map(
      (s) => `${s.system_id}: CPU ${s.cpu_usage_percent.toFixed(0)}%, dominant fault: ${s.dominant_fault_type}`,
    ),
  ];

  return {
    correlation_id:   'corr-cpu-exhaustion',
    root_cause:       'CPU exhaustion causing cascading service degradation',
    root_system:      highCpuSnaps[0].system_id,
    affected_systems: incWithCpu.flatMap((i) => i.systems),
    confidence:       Math.min(0.65 + (avgCpu - 80) / 100, 0.90),
    evidence,
    pattern:          'cpu_exhaustion',
  };
}

function detectNetworkDegradation(inputs: CorrelationInputs): Correlation | null {
  const { incidents } = inputs;
  const netInc = hasType(incidents, 'network', 'drop');
  if (netInc.length < 2) return null;

  const affectedSystems = [...new Set(netInc.flatMap((i) => i.systems))];
  if (affectedSystems.length < 2) return null;

  return {
    correlation_id:   'corr-network-degradation',
    root_cause:       'External network degradation affecting multiple systems',
    root_system:      null,
    affected_systems: affectedSystems,
    confidence:       Math.min(0.55 + netInc.length * 0.05, 0.90),
    evidence: [
      `Network incidents on ${affectedSystems.length} systems simultaneously`,
      'Suggests upstream router/BGP or datacenter-level connectivity issue',
    ],
    pattern: 'network_degradation',
  };
}

function detectIsolatedNodeFailure(inputs: CorrelationInputs): Correlation | null {
  const { incidents, mlPredictions } = inputs;
  if (incidents.length < 2) return null;

  const systemSets     = incidents.map((i) => new Set(i.systems));
  const commonSystems  = [...systemSets[0]].filter((s) => systemSets.every((set) => set.has(s)));
  if (commonSystems.length !== 1) return null;

  const isolatedSys = commonSystems[0];
  const mlForSys    = mlPredictions.find((p) => p.system_id === isolatedSys);
  const mlBoost     = mlForSys ? mlForSys.failure_probability * 0.15 : 0;

  const evidence: string[] = [
    `All ${incidents.length} incidents share single system: ${isolatedSys}`,
  ];
  if (mlForSys) {
    evidence.push(
      `ML failure probability: ${(mlForSys.failure_probability * 100).toFixed(0)}% — predicted: ${String(mlForSys.predicted_fault ?? 'Unknown')}`,
    );
  }

  return {
    correlation_id:   'corr-isolated-node',
    root_cause:       `Isolated node failure: ${isolatedSys}`,
    root_system:      isolatedSys,
    affected_systems: [isolatedSys],
    confidence:       Math.min(0.70 + mlBoost, 0.95),
    evidence,
    pattern:          'isolated_node',
  };
}

function detectAuthAfterCrash(inputs: CorrelationInputs): Correlation | null {
  const { incidents } = inputs;
  const crashInc = hasType(incidents, 'crash', 'service');
  const authInc  = hasType(incidents, 'auth');

  if (crashInc.length === 0 || authInc.length === 0) return null;

  const earliestCrash = sortByTime(crashInc)[0];
  const latestAuth    = sortByTime(authInc, 'desc')[0];

  const crashFirst   = new Date(earliestCrash.created_at).getTime() <= new Date(latestAuth.created_at).getTime();
  const withinWindow = minutesBetween(earliestCrash.created_at, latestAuth.created_at) <= 10;

  if (!crashFirst || !withinWindow) return null;

  const crashTime = new Date(earliestCrash.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return {
    correlation_id:   'corr-auth-after-crash',
    root_cause:       `Service crash on ${earliestCrash.systems[0] ?? 'service'} caused auth token invalidation`,
    root_system:      earliestCrash.systems[0] ?? null,
    affected_systems: [...new Set([...crashInc.flatMap((i) => i.systems), ...authInc.flatMap((i) => i.systems)])],
    confidence:       0.68,
    evidence: [
      `${earliestCrash.fault_type} on ${earliestCrash.systems[0] ?? 'service'} at ${crashTime}`,
      `Auth failures followed ${minutesBetween(earliestCrash.created_at, latestAuth.created_at).toFixed(1)}m later`,
      'Service restart likely invalidated in-flight sessions / JWT refresh tokens',
    ],
    pattern: 'auth_after_crash',
  };
}

// ── Main correlate() ─────────────────────────────────────────────────

export function correlate(inputs: CorrelationInputs): Correlation[] {
  if (inputs.incidents.length === 0) return [];

  const candidates = [
    detectDbApiCascade(inputs),
    detectCpuExhaustion(inputs),
    detectNetworkDegradation(inputs),
    detectIsolatedNodeFailure(inputs),
    detectAuthAfterCrash(inputs),
  ];

  return candidates
    .filter((c): c is Correlation => c !== null)
    .sort((a, b) => b.confidence - a.confidence);
}
