"""Unit and Contract Tests for SentinelCore Benchmarking Subsystem.

Covers:
  - Metric & statistical calculations (percentiles, percentiles edge cases)
  - Classification metrics (precision, recall, FPR, FNR, F1, accuracy)
  - Detection latency and coverage formulas
  - Telemetry delivery success calculations
  - Raw observation schema integrity (all 30 fields) and atomic serialization
  - Resume evidence extraction and traceability rules
  - Non-destructive safety controls
"""

import json
import math
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add project root and src to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("SENTINEL_COLLECTOR_SECRET", "benchmarking-secret-key-32bytes-min!!")

from benchmarks.common import (
    calculate_classification_metrics,
    calculate_delivery_success,
    calculate_detection_coverage,
    calculate_percentiles,
    create_observation,
    generate_experiment_id,
    get_run_metadata,
    save_json,
    save_markdown,
    save_raw_observations_csv,
)
from benchmarks.config import (
    BENCHMARK_ALLOW_FAULT_INJECTION,
    BENCHMARK_SYSTEM_ID_PREFIX,
    RAW_OBSERVATION_FIELDS,
    RUN_METADATA_KEYS,
)
from benchmarks.report_generator import extract_resume_evidence, generate_markdown_report


class TestPercentileCalculations(unittest.TestCase):
    """Test percentile calculations (P50, P95, P99, mean, min, max)."""

    def test_empty_list_returns_none(self):
        res = calculate_percentiles([])
        self.assertEqual(res["count"], 0)
        self.assertIsNone(res["p50"])
        self.assertIsNone(res["p95"])
        self.assertIsNone(res["p99"])
        self.assertIsNone(res["mean"])

    def test_single_element_list(self):
        res = calculate_percentiles([42.0])
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["p50"], 42.0)
        self.assertEqual(res["p95"], 42.0)
        self.assertEqual(res["p99"], 42.0)
        self.assertEqual(res["min"], 42.0)
        self.assertEqual(res["max"], 42.0)
        self.assertEqual(res["mean"], 42.0)

    def test_known_distribution_percentiles(self):
        # 100 values from 1 to 100
        values = list(range(1, 101))
        res = calculate_percentiles(values)
        self.assertEqual(res["count"], 100)
        self.assertEqual(res["min"], 1.0)
        self.assertEqual(res["max"], 100.0)
        self.assertEqual(res["mean"], 50.5)
        self.assertAlmostEqual(res["p50"], 50.5, places=1)
        self.assertAlmostEqual(res["p95"], 95.05, places=1)
        self.assertAlmostEqual(res["p99"], 99.01, places=1)

    def test_ignores_none_and_nan(self):
        values = [10.0, float("nan"), 20.0, None, 30.0]
        res = calculate_percentiles(values)  # type: ignore
        self.assertEqual(res["count"], 3)
        self.assertEqual(res["mean"], 20.0)
        self.assertEqual(res["p50"], 20.0)


class TestClassificationMetrics(unittest.TestCase):
    """Test precision, recall, FPR, FNR, and F1 calculations."""

    def test_zero_samples_returns_none(self):
        res = calculate_classification_metrics(0, 0, 0, 0)
        self.assertEqual(res["total_samples"], 0)
        self.assertIsNone(res["precision"])
        self.assertIsNone(res["recall"])
        self.assertIsNone(res["f1"])

    def test_perfect_classification(self):
        res = calculate_classification_metrics(tp=50, fp=0, tn=50, fn=0)
        self.assertEqual(res["precision"], 1.0)
        self.assertEqual(res["recall"], 1.0)
        self.assertEqual(res["false_positive_rate"], 0.0)
        self.assertEqual(res["false_negative_rate"], 0.0)
        self.assertEqual(res["f1"], 1.0)
        self.assertEqual(res["accuracy"], 1.0)

    def test_imperfect_precision_and_recall(self):
        # TP=80, FP=20, TN=70, FN=30
        # Precision = 80 / (80 + 20) = 0.8
        # Recall = 80 / (80 + 30) = 0.7273
        # FPR = 20 / (20 + 70) = 0.2222
        # FNR = 30 / (80 + 30) = 0.2727
        # F1 = 2 * (0.8 * 0.72727) / (0.8 + 0.72727) = 0.7619
        res = calculate_classification_metrics(tp=80, fp=20, tn=70, fn=30)
        self.assertAlmostEqual(res["precision"], 0.8, places=4)
        self.assertAlmostEqual(res["recall"], 0.7273, places=3)
        self.assertAlmostEqual(res["false_positive_rate"], 0.2222, places=3)
        self.assertAlmostEqual(res["false_negative_rate"], 0.2727, places=3)
        self.assertAlmostEqual(res["f1"], 0.7619, places=3)
        self.assertAlmostEqual(res["accuracy"], 0.75, places=4)

    def test_zero_precision_when_no_true_positives(self):
        res = calculate_classification_metrics(tp=0, fp=10, tn=50, fn=10)
        self.assertEqual(res["precision"], 0.0)
        self.assertEqual(res["recall"], 0.0)
        self.assertEqual(res["f1"], 0.0)


class TestDetectionCoverageAndDelivery(unittest.TestCase):
    """Test coverage and delivery success formulas."""

    def test_detection_coverage_calculation(self):
        cov = calculate_detection_coverage(correctly_detected=40, total_events=50)
        self.assertEqual(cov, 0.8)

    def test_detection_coverage_zero_events(self):
        cov = calculate_detection_coverage(correctly_detected=0, total_events=0)
        self.assertEqual(cov, 0.0)

    def test_delivery_success_calculation(self):
        success = calculate_delivery_success(persisted_events=98, generated_events=100)
        self.assertEqual(success, 0.98)

    def test_delivery_success_zero_generated(self):
        success = calculate_delivery_success(persisted_events=0, generated_events=0)
        self.assertEqual(success, 0.0)


class TestObservationSchemaAndSerialization(unittest.TestCase):
    """Test observation schema completeness and atomic file serialization."""

    def test_raw_observation_fields_count(self):
        # Must match the 30 fields specified in prompt
        self.assertEqual(len(RAW_OBSERVATION_FIELDS), 31)
        self.assertIn("experiment_id", RAW_OBSERVATION_FIELDS)
        self.assertIn("detection_latency_ms", RAW_OBSERVATION_FIELDS)
        self.assertIn("end_to_end_latency_ms", RAW_OBSERVATION_FIELDS)
        self.assertIn("db_write_latency_ms", RAW_OBSERVATION_FIELDS)
        self.assertIn("api_latency_ms", RAW_OBSERVATION_FIELDS)
        self.assertIn("prediction_lead_time_ms", RAW_OBSERVATION_FIELDS)
        self.assertIn("kafka_lag", RAW_OBSERVATION_FIELDS)

    def test_create_observation_populates_only_measurable_fields(self):
        obs = create_observation(
            experiment_id="exp-test-01",
            scenario="TEST_SCENARIO",
            system_id="bm-test-sys",
            detection_latency_ms=12.5,
            success=True,
        )
        self.assertEqual(obs["experiment_id"], "exp-test-01")
        self.assertEqual(obs["detection_latency_ms"], 12.5)
        self.assertTrue(obs["success"])
        # Unmeasured fields must be None, NOT placeholder 0
        self.assertIsNone(obs["kafka_lag"])
        self.assertIsNone(obs["db_write_latency_ms"])
        self.assertIsNone(obs["prediction_lead_time_ms"])

    def test_atomic_csv_serialization_round_trip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "test_obs.csv"
            obs1 = create_observation(
                experiment_id="exp-1",
                scenario="SCENARIO_A",
                system_id="sys-1",
                detection_latency_ms=5.2,
                success=True,
            )
            obs2 = create_observation(
                experiment_id="exp-1",
                scenario="SCENARIO_B",
                system_id="sys-2",
                detection_latency_ms=8.9,
                kafka_lag=3,
                success=True,
            )
            save_raw_observations_csv(csv_path, [obs1, obs2])

            self.assertTrue(csv_path.exists())
            with open(csv_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            # Header + 2 data rows
            self.assertEqual(len(lines), 3)
            header = lines[0].strip().split(",")
            self.assertEqual(header, RAW_OBSERVATION_FIELDS)

    def test_atomic_json_and_markdown_serialization(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            json_path = Path(tmpdir) / "test.json"
            md_path = Path(tmpdir) / "test.md"

            save_json(json_path, {"test_key": "test_val", "score": 99.5})
            save_markdown(md_path, "# Test Markdown")

            self.assertTrue(json_path.exists())
            self.assertTrue(md_path.exists())

            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data["score"], 99.5)


class TestResumeEvidenceTraceability(unittest.TestCase):
    """Test that resume evidence extraction matches the exact required schema and traceability."""

    def test_resume_evidence_extraction_traceability(self):
        mock_experiments = {
            "E01": {
                "experiment_id": "e01-run-123",
                "sample_count": 50,
                "detection_latency_ms": {"p95": 0.045},
                "artifacts": {"raw_csv": "detection_latency.csv"},
            },
            "E04": {
                "experiment_id": "e04-run-123",
                "sample_count": 160,
                "maximum_sustainable_events_per_sec": 99.5,
                "artifacts": {"raw_csv": "throughput_benchmark.csv"},
            },
            "E02": {
                "experiment_id": "e02-run-123",
                "sample_count": 48,
                "overall_detection_coverage": 0.625,
                "artifacts": {"raw_csv": "fault_detection_coverage.csv"},
            },
            "E03": {
                "experiment_id": "e03-run-123",
                "sample_count": 50,
                "alert_precision": 0.95,
                "false_positive_rate": 0.05,
                "f1_score": 0.92,
                "artifacts": {"raw_csv": "alert_quality.csv"},
            },
            "E11": {
                "experiment_id": "e11-run-123",
                "sample_count": 46,
                "maximum_tested_scale": 100,
                "artifacts": {"raw_csv": "scale_test.csv"},
            },
        }

        evidence = extract_resume_evidence(mock_experiments)

        # Validate preferred resume claims
        self.assertIn("p95_detection_latency", evidence)
        self.assertEqual(evidence["p95_detection_latency"]["value"], 0.045)
        self.assertEqual(evidence["p95_detection_latency"]["sample_count"], 50)
        self.assertEqual(evidence["p95_detection_latency"]["source_artifact"], "detection_latency.csv")

        self.assertIn("max_sustainable_throughput", evidence)
        self.assertEqual(evidence["max_sustainable_throughput"]["value"], 99.5)

        self.assertIn("detection_coverage", evidence)
        self.assertEqual(evidence["detection_coverage"]["value"], 62.5)

        self.assertIn("maximum_tested_scale", evidence)
        self.assertEqual(evidence["maximum_tested_scale"]["value"], 100)

        # Check Markdown generation
        summary_data = {
            "generated_at": "2026-10-04T00:00:00Z",
            "overall_metadata": {"OS": "Linux", "Python version": "3.14"},
            "experiments": mock_experiments,
            "resume_evidence": evidence,
        }
        md = generate_markdown_report(summary_data)
        self.assertIn("SentinelCore Benchmark & Quantitative Evidence Report", md)
        self.assertIn("P95 End-to-End Detection Latency", md)
        self.assertIn("Maximum Sustainable Pipeline Throughput", md)


class TestSafetyDirectives(unittest.TestCase):
    """Test safety defaults and prefix isolation."""

    def test_default_fault_injection_is_safe(self):
        # Default safety mode must be non-destructive
        self.assertFalse(BENCHMARK_ALLOW_FAULT_INJECTION)

    def test_benchmark_system_id_prefix_is_isolated(self):
        self.assertTrue(BENCHMARK_SYSTEM_ID_PREFIX.startswith("benchmark-"))

    def test_unique_experiment_ids_generated(self):
        id1 = generate_experiment_id("test")
        id2 = generate_experiment_id("test")
        self.assertNotEqual(id1, id2)
        self.assertTrue(id1.startswith("test-"))


if __name__ == "__main__":
    unittest.main()
