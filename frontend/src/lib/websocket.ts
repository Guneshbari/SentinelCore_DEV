/**
 * WebSocket transport layer for SentinelCore
 *
 * Rules:
 *  - Incoming messages buffered, flushed every 300ms
 *  - Reconnects with exponential backoff (1s → 30s max)
 *  - Disconnected gracefully — does NOT crash when backend is offline
 *  - Updates go direct into Zustand signalStore via batchPush()
 *  - USE_MOCK_DATA = true → WebSocket is stubbed (no connection attempt)
 *  - WS state: 'connected' | 'reconnecting' | 'disconnected' | 'mock'
 *  - Fallback polling: activates after 5s of WS reconnecting, stops on reconnect
 */
import { useSignalStore } from '../store/signalStore';
import { useHeartbeatStore } from '../store/heartbeatStore';
import { isApiSessionAuthenticated, USE_MOCK_DATA, fetchEvents, RECENT_EVENTS_LIMIT } from './api';
import { auth } from './firebase';
import type { FeatureSnapshot, TelemetryEvent } from '../types/telemetry';

export type WebSocketState = 'connected' | 'reconnecting' | 'disconnected' | 'mock';

let _currentWsState: WebSocketState = 'disconnected';

function _setWsState(state: WebSocketState) {
  _currentWsState = state;
  // Notify dashboardStore subscribers via signalStore connected flag
  useSignalStore.getState().setConnected(state === 'connected' || state === 'mock');
}

/** Get current WebSocket transport state for UI display. */
export function getWebSocketState(): WebSocketState {
  return _currentWsState;
}

/** Guarantees every WS event has a non-null event_time. */
function sanitizeTelemetryEvent(e: TelemetryEvent): TelemetryEvent {
  return {
    ...e,
    event_time: e.event_time ?? e.ingested_at ?? new Date().toISOString(),
  };
}

const WS_URL             = (import.meta.env.VITE_SENTINEL_WS_URL ?? 'ws://localhost:8000/ws/events').trim();
const BATCH_INTERVAL_MS  = 300;
const INITIAL_RETRY_MS   = 1_000;
const MAX_RETRY_MS       = 30_000;
/** Time to wait before activating fallback REST polling when WS is down. */
const FALLBACK_DELAY_MS  = 5_000;
/** Polling interval when fallback REST mode is active. */
const FALLBACK_POLL_MS   = 5_000;

class SentinelWebSocket {
  private ws:               WebSocket | null = null;
  private buffer:           TelemetryEvent[] = [];
  private flushTimer:       ReturnType<typeof setTimeout> | null = null;
  private retryDelay:       number = INITIAL_RETRY_MS;
  private retryCount:       number = 0;
  private stopped:          boolean = false;
  private url:              string;
  private fallbackTimer:    ReturnType<typeof setTimeout> | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this.stopped) return;

    let connectionUrl = this.url;
    if (isApiSessionAuthenticated()) {
      const user = auth.currentUser;
      if (!user) {
        _setWsState('reconnecting');
        this.retryCount++;
        this._scheduleReconnect();
        this._scheduleFallback();
        return;
      }
      try {
        const wsUrl = new URL(this.url);
        wsUrl.searchParams.set('token', await user.getIdToken());
        connectionUrl = wsUrl.toString();
      } catch (error) {
        console.warn('SentinelCore websocket auth token unavailable:', error);
        _setWsState('reconnecting');
        this.retryCount++;
        this._scheduleReconnect();
        this._scheduleFallback();
        return;
      }
    }

    try {
      this.ws = new WebSocket(connectionUrl);
    } catch {
      // WebSocket constructor can throw if URL is invalid
      _setWsState('reconnecting');
      this.retryCount++;
      this._scheduleReconnect();
      this._scheduleFallback();
      return;
    }

    this.ws.onopen = () => {
      this.retryDelay = INITIAL_RETRY_MS;
      this.retryCount = 0;
      this._stopFallback();
      _setWsState('connected');
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);

        // ── Typed envelope (backend v2) ──────────────────────────────
        if (msg && typeof msg === 'object' && !Array.isArray(msg) && msg.type) {
          if (msg.type === 'event') {
            const raw: TelemetryEvent[] = Array.isArray(msg.data)
              ? (msg.data as TelemetryEvent[])
              : [msg.data as TelemetryEvent];
            const events = raw.map(sanitizeTelemetryEvent);
            if (events.length > 0) {
              this.buffer.push(...events);
              this._scheduleFlush();
              useHeartbeatStore.getState().onEventReceived();
            }
          } else if (msg.type === 'feature_snapshot' || msg.type === 'feature_snapshots') {
            const snapshots = Array.isArray(msg.data)
              ? (msg.data as FeatureSnapshot[])
              : [msg.data as FeatureSnapshot];
            useSignalStore.getState().mergeFeatureSnapshots(snapshots);
          } else if (msg.type === 'heartbeat') {
            useHeartbeatStore.getState().onHeartbeat({
              timestamp: msg.timestamp as string,
              cpu:       Number(msg.cpu)    || 0,
              memory:    Number(msg.memory) || 0,
              disk:      Number(msg.disk)   || 0,
            });
          }
          return;
        }

        // ── Legacy: bare array (pre-typed backend) ───────────────────
        const legacyRaw: TelemetryEvent[] = Array.isArray(msg)
          ? (msg as TelemetryEvent[])
          : [msg as TelemetryEvent];
        this.buffer.push(...legacyRaw.map(sanitizeTelemetryEvent));
        this._scheduleFlush();
      } catch {
        // Ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      _setWsState('reconnecting');
      this.retryCount++;
    };

    this.ws.onclose = () => {
      if (!this.stopped) {
        _setWsState('reconnecting');
        this.retryCount++;
        this._scheduleReconnect();
        this._scheduleFallback();
      } else {
        _setWsState('disconnected');
      }
    };
  }

  private _scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const batch = this.buffer.splice(0);
      if (batch.length > 0) {
        useSignalStore.getState().batchPush(batch);
      }
    }, BATCH_INTERVAL_MS);
  }

  private _scheduleReconnect(): void {
    setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      this.connect().catch((error) => {
        console.warn('SentinelCore websocket reconnect failed:', error);
      });
    }, this.retryDelay);
  }

  /**
   * Schedule fallback REST polling after FALLBACK_DELAY_MS.
   * Only starts if not already in fallback mode.
   * Polls /events every FALLBACK_POLL_MS and pushes to signalStore.
   */
  private _scheduleFallback(): void {
    if (this.fallbackTimer !== null || this.fallbackInterval !== null) return;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      // Only start if still disconnected (not reconnected in the meantime)
      if (_currentWsState !== 'connected' && !this.stopped) {
        console.info('SentinelCore: WS down — switching to REST polling fallback');
        this.fallbackInterval = setInterval(async () => {
          if (_currentWsState === 'connected' || this.stopped) {
            this._stopFallback();
            return;
          }
          try {
            const events = await fetchEvents(RECENT_EVENTS_LIMIT);
            if (events.length > 0) {
              useSignalStore.getState().batchPush(events);
            }
          } catch {
            // Ignore fallback poll errors — WS reconnect will recover
          }
        }, FALLBACK_POLL_MS);
      }
    }, FALLBACK_DELAY_MS);
  }

  private _stopFallback(): void {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.fallbackInterval !== null) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
      console.info('SentinelCore: WS reconnected — stopping REST polling fallback');
    }
  }

  disconnect(): void {
    this.stopped = true;
    _setWsState('disconnected');
    this._stopFallback();
    useHeartbeatStore.getState().stopAliveTimer();
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

let _client: SentinelWebSocket | null = null;

/** Call once at app startup (after signal store is ready) */
export function initWebSocket(): void {
  if (USE_MOCK_DATA) {
    _setWsState('mock');
    return;
  }
  if (_client) return;
  _client = new SentinelWebSocket(WS_URL);
  _client.connect().catch((error) => {
    console.warn('SentinelCore websocket startup failed:', error);
  });
}

export function disconnectWebSocket(): void {
  _client?.disconnect();
  _client = null;
}
