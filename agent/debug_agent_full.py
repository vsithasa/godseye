#!/usr/bin/env python3
"""
Debug script to see exactly what the agent is computing
"""
import sys
import json
import hashlib
import hmac
from datetime import datetime, timezone

# Monkey-patch the transport module to debug
original_file = None

def debug_hmac_calculation():
    """Run the agent's send_metrics but with debug output"""
    import json
    from godseye_agent.config import Config
    from godseye_agent.credentials import Credentials
    from godseye_agent import collectors
    
    # Load config and credentials
    config = Config.load()
    credentials = Credentials.load()
    
    print(f"✓ Loaded credentials")
    print(f"  HMAC Secret: {credentials.hmac_secret[:10]}...")
    print(f"  JWT expires: checking...")
    
    # Collect metrics (same as agent does)
    print("\n✓ Collecting metrics...")
    payload = {
        "server": collectors.identity.collect(config),
        "heartbeat": collectors.heartbeat.collect(),
        "disks": collectors.disks.collect(),
        "network_ifaces": collectors.network.collect(),
        "processes": collectors.processes.collect(config),
        "packages": collectors.packages.collect(),
        "logs": collectors.logs.collect(config),
    }
    
    # Serialize body
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    print(f"\n✓ Serialized body")
    print(f"  Length: {len(body)}")
    print(f"  First 100 chars: {body[:100]}")
    
    # Hash body
    body_hash = hashlib.sha256(body).hexdigest()
    print(f"\n✓ Body hash: {body_hash}")
    
    # Generate timestamp and nonce
    import secrets
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    nonce = secrets.token_hex(16)
    
    print(f"\n✓ Generated request metadata")
    print(f"  Timestamp: {timestamp}")
    print(f"  Nonce: {nonce}")
    
    # Compute HMAC
    canonical = f"{timestamp}\n{nonce}\n{body_hash}"
    print(f"\n✓ Canonical message:")
    for line in canonical.split('\n'):
        print(f"  {line}")
    
    signature = hmac.new(
        credentials.hmac_secret.encode('utf-8'),
        canonical.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    print(f"\n✓ HMAC Signature: {signature}")
    
    # Make request
    import requests
    url = f"{config.api_url}/functions/v1/ingest"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {credentials.agent_jwt}',
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
        'X-Agent-Version': config.agent_version,
    }
    
    print(f"\n✓ Sending to {url}")
    print(f"  Headers: {json.dumps({k: v[:20] + '...' if len(v) > 20 else v for k, v in headers.items()}, indent=2)}")
    
    response = requests.post(url, data=body, headers=headers)
    
    print(f"\n{'✅' if response.status_code == 200 else '❌'} Response: {response.status_code}")
    print(f"  Body: {response.text}")

if __name__ == '__main__':
    try:
        debug_hmac_calculation()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

