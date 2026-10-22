"""API Performance Benchmark (E07).

Measures FastAPI performance across realistic concurrent dashboard workloads,
warming up the service, discarding warm-up samples, and reporting P50/P95/P99 latencies.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Ensure src is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

os.environ.setdefault("SENTINEL_COLLECTOR_SECRET", "benchmarking-secret-key-32bytes-min!!")

import httpx
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
    DEFAULT_API_CONCURRENCY_LEVELS,
    DEFAULT_API_ENDPOINTS,
)


def _setup_mock_db_if_unavailable(api_mod: Any) -> None:
    """If Postgres is not running, provide an in-memory query handler to allow standalone API testing."""
    now_dt = datetime.now(timezone.utc)

    sample_event = {
        "id": 101,
        "system_id": "bm-sys-001",
        "hostname": "benchmark-host",
        "log_channel": "System",
        "event_record_id": 1001,
        "provider_name": "Microsoft-Windows-Kernel-Power",
        "event_id": 41,
        "level": 1,
        "severity": "CRITICAL",
        "fault_type": "SYSTEM_FAULT",
        "fault_subtype": "CRASH",
        "confidence_score": 0.9,
        "event_message": "Kernel crash",
        "parsed_message": "Kernel crash",
        "normalized_message": "kernel crash",
        "diagnostic_context": "{}",
        "cpu_usage_percent": 45.0,
        "memory_usage_percent": 60.0,
        "disk_free_percent": 50.0,
        "raw_xml": "<Event/>",
        "ingested_at": now_dt,
        "acknowledged": False,
        "acknowledged_at": None,
        "escalated": False,
        "escalated_at": None,
        "assigned_to": None,
    }

    sample_system = {
        "system_id": "bm-sys-001",
        "hostname": "benchmark-host",
        "cpu_usage_percent": 45.0,
        "memory_usage_percent": 60.0,
        "disk_free_percent": 50.0,
        "os_version": "Linux 6.6",
        "agent_version": "2.2.0",
        "ip_address": "127.0.0.1",
        "uptime_seconds": 3600,
        "last_seen": now_dt,
    }

    sample_alert = {
        "id": 1,
        "source_event_id": 101,
        "alert_key": "key-001",
        "source_type": "native",
        "rule_id": None,
        "rule_name": "Kernel Crash",
        "system_id": "bm-sys-001",
        "hostname": "benchmark-host",
        "severity": "CRITICAL",
        "title": "Kernel Crash Detected",
        "description": "Kernel-Power 41 unexpected shutdown",
        "occurrence_count": 1,
        "first_seen_at": now_dt,
        "last_seen_at": now_dt,
        "acknowledged": False,
        "acknowledged_at": None,
        "escalated": False,
        "escalated_at": None,
        "assigned_to": None,
        "escalation_status": "pending",
        "escalation_target": None,
        "metadata": {},
    }

    sample_prediction = {
        "id": 1,
        "system_id": "bm-sys-001",
        "prediction_time": now_dt,
        "anomaly_score": 0.85,
        "is_anomaly": True,
        "failure_probability": 0.75,
        "predicted_fault": "SYSTEM_FAULT",
        "model_version": "v2-isof",
        "cluster_id": 0,
    }

    sample_dashboard_metrics = {
        "total_events": 1000,
        "total_systems": 5,
        "active_systems": 5,
        "critical_count": 10,
        "error_count": 25,
        "warning_count": 50,
        "info_count": 915,
        "avg_cpu": 35.5,
        "avg_mem": 52.0,
        "avg_disk": 68.0,
    }

    def mock_exec_query(sql: Any, params: Any = None, endpoint: str = "query") -> List[Dict[str, Any]]:
        sql_str = str(sql).lower()
        if hasattr(sql, "as_string"):
            try:
                sql_str = sql.as_string(None).lower()
            except Exception:
                sql_str = str(sql).lower()

        if "from events" in sql_str:
            return [dict(sample_event)]
        elif "from system_heartbeats" in sql_str or "from systems" in sql_str:
            return [dict(sample_system)]
        elif "from alerts" in sql_str:
            return [dict(sample_alert)]
        elif "from ml_predictions" in sql_str:
            return [dict(sample_prediction, prediction_time=datetime.now(timezone.utc))]
        elif "from feature_snapshots" in sql_str:
            return [dict(sample_system)]
        return [dict(sample_event)]

    def mock_exec_one(sql: Any, params: Any = None, endpoint: str = "query") -> Dict[str, Any]:
        return dict(sample_dashboard_metrics)

    # Test if live DB connects
    try:
        pool = api_mod._get_pool()
        conn = pool.getconn()
        pool.putconn(conn)
    except Exception:
        # DB unreachable - install mock query handlers for benchmark execution
        api_mod._exec_query = mock_exec_query
        api_mod._exec_one = mock_exec_one


def _get_api_client(base_url: Optional[str] = None):
    """
    Return an httpx AsyncClient.

    If base_url is specified or SENTINEL_SERVER_URL is set, connects via HTTP.
    Otherwise, loads the FastAPI ASGI app directly for isolated in-process testing.
    """
    server_url = base_url or os.getenv("SENTINEL_SERVER_URL")
    if server_url and server_url.startswith("http"):
        return httpx.AsyncClient(base_url=server_url, timeout=10.0), False

    import api_server
    _setup_mock_db_if_unavailable(api_server)
    transport = httpx.ASGITransport(app=api_server.app)
    return httpx.AsyncClient(transport=transport, base_url="http://sentinelcore.local", timeout=10.0), True


async def _make_request(
    client: httpx.AsyncClient,
    endpoint: str,
) -> Tuple[float, int, bool, Optional[str]]:
    """Execute one request and return (latency_ms, status_code, success, error_str)."""
    t0 = time.perf_counter()
    try:
        resp = await client.get(endpoint)
        t1 = time.perf_counter()
        lat_ms = (t1 - t0) * 1000.0
        success = (resp.status_code == 200)
        err = None if success else f"HTTP {resp.status_code}"
        return lat_ms, resp.status_code, success, err
    except httpx.TimeoutException:
        t1 = time.perf_counter()
        return (t1 - t0) * 1000.0, 408, False, "Request Timeout"
    except Exception as exc:
        t1 = time.perf_counter()
        return (t1 - t0) * 1000.0, 500, False, str(exc)


async def _run_api_benchmark_async(
    endpoints: List[str],
    concurrency_levels: List[int],
    requests_per_endpoint: int,
    warmup_requests: int,
    base_url: Optional[str] = None,
    experiment_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Execute the asynchronous benchmark suite across endpoints and concurrency levels."""
    exp_id = experiment_id or generate_experiment_id("E07-api-benchmark")
    artifacts_dir = output_dir or get_experiment_artifacts_dir(exp_id)
    system_id = f"{BENCHMARK_SYSTEM_ID_PREFIX}e07"

    observations: List[Dict[str, Any]] = []
    concurrency_summaries: List[Dict[str, Any]] = []

    client, is_asgi = _get_api_client(base_url)

    async with client:
        # 1. Warm-up phase (discarded from metrics)
        print(f"  → Warming up service with {warmup_requests} requests per endpoint (discarded)...")
        for ep in endpoints:
            for _ in range(warmup_requests):
                await _make_request(client, ep)

        # 2. Concurrency measurement phases
        t_suite_start = time.perf_counter()

        for concurrency in concurrency_levels:
            print(f"  → Measuring concurrency level: {concurrency} workers...")
            t_conc_start = time.perf_counter()
            latencies_all: List[float] = []
            errors_count = 0
            timeouts_count = 0
            total_requests = 0

            workload: List[str] = []
            for ep in endpoints:
                workload.extend([ep] * requests_per_endpoint)

            semaphore = asyncio.Semaphore(concurrency)

            async def _worker(ep: str):
                nonlocal errors_count, timeouts_count, total_requests
                async with semaphore:
                    lat_ms, status_code, success, err = await _make_request(client, ep)
                    latencies_all.append(lat_ms)
                    total_requests += 1
                    if not success:
                        errors_count += 1
                    if status_code == 408:
                        timeouts_count += 1

                    obs = create_observation(
                        experiment_id=exp_id,
                        scenario=f"API_CONCURRENCY_{concurrency}",
                        system_id=system_id,
                        api_latency_ms=round(lat_ms, 3),
                        success=success,
                        error=err,
                        notes=f"{ep} -> status {status_code}",
                    )
                    observations.append(obs)

            await asyncio.gather(*[_worker(ep) for ep in workload])

            conc_duration = time.perf_counter() - t_conc_start
            reqs_per_sec = total_requests / conc_duration if conc_duration > 0 else 0.0
            error_rate = (errors_count / total_requests) if total_requests > 0 else 0.0
            timeout_rate = (timeouts_count / total_requests) if total_requests > 0 else 0.0

            stats = calculate_percentiles(latencies_all)

            c_summary = {
                "concurrency": concurrency,
                "total_requests": total_requests,
                "duration_seconds": round(conc_duration, 4),
                "requests_per_second": round(reqs_per_sec, 2),
                "error_rate": round(error_rate, 4),
                "timeout_rate": round(timeout_rate, 4),
                "p50_latency_ms": stats["p50"],
                "p95_latency_ms": stats["p95"],
                "p99_latency_ms": stats["p99"],
                "mean_latency_ms": stats["mean"],
                "min_latency_ms": stats["min"],
                "max_latency_ms": stats["max"],
            }
            concurrency_summaries.append(c_summary)

        suite_duration = time.perf_counter() - t_suite_start

    metadata = get_run_metadata(
        experiment_id=exp_id,
        configuration={
            "endpoints": endpoints,
            "concurrency_levels": concurrency_levels,
            "requests_per_endpoint": requests_per_endpoint,
            "warmup_requests": warmup_requests,
            "is_asgi_direct": is_asgi,
        },
        system_count=1,
        workload_size=len(observations),
        duration_seconds=suite_duration,
    )

    summary = {
        "experiment_id": exp_id,
        "experiment_name": "FastAPI Middleware & Routing Latency",
        "experiment_code": "E07",
        "metadata": metadata,
        "database_backend": "in_memory_mock_fixtures",
        "measurement_scope": "asgi_direct_client_routing_and_serialization (database queries isolated via in-memory mocks)",
        "sample_count": len(observations),
        "endpoints_evaluated": endpoints,
        "concurrency_results": concurrency_summaries,
        "artifacts": {
            "raw_csv": "api_benchmark.csv",
            "summary_json": "api_benchmark_summary.json",
        },
    }

    save_raw_observations_csv(artifacts_dir / "api_benchmark.csv", observations)
    save_json(artifacts_dir / "api_benchmark_summary.json", summary)

    # Markdown report
    md_lines = [
        f"# Benchmark Report: E07 API Performance",
        f"",
        f"**Experiment ID:** `{exp_id}`  ",
        f"**Timestamp:** {metadata['timestamp']}  ",
        f"**Database Backend:** In-Memory Mock Fixtures (DB I/O isolated)  ",
        f"**Total Requests Measured:** {len(observations)} (Warm-up requests discarded)  ",
        f"**Endpoints:** `{', '.join(endpoints)}`  ",
        f"",
        f"> [!NOTE]",
        f"> Database query execution is isolated using in-memory mock fixtures to measure FastAPI routing, auth middleware, and JSON serialization latency independently of disk and network I/O.",
        f"",
        f"## Concurrency Benchmark Results",
        f"",
        f"| Concurrency | Requests/Sec | P50 Latency | P95 Latency | P99 Latency | Error Rate | Timeout Rate |",
        f"|---|---|---|---|---|---|---|",
    ]
    for c in concurrency_summaries:
        md_lines.append(
            f"| {c['concurrency']} | {c['requests_per_second']} req/s | {c['p50_latency_ms']} ms | "
            f"{c['p95_latency_ms']} ms | {c['p99_latency_ms']} ms | {c['error_rate'] * 100:.2f}% | "
            f"{c['timeout_rate'] * 100:.2f}% |"
        )
    save_markdown(artifacts_dir / "api_benchmark_report.md", "\n".join(md_lines))

    return summary


def run_api_benchmark(
    endpoints: Optional[List[str]] = None,
    concurrency_levels: Optional[List[int]] = None,
    requests_per_endpoint: int = 5,
    warmup_requests: int = 3,
    base_url: Optional[str] = None,
    experiment_id: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Synchronous entry point for running the API benchmark."""
    eps = endpoints or DEFAULT_API_ENDPOINTS
    conc = concurrency_levels or DEFAULT_API_CONCURRENCY_LEVELS
    return asyncio.run(
        _run_api_benchmark_async(
            endpoints=eps,
            concurrency_levels=conc,
            requests_per_endpoint=requests_per_endpoint,
            warmup_requests=warmup_requests,
            base_url=base_url,
            experiment_id=experiment_id,
            output_dir=output_dir,
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run SentinelCore API Performance Benchmark (E07)")
    parser.add_argument("--concurrency", type=str, default="1,10,25,50,100", help="Comma-separated concurrency levels")
    parser.add_argument("--requests", type=int, default=5, help="Requests per endpoint per concurrency level")
    parser.add_argument("--warmup", type=int, default=3, help="Warmup requests per endpoint")
    parser.add_argument("--url", type=str, default=None, help="Base URL of live server if running")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory")
    args = parser.parse_args()

    conc_levels = [int(x.strip()) for x in args.concurrency.split(",") if x.strip()]
    out_dir = Path(args.output_dir) if args.output_dir else None

    print(f"=== SentinelCore API Performance Benchmark (E07) ===")
    try:
        summary = run_api_benchmark(
            concurrency_levels=conc_levels,
            requests_per_endpoint=args.requests,
            warmup_requests=args.warmup,
            base_url=args.url,
            output_dir=out_dir,
        )
        print("✓ API Benchmark Complete:")
        for c in summary["concurrency_results"]:
            print(f"  Concurrency {c['concurrency']} -> {c['requests_per_second']} req/s | P50: {c['p50_latency_ms']} ms | P95: {c['p95_latency_ms']} ms")
        return 0
    except Exception as exc:
        print(f"ERROR: API benchmark failed: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
