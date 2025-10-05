"""HTTP transport layer with HMAC signing and retry logic."""

import gzip
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from urllib.parse import urljoin

import requests

from .config import AgentConfig
from .credentials import AgentCredentials


class TransportError(Exception):
    """Base exception for transport errors."""
    pass


class AuthenticationError(TransportError):
    """Authentication failed (401/403)."""
    pass


class ValidationError(TransportError):
    """Request validation failed (422)."""
    pass


class APIClient:
    """HTTP client for communicating with Godseye API."""

    def __init__(self, api_url: str, config: AgentConfig, credentials: Optional[AgentCredentials] = None):
        self.api_url = api_url.rstrip("/")
        self.config = config
        self.credentials = credentials

    def _compute_hmac(self, secret: str, timestamp: str, nonce: str, body_hash: str) -> str:
        """
        Compute HMAC-SHA256 signature.

        Args:
            secret: HMAC secret key
            timestamp: ISO 8601 timestamp
            nonce: Random nonce
            body_hash: SHA-256 hash of request body

        Returns:
            Hex-encoded HMAC signature
        """
        canonical_message = f"{timestamp}\\n{nonce}\\n{body_hash}"
        signature = hmac.new(
            secret.encode("utf-8"),
            canonical_message.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return signature

    def _hash_body(self, body: bytes) -> str:
        """Compute SHA-256 hash of request body."""
        return hashlib.sha256(body).hexdigest()

    def _prepare_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        compress: bool = True,
        sign: bool = True,
    ) -> tuple[str, Dict[str, str], Optional[bytes]]:
        """
        Prepare HTTP request with authentication and signing.

        Args:
            method: HTTP method
            endpoint: API endpoint path
            data: Request payload
            compress: Whether to gzip compress the body
            sign: Whether to sign with HMAC

        Returns:
            Tuple of (url, headers, body)
        """
        url = urljoin(self.api_url, endpoint)
        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"godseye-agent/0.1.0",
        }

        body = None
        body_for_hash = b""  # Uncompressed body for HMAC signature
        
        if data:
            body = json.dumps(data).encode("utf-8")
            body_for_hash = body  # Hash the uncompressed body

            if compress:
                body = gzip.compress(body)
                headers["Content-Encoding"] = "gzip"

        # Add authentication headers if credentials are available
        if sign and self.credentials:
            timestamp = datetime.now(timezone.utc).isoformat()
            nonce = secrets.token_hex(16)
            body_hash = self._hash_body(body_for_hash) if body_for_hash else ""

            signature = self._compute_hmac(
                self.credentials.hmac_secret,
                timestamp,
                nonce,
                body_hash
            )

            headers["Authorization"] = f"Bearer {self.credentials.agent_jwt}"
            headers["X-Timestamp"] = timestamp
            headers["X-Nonce"] = nonce
            headers["X-Signature"] = signature
            headers["X-Agent-Version"] = "0.1.0"

        return url, headers, body

    def _execute_request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """
        Execute HTTP request with retry logic.

        Args:
            method: HTTP method
            url: Full URL
            headers: Request headers
            body: Request body

        Returns:
            Response JSON data

        Raises:
            TransportError: On request failure
        """
        last_error = None

        for attempt in range(self.config.retry_attempts):
            try:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=headers,
                    data=body,
                    timeout=self.config.timeout,
                )

                # Handle different status codes
                if response.status_code == 200:
                    return response.json()

                elif response.status_code in (401, 403):
                    raise AuthenticationError(f"Authentication failed: {response.text}")

                elif response.status_code == 422:
                    raise ValidationError(f"Validation failed: {response.text}")

                elif response.status_code >= 500:
                    # Retry on server errors
                    last_error = TransportError(f"Server error: {response.status_code}")
                    time.sleep(self.config.retry_backoff ** attempt)
                    continue

                else:
                    raise TransportError(f"Request failed: {response.status_code} - {response.text}")

            except requests.exceptions.Timeout:
                last_error = TransportError("Request timeout")
                time.sleep(self.config.retry_backoff ** attempt)
                continue

            except requests.exceptions.ConnectionError:
                last_error = TransportError("Connection error")
                time.sleep(self.config.retry_backoff ** attempt)
                continue

            except requests.exceptions.RequestException as e:
                raise TransportError(f"Request failed: {e}")

        # All retries exhausted
        raise last_error or TransportError("Request failed after all retries")

    def enroll(self, org_secret: str, host_facts: Dict[str, Any]) -> AgentCredentials:
        """
        Enroll agent with the API.

        Args:
            org_secret: Organization enrollment secret
            host_facts: Server identity information

        Returns:
            Agent credentials

        Raises:
            TransportError: On enrollment failure
        """
        url, headers, body = self._prepare_request(
            method="POST",
            endpoint="/functions/v1/enroll",
            data={
                "org_enroll_secret": org_secret,
                "host_facts": host_facts,
            },
            compress=False,
            sign=False,  # Enrollment doesn't require signing
        )

        response_data = self._execute_request("POST", url, headers, body)

        return AgentCredentials(
            agent_id=response_data["agent_id"],
            org_id=response_data["org_id"],
            agent_jwt=response_data["agent_jwt"],
            refresh_token=response_data["refresh_token"],
            hmac_secret=response_data["hmac_secret"],
        )

    def ingest(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send metrics payload to the API.

        Args:
            payload: Metrics data

        Returns:
            API response

        Raises:
            TransportError: On ingest failure
        """
        if not self.credentials:
            raise TransportError("Credentials required for ingest")

        url, headers, body = self._prepare_request(
            method="POST",
            endpoint="/functions/v1/ingest",
            data=payload,
            compress=True,
            sign=True,
        )

        return self._execute_request("POST", url, headers, body)

    def rotate_token(self) -> tuple[str, str]:
        """
        Rotate JWT and refresh token.

        Returns:
            Tuple of (new_jwt, new_refresh_token)

        Raises:
            TransportError: On rotation failure
        """
        if not self.credentials:
            raise TransportError("Credentials required for token rotation")

        url, headers, body = self._prepare_request(
            method="POST",
            endpoint="/functions/v1/rotate",
            data={
                "agent_id": self.credentials.agent_id,
                "refresh_token": self.credentials.refresh_token,
            },
            compress=False,
            sign=False,  # Rotation uses refresh token, not HMAC
        )

        response_data = self._execute_request("POST", url, headers, body)

        return response_data["agent_jwt"], response_data["refresh_token"]

