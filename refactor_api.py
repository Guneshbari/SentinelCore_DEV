import sys

try:
    with open('src/api_server.py', 'r', encoding='utf-8') as f:
        content = f.read()

    repl1_old = """from shared_constants import (
    DB_CONFIG,
    FIREBASE_AUTH_ENABLED,
    API_RESPONSE_TIMEOUT_SECONDS,
    API_CACHE_TTL_SECONDS,
    API_CORS_ALLOWED_ORIGINS,
    API_MAX_EVENTS_LIMIT,
    DB_QUERY_TIMEOUT_SECONDS,
    DB_POOL_MIN_CONN,
    DB_POOL_MAX_CONN,
    ALERT_ACK_COOLDOWN_MINUTES,
    ALERT_ESCALATION_TIMEOUT_SECONDS,
    ALERT_ESCALATION_WEBHOOK_URL,
    ALERT_RULE_LOOKBACK_MINUTES,
)"""

    repl1_new = """from shared.resilience_constants import (
    API_RESPONSE_TIMEOUT_SECONDS,
    DB_QUERY_TIMEOUT_SECONDS,
)
from shared.api_constants import (
    FIREBASE_AUTH_ENABLED,
    API_CACHE_TTL_SECONDS,
    API_CORS_ALLOWED_ORIGINS,
    API_MAX_EVENTS_LIMIT,
    ALERT_ACK_COOLDOWN_MINUTES,
    ALERT_ESCALATION_TIMEOUT_SECONDS,
    ALERT_ESCALATION_WEBHOOK_URL,
    ALERT_RULE_LOOKBACK_MINUTES,
)
from shared.db_constants import (
    get_db_config,
    DB_POOL_MIN_CONN,
    DB_POOL_MAX_CONN,
)

_DB_CONFIG = get_db_config()"""

    content = content.replace(repl1_old, repl1_new)
    content = content.replace('**DB_CONFIG,', '**_DB_CONFIG,')
    content = content.replace('DB_CONFIG.get("password"', '_DB_CONFIG.get("password"')

    with open('src/api_server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")
except Exception as e:
    print("Error:", e)
