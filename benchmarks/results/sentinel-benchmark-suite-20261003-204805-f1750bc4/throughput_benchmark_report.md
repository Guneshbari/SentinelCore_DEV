# Benchmark Report: E04 Pipeline Throughput

**Experiment ID:** `E04-throughput-20261003-204805-6c649257`  
**Timestamp:** 2026-10-03T20:48:11.827886+00:00  
**Max Sustainable Events/Sec:** `249.65`  
**Total Observations:** 615  

## Throughput and Latency by Load Level

| Target EPS | Actual Input EPS | Persisted EPS | Loss % | P50 Latency | P95 Latency | P99 Latency | DB Write P50 | Peak Lag | Sustainable |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 10.0 | 10.0 | 0.0% | 99.996 ms | 100.033 ms | 100.057 ms | 0.185 ms | 1 | ✓ |
| 50 | 49.98 | 49.98 | 0.0% | 19.993 ms | 20.192 ms | 20.315 ms | 0.453 ms | 1 | ✓ |
| 100 | 99.94 | 99.94 | 0.0% | 9.993 ms | 10.102 ms | 10.225 ms | 0.761 ms | 1 | ✓ |
| 250 | 249.65 | 249.65 | 0.0% | 3.998 ms | 4.114 ms | 4.31 ms | 1.02 ms | 1 | ✓ |