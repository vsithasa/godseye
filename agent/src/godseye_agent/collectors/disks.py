"""Disk usage collector."""

from typing import List, Dict, Any

import psutil


def collect_disks() -> List[Dict[str, Any]]:
    """
    Collect disk usage information for all mounted filesystems.

    Returns list of disk usage data including mount point, filesystem type, and usage.
    """
    disks = []

    for partition in psutil.disk_partitions(all=False):
        # Skip special filesystems
        if partition.fstype in ("", "squashfs", "tmpfs", "devtmpfs"):
            continue

        try:
            usage = psutil.disk_usage(partition.mountpoint)

            disks.append({
                "mount": partition.mountpoint,
                "fs": partition.fstype,
                "size_bytes": usage.total,
                "used_bytes": usage.used,
                # Note: psutil doesn't provide inode info easily on all platforms
                # We could parse df output if needed, but skipping for now
            })
        except PermissionError:
            # Skip partitions we can't access
            continue
        except Exception:
            # Skip any other errors (stale mounts, etc.)
            continue

    return disks

