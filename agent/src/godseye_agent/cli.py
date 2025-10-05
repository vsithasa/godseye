"""Command-line interface for Godseye agent."""

import argparse
import json
import logging
import sys
from typing import Dict, Any

from . import __version__
from .config import AgentConfig, ConfigManager
from .credentials import CredentialsManager
from .transport import APIClient, AuthenticationError, TransportError
from .collectors import (
    collect_identity,
    collect_heartbeat,
    collect_disks,
    collect_network_interfaces,
    collect_processes,
    collect_packages,
    collect_updates,
    collect_logs,
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("godseye-agent")


def cmd_enroll(args: argparse.Namespace) -> int:
    """Enroll agent with the API."""
    try:
        # Collect host facts
        logger.info("Collecting host information...")
        host_facts = collect_identity(__version__)

        # Create API client
        config = AgentConfig(api_url=args.api_url)
        client = APIClient(config.api_url, config)

        # Enroll
        logger.info(f"Enrolling with {args.api_url}...")
        credentials = client.enroll(args.org_secret, host_facts)

        logger.info(f"Enrolled successfully! Agent ID: {credentials.agent_id}")

        # Save configuration
        config_mgr = ConfigManager()
        config_mgr.save(config)
        logger.info("Configuration saved")

        # Save credentials
        creds_mgr = CredentialsManager()
        creds_mgr.save(credentials)
        logger.info("Credentials saved securely")

        print(f"\\n✅ Agent enrolled successfully!")
        print(f"   Agent ID: {credentials.agent_id}")
        print(f"   Org ID: {credentials.org_id}")
        print(f"\\nNext steps:")
        print(f"   1. Enable and start the agent: sudo systemctl enable --now godseye-agent.timer")
        print(f"   2. Check status: sudo systemctl status godseye-agent.timer")
        print(f"   3. View logs: sudo journalctl -u godseye-agent -f")

        return 0

    except TransportError as e:
        logger.error(f"Enrollment failed: {e}")
        return 1
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return 1


def cmd_run(args: argparse.Namespace) -> int:
    """Collect and send metrics."""
    try:
        # Load configuration
        config_mgr = ConfigManager()
        if not config_mgr.exists():
            logger.error("Agent not enrolled. Run 'godseye-agent enroll' first.")
            return 1

        config = config_mgr.load()

        # Load credentials
        creds_mgr = CredentialsManager()
        if not creds_mgr.exists():
            logger.error("Credentials not found. Run 'godseye-agent enroll' first.")
            return 1

        credentials = creds_mgr.load()

        # Collect metrics
        logger.info("Collecting metrics...")

        payload: Dict[str, Any] = {
            "server": collect_identity(__version__),
            "heartbeat": collect_heartbeat(),
            "disks": collect_disks(),
            "network_ifaces": collect_network_interfaces(),
            "processes": collect_processes(config.process_limit),
        }

        # Optional: collect packages (can be expensive, maybe only on enrollment or daily)
        if args.include_packages:
            payload["packages"] = collect_packages()

        # Collect updates
        updates = collect_updates()
        if updates:
            payload["updates"] = updates

        # Optional: collect logs
        if config.enable_logs:
            payload["logs"] = collect_logs(config.log_lines)

        # Dry run mode - just print payload
        if args.dry_run:
            print(json.dumps(payload, indent=2))
            return 0

        # Send to API
        logger.info("Sending metrics to API...")
        client = APIClient(config.api_url, config, credentials)

        try:
            response = client.ingest(payload)
            logger.info(f"Metrics sent successfully: {response}")
            return 0

        except AuthenticationError:
            # Try to rotate token
            logger.warning("Authentication failed, attempting token rotation...")
            new_jwt, new_refresh = client.rotate_token()
            creds_mgr.update_tokens(new_jwt, new_refresh)
            logger.info("Token rotated successfully")

            # Retry with new token
            credentials = creds_mgr.load()
            client = APIClient(config.api_url, config, credentials)
            response = client.ingest(payload)
            logger.info(f"Metrics sent successfully after token rotation: {response}")
            return 0

    except TransportError as e:
        logger.error(f"Failed to send metrics: {e}")
        return 1
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return 1


def cmd_rotate(args: argparse.Namespace) -> int:
    """Rotate JWT and refresh token."""
    try:
        # Load configuration and credentials
        config = ConfigManager().load()
        creds_mgr = CredentialsManager()
        credentials = creds_mgr.load()

        # Rotate token
        logger.info("Rotating token...")
        client = APIClient(config.api_url, config, credentials)
        new_jwt, new_refresh = client.rotate_token()

        # Save new tokens
        creds_mgr.update_tokens(new_jwt, new_refresh)
        logger.info("Token rotated successfully")

        print("✅ Token rotated successfully")
        return 0

    except TransportError as e:
        logger.error(f"Token rotation failed: {e}")
        return 1
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return 1


def cmd_info(args: argparse.Namespace) -> int:
    """Show agent information."""
    try:
        # Check if enrolled
        config_mgr = ConfigManager()
        creds_mgr = CredentialsManager()

        if not config_mgr.exists() or not creds_mgr.exists():
            print("❌ Agent not enrolled")
            return 1

        config = config_mgr.load()
        credentials = creds_mgr.load()
        identity = collect_identity(__version__)

        print("\\n🔍 Godseye Agent Information")
        print("=" * 50)
        print(f"Version:     {__version__}")
        print(f"Agent ID:    {credentials.agent_id}")
        print(f"Org ID:      {credentials.org_id}")
        print(f"API URL:     {config.api_url}")
        print(f"Hostname:    {identity['hostname']}")
        print(f"Machine ID:  {identity['machine_id']}")
        print(f"OS:          {identity['os']['name']} {identity['os']['version']}")
        print(f"Kernel:      {identity['kernel']}")
        print(f"CPU:         {identity['cpu']['model']} ({identity['cpu']['cores']} cores)")
        print(f"Memory:      {identity['mem_bytes'] / (1024**3):.1f} GB")
        print("=" * 50)

        return 0

    except Exception as e:
        logger.error(f"Failed to show info: {e}")
        return 1


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Godseye Agent - Lightweight system monitoring agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("--version", action="version", version=f"godseye-agent {__version__}")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Enroll command
    enroll_parser = subparsers.add_parser("enroll", help="Enroll agent with the API")
    enroll_parser.add_argument(
        "--api-url",
        required=True,
        help="Godseye API URL (e.g., https://vwfzujkqfplmvyljoiki.supabase.co)",
    )
    enroll_parser.add_argument(
        "--org-secret",
        required=True,
        help="Organization enrollment secret",
    )

    # Run command
    run_parser = subparsers.add_parser("run", help="Collect and send metrics")
    run_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Collect metrics but don't send (prints JSON)",
    )
    run_parser.add_argument(
        "--include-packages",
        action="store_true",
        help="Include full package list (can be slow)",
    )

    # Rotate command
    subparsers.add_parser("rotate", help="Rotate JWT and refresh token")

    # Info command
    subparsers.add_parser("info", help="Show agent information")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    # Route to command handler
    if args.command == "enroll":
        return cmd_enroll(args)
    elif args.command == "run":
        return cmd_run(args)
    elif args.command == "rotate":
        return cmd_rotate(args)
    elif args.command == "info":
        return cmd_info(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())

