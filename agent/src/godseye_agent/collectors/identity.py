"""System identity collector."""

import platform
import socket
from pathlib import Path
from typing import Dict, Any

import distro
import psutil


def collect_identity(agent_version: str, tags: Dict[str, str] = None) -> Dict[str, Any]:
    """
    Collect system identity information.

    Returns server identity data including hostname, machine-id, OS info, CPU, and memory.
    """
    # Get machine ID from /etc/machine-id
    machine_id_path = Path("/etc/machine-id")
    if machine_id_path.exists():
        machine_id = machine_id_path.read_text().strip()
    else:
        # Fallback to /var/lib/dbus/machine-id
        machine_id = Path("/var/lib/dbus/machine-id").read_text().strip()

    # Get hostname
    hostname = socket.getfqdn()

    # Get OS information
    os_name = distro.name() or platform.system()
    os_version = distro.version() or platform.release()

    # Get kernel version
    kernel = platform.release()

    # Get CPU information
    cpu_info = {}
    if Path("/proc/cpuinfo").exists():
        with open("/proc/cpuinfo") as f:
            for line in f:
                if "model name" in line.lower():
                    cpu_model = line.split(":")[1].strip()
                    break
            else:
                cpu_model = platform.processor() or "Unknown"
    else:
        cpu_model = platform.processor() or "Unknown"

    cpu_count = psutil.cpu_count(logical=False) or psutil.cpu_count()

    # Get memory size
    mem_bytes = psutil.virtual_memory().total

    return {
        "hostname": hostname,
        "machine_id": machine_id,
        "os": {
            "name": os_name,
            "version": os_version,
        },
        "kernel": kernel,
        "cpu": {
            "model": cpu_model,
            "cores": cpu_count,
        },
        "mem_bytes": mem_bytes,
        "agent_version": agent_version,
        "tags": tags or {},
    }

