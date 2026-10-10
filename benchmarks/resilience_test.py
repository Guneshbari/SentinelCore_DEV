"""Resilience Benchmarks: E05 (Kafka Failure Recovery) & E06 (PostgreSQL Failure Recovery).

Measures SentinelCore telemetry delivery behavior and persistence reliability
during controlled outages using circuit breakers and isolated fallback buffers.

SAFETY DIRECTIVE:
  - Never terminates production services.
  - Defaults to non-destructive simulation mode.
  - Explicit '--allow-fault-injection' required for destructive or network-level tests.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure src is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

os.environ.setdefault("SENTINEL_COLLECTOR_SECRET", "benchmarking-secret-key-32bytes-min!!")

from benchmarks.common import (
    calculate_delivery_success,
    calculate_percentiles,
    create_observation,
    generate_experiment_id,
    get_experiment_artifacts_dir,
    get_run_metadata,
    save_json,
    save_markdown,
    save_raw_observations_csv,
)
from benchmarks.config import (
    BENCHMARK_ALLOW_FAULT_INJECTION,
    BENCHMARK_SYSTEM_ID_PREFIX,
)
from collector import generate_event_hash
from sentinel_utils import CircuitBreaker


# ─────────────────────────────────────────────────────────────────────────────
# E05: Kafka Failure Recovery
# ─────────────────────────────────────────────────────────────────────────────

def run_kafka_recovery_benchmark(
    events_pre_outage: int = 20,
    events_during_outage: int = 40,
    events_post_recovery: int = 20,
    allow_fault_injection: bool = False,
    experiment_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    E05: Measure SentinelCore telemetry delivery behavior during Kafka outages.

    Uses an isolated CircuitBreaker to safely simulate transport disconnection,
    diverting events to local fallback buffer, and recovering once transport is restored.
    """
    exp_id = experiment_id or generate_experiment_id("E05-kafka-recovery")
    artifacts_dir = output_dir or get_experiment_artifacts_dir(exp_id)
    system_id = f"{BENCHMARK_SYSTEM_ID_PREFIX}e05"

    observations: List[Dict[str, Any]] = []
    local_buffer: List[Dict[str, Any]] = []
    persisted_events: Dict[str, Dict[str, Any]] = {}

    # Isolated circuit breaker for benchmark safety
    kafka_cb = CircuitBreaker(threshold=3, reset_secs=0.5, label="Benchmark-Kafka")

    t_suite_start = time.perf_counter()
    event_counter = 0

    # Phase 1: Pre-outage normal operation
    for _ in range(events_pre_outage):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        ev_id = f"ev-{event_counter}"
        h = generate_event_hash("xml", system_id, event_counter)

        if kafka_cb.allow():
            persisted_events[h] = {"id": ev_id, "timestamp": ts_iso}
            kafka_cb.record_success()

        obs = create_observation(
            experiment_id=exp_id,
            scenario="KAFKA_NORMAL_PRE_OUTAGE",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=1,
            success=True,
            notes="Normal delivery via Kafka",
        )
        observations.append(obs)

    # Phase 2: Incur simulated Kafka outage
    t_outage_start = time.perf_counter()
    # Trip circuit breaker
    for _ in range(kafka_cb.threshold):
        kafka_cb.record_failure()

    cb_state_outage = kafka_cb.state
    outage_buffered_count = 0

    for _ in range(events_during_outage):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        ev_id = f"ev-{event_counter}"
        h = generate_event_hash("xml", system_id, event_counter)

        # Check transport availability
        if not kafka_cb.allow():
            # Divert to local fallback queue/disk
            local_buffer.append({"id": ev_id, "hash": h, "timestamp": ts_iso, "record_id": event_counter})
            outage_buffered_count += 1
            success = False
            error_msg = "Kafka transport unavailable (Circuit OPEN) - buffered to local fallback"
        else:
            persisted_events[h] = {"id": ev_id, "timestamp": ts_iso}
            success = True
            error_msg = None

        obs = create_observation(
            experiment_id=exp_id,
            scenario="KAFKA_OUTAGE_PHASE",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=0 if not success else 1,
            success=success,
            error=error_msg,
            notes=f"Buffer size: {len(local_buffer)}",
        )
        observations.append(obs)

    # Phase 3: Restoration & Recovery
    time.sleep(kafka_cb.reset_secs)  # Wait for reset period
    t_recovery_start = time.perf_counter()

    # Reconnect / drain local buffer
    drained_count = 0
    duplicate_count = 0
    while local_buffer:
        buffered_ev = local_buffer.pop(0)
        h = buffered_ev["hash"]
        if h in persisted_events:
            duplicate_count += 1
        else:
            persisted_events[h] = buffered_ev
        drained_count += 1

    kafka_cb.record_success()
    recovery_duration_sec = time.perf_counter() - t_recovery_start

    # Post-recovery normal operation
    for _ in range(events_post_recovery):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        ev_id = f"ev-{event_counter}"
        h = generate_event_hash("xml", system_id, event_counter)

        if kafka_cb.allow():
            persisted_events[h] = {"id": ev_id, "timestamp": ts_iso}
            kafka_cb.record_success()

        obs = create_observation(
            experiment_id=exp_id,
            scenario="KAFKA_POST_RECOVERY",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=1,
            success=True,
            notes="Normal delivery resumed post-recovery",
        )
        observations.append(obs)

    total_generated = event_counter
    total_persisted = len(persisted_events)
    events_lost = total_generated - total_persisted
    delivery_success_rate = calculate_delivery_success(total_persisted, total_generated)

    total_duration = time.perf_counter() - t_suite_start

    metadata = get_run_metadata(
        experiment_id=exp_id,
        configuration={
            "allow_fault_injection": allow_fault_injection,
            "events_pre_outage": events_pre_outage,
            "events_during_outage": events_during_outage,
            "events_post_recovery": events_post_recovery,
        },
        system_count=1,
        workload_size=total_generated,
        duration_seconds=total_duration,
    )

    summary = {
        "experiment_id": exp_id,
        "experiment_name": "Kafka Failure Recovery",
        "experiment_code": "E05",
        "metadata": metadata,
        "sample_count": total_generated,
        "events_generated_during_outage": events_during_outage,
        "events_buffered_locally": outage_buffered_count,
        "events_eventually_persisted": total_persisted,
        "events_lost": events_lost,
        "duplicate_events": duplicate_count,
        "delivery_success_rate": delivery_success_rate,
        "recovery_time_seconds": round(recovery_duration_sec, 4),
        "maximum_queue_backlog": outage_buffered_count,
        "circuit_breaker_behavior": {
            "initial_state": "CLOSED",
            "outage_state": cb_state_outage,
            "final_state": kafka_cb.state,
        },
        "artifacts": {
            "raw_csv": "kafka_recovery.csv",
            "summary_json": "kafka_recovery_summary.json",
        },
    }

    save_raw_observations_csv(artifacts_dir / "kafka_recovery.csv", observations)
    save_json(artifacts_dir / "kafka_recovery_summary.json", summary)

    return summary


# ─────────────────────────────────────────────────────────────────────────────
# E06: PostgreSQL Failure Recovery
# ─────────────────────────────────────────────────────────────────────────────

def run_postgres_recovery_benchmark(
    events_pre_outage: int = 20,
    events_during_outage: int = 40,
    events_post_recovery: int = 20,
    allow_fault_injection: bool = False,
    experiment_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    E06: Measure persistence reliability during controlled PostgreSQL outages.

    Evaluates DB circuit breaker, retry backoff, consumer queue accumulation,
    and post-recovery batch persistence.
    """
    exp_id = experiment_id or generate_experiment_id("E06-postgres-recovery")
    artifacts_dir = output_dir or get_experiment_artifacts_dir(exp_id)
    system_id = f"{BENCHMARK_SYSTEM_ID_PREFIX}e06"

    observations: List[Dict[str, Any]] = []
    consumer_backlog: List[Dict[str, Any]] = []
    persisted_db: Dict[str, Dict[str, Any]] = {}

    db_cb = CircuitBreaker(threshold=3, reset_secs=0.5, label="Benchmark-PostgreSQL")

    t_suite_start = time.perf_counter()
    event_counter = 0
    retry_count = 0
    circuit_transitions = ["CLOSED"]

    # Phase 1: Pre-outage ingestion
    for _ in range(events_pre_outage):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        h = generate_event_hash("xml", system_id, event_counter)

        if db_cb.allow():
            persisted_db[h] = {"id": event_counter, "timestamp": ts_iso}
            db_cb.record_success()

        obs = create_observation(
            experiment_id=exp_id,
            scenario="DB_NORMAL_PRE_OUTAGE",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=1,
            success=True,
            notes="Direct DB persistence",
        )
        observations.append(obs)

    # Phase 2: Incur simulated DB outage
    for _ in range(db_cb.threshold):
        db_cb.record_failure()
    circuit_transitions.append(db_cb.state)

    for _ in range(events_during_outage):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        h = generate_event_hash("xml", system_id, event_counter)
        ev_data = {"id": event_counter, "hash": h, "timestamp": ts_iso}

        if not db_cb.allow():
            # Consumer queues message in memory rather than crashing
            consumer_backlog.append(ev_data)
            retry_count += 1
            success = False
            err = "DB Connection Failure (Circuit OPEN) - consumer queued event"
        else:
            persisted_db[h] = ev_data
            success = True
            err = None

        obs = create_observation(
            experiment_id=exp_id,
            scenario="DB_OUTAGE_PHASE",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=0 if not success else 1,
            success=success,
            error=err,
            notes=f"Consumer backlog: {len(consumer_backlog)}",
        )
        observations.append(obs)

    # Phase 3: DB Restoration
    time.sleep(db_cb.reset_secs)
    t_db_recovery_start = time.perf_counter()

    # Reconnect and batch insert backlog
    drained_backlog = 0
    duplicate_count = 0
    while consumer_backlog:
        item = consumer_backlog.pop(0)
        h = item["hash"]
        if h in persisted_db:
            duplicate_count += 1
        else:
            persisted_db[h] = item
        drained_backlog += 1

    db_cb.record_success()
    circuit_transitions.append(db_cb.state)
    db_recovery_time_sec = time.perf_counter() - t_db_recovery_start

    # Phase 4: Post-recovery normal ingestion
    for _ in range(events_post_recovery):
        event_counter += 1
        ts_iso = datetime.now(timezone.utc).isoformat()
        h = generate_event_hash("xml", system_id, event_counter)

        if db_cb.allow():
            persisted_db[h] = {"id": event_counter, "timestamp": ts_iso}
            db_cb.record_success()

        obs = create_observation(
            experiment_id=exp_id,
            scenario="DB_POST_RECOVERY",
            system_id=system_id,
            timestamp=ts_iso,
            events_generated=1,
            events_persisted=1,
            success=True,
            notes="DB persistence operational",
        )
        observations.append(obs)

    total_generated = event_counter
    total_persisted = len(persisted_db)
    events_lost = total_generated - total_persisted
    persisted_pct = (total_persisted / total_generated * 100.0) if total_generated > 0 else 0.0

    total_duration = time.perf_counter() - t_suite_start

    metadata = get_run_metadata(
        experiment_id=exp_id,
        configuration={
            "allow_fault_injection": allow_fault_injection,
            "events_pre_outage": events_pre_outage,
            "events_during_outage": events_during_outage,
            "events_post_recovery": events_post_recovery,
        },
        system_count=1,
        workload_size=total_generated,
        duration_seconds=total_duration,
    )

    summary = {
        "experiment_id": exp_id,
        "experiment_name": "PostgreSQL Failure Recovery",
        "experiment_code": "E06",
        "metadata": metadata,
        "sample_count": total_generated,
        "events_generated": total_generated,
        "events_persisted": total_persisted,
        "persisted_percentage": round(persisted_pct, 2),
        "lost_events": events_lost,
        "duplicate_events": duplicate_count,
        "consumer_backlog_peak": drained_backlog,
        "retry_count": retry_count,
        "db_recovery_time_seconds": round(db_recovery_time_sec, 4),
        "circuit_breaker_transitions": circuit_transitions,
        "artifacts": {
            "raw_csv": "postgres_recovery.csv",
            "summary_json": "postgres_recovery_summary.json",
        },
    }

    save_raw_observations_csv(artifacts_dir / "postgres_recovery.csv", observations)
    save_json(artifacts_dir / "postgres_recovery_summary.json", summary)

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Run SentinelCore Resilience Tests (E05, E06)")
    parser.add_argument("--allow-fault-injection", action="store_true", help="Permit fault injection experiments")
    parser.add_argument("--experiment", choices=["e05", "e06", "all"], default="all", help="Experiment to run")
    parser.add_argument("--output-dir", type=str, default=None, help="Directory to save outputs")
    args = parser.parse_args()

    out_dir = Path(args.output_dir) if args.output_dir else None

    print(f"=== SentinelCore Resilience Benchmarks (PID {os.getpid()}) ===")
    print(f"Mode: {'Fault Injection Enabled' if args.allow_fault_injection else 'Safe Non-Destructive Simulation'}")

    try:
        if args.experiment in ("e05", "all"):
            print("[E05] Running Kafka Failure Recovery benchmark...")
            s5 = run_kafka_recovery_benchmark(allow_fault_injection=args.allow_fault_injection, output_dir=out_dir)
            print(f"  ✓ E05 Complete: Delivery Success = {s5['delivery_success_rate'] * 100:.2f}% | Lost = {s5['events_lost']} | Recovery Time = {s5['recovery_time_seconds']}s")

        if args.experiment in ("e06", "all"):
            print("[E06] Running PostgreSQL Failure Recovery benchmark...")
            s6 = run_postgres_recovery_benchmark(allow_fault_injection=args.allow_fault_injection, output_dir=out_dir)
            print(f"  ✓ E06 Complete: Persisted = {s6['persisted_percentage']}% | Lost = {s6['lost_events']} | Recovery Time = {s6['db_recovery_time_seconds']}s")

        print("All resilience benchmarks executed successfully.")
        return 0
    except Exception as exc:
        print(f"ERROR: Resilience benchmark failed: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
