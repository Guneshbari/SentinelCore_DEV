from __future__ import annotations

import os

def env_int(name: str, default: int) -> int:
    """Read an integer environment variable with a safe fallback."""
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default

def env_float(name: str, default: float) -> float:
    """Read a float environment variable with a safe fallback."""
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default

def env_bool(name: str, default: bool = False) -> bool:
    """Read a boolean environment variable."""
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}

def env_csv(name: str, default: str) -> list[str]:
    """Read a comma-separated environment variable into a list."""
    raw_value = os.getenv(name, default)
    return [item.strip() for item in raw_value.split(",") if item.strip()]

LEVEL_NAMES = {1: "CRITICAL", 2: "ERROR", 3: "WARNING", 4: "INFO", 5: "VERBOSE"}
