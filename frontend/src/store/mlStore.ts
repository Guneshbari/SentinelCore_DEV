/**
 * mlStore — Zustand store for ML anomaly, cluster, and failure-risk data.
 *
 * Fetches from /ml/anomalies, /ml/clusters, and /ml/failure-risk independently
 * of the main dashboardStore so the ML page can auto-refresh on its own cadence.
 *
 * Auto-refresh: every 60 seconds (matches the backend ML pipeline interval).
 * The interval is started when the first subscriber mounts and paused when
 * the window is hidden (visibility API) to avoid wasting requests.
 */
import { create } from 'zustand';
import { fetchMLAnomalies, fetchMLClusters, fetchMLFailureRisk } from '../lib/api';
import type { MLAnomaly, MLCluster, MLFailureRisk } from '../types/telemetry';

const REFRESH_INTERVAL_MS = 60_000;

interface MLState {
  // Data
  anomalies:    MLAnomaly[];
  clusters:     MLCluster[];
  failureRisks: MLFailureRisk[];

  // Derived
  atRiskCount: number; // systems with failure_probability >= 0.6

  // Status
  isLoading:   boolean;
  lastUpdated: Date | null;
  error:       string | null;

  // Filter
  showOnlyAnomalies: boolean;

  // Actions
  load: () => Promise<void>;
  setShowOnlyAnomalies: (v: boolean) => void;
  startAutoRefresh: () => () => void; // returns cleanup fn
}

export const useMLStore = create<MLState>((set, get) => ({
  anomalies:    [],
  clusters:     [],
  failureRisks: [],
  atRiskCount:  0,
  isLoading:    false,
  lastUpdated:  null,
  error:        null,
  showOnlyAnomalies: false,

  setShowOnlyAnomalies: (v) => {
    set({ showOnlyAnomalies: v });
    get().load();
  },

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const onlyAnomalies = get().showOnlyAnomalies;
      const [anomalyResult, clusterResult, riskResult] = await Promise.allSettled([
        fetchMLAnomalies(50, onlyAnomalies),
        fetchMLClusters(50),
        fetchMLFailureRisk(50),
      ]);

      const failureRisks =
        riskResult.status === 'fulfilled'
          ? [...riskResult.value].sort((a, b) => b.failure_probability - a.failure_probability)
          : get().failureRisks; // preserve stale data on failure

      const atRiskCount = failureRisks.filter((r) => r.failure_probability >= 0.6).length;

      const allFailed =
        anomalyResult.status === 'rejected' &&
        clusterResult.status === 'rejected' &&
        riskResult.status === 'rejected';

      set({
        anomalies:    anomalyResult.status === 'fulfilled' ? anomalyResult.value : get().anomalies,
        clusters:     clusterResult.status === 'fulfilled' ? clusterResult.value : get().clusters,
        failureRisks,
        atRiskCount,
        lastUpdated:  new Date(),
        error: allFailed
          ? 'ML data unavailable — backend may not have run a cycle yet.'
          : null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  startAutoRefresh: () => {
    // Initial load
    get().load();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => get().load(), REFRESH_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    start();

    // Pause when tab is hidden, resume when visible
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        get().load(); // immediate refresh on tab focus
        start();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Return cleanup fn for useEffect
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  },
}));
