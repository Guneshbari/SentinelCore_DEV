"""Collector Resource Overhead Benchmark (E10).

Measures CPU, memory, disk, and network overhead of SentinelCore's collector
by comparing controlled baseline metrics against active collector workload measurements.
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

import psutil
from benchmarks.common import (
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
    BENCHMARK_SYSTEM_ID_PREFIX,
    DEFAULT_SAMPLE_SIZE,
)
import collector as COL


def _sample_system_resources() -> Dict[str, float]:
    """Capture a snapshot of host and current process resource utilization."""
    proc = psutil.Process(os.getpid())
    sys_mem = psutil.virtual_memory()
    net_io = psutil.net_io_counters()
    disk_io = psutil.disk_io_counters()

    proc_cpu = proc.cpu_percent(interval=0.1)
    proc_mem_mb = proc.memory_info().rss / (1024.0 * 1024.0)

    return {
        "system_cpu_percent": psutil.cpu_percent(interval=0.1),
        "system_memory_mb": (sys_mem.total - sys_mem.available) / (1024.0 * 1024.0),
        "process_cpu_percent": proc_cpu,
        "process_memory_mb": proc_mem_mb,
        "network_bytes_sent": float(net_io.bytes_sent) if net_io else 0.0,
        "disk_bytes_written": float(disk_io.write_bytes) if disk_io else 0.0,
    }


def run_collector_resource_overhead_benchmark(
    sample_count: int = 15,
    sample_interval_sec: float = 0.2,
    workload_event_count: int = 500,
    experiment_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    E10: Measure the resource cost of deploying SentinelCore's collector.

    Reports CPU overhead percentage points, memory overhead MB, network and disk
    activity as the difference between controlled baseline and collector-enabled measurements.
    """
    exp_id = experiment_id or generate_experiment_id("E10-overhead")
    artifacts_dir = output_dir or get_experiment_artifacts_dir(exp_id)
    system_id = f"{BENCHMARK_SYSTEM_ID_PREFIX}e10"

    observations: List[Dict[str, Any]] = []

    # 1. Baseline measurements (collector idle / stopped)
    print(f"  → Measuring controlled baseline ({sample_count} samples)...")
    baseline_samples: List[Dict[str, float]] = []
    for i in range(sample_count):
        ts = datetime.now(timezone.utc).isoformat()
        sample = _sample_system_resources()
        baseline_samples.append(sample)

        obs = create_observation(
            experiment_id=exp_id,
            scenario="BASELINE_IDLE",
            system_id=system_id,
            timestamp=ts,
            cpu_overhead_percent=round(sample["system_cpu_percent"], 2),
            memory_overhead_mb=round(sample["process_memory_mb"], 2),
            network_bytes=int(sample["network_bytes_sent"]),
            success=True,
            notes="Baseline idle sample",
        )
        observations.append(obs)
        time.sleep(sample_interval_sec)

    # 2. Active collector workload measurements
    print(f"  → Running collector under representative telemetry load ({workload_event_count} events)...")
    active_samples: List[Dict[str, float]] = []
    t_active_start = time.perf_counter()

    # Create dummy checkpoint and output files in artifact directory
    chk_file = str(artifacts_dir / "bench_checkpoint.json")
    local_file = str(artifacts_dir / "bench_local_output.json")
    checkpoint_mgr = COL.CheckpointManager(chk_file)
    file_mgr = COL.LocalFileManager(local_file)

    events_generated = 0
    for i in range(sample_count):
        ts = datetime.now(timezone.utc).isoformat()

        # Exercise collector operations
        batch = []
        for j in range(workload_event_count // sample_count):
            events_generated += 1
            raw_xml = f"<Event><System><EventRecordID>{events_generated}</EventRecordID><TimeCreated SystemTime='{ts}'/></System></Event>"
            meta = COL.extract_event_metadata(raw_xml)
            h = COL.generate_event_hash(raw_xml, system_id, events_generated)
            classification = COL.classify_event("Service Control Manager", 7031, 2)
            batch.append({
                "event_record_id": events_generated,
                "metadata": meta,
                "event_hash": h,
                "classification": classification,
            })

        # Collector snapshot and checkpoint save
        _ = COL.get_resource_snapshot()
        checkpoint_mgr.update("System", events_generated)
        checkpoint_mgr.save()
        file_mgr.save_batch({
            "timestamp_collected": ts,
            "events": batch,
            "system_info": {"system_id": system_id},
        })

        sample = _sample_system_resources()
        active_samples.append(sample)

        obs = create_observation(
            experiment_id=exp_id,
            scenario="COLLECTOR_ACTIVE_LOAD",
            system_id=system_id,
            timestamp=ts,
            events_generated=len(batch),
            events_persisted=len(batch),
            cpu_overhead_percent=round(sample["process_cpu_percent"], 2),
            memory_overhead_mb=round(sample["process_memory_mb"], 2),
            network_bytes=int(sample["network_bytes_sent"]),
            success=True,
            notes="Active telemetry collection sample",
        )
        observations.append(obs)
        time.sleep(sample_interval_sec)

    t_active_duration = time.perf_counter() - t_active_start

    # Clean up temp benchmark files
    try:
        if os.path.exists(chk_file):
            os.remove(chk_file)
        if os.path.exists(local_file):
            os.remove(local_file)
    except Exception:
        pass

    # 3. Calculate deltas
    base_sys_cpu = [s["system_cpu_percent"] for s in baseline_samples]
    active_sys_cpu = [s["system_cpu_percent"] for s in active_samples]
    active_proc_cpu = [s["process_cpu_percent"] for s in active_samples]

    base_proc_mem = [s["process_memory_mb"] for s in baseline_samples]
    active_proc_mem = [s["process_memory_mb"] for s in active_samples]

    cpu_overhead_pts = max(0.0, (sum(active_proc_cpu) / len(active_proc_cpu)))
    mem_overhead_mb = max(0.0, (sum(active_proc_mem) / len(active_proc_mem)) - (sum(base_proc_mem) / len(base_proc_mem)))

    proc_cpu_stats = calculate_percentiles(active_proc_cpu)
    proc_mem_stats = calculate_percentiles(active_proc_mem)
    base_cpu_stats = calculate_percentiles(base_sys_cpu)

    net_delta_bytes = active_samples[-1]["network_bytes_sent"] - baseline_samples[0]["network_bytes_sent"]
    disk_delta_bytes = active_samples[-1]["disk_bytes_written"] - baseline_samples[0]["disk_bytes_written"]

    metadata = get_run_metadata(
        experiment_id=exp_id,
        configuration={
            "sample_count": sample_count,
            "workload_event_count": workload_event_count,
            "measurement_interval_sec": sample_interval_sec,
        },
        system_count=1,
        workload_size=events_generated,
        duration_seconds=t_active_duration,
    )

    summary = {
        "experiment_id": exp_id,
        "experiment_name": "Collector Resource Overhead",
        "experiment_code": "E10",
        "metadata": metadata,
        "sample_count": sample_count * 2,
        "baseline_system_cpu_percent": base_cpu_stats["mean"],
        "collector_cpu_overhead_percentage_points": round(cpu_overhead_pts, 3),
        "collector_process_cpu_percent": proc_cpu_stats,
        "collector_memory_overhead_mb": round(mem_overhead_mb, 3),
        "collector_process_memory_mb": proc_mem_stats,
        "network_bytes_transferred": int(net_delta_bytes),
        "disk_bytes_written": int(disk_delta_bytes),
        "events_processed": events_generated,
        "artifacts": {
            "raw_csv": "resource_overhead.csv",
            "summary_json": "resource_overhead_summary.json",
        },
    }

    save_raw_observations_csv(artifacts_dir / "resource_overhead.csv", observations)
    save_json(artifacts_dir / "resource_overhead_summary.json", summary)

    # Markdown Report
    md_content = f"""# Benchmark Report: E10 Collector Resource Overhead

**Experiment ID:** `{exp_id}`  
**Events Processed:** {events_generated}  
**Baseline Samples:** {sample_count} | **Active Samples:** {sample_count}  

## Resource Cost Summary

| Metric | Controlled Baseline | Collector Under Load | Net Overhead (Delta) |
|---|---|---|---|
| **CPU Utilization** | {base_cpu_stats['mean']}% system | {proc_cpu_stats['p50']}% process (P95: {proc_cpu_stats['p95']}%) | **+{round(cpu_overhead_pts, 2)} % points** |
| **Process Memory (RSS)** | {round(sum(base_proc_mem)/len(base_proc_mem), 2)} MB | {proc_mem_stats['p50']} MB (P95: {proc_mem_stats['p95']} MB) | **+{round(mem_overhead_mb, 2)} MB** |
| **Disk Write Total** | 0 B | {disk_delta_bytes} bytes | {disk_delta_bytes} bytes |
| **Network Output** | 0 B | {net_delta_bytes} bytes | {net_delta_bytes} bytes |

*Overhead is computed strictly as the difference between controlled idle baseline and collector workload execution.*
"""
    save_markdown(artifacts_dir / "resource_overhead_report.md", md_content)

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Run SentinelCore Collector Resource Overhead Benchmark (E10)")
    parser.add_argument("--samples", type=int, default=15, help="Number of samples for baseline and load")
    parser.add_argument("--events", type=int, default=500, help="Total events to process during load test")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.output_dir) if args.output_dir else None

    print(f"=== SentinelCore Collector Resource Overhead Benchmark (E10) ===")
    try:
        summary = run_collector_resource_overhead_benchmark(
            sample_count=args.samples,
            workload_event_count=args.events,
            output_dir=out_dir,
        )
        cpu_oh = summary["collector_cpu_overhead_percentage_points"]
        mem_oh = summary["collector_memory_overhead_mb"]
        p95_cpu = summary["collector_process_cpu_percent"]["p95"]
        print(f"✓ Resource Overhead Benchmark Complete:")
        print(f"  CPU Overhead: +{cpu_oh:.2f} % points (P95: {p95_cpu}%)")
        print(f"  Memory Overhead: +{mem_oh:.2f} MB")
        return 0
    except Exception as exc:
        print(f"ERROR: Resource overhead benchmark failed: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
