"""System logs collector."""

import subprocess
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


def collect_logs(lines: int = 200) -> List[Dict[str, Any]]:
    """
    Collect recent system logs from journalctl.

    Args:
        lines: Number of log lines to collect (default: 200)

    Returns:
        List of log entries with timestamp, level, source, and message
    """
    logs = []

    try:
        # Run journalctl to get recent logs in JSON format
        result = subprocess.run(
            ["journalctl", "-n", str(lines), "-o", "json", "--no-pager"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            return []

        # Parse JSON lines
        for line in result.stdout.splitlines():
            if not line.strip():
                continue

            try:
                entry = json.loads(line)

                # Extract relevant fields
                timestamp_us = int(entry.get("__REALTIME_TIMESTAMP", 0))
                timestamp = datetime.fromtimestamp(timestamp_us / 1000000, tz=timezone.utc).isoformat()

                # Map systemd priority to level
                priority = int(entry.get("PRIORITY", 6))
                level_map = {
                    0: "emergency",
                    1: "alert",
                    2: "critical",
                    3: "error",
                    4: "warning",
                    5: "notice",
                    6: "info",
                    7: "debug",
                }
                level = level_map.get(priority, "info")

                # Get source (unit or command)
                source = entry.get("_SYSTEMD_UNIT") or entry.get("_COMM") or "unknown"

                # Get message
                message = entry.get("MESSAGE", "")

                # Skip empty messages
                if not message:
                    continue

                logs.append({
                    "ts": timestamp,
                    "source": source,
                    "level": level,
                    "message": message[:500],  # Truncate long messages
                    "raw": {},  # Could include full entry if needed
                })

            except (json.JSONDecodeError, KeyError, ValueError):
                # Skip malformed entries
                continue

    except (subprocess.SubprocessError, FileNotFoundError, subprocess.TimeoutExpired):
        # journalctl not available or command failed
        pass

    return logs

