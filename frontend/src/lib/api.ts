/**
 * SentinelCore — API Client
 * Centralized fetch layer for the FastAPI backend.
 * Provides typed methods that match the existing telemetry interfaces.
 */

import type {
  TelemetryEvent,
  SystemInfo,
  Alert,
  MetricPoint,
  SeverityCount,
  FaultTypeCount,
} from '../types/telemetry';

const API_BASE = 'http://localhost:8000';

async function fetchJSON<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ── Core data fetchers ──────────────────────────────────

export async function fetchEvents(limit = 500): Promise<TelemetryEvent[]> {
  return fetchJSON<TelemetryEvent[]>(`/events?limit=${limit}`);
}

export async function fetchSystems(): Promise<SystemInfo[]> {
  return fetchJSON<SystemInfo[]>('/systems');
}

export async function fetchAlerts(): Promise<Alert[]> {
  return fetchJSON<Alert[]>('/alerts');
}

export async function fetchMetrics(): Promise<MetricPoint[]> {
  return fetchJSON<MetricPoint[]>('/metrics');
}

// ── Aggregation endpoints ───────────────────────────────

export interface DashboardMetrics {
  total_events: number;
  critical_events: number;
  warning_events: number;
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return fetchJSON<DashboardMetrics>('/dashboard-metrics');
}

export async function fetchFaultDistribution(): Promise<FaultTypeCount[]> {
  return fetchJSON<FaultTypeCount[]>('/fault-distribution');
}

export async function fetchSeverityDistribution(): Promise<SeverityCount[]> {
  return fetchJSON<SeverityCount[]>('/severity-distribution');
}

export interface SystemMetrics {
  avg_cpu: number;
  avg_memory: number;
  avg_disk: number;
}

export async function fetchSystemMetrics(): Promise<SystemMetrics> {
  return fetchJSON<SystemMetrics>('/system-metrics');
}

// ── Health check ────────────────────────────────────────

export async function checkAPIHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
