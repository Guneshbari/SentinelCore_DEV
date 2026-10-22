# SentinelCore Benchmarking & Empirical Evaluation Subsystem

The **SentinelCore Benchmarking Subsystem** provides a reproducible, empirical performance, reliability, detection accuracy, machine learning, and scalability evaluation framework. It executes controlled workloads, stress scenarios, and fault injections against SentinelCore components to collect defensible quantitative evidence of real-world system behavior.

> [!IMPORTANT]
> **Strict Empirical Integrity Rule:**
> Every reported metric, latency percentile, throughput number, and accuracy score is derived directly from executed experiments and raw observation data persisted to disk. No numbers are fabricated, estimated, or hardcoded. If a measurement cannot be collected, it remains `null` rather than using artificial zeros or placeholders.

---

## 1. Architecture & Experiments Overview

The benchmarking subsystem comprises 11 focused empirical experiments covering end-to-end telemetry flow, detection engine accuracy, resilience under failure, ML anomaly detection, and horizontal scaling.

| ID | Experiment Name | Module | Primary Metrics & Focus |
|:---|:---|:---|:---|
| **E01** | **End-to-End Detection Latency** | [`detection_benchmark.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/detection_benchmark.py) | Ingestion latency, event-to-alert latency (P50, P95, P99, Mean), sample counts. |
| **E02** | **Fault Detection Coverage** | [`detection_benchmark.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/detection_benchmark.py) | Classification accuracy across 8 fault categories (System, Driver, Service, Security, Storage, Update, Resource, Unknown). |
| **E03** | **Alert Quality & Signal-to-Noise** | [`detection_benchmark.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/detection_benchmark.py) | Precision, Recall, F1 Score, False Positive Rate (FPR), False Negative Rate (FNR). |
| **E04** | **Pipeline Throughput** | [`load_test.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/load_test.py) | Sustained Events/Sec (10–1000 EPS), batch DB write latency, transport lag, zero loss verification. |
| **E05** | **Kafka Failure Recovery** | [`resilience_test.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/resilience_test.py) | Transport outage survival, local disk queue buffering, replay recovery, delivery success rate, zero data loss. |
| **E06** | **PostgreSQL Failure Recovery** | [`resilience_test.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/resilience_test.py) | DB disconnection handling, retry circuit breaker transitions, memory buffer drain upon reconnect, zero loss. |
| **E07** | **API Response Performance** | [`api_benchmark.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/api_benchmark.py) | 10 FastAPI endpoints, concurrent load (P50, P95, P99 latency, RPS), warmup discarding. |
| **E08** | **ML Anomaly Detection Evaluation** | [`ml_evaluation.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/ml_evaluation.py) | Isolation Forest model, 80/20 train/test split, ROC-AUC, Precision, Recall, F1, inference latency. |
| **E09** | **ML Early Warning Lead Time** | [`ml_evaluation.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/ml_evaluation.py) | Prediction lead time (seconds/minutes) across controlled progressive resource exhaustion sequences. |
| **E10** | **Collector Resource Overhead** | [`resource_overhead.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/resource_overhead.py) | CPU overhead %, memory overhead MB, thread count, handle count under baseline vs active collection. |
| **E11** | **Horizontal Scale Test** | [`scale_test.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/scale_test.py) | Scalability across 1, 5, 10, 25, 50, 100 simulated systems, throughput scaling, DB/API latency under scale. |

---

## 2. Directory Structure & Artifacts

All benchmark code resides in `benchmarks/`. All outputs are written to timestamped run directories in `benchmarks/results/`:

```
benchmarks/
├── README.md                  # This documentation
├── __init__.py                # Package initialization
├── __main__.py                # CLI entrypoint for `python -m benchmarks`
├── runner.py                  # Orchestrator running E01–E11 and report generation
├── config.py                  # Schema definitions, 30 observation fields, metadata keys
├── common.py                  # Math functions (P50/P95/P99, F1, ROC-AUC), atomic writers
├── detection_benchmark.py     # E01 (Latency), E02 (Coverage), E03 (Alert Quality)
├── load_test.py               # E04 (Pipeline Throughput)
├── resilience_test.py         # E05 (Kafka Recovery), E06 (PostgreSQL Recovery)
├── api_benchmark.py           # E07 (FastAPI Latency & Throughput)
├── ml_evaluation.py           # E08 (ML Evaluation), E09 (Prediction Lead Time)
├── resource_overhead.py       # E10 (Collector Resource Overhead)
├── scale_test.py              # E11 (Horizontal System Scalability)
├── report_generator.py        # Compiles executive JSON/Markdown reports & resume evidence
└── results/                   # Raw outputs (CSVs, JSONs, Markdown reports)
    ├── run_YYYYMMDD_HHMMSS/   # Timestamped per-run artifacts
    ├── latest_summary.json    # Symlink/copy of latest run summary
    ├── latest_summary.md      # Symlink/copy of latest human-readable report
    └── latest_results.csv     # Symlink/copy of latest consolidated raw observations
```

### Standard Raw Observation Schema (30 Fields)

Raw observations are recorded in CSV format using 30 standardized fields:
`experiment_id`, `timestamp`, `scenario`, `system_id`, `events_generated`, `events_detected`, `events_persisted`, `alerts_generated`, `true_positives`, `false_positives`, `true_negatives`, `false_negatives`, `event_time`, `detection_time`, `alert_time`, `resolution_time`, `detection_latency_ms`, `end_to_end_latency_ms`, `kafka_lag`, `db_write_latency_ms`, `api_latency_ms`, `cpu_overhead_percent`, `memory_overhead_mb`, `network_bytes`, `prediction_probability`, `prediction_label`, `actual_label`, `prediction_lead_time_ms`, `success`, `error`, `notes`.

---

## 3. Running Benchmarks

### Prerequisites

Ensure you have initialized the virtual environment and installed dependencies:

```bash
source .venv/bin/activate
export SENTINEL_COLLECTOR_SECRET="test_sentinel_secret_key_benchmark"
```

### Run Entire Benchmark Suite

```bash
# Run all 11 experiments in safe non-destructive mode
python -m benchmarks

# Or run via runner module
python -m benchmarks.runner --output-dir benchmarks/results
```

### Run Individual Experiments

Each benchmark module can be executed independently as a standalone script:

```bash
# E01, E02, E03: Detection Latency, Coverage, and Alert Quality
python -m benchmarks.detection_benchmark

# E04: Pipeline Throughput (10 to 1000 EPS)
python -m benchmarks.load_test

# E05, E06: Fault Recovery (Safe Mode)
python -m benchmarks.resilience_test

# E05, E06: Fault Recovery with Actual Process/Network Interruption
python -m benchmarks.resilience_test --allow-fault-injection

# E07: API Response Latency (10 Endpoints, Concurrent Load)
python -m benchmarks.api_benchmark

# E08, E09: ML Model Evaluation & Prediction Lead Time
python -m benchmarks.ml_evaluation

# E10: Collector Resource Overhead
python -m benchmarks.resource_overhead

# E11: Horizontal System Scaling (1 to 100 Systems)
python -m benchmarks.scale_test

# Generate Reports and Resume Evidence from existing raw results
python -m benchmarks.report_generator --results-dir benchmarks/results
```

---

## 4. Configuration & Safety Guardrails

### Configuration Options

| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--output-dir` | `BENCHMARK_OUTPUT_DIR` | `benchmarks/results` | Root directory for benchmark output files. |
| `--allow-fault-injection` | `BENCHMARK_ALLOW_FAULT_INJECTION` | `false` | Enables actual service/process termination during resilience tests. |
| `--sample-multiplier` | `BENCHMARK_SAMPLE_MULTIPLIER` | `1.0` | Scaling factor for sample counts (e.g. `0.2` for quick run, `2.0` for deep run). |
| `--skip-ml` | `BENCHMARK_SKIP_ML` | `false` | Skips machine learning benchmarks (E08, E09). |
| `--skip-scale` | `BENCHMARK_SKIP_SCALE` | `false` | Skips horizontal scaling benchmark (E11). |

### Safety Guardrails

1. **Default Non-Destructive Operation:**
   By default, `resilience_test.py` performs in-process component isolation and mocked network/socket drops. Destructive process kills (`SIGSTOP`, container stops) require the explicit `--allow-fault-injection` command-line flag or `BENCHMARK_ALLOW_FAULT_INJECTION=1`.
2. **Database Isolation:**
   All benchmark events use system IDs prefixed with `bench_` or `test_` to prevent mixing test records with production telemetry.
3. **Clean Failure Exit Codes:**
   Any unrecoverable error during a benchmark run exits with code `1` and logs full error context into the `notes` and `error` columns of the raw observation CSV.

---

## 5. Statistical Methods & Formulas

### Latency Percentiles
Latency measurements are sorted in ascending order and calculated using linear interpolation percentiles:
- **P50 (Median):** 50th percentile rank. Represents typical response latency.
- **P95:** 95th percentile rank. Represents latency under standard tail degradation.
- **P99:** 99th percentile rank. Captures worst-case tail latencies and GC/IO pauses.

### Classification & Detection Formulas
- **Detection Coverage:**
  $$\text{Coverage} = \frac{\text{Correctly Detected Events}}{\text{Total Test Fault Events}}$$
- **Precision:**
  $$\text{Precision} = \frac{TP}{TP + FP}$$
- **Recall (Sensitivity):**
  $$\text{Recall} = \frac{TP}{TP + FN}$$
- **False Positive Rate (FPR):**
  $$\text{FPR} = \frac{FP}{FP + TN}$$
- **False Negative Rate (FNR):**
  $$\text{FNR} = \frac{FN}{TP + FN}$$
- **F1 Score:**
  $$\text{F1} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

### Reliability & Resilience Formulas
- **Delivery Success Rate:**
  $$\text{Success Rate} = \frac{\text{Events Successfully Persisted}}{\text{Total Events Generated}} \times 100\%$$
- **Event Loss Rate:**
  $$\text{Loss Rate} = \frac{\text{Events Lost}}{\text{Total Events Generated}} \times 100\%$$
- **Recovery Time:**
  Elapsed time ($t_{\text{recovered}} - t_{\text{restored}}$) until the pipeline clears backpressure lag and resumes normal ingestion latency.

---

## 6. How Baselines & Ground Truth Are Established

1. **Detection Engine Ground Truth:**
   Controlled synthetic events are injected with explicit known fault categories (`SYSTEM_FAULT`, `DRIVER_ISSUE`, `SERVICE_ERROR`, `RESOURCE_WARNING`, etc.) and compared deterministically against the classifications produced by [`collector.py:classify_event`](file:///home/gnx/Projects/SentinelCore_DEV/src/collector.py) and [`analyzer.py:detect_errors`](file:///home/gnx/Projects/SentinelCore_DEV/src/analyzer.py).
2. **Resource Overhead Baseline:**
   Before collecting telemetry, [`resource_overhead.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/resource_overhead.py) samples the idle process state for 3 seconds across 10 observations to measure baseline CPU percentage and memory RSS. The active overhead is calculated as $(\text{Active} - \text{Baseline})$.
3. **ML Evaluation Ground Truth:**
   Evaluated against synthetic and production-grade multivariate metric records with known label annotations (normal vs degraded/failing state), split using a strict 80% training / 20% test partition to prevent data leakage.
4. **Resilience Outage Timing:**
   Exact timestamps of simulated disconnection and reconnection are recorded. Messages produced during the blackout window are tagged with `scenario="kafka_outage_buffering"` to verify 100% replay integrity.

---

## 7. Resume Evidence Extraction & Traceability

SentinelCore includes an automated provenance pipeline in [`report_generator.py`](file:///home/gnx/Projects/SentinelCore_DEV/benchmarks/report_generator.py) that maps technical resume claims directly to raw measurement files:

| Claim Category | Concrete Technical Claim Metric | Scope & Measurement Boundary | Raw Observation Source File |
|:---|:---|:---|:---|
| **Detection Speed** | Sub-millisecond P50 in-process classification latency (~0.02ms) | In-Memory Microbenchmark (excludes wire/queue) | `results/run_*/detection_latency.csv` |
| **Fault Coverage** | 100% detection coverage across 8 Windows fault types | Controlled Scenario Verification | `results/run_*/fault_detection_coverage.csv` |
| **Signal Quality** | Alert Precision 100.0% and F1 > 0.90 on controlled workload | Controlled Scenario Verification | `results/run_*/alert_quality.csv` |
| **Pipeline Scale** | 250–1,000 EPS sustained with batched writes to PostgreSQL (~3–12ms per batch) | Measured on Live PostgreSQL Stack | `results/run_*/throughput_benchmark.csv` |
| **Zero Data Loss** | 100% delivery success via local fallback buffer during simulated outage | In-Process Simulation | `results/run_*/kafka_recovery.csv` |
| **Database Resilience**| 100% delivery success via consumer backlog queue during simulated outage | In-Process Simulation | `results/run_*/postgres_recovery.csv` |
| **API Performance** | P95 API response latency < 15ms across 10 endpoints (DB I/O isolated) | In-Memory / ASGI Microbenchmark | `results/run_*/api_benchmark.csv` |
| **Proactive ML** | Isolation Forest ROC-AUC 1.0, validation-calibrated F1 > 0.85 (default recall ~0.50) | Decoupled Train/Val/Test Evaluation | `results/run_*/ml_evaluation.csv` |
| **Agent Footprint** | Standalone collector process RSS ~38 MB, CPU overhead < 1% under load | Standalone Subprocess Measurement | `results/run_*/resource_overhead.csv` |
| **Fleet Scale** | Multi-tenant key hashing verified for 100 system IDs (Cluster scale: UNVERIFIED) | In-Process Data Structure Simulation | `results/run_*/scale_test.csv` |

### Accessing Benchmark Results in the UI and API

- **Backend API:**
  - `GET /benchmarks/summary`: Returns latest consolidated benchmark run metadata, 11-experiment metrics, and resume evidence items.
  - `GET /benchmarks/latest`: Serves the latest human-readable markdown report.
- **Frontend Dashboard:**
  - Navigate to **Benchmarks & Evidence** in the SentinelCore web dashboard sidebar (`/benchmarks`).
  - Displays high-level KPIs, full resume claims provenance table with raw file citations, experiment tabs, and environment metadata strip.
