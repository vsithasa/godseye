"""Process collector."""

from typing import List, Dict, Any

import psutil


def collect_processes(limit: int = 30) -> List[Dict[str, Any]]:
    """
    Collect information about top processes by CPU and memory usage.

    Args:
        limit: Maximum number of processes to return (default: 30)

    Returns:
        List of process information dictionaries
    """
    processes = []

    # First pass: initialize CPU measurement for all processes
    for proc in psutil.process_iter(["pid", "name", "cmdline", "memory_info", "username"]):
        try:
            # Call cpu_percent() to start measurement (returns 0.0)
            proc.cpu_percent()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        except Exception:
            continue

    # Small delay to allow CPU measurement
    import time
    time.sleep(0.1)

    # Second pass: collect actual data with measured CPU
    for proc in psutil.process_iter(["pid", "name", "cmdline", "memory_info", "username"]):
        try:
            pinfo = proc.info

            # Get command line (truncated)
            cmdline = " ".join(pinfo["cmdline"]) if pinfo["cmdline"] else pinfo["name"]
            if len(cmdline) > 200:
                cmdline = cmdline[:197] + "..."

            # Get memory in bytes
            mem_bytes = pinfo["memory_info"].rss if pinfo["memory_info"] else 0

            # Get CPU percent (now returns actual value after initial call)
            cpu_pct = proc.cpu_percent()

            processes.append({
                "pid": pinfo["pid"],
                "cmd": cmdline,
                "cpu_pct": cpu_pct if cpu_pct is not None else 0.0,
                "mem_bytes": mem_bytes,
                "usr": pinfo["username"] or "unknown",  # Changed from "user" to "usr"
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            # Process disappeared or we don't have permission
            continue
        except Exception:
            # Skip any other errors
            continue

    # Sort by CPU usage (descending) and take top N
    processes.sort(key=lambda p: p["cpu_pct"], reverse=True)

    return processes[:limit]

