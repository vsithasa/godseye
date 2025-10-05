"""Metrics collectors for system monitoring."""

from .identity import collect_identity
from .heartbeat import collect_heartbeat
from .disks import collect_disks
from .network import collect_network_interfaces
from .processes import collect_processes
from .packages import collect_packages, collect_updates
from .logs import collect_logs

__all__ = [
    "collect_identity",
    "collect_heartbeat",
    "collect_disks",
    "collect_network_interfaces",
    "collect_processes",
    "collect_packages",
    "collect_updates",
    "collect_logs",
]

