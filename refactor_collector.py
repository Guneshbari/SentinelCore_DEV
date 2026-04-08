import sys
import re
import os

target = 'src/collector.py'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

old_import = re.search(r'from shared_constants import \([\s\S]*?\)', content).group(0)

new_import = """from shared.system_constants import LEVEL_NAMES
from shared.collector_constants import (
    COLLECTOR_BASE_BATCH_SIZE,
    COLLECTOR_DYNAMIC_BATCHING_ENABLED,
    COLLECTOR_SECRET,
    COLLECTOR_INTERVAL_SECONDS,
    COLLECTOR_MAX_BATCH_SIZE,
)
from shared.ml_constants import (
    CPU_ALERT_THRESHOLD,
    MEMORY_ALERT_THRESHOLD,
    DISK_LOW_THRESHOLD,
)
from shared.kafka_constants import (
    KAFKA_BOOTSTRAP_SERVERS as SC_KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC as SC_KAFKA_TOPIC,
)
from shared.resilience_constants import (
    RETRY_MAX_ATTEMPTS as _SC_RETRY_MAX,
    RETRY_BACKOFF_SECONDS as _SC_RETRY_BACKOFF,
    CIRCUIT_BREAKER_THRESHOLD,
    CIRCUIT_BREAKER_RESET_SECS,
)"""

content = content.replace(old_import, new_import)
with open(target, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated collector.py")
