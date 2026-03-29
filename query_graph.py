import sqlite3

db = sqlite3.connect('.code-review-graph/graph.db')
c = db.cursor()

targets = ["EventsPage", "SystemsPage", "AlertsPage", "EventDetails", "SystemDetails", "DashboardLayout", "index.css"]
found_files = set()

c.execute("SELECT file_path FROM nodes WHERE file_path IS NOT NULL")
for row in c.fetchall():
    path = row[0]
    if 'frontend' in path and 'src' in path:
        for t in targets:
            if t in path:
                found_files.add(path)

for f in sorted(list(found_files)):
    print(f)
