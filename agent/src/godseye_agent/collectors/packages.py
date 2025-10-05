"""Package and updates collector."""

import subprocess
import re
from typing import List, Dict, Any, Optional


def collect_packages() -> List[Dict[str, Any]]:
    """
    Collect installed packages using dpkg.

    Returns list of installed packages with name and version.
    Note: This returns a LOT of packages. Consider sending only on enrollment
    or periodically (daily) rather than every heartbeat.
    """
    packages = []

    try:
        # Run dpkg-query to get installed packages
        result = subprocess.run(
            ["dpkg-query", "-W", "-f=${binary:Package} ${Version} ${Status}\\n"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode == 0:
            for line in result.stdout.splitlines():
                parts = line.rsplit(" ", 3)
                if len(parts) >= 4:
                    package_name = parts[0]
                    version = parts[1]
                    status = parts[-1]

                    # Only include installed packages
                    if status == "installed":
                        packages.append({
                            "name": package_name,
                            "version": version,
                            "status": status,
                        })
    except (subprocess.SubprocessError, FileNotFoundError):
        # dpkg not available or command failed
        pass

    return packages


def collect_updates() -> Optional[Dict[str, Any]]:
    """
    Collect available updates information.

    Returns counts of security and regular updates available.
    """
    try:
        # Run apt-get with simulation to check for updates
        result = subprocess.run(
            ["apt-get", "-s", "upgrade"],
            capture_output=True,
            text=True,
            timeout=30,
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        if result.returncode != 0:
            return None

        # Parse output to count updates
        security_count = 0
        regular_count = 0
        details = []

        # Look for upgrade lines
        upgrade_pattern = re.compile(r"Inst\s+(\S+)\s+\[([^\]]+)\]\s+\(([^)]+)\)")

        for line in result.stdout.splitlines():
            match = upgrade_pattern.match(line)
            if match:
                package = match.group(1)
                current_version = match.group(2)
                new_version = match.group(3).split()[0]

                # Check if it's a security update (heuristic: contains "security" in version or line)
                is_security = "security" in line.lower()

                if is_security:
                    security_count += 1
                else:
                    regular_count += 1

                details.append({
                    "name": package,
                    "current": current_version,
                    "candidate": new_version,
                    "security": is_security,
                })

        return {
            "security_updates_count": security_count,
            "regular_updates_count": regular_count,
            "details": details[:50],  # Limit details to 50 packages
        }

    except (subprocess.SubprocessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None

