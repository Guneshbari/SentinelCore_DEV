import os
from shared.system_constants import env_int, env_float, env_bool

COLLECTOR_BASE_BATCH_SIZE = env_int("SENTINEL_COLLECTOR_BATCH_SIZE", 20)
COLLECTOR_MAX_BATCH_SIZE = env_int("SENTINEL_COLLECTOR_MAX_BATCH_SIZE", 100)
COLLECTOR_INTERVAL_SECONDS = env_int("SENTINEL_COLLECTION_INTERVAL_SECONDS", 30)
COLLECTOR_DYNAMIC_BATCHING_ENABLED = env_bool("SENTINEL_COLLECTOR_DYNAMIC_BATCHING_ENABLED", True)

# ── Delta-driven streaming ──────────────────────────────────────────────────
# Minimum change (%) in a resource metric to trigger a synthetic RESOURCE_WARNING.
# Suppresses empty Kafka sends when metrics are stable and no log events exist.
COLLECTOR_DELTA_CPU_THRESHOLD  = env_float("SENTINEL_DELTA_CPU",  5.0)
COLLECTOR_DELTA_MEM_THRESHOLD  = env_float("SENTINEL_DELTA_MEM",  5.0)
COLLECTOR_DELTA_DISK_THRESHOLD = env_float("SENTINEL_DELTA_DISK", 3.0)

# Minimum seconds between consecutive synthetic RESOURCE_WARNING events.
# Prevents Kafka flooding when metrics fluctuate around a threshold.
COLLECTOR_RESOURCE_EVENT_RATE_LIMIT_SECS = env_int("SENTINEL_RESOURCE_EVENT_RATE_SECS", 30)

# ── Adaptive sleep ──────────────────────────────────────────────────────────
# Base sleep after an active cycle (events sent). Shorter = more responsive.
COLLECTOR_SLEEP_ACTIVE_SECS = env_int("SENTINEL_SLEEP_ACTIVE", 5)
# Maximum sleep ceiling during idle run-up. Never exceeds COLLECTOR_INTERVAL_SECONDS.
COLLECTOR_SLEEP_IDLE_MAX_SECS = env_int("SENTINEL_SLEEP_IDLE_MAX", 60)

_COLLECTOR_SECRET_RAW = os.getenv("SENTINEL_COLLECTOR_SECRET", "")
if not _COLLECTOR_SECRET_RAW:
    raise RuntimeError(
        "[FATAL] SENTINEL_COLLECTOR_SECRET environment variable is not set. "
        "Generate a strong secret with: openssl rand -hex 32"
    )
COLLECTOR_SECRET: str = _COLLECTOR_SECRET_RAW
