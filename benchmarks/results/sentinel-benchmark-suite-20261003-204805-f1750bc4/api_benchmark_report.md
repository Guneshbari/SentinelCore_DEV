# Benchmark Report: E07 API Performance

**Experiment ID:** `E07-api-benchmark-20261003-204812-8a7c5dcf`  
**Timestamp:** 2026-10-03T20:48:13.117779+00:00  
**Total Requests Measured:** 60 (Warm-up requests discarded)  
**Endpoints:** `/events, /systems, /alerts, /dashboard-metrics, /metrics, /ml/predictions, /ml/anomalies, /ml/failure-risk, /pipeline-health, /pipeline-health/status`  

## Concurrency Benchmark Results

| Concurrency | Requests/Sec | P50 Latency | P95 Latency | P99 Latency | Error Rate | Timeout Rate |
|---|---|---|---|---|---|---|
| 1 | 1162.93 req/s | 0.669 ms | 1.165 ms | 2.867 ms | 0.00% | 0.00% |
| 10 | 1248.47 req/s | 6.579 ms | 10.673 ms | 11.385 ms | 0.00% | 0.00% |
| 25 | 1260.04 req/s | 12.934 ms | 14.507 ms | 14.598 ms | 0.00% | 0.00% |