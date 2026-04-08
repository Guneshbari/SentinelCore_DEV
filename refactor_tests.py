import sys

try:
    with open('tests/test_scalability.py', 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('import shared_constants as SC', 'import shared.db_constants as SC')
    content = content.replace('import shared_constants as SC2', 'import shared.db_constants as SC2')
    content = content.replace('SC2.DB_CONFIG["password"]', 'SC2.get_db_config()["password"]')

    with open('tests/test_scalability.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated test_scalability.py')
except Exception as e:
    print('Error:', e)
