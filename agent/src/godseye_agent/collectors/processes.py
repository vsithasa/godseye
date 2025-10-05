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

    for proc in psutil.process_iter(["pid", "name", "cmdline", "cpu_percent", "memory_info", "username"]):
        try:
            pinfo = proc.info

            # Get command line (truncated)
            cmdline = " ".join(pinfo["cmdline"]) if pinfo["cmdline"] else pinfo["name"]
            if len(cmdline) > 200:
                cmdline = cmdline[:197] + "..."

            # Get memory in bytes
            mem_bytes = pinfo["memory_info"].rss if pinfo["memory_info"] else 0

            processes.append({
                "pid": pinfo["pid"],
                "cmd": cmdline,
                "cpu_pct": pinfo["cpu_percent"] or 0.0,
                "mem_bytes": mem_bytes,
                "user": pinfo["username"] or "unknown",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            # Process disappeared or we don't have permission
            continue
        except Exception:
            # Skip any other errors
            continue

    # Sort by memory usage (descending) and take top N
    processes.sort(key=lambda p: p["mem_bytes"], reverse=True)

    return processes[:limit]

