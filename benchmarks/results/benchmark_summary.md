# SentinelCore Benchmark & Quantitative Evidence Report

**Generated:** 2026-10-22T20:30:45.487630+00:00  
**Environment:** linux | Python 3.12.14  
**Git Commit / Version:** `eb22668`  

> [!IMPORTANT]
> Every number in this report originates from executed benchmark experiments and persisted raw measurement data.
> No numbers are estimated, fabricated, or hard-coded.

## Defensible Quantitative Claims (Technical Evidence)

The following empirical metrics are verified and directly traceable to raw observation files:

| Metric | Measured Value | Sample Count | Experiment Code | Raw Artifact Provenance |
|---|---|---|---|---|
| **In-Memory Classification Latency (P95) [formerly P95 End-to-End Detection Latency]** | `0.025 milliseconds` | 50 | `E01` | `detection_latency.csv` |
| **Maximum Sustainable Pipeline Throughput** | `247.41 events/second` | 615 | `E04` | `throughput_benchmark.csv` |
| **Fault Detection Coverage Across 8 Controlled Scenarios** | `100.0 percent` | 48 | `E02` | `fault_detection_coverage.csv` |
| **Alert Precision** | `100.0 percent` | 50 | `E03` | `alert_quality.csv` |
| **False-Positive Rate** | `0.0 percent` | 50 | `E03` | `alert_quality.csv` |
| **Telemetry Delivery Success Rate During Outage (In-Process Simulation)** | `100.0 percent` | 80 | `E05` | `kafka_recovery.csv` |
| **Kafka Fallback Buffer Drain Time (In-Memory Simulation)** | `0.0003 seconds` | 80 | `E05` | `kafka_recovery.csv` |
| **PostgreSQL Recovery & Backlog Drain Time** | `0.0002 seconds` | 80 | `E06` | `postgres_recovery.csv` |
| **Isolation Forest Anomaly Detection F1 Score** | `0.6667 score (0-1)` | 50 | `E08` | `ml_evaluation.csv` |
| **ML Anomaly Scoring ROC-AUC** | `1.0 score (0-1)` | 50 | `E08` | `ml_evaluation.csv` |
| **Median ML Failure Prediction Lead Time** | `30.0 seconds` | 15 | `E09` | `prediction_lead_time.csv` |
| **Collector CPU Overhead** | `0.0 percentage points` | 10 | `E10` | `resource_overhead.csv` |
| **Collector Process Memory (RSS)** | `37.77 megabytes (MB) RSS` | 10 | `E10` | `resource_overhead.csv` |
| **Multi-Tenant Key Partitioning Scale (Simulated)** | `100 systems (simulated)` | 46 | `E11` | `scale_test.csv` |

## Detailed Experiment Summaries

### [E01] In-Memory Telemetry Classification Latency
- **Experiment Run ID:** `E01-latency-20261022-203026-789a52dc`
- **Total Samples:** 50
- **Detection Latency (ms):** P50 = 0.018 | P95 = 0.025 | P99 = 0.034 | Mean = 0.017
- **End-to-End Latency (ms):** P50 = 0.019 | P95 = 0.027 | P99 = 0.036

### [E02] Fault Detection Coverage
- **Experiment Run ID:** `E02-coverage-20261022-203026-5c373b54`
- **Total Samples:** 48
- **Detection Coverage:** 100.00% | False Negatives: 0

### [E03] Alert Quality
- **Experiment Run ID:** `E03-alert-quality-20261022-203026-f6626898`
- **Total Samples:** 50
- **Alert Precision:** 100.00% | F1: 0.913 | False Positive Rate: 0.00%

### [E04] Pipeline Throughput
- **Experiment Run ID:** `E04-throughput-20261022-203026-7b885887`
- **Total Samples:** 615
- **Maximum Sustainable Throughput:** 247.41 events/sec

### [E05] Kafka Fallback Buffer Simulation (In-Process)
- **Experiment Run ID:** `E05-kafka-recovery-20261022-203032-1f113f47`
- **Total Samples:** 80
- **Delivery Success Rate:** 100.00% | Recovery Time: 0.0003s | Events Lost: 0

### [E06] PostgreSQL Backlog Queue Simulation (In-Process)
- **Experiment Run ID:** `E06-postgres-recovery-20261022-203033-54675225`
- **Total Samples:** 80
- **DB Recovery Time:** 0.0002s | Persisted: 100.0% | Retries: 40

### [E07] FastAPI Middleware & Routing Latency
- **Experiment Run ID:** `E07-api-benchmark-20261022-203033-07f30fe0`
- **Total Samples:** 60
  - Concurrency 1: 932.45 req/s (P50: 1.043ms, P95: 1.235ms, Error: 0.00%)
  - Concurrency 10: 1216.75 req/s (P50: 6.104ms, P95: 10.521ms, Error: 0.00%)
  - Concurrency 25: 1553.69 req/s (P50: 10.085ms, P95: 11.223ms, Error: 0.00%)

### [E08] ML Model Evaluation
- **Experiment Run ID:** `E08-ml-evaluation-20261022-203033-cd820d02`
- **Total Samples:** 50
- **ML Precision:** 1.0 | Recall: 0.5 | F1: 0.6667 | ROC-AUC: 1.0

### [E09] ML Prediction Lead Time
- **Experiment Run ID:** `E09-lead-time-20261022-203034-9c74a4aa`
- **Total Samples:** 15
- **Median Prediction Lead Time:** 30.0s (P95: 123.0s) | Predicted: 15/15

### [E10] Collector Resource Overhead
- **Experiment Run ID:** `E10-overhead-20261022-203035-99fed25e`
- **Total Samples:** 10
- **Net CPU Overhead:** +0.0% points | Memory Overhead: +37.77 MB

### [E11] Multi-Tenant Key Partitioning Simulation
- **Experiment Run ID:** `E11-scale-20261022-203045-1c10bea4`
- **Total Samples:** 46
- **Maximum Tested Scale:** 100 systems (0% event loss validated)

## Reproduction Guidelines

To reproduce this complete benchmark suite under identical experimental conditions:
```bash
# Run the complete safe benchmark suite
python -m benchmarks

# Or execute individual benchmarks independently
python -m benchmarks.detection_benchmark
python -m benchmarks.load_test
python -m benchmarks.api_benchmark
python -m benchmarks.ml_evaluation
python -m benchmarks.resilience_test
python -m benchmarks.resource_overhead
python -m benchmarks.scale_test
```

All raw observations are saved with atomic writes in `benchmarks/results/` and preserved across runs.