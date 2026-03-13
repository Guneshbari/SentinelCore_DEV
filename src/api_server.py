"""
SentinelCore — FastAPI Backend
Serves live PostgreSQL data to the dashboard frontend.
Uses connection pooling for stable performance under frequent polling.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import contextmanager
from datetime import datetime, timezone
import psycopg2
import psycopg2.pool
import psycopg2.extras
import typing

# ============================================================================
# APP SETUP
# ============================================================================

app = FastAPI(
    title="SentinelCore API",
    description="Live telemetry data API for the SentinelCore dashboard",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DATABASE CONNECTION POOL
# ============================================================================

DB_CONFIG = {
    "dbname": "sentinel_logs",
    "user": "sentinel_admin",
    "password": "changeme123",
    "host": "localhost",
    "port": 5432,
}

pool = None


def get_pool():
    global pool
    if pool is None:
        pool = psycopg2.pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            **DB_CONFIG,
        )
    return pool


@contextmanager
def get_db():
    """Context manager that gets a connection from the pool and returns it."""
    conn = get_pool().getconn()
    try:
        yield conn
    finally:
        get_pool().putconn(conn)


@app.on_event("shutdown")
def shutdown():
    global pool
    if pool:
        pool.closeall()


# ============================================================================
# API ENDPOINTS
# ============================================================================


@app.get("/events")
def get_events(limit: int = 100):
    """Return recent events for the dashboard event table and context."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, system_id, fault_type, severity, provider_name, event_id, cpu_usage_percent, memory_usage_percent, disk_free_percent, event_hash, diagnostic_context, raw_xml, ingested_at FROM events ORDER BY ingested_at DESC LIMIT %s
            """, (limit,))
            rows = typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())

    import json
    # Convert datetimes to ISO strings for JSON serialization
    for row in rows:
        row['event_record_id'] = row['id']
        row['hostname'] = row['system_id']
        row['fault_description'] = ''
        row['event_time'] = row['ingested_at']
        
        diag = row.get('diagnostic_context')
        if isinstance(diag, str):
            try:
                row['diagnostic_context'] = json.loads(diag)
            except Exception:
                pass

        for key in ("ingested_at", "event_time"):
            if isinstance(row.get(key), datetime):
                row[key] = row[key].isoformat()

    return rows


@app.get("/systems")
def get_systems():
    """Aggregate system info from events for the Systems page."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                WITH latest AS (
                    SELECT DISTINCT ON (system_id)
                        system_id,
                        cpu_usage_percent,
                        memory_usage_percent,
                        disk_free_percent,
                        ingested_at
                    FROM events
                    ORDER BY system_id, ingested_at DESC
                ),
                counts AS (
                    SELECT system_id, COUNT(*) AS total_events
                    FROM events
                    GROUP BY system_id
                ),
                critical_counts AS (
                    SELECT system_id, COUNT(*) AS critical_count
                    FROM events
                    WHERE severity IN ('CRITICAL', 'ERROR')
                      AND ingested_at > NOW() - INTERVAL '1 hour'
                    GROUP BY system_id
                )
                SELECT
                    l.system_id,
                    l.system_id AS hostname,
                    l.cpu_usage_percent,
                    l.memory_usage_percent,
                    l.disk_free_percent,
                    l.ingested_at AS last_seen,
                    COALESCE(c.total_events, 0) AS total_events,
                    COALESCE(cc.critical_count, 0) AS critical_count
                FROM latest l
                LEFT JOIN counts c ON c.system_id = l.system_id
                LEFT JOIN critical_counts cc ON cc.system_id = l.system_id
                ORDER BY l.system_id
            """)
            rows = typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())

    systems = []
    for row in rows:
        crit = row.get("critical_count", 0)
        if crit >= 3:
            status = "degraded"
        elif row.get("cpu_usage_percent", 0) > 90 or row.get("memory_usage_percent", 0) > 95:
            status = "degraded"
        else:
            status = "online"

        last_seen = row.get("last_seen")
        if isinstance(last_seen, datetime):
            # If last seen is more than 10 minutes ago, mark offline
            diff = (datetime.now(timezone.utc) - last_seen.replace(tzinfo=timezone.utc)).total_seconds()
            if diff > 600:
                status = "offline"
            last_seen = last_seen.isoformat()

        systems.append({
            "system_id": row["system_id"],
            "hostname": row["hostname"],
            "status": status,
            "cpu_usage_percent": float(row.get("cpu_usage_percent", 0)),
            "memory_usage_percent": float(row.get("memory_usage_percent", 0)),
            "disk_free_percent": float(row.get("disk_free_percent", 0)),
            "os_version": "Windows",
            "last_seen": last_seen,
            "ip_address": "",
            "total_events": row.get("total_events", 0),
        })

    return systems


@app.get("/alerts")
def get_alerts():
    """Generate alerts from recent CRITICAL/ERROR events."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    system_id,
                    system_id AS hostname,
                    severity,
                    fault_type,
                    '' AS fault_description,
                    provider_name,
                    ingested_at AS event_time,
                    id AS event_record_id
                FROM events
                WHERE severity IN ('CRITICAL', 'ERROR')
                ORDER BY ingested_at DESC
                LIMIT 50
            """)
            rows = typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())

    alerts = []
    for i, row in enumerate(rows):
        event_time = row.get("event_time")
        if isinstance(event_time, datetime):
            event_time = event_time.isoformat()

        alerts.append({
            "alert_id": f"ALERT-{row.get('event_record_id', i)}",
            "system_id": row["system_id"],
            "hostname": row.get("hostname", ""),
            "severity": row["severity"],
            "rule": f"{row.get('fault_type', 'Unknown')} Detection",
            "title": f"{row['severity']}: {row.get('fault_type', 'Unknown')} on {row.get('hostname', 'Unknown')}",
            "description": row.get("fault_description", ""),
            "triggered_at": event_time,
            "acknowledged": False,
        })

    return alerts


@app.get("/metrics")
def get_metrics():
    """Return time-bucketed MetricPoint data for charts."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    date_trunc('hour', ingested_at) AS bucket,
                    COUNT(*) AS event_count,
                    COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
                    COUNT(*) FILTER (WHERE severity = 'ERROR') AS error_count,
                    COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_count,
                    COUNT(*) FILTER (WHERE severity = 'INFO') AS info_count,
                    ROUND(AVG(cpu_usage_percent)::numeric, 1) AS avg_cpu,
                    ROUND(AVG(memory_usage_percent)::numeric, 1) AS avg_memory,
                    ROUND(AVG(disk_free_percent)::numeric, 1) AS avg_disk_free
                FROM events
                WHERE ingested_at > NOW() - INTERVAL '24 hours'
                GROUP BY bucket
                ORDER BY bucket ASC
            """)
            rows = typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())

    metrics = []
    for row in rows:
        ts = row.get("bucket")
        if isinstance(ts, datetime):
            ts = ts.isoformat()

        metrics.append({
            "timestamp": ts,
            "event_count": row.get("event_count", 0),
            "critical_count": row.get("critical_count", 0),
            "error_count": row.get("error_count", 0),
            "warning_count": row.get("warning_count", 0),
            "info_count": row.get("info_count", 0),
            "avg_cpu": float(row.get("avg_cpu", 0)),
            "avg_memory": float(row.get("avg_memory", 0)),
            "avg_disk_free": float(row.get("avg_disk_free", 0)),
        })

    return metrics


@app.get("/dashboard-metrics")
def get_dashboard_metrics():
    """Summary counts for the overview KPI cards."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    COUNT(*) AS total_events,
                    COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_events,
                    COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_events
                FROM events
            """)
            row = typing.cast(typing.Optional[typing.Dict[str, typing.Any]], cur.fetchone())

    return row or {"total_events": 0, "critical_events": 0, "warning_events": 0}


@app.get("/fault-distribution")
def get_fault_distribution():
    """Fault type breakdown for charts."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT fault_type, COUNT(*) AS count
                FROM events
                GROUP BY fault_type
                ORDER BY count DESC
            """)
            return typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())

@app.get("/severity-distribution")
def get_severity_distribution():
    """Severity breakdown for the pie chart."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT severity, COUNT(*) AS count
                FROM events
                GROUP BY severity
            """)
            return typing.cast(typing.List[typing.Dict[str, typing.Any]], cur.fetchall())


@app.get("/system-metrics")
def get_system_metrics():
    """Average CPU, memory, disk across all events."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    ROUND(AVG(cpu_usage_percent)::numeric, 1) AS avg_cpu,
                    ROUND(AVG(memory_usage_percent)::numeric, 1) AS avg_memory,
                    ROUND(AVG(disk_free_percent)::numeric, 1) AS avg_disk
                FROM events
            """)
            row = typing.cast(typing.Optional[typing.Dict[str, typing.Any]], cur.fetchone())

    return row or {"avg_cpu": 0, "avg_memory": 0, "avg_disk": 0}


@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")
