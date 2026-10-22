"""Timeout helpers for bounded blocking work."""

from __future__ import annotations

import atexit
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import Any, Callable, Optional, Tuple

from shared.resilience_constants import DB_QUERY_TIMEOUT_SECONDS

logger = logging.getLogger("sentinel_utils.timeout")

# Bounded persistent thread pool for timeout-managed operations.
# Using a shared pool prevents:
# 1. Thread creation storms under load.
# 2. Unexpected blocking during executor context-manager shutdown (shutdown(wait=True)).
_TIMEOUT_POOL: Optional[ThreadPoolExecutor] = None
_POOL_LOCK = threading.Lock()
_MAX_TIMEOUT_WORKERS = 16


def get_timeout_pool() -> ThreadPoolExecutor:
    """Return or lazily initialize the shared bounded thread pool."""
    global _TIMEOUT_POOL
    with _POOL_LOCK:
        if _TIMEOUT_POOL is None:
            _TIMEOUT_POOL = ThreadPoolExecutor(
                max_workers=_MAX_TIMEOUT_WORKERS,
                thread_name_prefix="sentinel-timeout",
            )
        return _TIMEOUT_POOL


def shutdown_timeout_pool(wait: bool = False, cancel_futures: bool = True) -> None:
    """
    Shut down the shared timeout thread pool cleanly.

    Args:
        wait: If True, blocks until running tasks finish. Defaults to False to prevent hangs.
        cancel_futures: If True, cancels pending futures that have not started.
    """
    global _TIMEOUT_POOL
    with _POOL_LOCK:
        if _TIMEOUT_POOL is not None:
            _TIMEOUT_POOL.shutdown(wait=wait, cancel_futures=cancel_futures)
            _TIMEOUT_POOL = None


atexit.register(shutdown_timeout_pool, wait=False, cancel_futures=True)


def timeout_wrapper(
    fn: Callable,
    *args: Any,
    timeout_secs: float = float(DB_QUERY_TIMEOUT_SECONDS),
    label: str = "op",
    **kwargs: Any,
) -> Tuple[Any, bool]:
    """
    Run fn with a strict timeout using a persistent bounded ThreadPoolExecutor.

    Cancellation Semantics:
    - Standard Python cannot safely force-kill an arbitrary running OS thread without
      risking interpreter deadlocks or corrupted mutex state. Therefore, this function
      cannot promise hard preemption of active compute or non-interruptible C extensions.
    - If fn does not complete before timeout_secs, this function immediately
      returns (None, False) to the caller without blocking on thread completion.
    - The underlying future is cancelled if it has not yet begun execution.
    - The worker thread continues running in the bounded pool until natural completion,
      ensuring system resources remain bounded without leaking unbounded threads.

    Returns:
        (result, True) if the call completes before timeout_secs,
        or (None, False) immediately on timeout.
    """
    pool = get_timeout_pool()
    future = pool.submit(fn, *args, **kwargs)
    try:
        result = future.result(timeout=timeout_secs)
        return result, True
    except TimeoutError:
        logger.error(
            "[timeout_wrapper] %s exceeded %.1fs - returning fallback",
            label,
            timeout_secs,
        )
        future.cancel()
        return None, False
    except Exception as exc:
        raise exc
