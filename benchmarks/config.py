"""Configuration and Schema Definitions for SentinelCore Benchmarking Subsystem."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

# Paths
BENCHMARK_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BENCHMARK_DIR.parent
RESULTS_DIR = Path(os.getenv("SENTINEL_BENCHMARK_RESULTS_DIR", str(BENCHMARK_DIR / "results")))

# Safety and Execution Mode
BENCHMARK_ALLOW_FAULT_INJECTION = (
    os.getenv("SENTINEL_BENCHMARK_ALLOW_FAULT_INJECTION", "false").lower() in {"1", "true", "yes"}
)
BENCHMARK_SYSTEM_ID_PREFIX = os.getenv("SENTINEL_BENCHMARK_SYSTEM_PREFIX", "benchmark-sys-")
BENCHMARK_ISOLATED_DATA = True

# Workload Defaults (can be overridden via CLI args or env vars)
DEFAULT_SAMPLE_SIZE = int(os.getenv("SENTINEL_BENCHMARK_SAMPLES", "50"))
DEFAULT_DURATION_SECONDS = float(os.getenv("SENTINEL_BENCHMARK_DURATION", "3.0"))
DEFAULT_THROUGHPUT_LEVELS: List[int] = [10, 50, 100, 250, 500, 1000]
DEFAULT_SYSTEM_COUNTS: List[int] = [1, 5, 10, 25, 50, 100]
DEFAULT_API_CONCURRENCY_LEVELS: List[int] = [1, 10, 25, 50, 100]

DEFAULT_API_ENDPOINTS: List[str] = [
    "/events",
    "/systems",
    "/alerts",
    "/dashboard-metrics",
    "/metrics",
    "/ml/predictions",
    "/ml/anomalies",
    "/ml/failure-risk",
    "/pipeline-health",
    "/pipeline-health/status",
]

# Fault scenarios for E02
FAULT_SCENARIOS: List[str] = [
    "SYSTEM_FAULT",
    "DRIVER_ISSUE",
    "RESOURCE_WARNING",
    "SERVICE_ERROR",
    "SECURITY_EVENT",
    "UPDATE_ERROR",
    "STORAGE_ERROR",
    "UNKNOWN",
]

# Raw Observation Fields (30 fields as specified in benchmark schema)
RAW_OBSERVATION_FIELDS: List[str] = [
    "experiment_id",
    "timestamp",
    "scenario",
    "system_id",
    "events_generated",
    "events_detected",
    "events_persisted",
    "alerts_generated",
    "true_positives",
    "false_positives",
    "true_negatives",
    "false_negatives",
    "event_time",
    "detection_time",
    "alert_time",
    "resolution_time",
    "detection_latency_ms",
    "end_to_end_latency_ms",
    "kafka_lag",
    "db_write_latency_ms",
    "api_latency_ms",
    "cpu_overhead_percent",
    "memory_overhead_mb",
    "network_bytes",
    "prediction_probability",
    "prediction_label",
    "actual_label",
    "prediction_lead_time_ms",
    "success",
    "error",
    "notes",
]

# Run Metadata Keys
RUN_METADATA_KEYS: List[str] = [
    "experiment_id",
    "timestamp",
    "git_commit_or_version",
    "hostname",
    "OS",
    "Python version",
    "configuration",
    "system_count",
    "workload_size",
    "duration_seconds",
]
