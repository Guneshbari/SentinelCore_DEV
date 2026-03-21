"""
SentinelCore — Shared Constants
Single source of truth for all configuration values used across:
  collector, analyzer, api_server, kafka_to_postgres, feature_builder
"""

import os

# ============================================================================
# SEVERITY LEVEL NAMES
# ============================================================================

LEVEL_NAMES = {1: 'CRITICAL', 2: 'ERROR', 3: 'WARNING', 4: 'INFO', 5: 'VERBOSE'}

# ============================================================================
# RESOURCE ALERT THRESHOLDS
# ============================================================================

CPU_ALERT_THRESHOLD    = 90   # percent
MEMORY_ALERT_THRESHOLD = 90   # percent
DISK_LOW_THRESHOLD     = 10   # percent free

# ============================================================================
# RELIABILITY & TIMEOUT CONSTANTS
# ============================================================================

RETRY_MAX_ATTEMPTS           = 3    # max retries for transient failures
RETRY_BACKOFF_SECONDS        = 2.0  # base backoff in seconds (doubles per attempt)
DB_QUERY_TIMEOUT_SECONDS     = 5    # hard limit on any single DB query
API_RESPONSE_TIMEOUT_SECONDS = 3    # hard limit on any API handler
CIRCUIT_BREAKER_THRESHOLD    = 5    # consecutive failures before circuit opens
CIRCUIT_BREAKER_RESET_SECS   = 30.0 # seconds before circuit half-opens

# ============================================================================
# SCALABILITY CONSTANTS  (tuned for 100+ systems)
# ============================================================================

# Connection pool: API server handles dashboard + Prometheus (every 5s) +
# concurrent users.  20 covers all realistic concurrent workloads at 100 systems.
DB_POOL_MIN_CONN  = 2
DB_POOL_MAX_CONN  = int(os.getenv("SENTINEL_DB_POOL_MAX", "20"))

# Batch insert: how many event rows to write per executemany() call.
# Larger = fewer round trips; 200 is safe for Postgres default packet size.
DB_INSERT_BATCH_SIZE = int(os.getenv("SENTINEL_INSERT_BATCH_SIZE", "200"))

# Data retention: events older than this are eligible for archival/deletion.
# 30 days keeps raw_xml storage bounded at ~500 GB for 100 systems.
DATA_RETENTION_DAYS = int(os.getenv("SENTINEL_RETENTION_DAYS", "30"))

# raw_xml per-event size cap: truncate before storing to bound TEXT column growth.
# 4 KB is enough to diagnose; full XML can be 10-50 KB.
RAW_XML_MAX_BYTES = int(os.getenv("SENTINEL_RAW_XML_MAX_BYTES", "4096"))

# ============================================================================
# DATABASE CONFIGURATION
# Credentials read from environment variables first; fall back to defaults.
# Set SENTINEL_DB_* env vars in production — never commit real passwords.
# ============================================================================

DB_CONFIG = {
    "dbname":          os.getenv("SENTINEL_DB_NAME",     "sentinel_logs"),
    "user":            os.getenv("SENTINEL_DB_USER",     "sentinel_admin"),
    "password":        os.getenv("SENTINEL_DB_PASSWORD", "changeme123"),
    "host":            os.getenv("SENTINEL_DB_HOST",     "localhost"),
    "port":            int(os.getenv("SENTINEL_DB_PORT", "5432")),
    "connect_timeout": DB_QUERY_TIMEOUT_SECONDS,
    # Enforce per-statement timeout at Postgres level (value in ms)
    "options":         f"-c statement_timeout={DB_QUERY_TIMEOUT_SECONDS * 1000}",
}