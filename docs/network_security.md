# Network Security Guide (UFW)

To fully lock down the SentinelCore backend on a Linux server, you must use a firewall to restrict access, guaranteeing that the telemetry API and databases are isolated.

Assuming you are using Uncomplicated Firewall (`ufw`) on Ubuntu/Debian:

## 1. Deny All Incoming Traffic by Default
Start by setting a strict default posture:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

## 2. Allow SSH (Critical)
Always ensure you do not lock yourself out!
```bash
sudo ufw allow 22/tcp
```

## 3. Restrict API Port (8000) to Admin IP
The FastAPI backend (`api_server.py`) should **only** be accessible from your known administrator IP address, preventing the internet from even attempting to reach it.
Replace `<ADMIN_IP>` with your actual external static IP address:
```bash
sudo ufw allow from <ADMIN_IP> to any port 8000
```

## 4. Restrict External Database Access
PostgreSQL and Kafka run in Docker and are exposed on ports `5432` and `9092`. By default, Docker overrides UFW. To prevent external machines from connecting directly to your database or Kafka broker:
- Ensure the `docker-compose.yml` binds the ports explicitly to localhost:
  - `127.0.0.1:5432:5432`
  - `127.0.0.1:9092:9092`

If they must be exposed on the host interface, strictly restrict them using UFW:
```bash
sudo ufw deny 5432
sudo ufw deny 9092
```

## 5. Enable the Firewall
```bash
sudo ufw enable
```

You can review your active rules with:
```bash
sudo ufw status verbose
```
