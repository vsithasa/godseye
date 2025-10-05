# Godseye Agent

Lightweight Python agent for the Godseye fleet monitoring system.

## Features

- 🚀 **Zero-touch enrollment** - One command to register
- 📊 **Comprehensive metrics** - CPU, memory, disk, network, processes, packages
- 🔒 **Secure by default** - HMAC signatures, JWT auth, encrypted transport
- ⚡ **Lightweight** - Minimal CPU/memory footprint
- 🔄 **Auto-recovery** - Handles network issues, token rotation, re-enrollment

## Requirements

- Ubuntu 20.04+ (other Debian-based distros may work)
- Python 3.10+
- Root or sudo access for installation

## Installation

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/vsithasa/godseye/main/agent/install.sh | sudo bash
```

### Manual Install

```bash
# Install from source
git clone https://github.com/vsithasa/godseye.git
cd godseye/agent
sudo pip3 install .

# Enroll agent
sudo godseye-agent enroll --api-url https://vwfzujkqfplmvyljoiki.supabase.co \
  --org-secret YOUR_ORG_ENROLLMENT_SECRET

# Start service
sudo systemctl enable --now godseye-agent.timer
```

## Usage

### Enroll Agent

```bash
sudo godseye-agent enroll \\
  --api-url https://vwfzujkqfplmvyljoiki.supabase.co \\
  --org-secret YOUR_SECRET_HERE
```

### Run Manually (for testing)

```bash
sudo godseye-agent run
```

### Check Status

```bash
sudo systemctl status godseye-agent.timer
sudo journalctl -u godseye-agent -f
```

### Rotate JWT

```bash
sudo godseye-agent rotate
```

### Show Info

```bash
sudo godseye-agent info
```

## Configuration

Configuration is stored in `/etc/godseye/config.json`:

```json
{
  "api_url": "https://vwfzujkqfplmvyljoiki.supabase.co",
  "collection_interval": 300,
  "enable_logs": false,
  "log_lines": 200,
  "process_limit": 30,
  "retry_attempts": 3,
  "retry_backoff": 2
}
```

Credentials are stored in `/etc/godseye/credentials.json` (root-only, 0600).

## What Gets Collected

- **System Identity**: hostname, machine-id, OS, kernel, CPU model, memory
- **Heartbeat**: uptime, load averages, CPU %, memory usage, swap
- **Disks**: mount points, filesystem type, usage, inodes
- **Network**: interfaces, IPs, MACs, rx/tx bytes
- **Processes**: top 30 by CPU/memory
- **Packages**: installed packages (dpkg)
- **Updates**: available security and regular updates
- **Logs** (optional): last 200 lines from journalctl

## Architecture

```
godseye-agent (Python)
  ├── collectors/     # Metric collection modules
  ├── transport/      # HTTP client with HMAC signing
  ├── credentials/    # Secure credential storage
  └── cli/           # Command-line interface
```

## Security

- All requests signed with HMAC-SHA256
- JWT authentication with 60-minute lifetime
- Replay protection via nonces (5-minute window)
- Credentials stored with 0600 permissions (root-only)
- HTTPS-only communication
- Automatic token rotation

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black src/

# Lint
ruff check src/

# Type check
mypy src/
```

## Troubleshooting

### Agent not sending data

```bash
# Check service status
sudo systemctl status godseye-agent.timer
sudo systemctl status godseye-agent.service

# View logs
sudo journalctl -u godseye-agent -n 50

# Test manually
sudo godseye-agent run --dry-run
```

### Re-enrollment

If you need to re-enroll (same machine-id will reuse existing server):

```bash
sudo godseye-agent enroll --api-url URL --org-secret SECRET
```

### Remove agent

```bash
sudo systemctl stop godseye-agent.timer
sudo systemctl disable godseye-agent.timer
sudo pip3 uninstall godseye-agent
sudo rm -rf /etc/godseye /opt/godseye-agent
```

## License

MIT

