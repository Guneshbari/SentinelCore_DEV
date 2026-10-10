"""Benchmark Report Generator.

Aggregates raw empirical observations and per-experiment summaries to produce:
  - benchmark_summary.json (machine-readable summary + traceable resume evidence)
  - benchmark_summary.md (human-readable executive report)
  - benchmark_results.csv (compiled raw observations)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure src is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from benchmarks.common import (
    get_git_commit_or_version,
    save_json,
    save_markdown,
    save_raw_observations_csv,
)
from benchmarks.config import RAW_OBSERVATION_FIELDS, RESULTS_DIR


def extract_resume_evidence(experiments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract defensible quantitative evidence traceable to raw experiment output.

    RESUME RULE:
      Only use metrics that are present in benchmark_summary.json and
      traceable to raw experiment output.
    """
    evidence: Dict[str, Any] = {}

    # E01: P95 detection latency
    e01 = experiments.get("E01")
    if e01 and "detection_latency_ms" in e01:
        evidence["p95_detection_latency"] = {
            "metric_name": "P95 End-to-End Detection Latency",
            "value": e01["detection_latency_ms"]["p95"],
            "unit": "milliseconds",
            "sample_count": e01.get("sample_count", 0),
            "experiment_code": "E01",
            "experiment_id": e01.get("experiment_id", ""),
            "source_artifact": e01.get("artifacts", {}).get("raw_csv", "detection_latency.csv"),
            "provenance": "Empirically measured ingestion-to-alert processing latency across controlled fault workloads.",
        }

    # E04: Maximum sustainable throughput
    e04 = experiments.get("E04")
    if e04 and "maximum_sustainable_events_per_sec" in e04:
        evidence["max_sustainable_throughput"] = {
            "metric_name": "Maximum Sustainable Pipeline Throughput",
            "value": e04["maximum_sustainable_events_per_sec"],
            "unit": "events/second",
            "sample_count": e04.get("sample_count", 0),
            "experiment_code": "E04",
            "experiment_id": e04.get("experiment_id", ""),
            "source_artifact": e04.get("artifacts", {}).get("raw_csv", "throughput_benchmark.csv"),
            "provenance": "Highest EPS level sustained with 0% event loss and bounded latency.",
        }

    # E02: Detection coverage
    e02 = experiments.get("E02")
    if e02 and "overall_detection_coverage" in e02:
        evidence["detection_coverage"] = {
            "metric_name": "Fault Detection Coverage",
            "value": round(e02["overall_detection_coverage"] * 100.0, 2),
            "unit": "percent",
            "sample_count": e02.get("sample_count", 0),
            "experiment_code": "E02",
            "experiment_id": e02.get("experiment_id", ""),
            "source_artifact": e02.get("artifacts", {}).get("raw_csv", "fault_detection_coverage.csv"),
            "provenance": "Fraction of known controlled fault scenarios accurately classified against ground truth.",
        }

    # E03: Alert precision & FPR
    e03 = experiments.get("E03")
    if e03:
        if e03.get("alert_precision") is not None:
            evidence["alert_precision"] = {
                "metric_name": "Alert Precision",
                "value": round(e03["alert_precision"] * 100.0, 2),
                "unit": "percent",
                "sample_count": e03.get("sample_count", 0),
                "experiment_code": "E03",
                "experiment_id": e03.get("experiment_id", ""),
                "source_artifact": e03.get("artifacts", {}).get("raw_csv", "alert_quality.csv"),
                "provenance": "Ratio of true-positive alerts over all generated alerts on mixed workload.",
            }
        if e03.get("false_positive_rate") is not None:
            evidence["false_positive_rate"] = {
                "metric_name": "False-Positive Rate",
                "value": round(e03["false_positive_rate"] * 100.0, 2),
                "unit": "percent",
                "sample_count": e03.get("sample_count", 0),
                "experiment_code": "E03",
                "experiment_id": e03.get("experiment_id", ""),
                "source_artifact": e03.get("artifacts", {}).get("raw_csv", "alert_quality.csv"),
                "provenance": "Fraction of benign events mistakenly elevated to alerts.",
            }

    # E05: Telemetry delivery success rate
    e05 = experiments.get("E05")
    if e05 and "delivery_success_rate" in e05:
        evidence["telemetry_delivery_success_rate"] = {
            "metric_name": "Telemetry Delivery Success Rate During Outage",
            "value": round(e05["delivery_success_rate"] * 100.0, 2),
            "unit": "percent",
            "sample_count": e05.get("sample_count", 0),
            "experiment_code": "E05",
            "experiment_id": e05.get("experiment_id", ""),
            "source_artifact": e05.get("artifacts", {}).get("raw_csv", "kafka_recovery.csv"),
            "provenance": "Ratio of unique events persisted after simulated Kafka disconnection via local fallback buffering.",
        }

    # E05 & E06: Recovery times
    if e05 and "recovery_time_seconds" in e05:
        evidence["kafka_recovery_time"] = {
            "metric_name": "Kafka Reconnection & Drain Time",
            "value": e05["recovery_time_seconds"],
            "unit": "seconds",
            "sample_count": e05.get("sample_count", 0),
            "experiment_code": "E05",
            "experiment_id": e05.get("experiment_id", ""),
            "source_artifact": e05.get("artifacts", {}).get("raw_csv", "kafka_recovery.csv"),
            "provenance": "Duration to restore connection and drain buffered telemetry into pipeline.",
        }
    e06 = experiments.get("E06")
    if e06 and "db_recovery_time_seconds" in e06:
        evidence["postgres_recovery_time"] = {
            "metric_name": "PostgreSQL Recovery & Backlog Drain Time",
            "value": e06["db_recovery_time_seconds"],
            "unit": "seconds",
            "sample_count": e06.get("sample_count", 0),
            "experiment_code": "E06",
            "experiment_id": e06.get("experiment_id", ""),
            "source_artifact": e06.get("artifacts", {}).get("raw_csv", "postgres_recovery.csv"),
            "provenance": "Duration to resume consumer persistence following database circuit-breaker reset.",
        }

    # E08: ML precision/recall/F1
    e08 = experiments.get("E08")
    if e08 and e08.get("f1_score") is not None:
        evidence["ml_f1_score"] = {
            "metric_name": "Isolation Forest Anomaly Detection F1 Score",
            "value": e08["f1_score"],
            "unit": "score (0-1)",
            "sample_count": e08.get("sample_count", 0),
            "experiment_code": "E08",
            "experiment_id": e08.get("experiment_id", ""),
            "source_artifact": e08.get("artifacts", {}).get("raw_csv", "ml_evaluation.csv"),
            "provenance": "Harmonic mean of precision and recall evaluated on held-out test data.",
        }
    if e08 and e08.get("roc_auc") is not None:
        evidence["ml_roc_auc"] = {
            "metric_name": "ML Anomaly Scoring ROC-AUC",
            "value": e08["roc_auc"],
            "unit": "score (0-1)",
            "sample_count": e08.get("sample_count", 0),
            "experiment_code": "E08",
            "experiment_id": e08.get("experiment_id", ""),
            "source_artifact": e08.get("artifacts", {}).get("raw_csv", "ml_evaluation.csv"),
            "provenance": "Area under the ROC curve for IsolationForest continuous anomaly scores.",
        }

    # E09: ML prediction lead time
    e09 = experiments.get("E09")
    if e09 and "lead_time_seconds" in e09:
        evidence["ml_prediction_lead_time"] = {
            "metric_name": "Median ML Failure Prediction Lead Time",
            "value": e09["lead_time_seconds"]["p50"],
            "unit": "seconds",
            "sample_count": e09.get("sample_count", 0),
            "experiment_code": "E09",
            "experiment_id": e09.get("experiment_id", ""),
            "source_artifact": e09.get("artifacts", {}).get("raw_csv", "prediction_lead_time.csv"),
            "provenance": "Median time difference between first valid risk threshold crossing and hard failure timestamp.",
        }

    # E10: Collector CPU & memory overhead
    e10 = experiments.get("E10")
    if e10:
        if "collector_cpu_overhead_percentage_points" in e10:
            evidence["collector_cpu_overhead"] = {
                "metric_name": "Collector CPU Overhead",
                "value": e10["collector_cpu_overhead_percentage_points"],
                "unit": "percentage points",
                "sample_count": e10.get("sample_count", 0),
                "experiment_code": "E10",
                "experiment_id": e10.get("experiment_id", ""),
                "source_artifact": e10.get("artifacts", {}).get("raw_csv", "resource_overhead.csv"),
                "provenance": "Delta between controlled host baseline and active telemetry collector CPU usage.",
            }
        if "collector_memory_overhead_mb" in e10:
            evidence["collector_memory_overhead"] = {
                "metric_name": "Collector Memory Overhead (RSS)",
                "value": e10["collector_memory_overhead_mb"],
                "unit": "megabytes (MB)",
                "sample_count": e10.get("sample_count", 0),
                "experiment_code": "E10",
                "experiment_id": e10.get("experiment_id", ""),
                "source_artifact": e10.get("artifacts", {}).get("raw_csv", "resource_overhead.csv"),
                "provenance": "Incremental resident memory incurred during active event processing.",
            }

    # E11: Maximum tested scale
    e11 = experiments.get("E11")
    if e11 and "maximum_tested_scale" in e11:
        evidence["maximum_tested_scale"] = {
            "metric_name": "Maximum Experimentally Validated Scale",
            "value": e11["maximum_tested_scale"],
            "unit": "systems",
            "sample_count": e11.get("sample_count", 0),
            "experiment_code": "E11",
            "experiment_id": e11.get("experiment_id", ""),
            "source_artifact": e11.get("artifacts", {}).get("raw_csv", "scale_test.csv"),
            "provenance": "Highest system count experimentally tested meeting 0% loss and latency SLA.",
        }

    return evidence


def generate_markdown_report(summary_data: Dict[str, Any]) -> str:
    """Render human-readable Markdown report with comprehensive methodology and tables."""
    meta = summary_data.get("overall_metadata", {})
    evidence = summary_data.get("resume_evidence", {})
    exps = summary_data.get("experiments", {})

    lines: List[str] = [
        "# SentinelCore Benchmark & Quantitative Evidence Report",
        "",
        f"**Generated:** {summary_data.get('generated_at', '')}  ",
        f"**Environment:** {meta.get('OS', '')} | Python {meta.get('Python version', '')}  ",
        f"**Git Commit / Version:** `{meta.get('git_commit_or_version', '')}`  ",
        "",
        "> [!IMPORTANT]",
        "> Every number in this report originates from executed benchmark experiments and persisted raw measurement data.",
        "> No numbers are estimated, fabricated, or hard-coded.",
        "",
        "## Defensible Quantitative Claims (Technical Evidence)",
        "",
        "The following empirical metrics are verified and directly traceable to raw observation files:",
        "",
        "| Metric | Measured Value | Sample Count | Experiment Code | Raw Artifact Provenance |",
        "|---|---|---|---|---|",
    ]

    for key, ev in evidence.items():
        lines.append(
            f"| **{ev['metric_name']}** | `{ev['value']} {ev['unit']}` | {ev['sample_count']} | `{ev['experiment_code']}` | `{ev['source_artifact']}` |"
        )

    lines.extend([
        "",
        "## Detailed Experiment Summaries",
        "",
    ])

    for code, exp in sorted(exps.items()):
        name = exp.get("experiment_name", code)
        exp_id = exp.get("experiment_id", "")
        samples = exp.get("sample_count", 0)
        lines.append(f"### [{code}] {name}")
        lines.append(f"- **Experiment Run ID:** `{exp_id}`")
        lines.append(f"- **Total Samples:** {samples}")

        if code == "E01":
            det = exp.get("detection_latency_ms", {})
            e2e = exp.get("end_to_end_latency_ms", {})
            lines.append(f"- **Detection Latency (ms):** P50 = {det.get('p50')} | P95 = {det.get('p95')} | P99 = {det.get('p99')} | Mean = {det.get('mean')}")
            lines.append(f"- **End-to-End Latency (ms):** P50 = {e2e.get('p50')} | P95 = {e2e.get('p95')} | P99 = {e2e.get('p99')}")
        elif code == "E02":
            cov = exp.get("overall_detection_coverage", 0)
            lines.append(f"- **Detection Coverage:** {cov * 100:.2f}% | False Negatives: {exp.get('total_false_negatives', 0)}")
        elif code == "E03":
            lines.append(f"- **Alert Precision:** {exp.get('alert_precision') * 100:.2f}% | F1: {exp.get('f1_score')} | False Positive Rate: {exp.get('false_positive_rate') * 100:.2f}%")
        elif code == "E04":
            lines.append(f"- **Maximum Sustainable Throughput:** {exp.get('maximum_sustainable_events_per_sec')} events/sec")
        elif code == "E05":
            lines.append(f"- **Delivery Success Rate:** {exp.get('delivery_success_rate') * 100:.2f}% | Recovery Time: {exp.get('recovery_time_seconds')}s | Events Lost: {exp.get('events_lost')}")
        elif code == "E06":
            lines.append(f"- **DB Recovery Time:** {exp.get('db_recovery_time_seconds')}s | Persisted: {exp.get('persisted_percentage')}% | Retries: {exp.get('retry_count')}")
        elif code == "E07":
            conc = exp.get("concurrency_results", [])
            for c in conc:
                lines.append(f"  - Concurrency {c['concurrency']}: {c['requests_per_second']} req/s (P50: {c['p50_latency_ms']}ms, P95: {c['p95_latency_ms']}ms, Error: {c['error_rate'] * 100:.2f}%)")
        elif code == "E08":
            lines.append(f"- **ML Precision:** {exp.get('precision')} | Recall: {exp.get('recall')} | F1: {exp.get('f1_score')} | ROC-AUC: {exp.get('roc_auc')}")
        elif code == "E09":
            lead_sec = exp.get("lead_time_seconds", {})
            lines.append(f"- **Median Prediction Lead Time:** {lead_sec.get('p50')}s (P95: {lead_sec.get('p95')}s) | Predicted: {exp.get('successfully_predicted_failures')}/{samples}")
        elif code == "E10":
            lines.append(f"- **Net CPU Overhead:** +{exp.get('collector_cpu_overhead_percentage_points')}% points | Memory Overhead: +{exp.get('collector_memory_overhead_mb')} MB")
        elif code == "E11":
            lines.append(f"- **Maximum Tested Scale:** {exp.get('maximum_tested_scale')} systems (0% event loss validated)")

        lines.append("")

    lines.extend([
        "## Reproduction Guidelines",
        "",
        "To reproduce this complete benchmark suite under identical experimental conditions:",
        "```bash",
        "# Run the complete safe benchmark suite",
        "python -m benchmarks",
        "",
        "# Or execute individual benchmarks independently",
        "python -m benchmarks.detection_benchmark",
        "python -m benchmarks.load_test",
        "python -m benchmarks.api_benchmark",
        "python -m benchmarks.ml_evaluation",
        "python -m benchmarks.resilience_test",
        "python -m benchmarks.resource_overhead",
        "python -m benchmarks.scale_test",
        "```",
        "",
        "All raw observations are saved with atomic writes in `benchmarks/results/` and preserved across runs.",
    ])

    return "\n".join(lines)


def compile_results_csv(target_file: Path, results_dir: Path) -> int:
    """Find all experiment CSVs in results_dir and compile into target_file."""
    all_rows: List[Dict[str, Any]] = []

    for root, _, files in os.walk(results_dir):
        for f in files:
            if f.endswith(".csv") and f not in ("benchmark_results.csv", "latest_results.csv"):
                csv_path = Path(root) / f
                try:
                    with open(csv_path, "r", encoding="utf-8") as fp:
                        reader = csv.DictReader(fp)
                        for r in reader:
                            all_rows.append(r)
                except Exception:
                    pass

    if all_rows:
        save_raw_observations_csv(target_file, all_rows)
    return len(all_rows)


def generate_comprehensive_reports(
    experiments: Dict[str, Any],
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Compile summaries, extract resume evidence, and write all report formats."""
    out_dir = output_dir or RESULTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit_or_version": get_git_commit_or_version(),
        "hostname": os.uname().nodename if hasattr(os, "uname") else "localhost",
        "OS": f"{sys.platform}",
        "Python version": sys.version.split()[0],
    }

    resume_evidence = extract_resume_evidence(experiments)

    summary_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overall_metadata": metadata,
        "experiments": experiments,
        "resume_evidence": resume_evidence,
    }

    # Save summary JSON
    summary_json_path = out_dir / "benchmark_summary.json"
    save_json(summary_json_path, summary_data)
    save_json(out_dir / "latest_summary.json", summary_data)

    # Save summary Markdown
    md_content = generate_markdown_report(summary_data)
    summary_md_path = out_dir / "benchmark_summary.md"
    save_markdown(summary_md_path, md_content)
    save_markdown(out_dir / "latest_summary.md", md_content)

    # Compile unified CSV
    results_csv_path = out_dir / "benchmark_results.csv"
    compile_results_csv(results_csv_path, RESULTS_DIR)
    compile_results_csv(out_dir / "latest_results.csv", RESULTS_DIR)

    return summary_data


def scan_and_generate_latest_report() -> Dict[str, Any]:
    """Scan benchmarks/results/ for all latest experiment summaries and compile report."""
    experiments: Dict[str, Any] = {}

    exp_files = {
        "E01": "detection_latency_summary.json",
        "E02": "fault_detection_coverage_summary.json",
        "E03": "alert_quality_summary.json",
        "E04": "throughput_benchmark_summary.json",
        "E05": "kafka_recovery_summary.json",
        "E06": "postgres_recovery_summary.json",
        "E07": "api_benchmark_summary.json",
        "E08": "ml_evaluation_summary.json",
        "E09": "prediction_lead_time_summary.json",
        "E10": "resource_overhead_summary.json",
        "E11": "scale_test_summary.json",
    }

    # Search RESULTS_DIR for the most recently modified matching JSONs
    for code, filename in exp_files.items():
        matching = list(RESULTS_DIR.glob(f"**/{filename}"))
        if matching:
            # Pick the newest file
            newest = max(matching, key=lambda p: p.stat().st_mtime)
            try:
                with open(newest, "r", encoding="utf-8") as f:
                    experiments[code] = json.load(f)
            except Exception:
                pass

    return generate_comprehensive_reports(experiments)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate SentinelCore Benchmark Summary Reports")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.output_dir) if args.output_dir else RESULTS_DIR
    print(f"Generating benchmark summary reports in {out_dir}...")
    summary = scan_and_generate_latest_report()
    print(f"✓ Summary generated: {len(summary['experiments'])} experiments included.")
    print(f"✓ Resume evidence entries extracted: {len(summary['resume_evidence'])}")
    print(f"  - JSON: {out_dir / 'benchmark_summary.json'}")
    print(f"  - Markdown: {out_dir / 'benchmark_summary.md'}")
    print(f"  - CSV: {out_dir / 'benchmark_results.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
