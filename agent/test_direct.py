#!/usr/bin/env python3
"""Direct test script to debug HMAC signature."""

import json
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
import requests

# Load credentials
with open('/etc/godseye/credentials.json', 'r') as f:
    creds = json.load(f)

# Simple test payload
payload = {
    "server": {
        "hostname": "test",
        "machine_id": "test123",
        "os": {"name": "Ubuntu", "version": "22.04"},
        "kernel": "5.15.0",
        "cpu": {"model": "Test", "cores": 4},
        "mem_bytes": 8000000000,
        "agent_version": "0.1.0",
        "tags": {}
    },
    "heartbeat": {
        "ts": "2025-10-05T05:30:00.000Z",
        "uptime_s": 1000,
        "load": {"m1": 0.1, "m5": 0.1, "m15": 0.1},
        "cpu_pct": 10.0,
        "mem": {"used": 1000000, "free": 7000000, "swap_used": 0}
    },
    "disks": [],
    "network_ifaces": [],
    "processes": []
}

# Serialize
body = json.dumps(payload).encode('utf-8')
print(f"Body length: {len(body)}")
print(f"Body (first 200 chars): {body[:200]}")

# Hash body
body_hash = hashlib.sha256(body).hexdigest()
print(f"Body hash: {body_hash}")

# Create HMAC signature
timestamp = datetime.now(timezone.utc).isoformat()
nonce = secrets.token_hex(16)
canonical_message = f"{timestamp}\n{nonce}\n{body_hash}"

print(f"\nTimestamp: {timestamp}")
print(f"Nonce: {nonce}")
print(f"Canonical message:\n{canonical_message}")

signature = hmac.new(
    creds['hmac_secret'].encode('utf-8'),
    canonical_message.encode('utf-8'),
    hashlib.sha256
).hexdigest()

print(f"\nHMAC Signature: {signature}")

# Send request (UNCOMPRESSED)
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {creds['agent_jwt']}",
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
    "X-Agent-Version": "0.1.0"
}

print(f"\nSending request to https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/ingest")
print(f"Headers: {headers}")

response = requests.post(
    "https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/ingest",
    headers=headers,
    data=body,
    timeout=30
)

print(f"\nResponse status: {response.status_code}")
print(f"Response body: {response.text}")

