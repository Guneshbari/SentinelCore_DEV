# Benchmark Report: E01 End-to-End Detection Latency

**Experiment ID:** `E01-latency-20261003-204805-be4f5497`  
**Timestamp:** 2026-10-03T20:48:05.812756+00:00  
**Environment:** Linux 7.2.5-3-omarchy (x86_64) | Python 3.14.7  
**Commit:** `38fd6b0`  
**Sample Size:** 50 observations across 8 scenarios

## Latency Summary (Milliseconds)

| Metric | Detection Latency (P50 / P95 / P99) | End-to-End Latency (P50 / P95 / P99) | Event-to-Alert Latency (P50 / P95 / P99) |
|---|---|---|---|
| **P50 (Median)** | 0.02 ms | 0.022 ms | 0.001 ms |
| **P95** | 0.038 ms | 0.039 ms | 0.002 ms |
| **P99** | 0.085 ms | 0.088 ms | 0.004 ms |
| **Mean** | 0.022 ms | 0.024 ms | 0.002 ms |
| **Min / Max** | 0.006 / 0.125 ms | 0.006 / 0.129 ms | 0.001 / 0.005 ms |

## Methodology
1. Controlled events with high-resolution generation timestamps were injected into the SentinelCore pipeline.
2. Ingestion, error classification via knowledge base/rules, and alert candidate triggers were measured per event.
3. Raw timestamps and computed latencies were recorded without synthetic fabrication.
