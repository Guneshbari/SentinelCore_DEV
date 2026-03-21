import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from 'react';
import type {
  Severity,
  TelemetryEvent,
  SystemInfo,
  Alert,
  MetricPoint,
  SeverityCount,
  FaultTypeCount,
  SystemFailureCount,
} from '../types/telemetry';
import {
  fetchAlerts,
  fetchDashboardMetrics,
  fetchEvents,
  fetchFaultDistribution,
  fetchMetrics,
  fetchSeverityDistribution,
  fetchSystemFailures,
  fetchSystems,
  RECENT_EVENTS_LIMIT,
  type DashboardMetrics,
} from '../lib/api';

// ── Types ───────────────────────────────────────────────
export type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h';
export type AutoRefresh = 'off' | '5s' | '10s' | '30s' | '1m';

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

const TIME_RANGE_WINDOW_MINUTES: Record<TimeRange, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
};

const REFRESH_MS: Record<AutoRefresh, number | null> = {
  off: null,
  '5s': 5_000,
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
};

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '5m': 'Last 5 min',
  '15m': 'Last 15 min',
  '1h': 'Last 1 hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
};

export const REFRESH_LABELS: Record<AutoRefresh, string> = {
  off: 'Off',
  '5s': '5s',
  '10s': '10s',
  '30s': '30s',
  '1m': '1m',
};

interface DashboardState {
  // Time range
  timeRange: TimeRange;
  setTimeRange: (r: TimeRange) => void;
  autoRefresh: AutoRefresh;
  setAutoRefresh: (r: AutoRefresh) => void;

  // Global filters
  selectedSystems: string[];
  setSelectedSystems: (s: string[]) => void;
  selectedSeverities: Severity[];
  setSelectedSeverities: (s: Severity[]) => void;
  selectedFaultTypes: string[];
  setSelectedFaultTypes: (f: string[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Live data
  allEvents: TelemetryEvent[];
  systems: SystemInfo[];
  alerts: Alert[];
  metrics: MetricPoint[];
  dashboardMetrics: DashboardMetrics;
  severityDistribution: SeverityCount[];
  faultDistribution: FaultTypeCount[];
  systemFailures: SystemFailureCount[];
  isLoading: boolean;
  apiError: string | null;
  recentEventsLimit: number;
  canUseAggregateViews: boolean;

  // Computed
  filteredEvents: TelemetryEvent[];
  filteredAlerts: Alert[];
  filteredSystems: SystemInfo[];
  refreshTick: number;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

const DashboardContext = createContext<DashboardState | null>(null);

// ── Provider ─────────────────────────────────────────────
interface DashboardProviderProps {
  readonly children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState<AutoRefresh>('10s');
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([]);
  const [selectedFaultTypes, setSelectedFaultTypes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live data state
  const [allEvents, setAllEvents] = useState<TelemetryEvent[]>([]);
  const [systems, setSystems] = useState<SystemInfo[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    total_events: 0,
    critical_events: 0,
    warning_events: 0,
  });
  const [severityDistribution, setSeverityDistribution] = useState<SeverityCount[]>([]);
  const [faultDistribution, setFaultDistribution] = useState<FaultTypeCount[]>([]);
  const [systemFailures, setSystemFailures] = useState<SystemFailureCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const aggregateWindowMinutes = TIME_RANGE_WINDOW_MINUTES[timeRange];

  // Fetch all data from the API
  const loadData = useCallback(async () => {
    try {
      const [
        eventsResult,
        systemsResult,
        alertsResult,
        metricsResult,
        dashboardMetricsResult,
        severityDistributionResult,
        faultDistributionResult,
        systemFailuresResult,
      ] = await Promise.allSettled([
        fetchEvents(RECENT_EVENTS_LIMIT),
        fetchSystems(),
        fetchAlerts(),
        fetchMetrics(),
        fetchDashboardMetrics(aggregateWindowMinutes),
        fetchSeverityDistribution(aggregateWindowMinutes),
        fetchFaultDistribution(aggregateWindowMinutes),
        fetchSystemFailures(6, aggregateWindowMinutes),
      ]);

      const failures: string[] = [];
      const taskResults = [
        { name: 'events', result: eventsResult },
        { name: 'systems', result: systemsResult },
        { name: 'alerts', result: alertsResult },
        { name: 'metrics', result: metricsResult },
        { name: 'dashboard-metrics', result: dashboardMetricsResult },
        { name: 'severity-distribution', result: severityDistributionResult },
        { name: 'fault-distribution', result: faultDistributionResult },
        { name: 'system-failures', result: systemFailuresResult },
      ];

      taskResults.forEach(({ name, result }) => {
        if (result.status === 'rejected') {
          const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          failures.push(`${name}: ${reason}`);
        }
      });

      if (eventsResult.status === 'fulfilled') setAllEvents(eventsResult.value);
      if (systemsResult.status === 'fulfilled') setSystems(systemsResult.value);
      if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value);
      if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
      if (dashboardMetricsResult.status === 'fulfilled') setDashboardMetrics(dashboardMetricsResult.value);
      if (severityDistributionResult.status === 'fulfilled') setSeverityDistribution(severityDistributionResult.value);
      if (faultDistributionResult.status === 'fulfilled') setFaultDistribution(faultDistributionResult.value);
      if (systemFailuresResult.status === 'fulfilled') setSystemFailures(systemFailuresResult.value);

      const errorMessage = failures.length > 0 ? failures.join(' | ') : null;
      setApiError(errorMessage);
      if (errorMessage) {
        console.warn('SentinelCore API error:', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [aggregateWindowMinutes]);

  // Initial data load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh timer — re-fetch data from API
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = REFRESH_MS[autoRefresh];
    if (ms) {
      intervalRef.current = setInterval(() => {
        setRefreshTick((t) => t + 1);
        loadData();
      }, ms);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadData]);

  const clearFilters = useCallback(() => {
    setSelectedSystems([]);
    setSelectedSeverities([]);
    setSelectedFaultTypes([]);
    setSearchQuery('');
  }, []);

  const hasActiveFilters =
    selectedSystems.length > 0 ||
    selectedSeverities.length > 0 ||
    selectedFaultTypes.length > 0 ||
    searchQuery.length > 0;
  const canUseAggregateViews = !hasActiveFilters;

  // Filter events based on all global state — use real time
  const filteredEvents = useMemo(() => allEvents.filter((e) => {
    const now = Date.now();
    const eventTime = new Date(e.event_time).getTime();
    if (eventTime < now - TIME_RANGE_MS[timeRange]) return false;

    if (selectedSystems.length > 0 && !selectedSystems.includes(e.hostname)) return false;
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(e.severity)) return false;
    if (selectedFaultTypes.length > 0 && !selectedFaultTypes.includes(e.fault_type)) return false;

    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      const matches =
        e.fault_description.toLowerCase().includes(term) ||
        e.hostname.toLowerCase().includes(term) ||
        e.system_id.toLowerCase().includes(term) ||
        e.fault_type.toLowerCase().includes(term) ||
        e.provider_name.toLowerCase().includes(term) ||
        String(e.event_id).includes(term);
      if (!matches) return false;
    }

    return true;
  }), [
    allEvents,
    timeRange,
    selectedSystems,
    selectedSeverities,
    selectedFaultTypes,
    searchQuery,
  ]);

  // Filter alerts based on global state
  const filteredAlerts = useMemo(() => alerts.filter((a) => {
    const now = Date.now();
    const alertTime = new Date(a.triggered_at).getTime();
    if (alertTime < now - TIME_RANGE_MS[timeRange]) return false;
    if (selectedSystems.length > 0 && !selectedSystems.includes(a.hostname)) return false;
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(a.severity)) return false;
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      if (!a.rule.toLowerCase().includes(term) && 
          !a.title.toLowerCase().includes(term) && 
          !a.hostname.toLowerCase().includes(term)) return false;
    }
    return true;
  }), [alerts, timeRange, selectedSystems, selectedSeverities, searchQuery]);

  // Filter systems based on global state (no time filtering for status, just metadata filtering)
  const filteredSystems = useMemo(() => systems.filter((s) => {
    if (selectedSystems.length > 0 && !selectedSystems.includes(s.hostname)) return false;
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      if (!s.hostname.toLowerCase().includes(term) && 
          !s.system_id.toLowerCase().includes(term)) return false;
    }
    return true;
  }), [systems, selectedSystems, searchQuery]);

  return (
    <DashboardContext.Provider
      value={{
        timeRange,
        setTimeRange,
        autoRefresh,
        setAutoRefresh,
        selectedSystems,
        setSelectedSystems,
        selectedSeverities,
        setSelectedSeverities,
        selectedFaultTypes,
        setSelectedFaultTypes,
        searchQuery,
        setSearchQuery,
        allEvents,
        systems,
        alerts,
        metrics,
        dashboardMetrics,
        severityDistribution,
        faultDistribution,
        systemFailures,
        isLoading,
        apiError,
        recentEventsLimit: RECENT_EVENTS_LIMIT,
        canUseAggregateViews,
        filteredEvents,
        filteredAlerts,
        filteredSystems,
        refreshTick,
        clearFilters,
        hasActiveFilters,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────
export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
