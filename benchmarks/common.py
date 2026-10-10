"""Common utilities, statistical formulas, metadata extraction, and atomic persistence."""

from __future__ import annotations

import csv
import json
import os
import platform
import socket
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from benchmarks.config import (
    RAW_OBSERVATION_FIELDS,
    RESULTS_DIR,
    RUN_METADATA_KEYS,
)


def generate_experiment_id(prefix: str = "exp") -> str:
    """Generate a unique, lexicographically sortable experiment ID."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    uid = uuid.uuid4().hex[:8]
    return f"{prefix}-{ts}-{uid}"


def get_git_commit_or_version() -> str:
    """Safely obtain git commit hash or SentinelCore version."""
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return "v2.2.0-main"


def get_run_metadata(
    experiment_id: str,
    configuration: Optional[Dict[str, Any]] = None,
    system_count: int = 1,
    workload_size: int = 0,
    duration_seconds: float = 0.0,
) -> Dict[str, Any]:
    """Capture environment and execution metadata for a benchmark run."""
    metadata = {
        "experiment_id": experiment_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit_or_version": get_git_commit_or_version(),
        "hostname": socket.gethostname(),
        "OS": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "Python version": sys.version.split()[0],
        "configuration": configuration or {},
        "system_count": system_count,
        "workload_size": workload_size,
        "duration_seconds": round(duration_seconds, 4),
    }
    return metadata


def calculate_percentiles(values: Sequence[float]) -> Dict[str, Optional[float]]:
    """
    Calculate percentiles (P50, P95, P99), mean, min, max for a sequence of numbers.

    Returns None for percentiles when sample size is insufficient.
    """
    cleaned = [float(v) for v in values if v is not None and not (isinstance(v, float) and v != v)]
    count = len(cleaned)
    if count == 0:
        return {
            "count": 0,
            "mean": None,
            "p50": None,
            "p95": None,
            "p99": None,
            "min": None,
            "max": None,
        }

    cleaned.sort()

    def _percentile(sorted_data: List[float], p: float) -> float:
        # Nearest-rank / standard linear interpolation
        k = (len(sorted_data) - 1) * (p / 100.0)
        f = int(k)
        c = f + 1
        if c < len(sorted_data):
            return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])
        return sorted_data[f]

    mean_val = sum(cleaned) / count
    p50_val = _percentile(cleaned, 50.0)
    p95_val = _percentile(cleaned, 95.0) if count >= 5 else p50_val
    p99_val = _percentile(cleaned, 99.0) if count >= 10 else p95_val

    return {
        "count": count,
        "mean": round(mean_val, 3),
        "p50": round(p50_val, 3),
        "p95": round(p95_val, 3),
        "p99": round(p99_val, 3),
        "min": round(cleaned[0], 3),
        "max": round(cleaned[-1], 3),
    }


def calculate_classification_metrics(
    true_positives: Optional[int] = None,
    false_positives: Optional[int] = None,
    true_negatives: Optional[int] = None,
    false_negatives: Optional[int] = None,
    tp: Optional[int] = None,
    fp: Optional[int] = None,
    tn: Optional[int] = None,
    fn: Optional[int] = None,
) -> Dict[str, Optional[float]]:
    """
    Calculate precision, recall, false positive rate, false negative rate, and F1.

    Formula definitions:
      precision = TP / (TP + FP)
      recall = TP / (TP + FN)
      false_positive_rate = FP / (FP + TN)
      false_negative_rate = FN / (TP + FN)
      f1 = 2 * precision * recall / (precision + recall)
      accuracy = (TP + TN) / (TP + TN + FP + FN)
    """
    val_tp = float(tp if tp is not None else (true_positives or 0))
    val_fp = float(fp if fp is not None else (false_positives or 0))
    val_tn = float(tn if tn is not None else (true_negatives or 0))
    val_fn = float(fn if fn is not None else (false_negatives or 0))

    total = val_tp + val_fp + val_tn + val_fn
    if total == 0:
        return {
            "precision": None,
            "recall": None,
            "false_positive_rate": None,
            "false_negative_rate": None,
            "f1": None,
            "accuracy": None,
            "total_samples": 0,
        }

    precision = val_tp / (val_tp + val_fp) if (val_tp + val_fp) > 0 else 0.0
    recall = val_tp / (val_tp + val_fn) if (val_tp + val_fn) > 0 else 0.0
    fpr = val_fp / (val_fp + val_tn) if (val_fp + val_tn) > 0 else 0.0
    fnr = val_fn / (val_tp + val_fn) if (val_tp + val_fn) > 0 else 0.0

    if (precision + recall) > 0:
        f1 = (2.0 * precision * recall) / (precision + recall)
    else:
        f1 = 0.0

    accuracy = (val_tp + val_tn) / total

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "false_positive_rate": round(fpr, 4),
        "false_negative_rate": round(fnr, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "total_samples": int(total),
        "tp": int(val_tp),
        "fp": int(val_fp),
        "tn": int(val_tn),
        "fn": int(val_fn),
    }


def calculate_detection_coverage(correctly_detected: int, total_events: int) -> float:
    """
    Coverage formula: correctly_detected / total_events.

    Returns 0.0 if total_events is 0.
    """
    if total_events <= 0:
        return 0.0
    return round(correctly_detected / total_events, 4)


def calculate_delivery_success(persisted_events: int, generated_events: int) -> float:
    """
    Telemetry delivery success rate: unique_events_persisted / unique_events_generated.
    """
    if generated_events <= 0:
        return 0.0
    return round(persisted_events / generated_events, 4)


def create_observation(
    experiment_id: str,
    scenario: str,
    system_id: str,
    timestamp: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Construct a raw observation dict enforcing RAW_OBSERVATION_FIELDS.

    Rule: Only populate fields that are actually measurable. Use None for omitted fields.
    """
    obs: Dict[str, Any] = {field: None for field in RAW_OBSERVATION_FIELDS}
    obs["experiment_id"] = experiment_id
    obs["scenario"] = scenario
    obs["system_id"] = system_id
    obs["timestamp"] = timestamp or datetime.now(timezone.utc).isoformat()

    for key, value in kwargs.items():
        if key in obs:
            obs[key] = value

    return obs


def atomic_write_file(target_path: Path, content: str) -> None:
    """Atomically write text content to target_path using a temporary file."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = target_path.parent
    with tempfile.NamedTemporaryFile("w", dir=temp_dir, delete=False, encoding="utf-8") as tf:
        tf.write(content)
        temp_name = tf.name
    os.replace(temp_name, target_path)


def save_raw_observations_csv(filepath: Path | str, observations: Sequence[Dict[str, Any]]) -> None:
    """
    Atomically save raw observations to CSV.

    Ensures every field from RAW_OBSERVATION_FIELDS is preserved.
    """
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, newline="", encoding="utf-8") as tf:
        writer = csv.DictWriter(
            tf,
            fieldnames=RAW_OBSERVATION_FIELDS,
            restval="",
            extrasaction="ignore",
        )
        writer.writeheader()
        for obs in observations:
            # Format row with None represented as empty string
            row = {}
            for field in RAW_OBSERVATION_FIELDS:
                val = obs.get(field)
                if val is None:
                    row[field] = ""
                elif isinstance(val, (int, float, str, bool)):
                    row[field] = str(val)
                else:
                    row[field] = json.dumps(val)
            writer.writerow(row)
        temp_name = tf.name
    os.replace(temp_name, path)


def save_json(filepath: Path | str, data: Any) -> None:
    """Atomically serialize and save data as JSON with pretty indentation."""
    path = Path(filepath)
    content = json.dumps(data, indent=2, default=str)
    atomic_write_file(path, content)


def save_markdown(filepath: Path | str, content: str) -> None:
    """Atomically write Markdown report."""
    path = Path(filepath)
    atomic_write_file(path, content)


def get_experiment_artifacts_dir(experiment_id: str) -> Path:
    """Return a dedicated results directory for an experiment run."""
    exp_dir = RESULTS_DIR / experiment_id
    exp_dir.mkdir(parents=True, exist_ok=True)
    return exp_dir
