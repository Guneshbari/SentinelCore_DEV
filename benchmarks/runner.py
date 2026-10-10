"""Master Benchmark Suite Runner.

Executes the complete safe benchmark suite or individual experiments with
reproducible configuration, unique experiment IDs, atomic output persistence,
and comprehensive report generation.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure src is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

os.environ.setdefault("SENTINEL_COLLECTOR_SECRET", "benchmarking-secret-key-32bytes-min!!")

from benchmarks.api_benchmark import run_api_benchmark
from benchmarks.common import (
    generate_experiment_id,
    get_experiment_artifacts_dir,
    get_run_metadata,
)
from benchmarks.config import (
    DEFAULT_API_CONCURRENCY_LEVELS,
    DEFAULT_DURATION_SECONDS,
    DEFAULT_SAMPLE_SIZE,
    DEFAULT_SYSTEM_COUNTS,
    DEFAULT_THROUGHPUT_LEVELS,
    RESULTS_DIR,
)
from benchmarks.detection_benchmark import (
    run_alert_quality_benchmark,
    run_detection_latency_benchmark,
    run_fault_detection_coverage_benchmark,
)
from benchmarks.load_test import run_pipeline_throughput_benchmark
from benchmarks.ml_evaluation import (
    run_ml_evaluation_benchmark,
    run_ml_prediction_lead_time_benchmark,
)
from benchmarks.report_generator import generate_comprehensive_reports
from benchmarks.resilience_test import (
    run_kafka_recovery_benchmark,
    run_postgres_recovery_benchmark,
)
from benchmarks.resource_overhead import run_collector_resource_overhead_benchmark
from benchmarks.scale_test import run_horizontal_scale_benchmark


def run_all_benchmarks(
    samples: int = DEFAULT_SAMPLE_SIZE,
    duration: float = DEFAULT_DURATION_SECONDS,
    allow_fault_injection: bool = False,
    output_dir: Optional[Path] = None,
) -> Tuple[int, Dict[str, Any]]:
    """
    Execute the complete safe benchmark suite (E01 to E11) sequentially.

    Returns (exit_code, summary_dict).
    """
    suite_id = generate_experiment_id("sentinel-benchmark-suite")
    suite_dir = output_dir or get_experiment_artifacts_dir(suite_id)
    suite_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 78)
    print(f"SentinelCore Benchmarking Subsystem — Full Suite Runner")
    print(f"Suite ID: {suite_id}")
    print(f"Results Directory: {suite_dir}")
    print(f"Safety Mode: {'Fault-Injection Permitted' if allow_fault_injection else 'Safe Non-Destructive'}")
    print("=" * 78)

    experiments: Dict[str, Any] = {}
    failed_experiments: List[str] = []

    t_suite_start = time.perf_counter()

    # E01: End-to-End Detection Latency
    try:
        print("\n[1/8] Running Detection Benchmarks (E01, E02, E03)...")
        e01 = run_detection_latency_benchmark(sample_size=samples, output_dir=suite_dir)
        experiments["E01"] = e01
        p95 = e01["detection_latency_ms"]["p95"]
        print(f"  ✓ E01 Complete: P95 Detection Latency = {p95} ms")
    except Exception as exc:
        print(f"  ✗ E01 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E01")

    # E02: Fault Detection Coverage
    try:
        e02 = run_fault_detection_coverage_benchmark(
            sample_size_per_scenario=max(5, samples // 8), output_dir=suite_dir
        )
        experiments["E02"] = e02
        cov = e02["overall_detection_coverage"] * 100.0
        print(f"  ✓ E02 Complete: Detection Coverage = {cov:.2f}%")
    except Exception as exc:
        print(f"  ✗ E02 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E02")

    # E03: Alert Quality
    try:
        e03 = run_alert_quality_benchmark(sample_size=samples, output_dir=suite_dir)
        experiments["E03"] = e03
        prec = e03["alert_precision"]
        f1 = e03["f1_score"]
        print(f"  ✓ E03 Complete: Precision = {prec * 100.0 if prec else 0:.1f}% | F1 = {f1 if f1 else 0:.4f}")
    except Exception as exc:
        print(f"  ✗ E03 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E03")

    # E04: Pipeline Throughput
    try:
        print("\n[2/8] Running Pipeline Throughput Benchmark (E04)...")
        e04 = run_pipeline_throughput_benchmark(
            load_levels=DEFAULT_THROUGHPUT_LEVELS[:4],
            duration_per_level=min(duration, 1.5),
            output_dir=suite_dir,
        )
        experiments["E04"] = e04
        max_eps = e04["maximum_sustainable_events_per_sec"]
        print(f"  ✓ E04 Complete: Max Sustainable Throughput = {max_eps} events/sec")
    except Exception as exc:
        print(f"  ✗ E04 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E04")

    # E05 & E06: Resilience
    try:
        print("\n[3/8] Running Resilience Tests (E05, E06)...")
        e05 = run_kafka_recovery_benchmark(
            allow_fault_injection=allow_fault_injection, output_dir=suite_dir
        )
        experiments["E05"] = e05
        print(f"  ✓ E05 Complete: Delivery Success = {e05['delivery_success_rate'] * 100:.1f}% | Recovery = {e05['recovery_time_seconds']}s")

        e06 = run_postgres_recovery_benchmark(
            allow_fault_injection=allow_fault_injection, output_dir=suite_dir
        )
        experiments["E06"] = e06
        print(f"  ✓ E06 Complete: Persisted = {e06['persisted_percentage']}% | Recovery = {e06['db_recovery_time_seconds']}s")
    except Exception as exc:
        print(f"  ✗ E05/E06 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E05/E06")

    # E07: API Performance
    try:
        print("\n[4/8] Running API Performance Benchmark (E07)...")
        e07 = run_api_benchmark(
            concurrency_levels=[1, 10, 25],
            requests_per_endpoint=2,
            warmup_requests=1,
            output_dir=suite_dir,
        )
        experiments["E07"] = e07
        c25 = next((c for c in e07["concurrency_results"] if c["concurrency"] == 25), e07["concurrency_results"][-1])
        print(f"  ✓ E07 Complete: Concurrency 25 -> {c25['requests_per_second']} req/s (P95: {c25['p95_latency_ms']} ms)")
    except Exception as exc:
        print(f"  ✗ E07 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E07")

    # E08 & E09: ML Evaluation
    try:
        print("\n[5/8] Running ML Evaluation & Lead Time Benchmarks (E08, E09)...")
        e08 = run_ml_evaluation_benchmark(total_samples=250, output_dir=suite_dir)
        experiments["E08"] = e08
        print(f"  ✓ E08 Complete: ML F1 = {e08['f1_score']} | ROC-AUC = {e08['roc_auc']}")

        e09 = run_ml_prediction_lead_time_benchmark(incident_count=15, output_dir=suite_dir)
        experiments["E09"] = e09
        print(f"  ✓ E09 Complete: Median Lead Time = {e09['lead_time_seconds']['p50']}s")
    except Exception as exc:
        print(f"  ✗ E08/E09 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E08/E09")

    # E10: Collector Overhead
    try:
        print("\n[6/8] Running Collector Resource Overhead Benchmark (E10)...")
        e10 = run_collector_resource_overhead_benchmark(
            sample_count=5, workload_event_count=100, output_dir=suite_dir
        )
        experiments["E10"] = e10
        print(f"  ✓ E10 Complete: CPU Overhead = +{e10['collector_cpu_overhead_percentage_points']}% | Mem Overhead = +{e10['collector_memory_overhead_mb']} MB")
    except Exception as exc:
        print(f"  ✗ E10 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E10")

    # E11: Scale Test
    try:
        print("\n[7/8] Running Horizontal Scale Test (E11)...")
        e11 = run_horizontal_scale_benchmark(
            system_counts=DEFAULT_SYSTEM_COUNTS, events_per_system=5, output_dir=suite_dir
        )
        experiments["E11"] = e11
        print(f"  ✓ E11 Complete: Max Validated Scale = {e11['maximum_tested_scale']} systems")
    except Exception as exc:
        print(f"  ✗ E11 Failed: {exc}", file=sys.stderr)
        failed_experiments.append("E11")

    # Report Generation
    print("\n[8/8] Generating Consolidated Reports...")
    reports = generate_comprehensive_reports(experiments, output_dir=suite_dir)
    # Also update top-level latest reports in RESULTS_DIR
    generate_comprehensive_reports(experiments, output_dir=RESULTS_DIR)

    total_time = time.perf_counter() - t_suite_start
    print("=" * 78)
    if failed_experiments:
        print(f"Suite completed with FAILURES in: {', '.join(failed_experiments)} (Total time: {total_time:.2f}s)")
        return 1, reports
    else:
        print(f"Suite completed successfully! All 11 benchmarks passed. (Total time: {total_time:.2f}s)")
        print(f"Reports saved to:\n  - {suite_dir / 'benchmark_summary.json'}\n  - {suite_dir / 'benchmark_summary.md'}\n  - {suite_dir / 'benchmark_results.csv'}")
        print(f"Top-level latest updated:\n  - {RESULTS_DIR / 'latest_summary.json'}\n  - {RESULTS_DIR / 'latest_summary.md'}")
        return 0, reports


def main() -> int:
    parser = argparse.ArgumentParser(description="SentinelCore Benchmark Suite Runner")
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLE_SIZE, help="Sample size for benchmarks")
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION_SECONDS, help="Duration seconds for load levels")
    parser.add_argument("--allow-fault-injection", action="store_true", help="Permit fault injection experiments")
    parser.add_argument("--output-dir", type=str, default=None, help="Directory to save suite outputs")
    args = parser.parse_args()

    out_dir = Path(args.output_dir) if args.output_dir else None
    exit_code, _ = run_all_benchmarks(
        samples=args.samples,
        duration=args.duration,
        allow_fault_injection=args.allow_fault_injection,
        output_dir=out_dir,
    )
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
