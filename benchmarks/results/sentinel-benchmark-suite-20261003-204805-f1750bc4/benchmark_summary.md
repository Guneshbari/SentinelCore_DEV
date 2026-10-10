# SentinelCore Benchmark & Quantitative Evidence Report

**Generated:** 2026-10-03T20:48:23.797069+00:00  
**Environment:** linux | Python 3.14.7  
**Git Commit / Version:** `38fd6b0`  

> [!IMPORTANT]
> Every number in this report originates from executed benchmark experiments and persisted raw measurement data.
> No numbers are estimated, fabricated, or hard-coded.

## Defensible Quantitative Claims (Technical Evidence)

The following empirical metrics are verified and directly traceable to raw observation files:

| Metric | Measured Value | Sample Count | Experiment Code | Raw Artifact Provenance |
|---|---|---|---|---|
| **P95 End-to-End Detection Latency** | `0.038 milliseconds` | 50 | `E01` | `detection_latency.csv` |
| **Maximum Sustainable Pipeline Throughput** | `249.65 events/second` | 615 | `E04` | `throughput_benchmark.csv` |
| **Fault Detection Coverage** | `62.5 percent` | 48 | `E02` | `fault_detection_coverage.csv` |
| **Alert Precision** | `100.0 percent` | 50 | `E03` | `alert_quality.csv` |
| **False-Positive Rate** | `0.0 percent` | 50 | `E03` | `alert_quality.csv` |
| **Telemetry Delivery Success Rate During Outage** | `100.0 percent` | 80 | `E05` | `kafka_recovery.csv` |
| **Kafka Reconnection & Drain Time** | `0.0003 seconds` | 80 | `E05` | `kafka_recovery.csv` |
| **PostgreSQL Recovery & Backlog Drain Time** | `0.0002 seconds` | 80 | `E06` | `postgres_recovery.csv` |
| **Isolation Forest Anomaly Detection F1 Score** | `0.4615 score (0-1)` | 50 | `E08` | `ml_evaluation.csv` |
| **ML Anomaly Scoring ROC-AUC** | `1.0 score (0-1)` | 50 | `E08` | `ml_evaluation.csv` |
| **Median ML Failure Prediction Lead Time** | `30.0 seconds` | 15 | `E09` | `prediction_lead_time.csv` |
| **Collector CPU Overhead** | `0.0 percentage points` | 10 | `E10` | `resource_overhead.csv` |
| **Collector Memory Overhead (RSS)** | `0.0 megabytes (MB)` | 10 | `E10` | `resource_overhead.csv` |
| **Maximum Experimentally Validated Scale** | `100 systems` | 46 | `E11` | `scale_test.csv` |

## Detailed Experiment Summaries

### [E01] End-to-End Detection Latency
- **Experiment Run ID:** `E01-latency-20261003-204805-be4f5497`
- **Total Samples:** 50
- **Detection Latency (ms):** P50 = 0.02 | P95 = 0.038 | P99 = 0.085 | Mean = 0.022
- **End-to-End Latency (ms):** P50 = 0.022 | P95 = 0.039 | P99 = 0.088

### [E02] Fault Detection Coverage
- **Experiment Run ID:** `E02-coverage-20261003-204805-1fb2194f`
- **Total Samples:** 48
- **Detection Coverage:** 62.50% | False Negatives: 18

### [E03] Alert Quality
- **Experiment Run ID:** `E03-alert-quality-20261003-204805-b95a283c`
- **Total Samples:** 50
- **Alert Precision:** 100.00% | F1: 0.913 | False Positive Rate: 0.00%

### [E04] Pipeline Throughput
- **Experiment Run ID:** `E04-throughput-20261003-204805-6c649257`
- **Total Samples:** 615
- **Maximum Sustainable Throughput:** 249.65 events/sec

### [E05] Kafka Failure Recovery
- **Experiment Run ID:** `E05-kafka-recovery-20261003-204811-d5f30b6d`
- **Total Samples:** 80
- **Delivery Success Rate:** 100.00% | Recovery Time: 0.0003s | Events Lost: 0

### [E06] PostgreSQL Failure Recovery
- **Experiment Run ID:** `E06-postgres-recovery-20261003-204812-ecbafe2f`
- **Total Samples:** 80
- **DB Recovery Time:** 0.0002s | Persisted: 100.0% | Retries: 40

### [E07] API Performance
- **Experiment Run ID:** `E07-api-benchmark-20261003-204812-8a7c5dcf`
- **Total Samples:** 60
  - Concurrency 1: 1162.93 req/s (P50: 0.669ms, P95: 1.165ms, Error: 0.00%)
  - Concurrency 10: 1248.47 req/s (P50: 6.579ms, P95: 10.673ms, Error: 0.00%)
  - Concurrency 25: 1260.04 req/s (P50: 12.934ms, P95: 14.507ms, Error: 0.00%)

### [E08] ML Model Evaluation
- **Experiment Run ID:** `E08-ml-evaluation-20261003-204813-3a3598cd`
- **Total Samples:** 50
- **ML Precision:** 1.0 | Recall: 0.3 | F1: 0.4615 | ROC-AUC: 1.0

### [E09] ML Prediction Lead Time
- **Experiment Run ID:** `E09-lead-time-20261003-204813-1dc882ec`
- **Total Samples:** 15
- **Median Prediction Lead Time:** 30.0s (P95: 126.0s) | Predicted: 15/15

### [E10] Collector Resource Overhead
- **Experiment Run ID:** `E10-overhead-20261003-204814-d55cec02`
- **Total Samples:** 10
- **Net CPU Overhead:** +0.0% points | Memory Overhead: +0.0 MB

### [E11] Horizontal Scale Test
- **Experiment Run ID:** `E11-scale-20261003-204823-29edf633`
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