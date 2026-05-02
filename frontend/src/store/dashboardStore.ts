import { create } from 'zustand';
import type {
  Severity,
  TelemetryEvent,
  SystemInfo,
  Alert,
  MetricPoint,
  SeverityCount,
  FaultTypeCount,
  SystemFailureCount,
  LiveStatusEntry,
} from '../types/telemetry';
import {
  fetchAlerts,
  fetchDashboardMetrics,
  fetchEvents,
  fetchFaultDistribution,
  fetchMetrics,
  fetchPipelineHealth,
  fetchSeverityDistribution,
  fetchSystemFailures,
  fetchSystems,
  fetchMLPredictions,
  fetchFeatureSnapshots,
  fetchSystemMetrics,
  fetchLiveStatus,
  RECENT_EVENTS_LIMIT,
  type DashboardMetrics,
  type PipelineHealthData,
  type SystemMetrics,
} from '../lib/api';
import { useSignalStore } from './signalStore';
import { useIncidentStore } from './incidentStore';
import { useForecastStore } from './forecastStore';
import { useAdaptiveAlertStore } from './adaptiveAlertStore';
import { useFeedbackStore } from './feedbackStore';
import { getWebSocketState, type WebSocketState } from '../lib/websocket';
import {
  type TimeRange,
  type AutoRefresh,
  type SystemEventSummary,
  TIME_RANGE_WINDOW_MINUTES,
  deriveFilteredEvents,
  deriveSystemSummaries,
  deriveFilteredAlerts,
  deriveFilteredSystems,
} from '../lib/dashboardDerived';

// ── Named keys for Promise.allSettled mapping ─────────────────────────────────
// Order here MUST match the array passed to Promise.allSettled in loadData().
// TypeScript will enforce key presence — adding/removing requires updating both.
const FETCH_KEYS = [
  'events',
  'systems',
  'alerts',
  'metrics',
  'dashboardMetrics',
  'severityDist',
  'faultDist',
  'systemFailures',
  'pipelineHealth',
  'mlPredictions',
  'featureSnapshots',
  'systemMetrics',
  'liveStatus',
] as const;

type FetchKey = typeof FETCH_KEYS[number];

interface DashboardState {
  // Config
  timeRange: TimeRange;
  autoRefresh: AutoRefresh;

  // Global filters
  selectedSystems: string[];
  selectedSeverities: Severity[];
  selectedFaultTypes: string[];
  searchQuery: string;

  // Live Data
  allEvents:         TelemetryEvent[];
  systems:           SystemInfo[];
  alerts:            Alert[];
  metrics:           MetricPoint[];
  dashboardMetrics:  DashboardMetrics;
  severityDistribution: SeverityCount[];
  faultDistribution:    FaultTypeCount[];
  systemFailures:       SystemFailureCount[];
  pipelineHealth:       PipelineHealthData | null;
  pipelineHealthError:  string | null;
  systemMetrics:        SystemMetrics;
  liveStatus:           LiveStatusEntry[];

  // Status
  isLoading:        boolean;
  apiError:         string | null;
  refreshTick:      number;
  recentEventsLimit: number;
  wsStatus:         WebSocketState;

  // Derived state (pre-computed to avoid full selector re-evaluations)
  filteredEvents:                TelemetryEvent[];
  filteredEventsBySystemId:      Record<string, TelemetryEvent[]>;
  filteredSystemEventSummaries:  Record<string, SystemEventSummary>;
  topSystemsByEventVolume:       { name: string; events: number }[];
  filteredAlerts:                Alert[];
  filteredSystems:               SystemInfo[];

  // Actions
  setTimeRange: (r: TimeRange) => void;
  setAutoRefresh: (r: AutoRefresh) => void;
  setSelectedSystems: (s: string[]) => void;
  setSelectedSeverities: (s: Severity[]) => void;
  setSelectedFaultTypes: (f: string[]) => void;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;
  loadData: () => Promise<void>;
  tickRefresh: () => void;
  syncWsStatus: () => void;
}

function deriveMetricsFromEvents(events: TelemetryEvent[], windowMinutes: number): MetricPoint[] {
  if (events.length === 0) return [];

  const now = Date.now();
  const windowMs = windowMinutes * 60_000;
  const recentEvents = events
    .map((event) => ({
      ...event,
      ts: new Date(event.event_time || event.ingested_at || 0).getTime(),
    }))
    .filter((event) => Number.isFinite(event.ts) && now - event.ts <= windowMs);

  if (recentEvents.length === 0) return [];

  const minTs = Math.min(...recentEvents.map((event) => event.ts));
  const maxTs = Math.max(...recentEvents.map((event) => event.ts));
  const spanMs = Math.max(maxTs - minTs, 1);

  let bucketSizeMs = 60 * 60_000;
  if (spanMs <= 15 * 60_000) {
    bucketSizeMs = 30_000;
  } else if (spanMs <= 60 * 60_000) {
    bucketSizeMs = 60_000;
  } else if (spanMs <= 6 * 60 * 60_000) {
    bucketSizeMs = 5 * 60_000;
  } else if (spanMs <= 24 * 60 * 60_000) {
    bucketSizeMs = 15 * 60_000;
  }

  const buckets = new Map<number, TelemetryEvent[]>();

  for (const event of recentEvents) {
    const bucket = Math.floor(event.ts / bucketSizeMs) * bucketSizeMs;
    const bucketEvents = buckets.get(bucket) ?? [];
    bucketEvents.push(event);
    buckets.set(bucket, bucketEvents);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([bucketTs, bucketEvents]) => {
      const countSeverity = (severity: Severity) =>
        bucketEvents.filter((event) => event.severity === severity).length;
      const avg = (selector: (event: TelemetryEvent) => number) =>
        bucketEvents.reduce((sum, event) => sum + (selector(event) || 0), 0) / (bucketEvents.length || 1);

      return {
        timestamp:      new Date(bucketTs).toISOString(),
        event_count:    bucketEvents.length,
        critical_count: countSeverity('CRITICAL'),
        error_count:    countSeverity('ERROR'),
        warning_count:  countSeverity('WARNING'),
        info_count:     countSeverity('INFO'),
        avg_cpu:     avg((event) => event.cpu_usage_percent),
        avg_memory:  avg((event) => event.memory_usage_percent),
        avg_disk_free: avg((event) => event.disk_free_percent),
      };
    });
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  timeRange:   '24h',
  autoRefresh: '30s',

  selectedSystems:    [],
  selectedSeverities: [],
  selectedFaultTypes: [],
  searchQuery: '',

  allEvents:           [],
  systems:             [],
  alerts:              [],
  metrics:             [],
  dashboardMetrics:    { total_events: 0, critical_events: 0, warning_events: 0 },
  severityDistribution: [],
  faultDistribution:    [],
  systemFailures:       [],
  pipelineHealth:       null,
  pipelineHealthError:  null,
  systemMetrics:        { avg_cpu: 0, avg_memory: 0, avg_disk: 0 },
  liveStatus:           [],

  isLoading:         true,
  apiError:          null,
  refreshTick:       0,
  recentEventsLimit: RECENT_EVENTS_LIMIT,
  wsStatus:          'disconnected',

  filteredEvents:               [],
  filteredEventsBySystemId:     {},
  filteredSystemEventSummaries: {},
  topSystemsByEventVolume:      [],
  filteredAlerts:               [],
  filteredSystems:              [],

  setTimeRange: (r) => {
    set({ timeRange: r });
    get().loadData();
  },
  setAutoRefresh: (r) => set({ autoRefresh: r }),

  setSelectedSystems:    (s) => set((state) => applyFilters({ ...state, selectedSystems: s })),
  setSelectedSeverities: (s) => set((state) => applyFilters({ ...state, selectedSeverities: s })),
  setSelectedFaultTypes: (f) => set((state) => applyFilters({ ...state, selectedFaultTypes: f })),
  setSearchQuery:        (q) => set((state) => applyFilters({ ...state, searchQuery: q })),

  clearFilters: () => set((state) => applyFilters({
    ...state,
    selectedSystems:    [],
    selectedSeverities: [],
    selectedFaultTypes: [],
    searchQuery: '',
  })),

  tickRefresh: () => {
    set((s) => ({ refreshTick: s.refreshTick + 1 }));
    get().loadData();
  },

  syncWsStatus: () => {
    set({ wsStatus: getWebSocketState() });
  },

  loadData: async () => {
    const s = get();
    set({ isLoading: true });

    try {
      const windowMin = TIME_RANGE_WINDOW_MINUTES[s.timeRange];

      // ── Named Promise.allSettled mapping ─────────────────────────────────
      // IMPORTANT: array order MUST match FETCH_KEYS order above.
      // Never use positional destructuring — always use the named map below.
      const settled = await Promise.allSettled([
        fetchEvents({                                                      // events
          limit:      RECENT_EVENTS_LIMIT,
          search:     s.searchQuery || undefined,
          system_id:  s.selectedSystems.length === 1 ? s.selectedSystems[0] : undefined,
          severity:   s.selectedSeverities.length === 1 ? s.selectedSeverities[0] : undefined,
          fault_type: s.selectedFaultTypes.length === 1 ? s.selectedFaultTypes[0] : undefined,
        }),
        fetchSystems(),                                                    // systems
        fetchAlerts(),                                                     // alerts
        fetchMetrics(undefined, undefined, windowMin),                     // metrics
        fetchDashboardMetrics(windowMin),                                  // dashboardMetrics
        fetchSeverityDistribution(windowMin),                              // severityDist
        fetchFaultDistribution(windowMin),                                 // faultDist
        fetchSystemFailures(6, windowMin),                                 // systemFailures
        fetchPipelineHealth(),                                             // pipelineHealth
        fetchMLPredictions(),                                              // mlPredictions
        fetchFeatureSnapshots(undefined, 500),                             // featureSnapshots
        fetchSystemMetrics(),                                              // systemMetrics  ← was silently missing
        fetchLiveStatus(),                                                 // liveStatus     ← new
      ]);

      // Map by key — never rely on index position
      const results = Object.fromEntries(
        FETCH_KEYS.map((key, i) => [key, settled[i]])
      ) as Record<FetchKey, PromiseSettledResult<unknown>>;

      const partialUpdate: Partial<DashboardState> = {};

      if (results.events.status === 'fulfilled')
        partialUpdate.allEvents = results.events.value as TelemetryEvent[];

      if (results.systems.status === 'fulfilled')
        partialUpdate.systems = results.systems.value as SystemInfo[];

      if (results.alerts.status === 'fulfilled')
        partialUpdate.alerts = results.alerts.value as Alert[];

      if (results.metrics.status === 'fulfilled')
        partialUpdate.metrics = results.metrics.value as MetricPoint[];

      if (results.dashboardMetrics.status === 'fulfilled')
        partialUpdate.dashboardMetrics = results.dashboardMetrics.value as DashboardMetrics;

      if (results.severityDist.status === 'fulfilled')
        partialUpdate.severityDistribution = results.severityDist.value as SeverityCount[];

      if (results.faultDist.status === 'fulfilled')
        partialUpdate.faultDistribution = results.faultDist.value as FaultTypeCount[];

      if (results.systemFailures.status === 'fulfilled')
        partialUpdate.systemFailures = results.systemFailures.value as SystemFailureCount[];

      if (results.pipelineHealth.status === 'fulfilled') {
        partialUpdate.pipelineHealth = results.pipelineHealth.value as PipelineHealthData;
        partialUpdate.pipelineHealthError = null;
      } else {
        partialUpdate.pipelineHealthError =
          results.pipelineHealth.reason instanceof Error
            ? results.pipelineHealth.reason.message
            : 'Unavailable';
      }

      if (results.systemMetrics.status === 'fulfilled')
        partialUpdate.systemMetrics = results.systemMetrics.value as SystemMetrics;

      if (results.liveStatus.status === 'fulfilled')
        partialUpdate.liveStatus = results.liveStatus.value as LiveStatusEntry[];

      // Sync WS status
      partialUpdate.wsStatus = getWebSocketState();

      // Sync inner stores — preserve stale data when fetch fails
      const mlPreds = results.mlPredictions.status === 'fulfilled'
        ? results.mlPredictions.value as ReturnType<typeof fetchMLPredictions> extends Promise<infer T> ? T : never
        : null;
      const snaps = results.featureSnapshots.status === 'fulfilled'
        ? results.featureSnapshots.value as ReturnType<typeof fetchFeatureSnapshots> extends Promise<infer T> ? T : never
        : null;
      const evts = partialUpdate.allEvents ?? s.allEvents;

      if (!partialUpdate.metrics || partialUpdate.metrics.length < 6) {
        partialUpdate.metrics = deriveMetricsFromEvents(evts, windowMin);
      }

      useSignalStore.getState().setEvents(evts);
      if (mlPreds !== null) useSignalStore.getState().setMLPredictions(mlPreds);
      if (snaps   !== null) useSignalStore.getState().setFeatureSnapshots(snaps);

      const resolvedMlPreds = mlPreds ?? useSignalStore.getState().mlPredictions;
      const resolvedSnaps   = snaps   ?? useSignalStore.getState().featureSnapshots;

      useForecastStore.getState().ingest(resolvedMlPreds, resolvedSnaps);
      const signals     = useSignalStore.getState().signals;
      const systemsList = partialUpdate.systems ?? s.systems;
      const avgCpu = systemsList.length > 0
        ? systemsList.reduce((sum, sys) => sum + sys.cpu_usage_percent, 0) / systemsList.length
        : 0;

      useIncidentStore.getState().deriveAll(signals, resolvedMlPreds, resolvedSnaps, avgCpu);

      const alertsData = partialUpdate.alerts ?? s.alerts;
      const avgResolutionMsByRule = useFeedbackStore.getState().avgResolutionMsByRule;
      useAdaptiveAlertStore.getState().process(alertsData, avgResolutionMsByRule);

      const nextState = { ...s, ...partialUpdate };
      set(applyFilters(nextState));

    } finally {
      set({ isLoading: false });
    }
  },
}));

// Apply filters over entire static state
function applyFilters(state: DashboardState): DashboardState {
  const filteredEvents = deriveFilteredEvents(
    state.allEvents, state.timeRange, state.selectedSystems,
    state.selectedSeverities, state.selectedFaultTypes, state.searchQuery,
  );

  const { filteredEventsBySystemId, filteredSystemEventSummaries, topSystemsByEventVolume } =
    deriveSystemSummaries(filteredEvents);

  const filteredAlerts = deriveFilteredAlerts(
    state.alerts, state.timeRange, state.selectedSystems,
    state.selectedSeverities, state.searchQuery,
  );

  const filteredSystems = deriveFilteredSystems(
    state.systems, state.selectedSystems, state.searchQuery,
  );

  return {
    ...state,
    filteredEvents,
    filteredEventsBySystemId,
    filteredSystemEventSummaries,
    topSystemsByEventVolume,
    filteredAlerts,
    filteredSystems,
  };
}
