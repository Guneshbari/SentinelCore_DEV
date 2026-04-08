import os
from shared.system_constants import env_int, env_csv, env_bool

API_CACHE_TTL_SECONDS = env_int("SENTINEL_API_CACHE_TTL_SECONDS", 5)
API_MAX_EVENTS_LIMIT = env_int("SENTINEL_API_MAX_EVENTS_LIMIT", 1000)
API_CORS_ALLOWED_ORIGINS = env_csv("SENTINEL_API_CORS_ALLOWED_ORIGINS", "http://localhost:5173")
ALERT_ACK_COOLDOWN_MINUTES = env_int("SENTINEL_ALERT_ACK_COOLDOWN_MINUTES", 30)
ALERT_RULE_LOOKBACK_MINUTES = env_int("SENTINEL_ALERT_RULE_LOOKBACK_MINUTES", 15)
ALERT_ESCALATION_TIMEOUT_SECONDS = env_int("SENTINEL_ALERT_ESCALATION_TIMEOUT_SECONDS", 5)
ALERT_ESCALATION_WEBHOOK_URL = os.getenv("SENTINEL_ALERT_ESCALATION_WEBHOOK_URL", "").strip()

# Firebase Admin SDK auth integration
# Set SENTINEL_FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/key.json
_backend_env = os.getenv("SENTINEL_ENV", "development").strip().lower()
FIREBASE_AUTH_ENABLED = env_bool(
    "SENTINEL_FIREBASE_AUTH_ENABLED",
    default=False if _backend_env == "development" else True,
)
