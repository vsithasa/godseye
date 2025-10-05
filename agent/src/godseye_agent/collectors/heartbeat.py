"""Heartbeat metrics collector."""

import time
from datetime import datetime, timezone
from typing import Dict, Any

import psutil


def collect_heartbeat() -> Dict[str, Any]:
    """
    Collect heartbeat metrics.

    Returns uptime, load averages, CPU%, and memory usage.
    """
    # Get current timestamp in ISO 8601 format with Z suffix
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

    # Get uptime
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)

    # Get load averages (1, 5, 15 minutes)
    load_avg = psutil.getloadavg()

    # Get CPU percentage (non-blocking, instant reading)
    cpu_percent = psutil.cpu_percent(interval=0)

    # Get memory info
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    return {
        "ts": timestamp,
        "uptime_s": uptime_seconds,
        "load": {
            "m1": load_avg[0],
            "m5": load_avg[1],
            "m15": load_avg[2],
        },
        "cpu_pct": cpu_percent,
        "mem": {
            "used": mem.used,
            "free": mem.available,  # available is more accurate than free
            "swap_used": swap.used,
        },
    }

