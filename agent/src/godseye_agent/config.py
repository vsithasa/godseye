"""Configuration management for Godseye agent."""

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional


@dataclass
class AgentConfig:
    """Agent configuration."""

    api_url: str
    collection_interval: int = 300  # seconds
    enable_logs: bool = False
    log_lines: int = 200
    process_limit: int = 30
    retry_attempts: int = 3
    retry_backoff: float = 2.0
    timeout: int = 30


class ConfigManager:
    """Manages agent configuration."""

    def __init__(self, config_path: str = "/etc/godseye/config.json"):
        self.config_path = Path(config_path)

    def load(self) -> AgentConfig:
        """Load configuration from file."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, "r") as f:
            data = json.load(f)

        return AgentConfig(**data)

    def save(self, config: AgentConfig) -> None:
        """Save configuration to file."""
        # Ensure directory exists
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.config_path, "w") as f:
            json.dump(asdict(config), f, indent=2)

        # Set secure permissions (root only)
        os.chmod(self.config_path, 0o600)

    def exists(self) -> bool:
        """Check if config file exists."""
        return self.config_path.exists()

