import sys

try:
    with open('tests/test_sentinelcore.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove `import shared_constants as SC` from top block
    content = content.replace("import shared_constants as SC\nfrom shared.db_constants import get_db_config\nSC.get_db_config = get_db_config # Patch it for tests\n",
    """from shared import system_constants as SC_sys
from shared import ml_constants as SC_ml
from shared import resilience_constants as SC_res
from shared import db_constants as SC_db
from shared import api_constants as SC_api
""")

    # We need to replace SC. with appropriate domains inside TestSharedConstants
    content = content.replace('SC.LEVEL_NAMES', 'SC_sys.LEVEL_NAMES')
    content = content.replace('SC.CPU_ALERT_THRESHOLD', 'SC_ml.CPU_ALERT_THRESHOLD')
    content = content.replace('SC.MEMORY_ALERT_THRESHOLD', 'SC_ml.MEMORY_ALERT_THRESHOLD')
    content = content.replace('SC.DISK_LOW_THRESHOLD', 'SC_ml.DISK_LOW_THRESHOLD')
    
    content = content.replace('SC.RETRY_MAX_ATTEMPTS', 'SC_res.RETRY_MAX_ATTEMPTS')
    content = content.replace('SC.RETRY_BACKOFF_SECONDS', 'SC_res.RETRY_BACKOFF_SECONDS')
    content = content.replace('SC.DB_QUERY_TIMEOUT_SECONDS', 'SC_res.DB_QUERY_TIMEOUT_SECONDS')
    content = content.replace('SC.API_RESPONSE_TIMEOUT_SECONDS', 'SC_res.API_RESPONSE_TIMEOUT_SECONDS')
    content = content.replace('SC.CIRCUIT_BREAKER_THRESHOLD', 'SC_res.CIRCUIT_BREAKER_THRESHOLD')
    content = content.replace('SC.CIRCUIT_BREAKER_RESET_SECS', 'SC_res.CIRCUIT_BREAKER_RESET_SECS')
    
    # test_db_config uses get_db_config()
    content = content.replace('SC.DB_CONFIG', 'SC_db.get_db_config()')
    content = content.replace('SC.get_db_config', 'SC_db.get_db_config')

    with open('tests/test_sentinelcore.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Fixed tests/test_sentinelcore.py")
except Exception as e:
    print(e)
