# SentinelCore

**SentinelCore** is an enterprise-grade telemetry ingestion, processing, and predictive analytics platform. It collects high-throughput system event logs from Windows nodes, buffers them through Kafka, routes them into an isolated PostgreSQL warehouse, and visualizes system health via a sleek React dashboard backed by real-time FastAPI endpoints and predictive ML forecasting.

## Architecture Highlights
- **Distributed Ingestion:** Windows collectors securely publish event telemetry to a localized Kafka cluster using an injectible pre-shared key (PSK).
- **Asynchronous Persistence:** `kafka_to_postgres.py` offloads high-throughput streams into a PostgreSQL database with dynamic caching, fallback circuit-breaking, and partitioned schema scaling.
- **Predictive ML Analytics:** `ml_engine.py` processes live `feature_snapshots` to passively compute system anomaly scores and hardware failure probabilities.
- **Zero-Trust Dashboard:** Real-time metrics are accessible only through a Google Firebase authenticated React frontend, which pulls normalized payloads from a token-restricted `api_server.py`.

## Documentation Hub
For an exhaustive breakdown of SentinelCore's architecture and capabilities, explore our detailed documentation:

1. [Architectural Overview](docs/architecture.md) - System design and data flow layout.
2. [Backend Services Overview](docs/backend_services.md) - Detailed behavior of Python microservices.
3. [Frontend Dashboard](docs/frontend_dashboard.md) - React UI configurations and context state mapping.
4. [API Reference](docs/api_reference.md) - Payload strictures for the FastAPI endpoints.

### Infrastructure & Deployment Guides
- [WSL / Local Deployment](docs/WSL_KAFKA_POSTGRES_SETUP.md)
- [Firebase Authorization Configuration](docs/firebase_auth_setup.md)
- [Server Network Security (UFW)](docs/network_security.md)

## Quick Start (Backend)
Requirements: **Python 3.9+**, **Kafka**, **PostgreSQL**

```bash
# Terminal 1: Telemetry Consumer
python src/kafka_to_postgres.py

# Terminal 2: ML Snapshot Engines
python src/feature_builder.py
python src/ml_engine.py

# Terminal 3: REST API
uvicorn src.api_server:app --host 0.0.0.0 --port 8000
```
