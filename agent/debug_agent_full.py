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
    from godseye_agent.config import ConfigManager
    from godseye_agent.credentials import CredentialsManager
    from godseye_agent import collectors
    from godseye_agent import __version__
    
    # Load config and credentials
    config_mgr = ConfigManager()
    creds_mgr = CredentialsManager()
    
    config = config_mgr.load()
    credentials = creds_mgr.load()
    
    print(f"✓ Loaded credentials")
    print(f"  HMAC Secret: {credentials.hmac_secret[:10]}...")
    print(f"  Agent ID: {credentials.agent_id}")
    
    # Collect metrics (same as agent does)
    print("\n✓ Collecting metrics...")
    payload = {
        "server": collectors.collect_identity(__version__),
        "heartbeat": collectors.collect_heartbeat(),
        "disks": collectors.collect_disks(),
        "network_ifaces": collectors.collect_network_interfaces(),
        "processes": collectors.collect_processes(config.process_limit),
        "packages": collectors.collect_packages(),
        "logs": collectors.collect_logs(config.enable_logs, config.log_lines) if config.enable_logs else [],
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
        'X-Agent-Version': __version__,
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

