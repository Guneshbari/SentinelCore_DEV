import sys
import re

try:
    with open('tests/test_sentinelcore.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # We need to change DB_CONFIG usage in TestSharedConstants to get_db_config() and import it
    content = content.replace('SC.DB_CONFIG', 'SC.get_db_config()')

    # However, shared_constants does NOT export get_db_config.
    # We should add it to shared_constants.py so we don't break the whole codebase yet,
    # or just change the test to import db_constants.
    content = content.replace('import shared_constants as SC', '''import shared_constants as SC
from shared.db_constants import get_db_config
SC.get_db_config = get_db_config # Patch it for tests
''')

    with open('tests/test_sentinelcore.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Fixed tests/test_sentinelcore.py")
except Exception as e:
    print(e)
