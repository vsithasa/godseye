"""Network interface collector."""

from typing import List, Dict, Any

import psutil


def collect_network_interfaces() -> List[Dict[str, Any]]:
    """
    Collect network interface information.

    Returns list of network interfaces with IPs, MACs, and throughput counters.
    """
    interfaces = []

    # Get address information
    addrs = psutil.net_if_addrs()

    # Get I/O counters
    io_counters = psutil.net_io_counters(pernic=True)

    for iface_name, addresses in addrs.items():
        # Skip loopback
        if iface_name == "lo":
            continue

        ipv4_addrs = []
        ipv6_addrs = []
        mac = None

        for addr in addresses:
            if addr.family == 2:  # AF_INET (IPv4)
                ipv4_addrs.append(addr.address)
            elif addr.family == 10:  # AF_INET6 (IPv6)
                # Filter out link-local addresses
                if not addr.address.startswith("fe80:"):
                    ipv6_addrs.append(addr.address)
            elif addr.family == 17:  # AF_PACKET (MAC)
                mac = addr.address

        # Get I/O counters if available
        rx_bytes = 0
        tx_bytes = 0
        if iface_name in io_counters:
            counters = io_counters[iface_name]
            rx_bytes = counters.bytes_recv
            tx_bytes = counters.bytes_sent

        interfaces.append({
            "name": iface_name,
            "mac": mac,
            "ipv4": ipv4_addrs,
            "ipv6": ipv6_addrs,
            "rx_bytes": rx_bytes,
            "tx_bytes": tx_bytes,
        })

    return interfaces

