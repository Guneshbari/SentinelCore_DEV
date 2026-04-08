import os
from shared.system_constants import env_int, env_bool
from shared.resilience_constants import DB_QUERY_TIMEOUT_SECONDS

DB_POOL_MIN_CONN = env_int("SENTINEL_DB_POOL_MIN", 2)
DB_POOL_MAX_CONN = env_int("SENTINEL_DB_POOL_MAX", 20)
DB_INSERT_BATCH_SIZE = env_int("SENTINEL_INSERT_BATCH_SIZE", 200)
DATA_RETENTION_DAYS = env_int("SENTINEL_RETENTION_DAYS", 30)
RAW_XML_MAX_BYTES = env_int("SENTINEL_RAW_XML_MAX_BYTES", 4096)

RETENTION_CLEANUP_ENABLED = env_bool("SENTINEL_RETENTION_CLEANUP_ENABLED", True)
RETENTION_CLEANUP_INTERVAL_SECS = env_int("SENTINEL_RETENTION_CLEANUP_INTERVAL_SECS", 900)
RETENTION_DELETE_BATCH_SIZE = env_int("SENTINEL_RETENTION_DELETE_BATCH_SIZE", 1000)

EVENT_PARTITIONING_ENABLED = env_bool("SENTINEL_EVENT_PARTITIONING_ENABLED", False)
EVENT_PARTITION_MONTHS_AHEAD = env_int("SENTINEL_EVENT_PARTITION_MONTHS_AHEAD", 2)
EVENT_PARTITION_MONTHS_BEHIND = env_int("SENTINEL_EVENT_PARTITION_MONTHS_BEHIND", 1)
EVENT_SHARD_KEY = os.getenv("SENTINEL_EVENT_SHARD_KEY", "system_id")

def get_db_config() -> dict[str, any]:
    """Returns a fresh dictionary with DB connection settings."""
    return {
        "dbname": os.getenv("SENTINEL_DB_NAME", "sentinel_logs"),
        "user": os.getenv("SENTINEL_DB_USER", "sentinel_admin"),
        "password": os.getenv("SENTINEL_DB_PASSWORD", ""),
        "host": os.getenv("SENTINEL_DB_HOST", "postgres"),
        "port": env_int("SENTINEL_DB_PORT", 5432),
        "connect_timeout": DB_QUERY_TIMEOUT_SECONDS,
        "options": f"-c statement_timeout={DB_QUERY_TIMEOUT_SECONDS * 1000}",
    }
