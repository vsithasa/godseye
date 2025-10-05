"""Credentials management for Godseye agent."""

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional


@dataclass
class AgentCredentials:
    """Agent credentials returned from enrollment."""

    agent_id: str
    org_id: str
    agent_jwt: str
    refresh_token: str
    hmac_secret: str


class CredentialsManager:
    """Manages agent credentials securely."""

    def __init__(self, credentials_path: str = "/etc/godseye/credentials.json"):
        self.credentials_path = Path(credentials_path)

    def load(self) -> AgentCredentials:
        """Load credentials from file."""
        if not self.credentials_path.exists():
            raise FileNotFoundError(f"Credentials file not found: {self.credentials_path}")

        with open(self.credentials_path, "r") as f:
            data = json.load(f)

        return AgentCredentials(**data)

    def save(self, credentials: AgentCredentials) -> None:
        """Save credentials to file with secure permissions."""
        # Ensure directory exists
        self.credentials_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.credentials_path, "w") as f:
            json.dump(asdict(credentials), f, indent=2)

        # Set permissions to 0600 (read/write for owner only)
        os.chmod(self.credentials_path, 0o600)

    def exists(self) -> bool:
        """Check if credentials file exists."""
        return self.credentials_path.exists()

    def update_tokens(self, agent_jwt: str, refresh_token: str) -> None:
        """Update JWT and refresh token."""
        creds = self.load()
        creds.agent_jwt = agent_jwt
        creds.refresh_token = refresh_token
        self.save(creds)

    def delete(self) -> None:
        """Delete credentials file."""
        if self.credentials_path.exists():
            self.credentials_path.unlink()

