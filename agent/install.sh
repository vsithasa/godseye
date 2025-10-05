#!/bin/bash
#
# Godseye Agent Installation Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vsithasa/godseye/main/agent/install.sh | sudo bash
#   OR
#   sudo bash install.sh
#

set -e

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Starting Godseye Agent installation..."

# Check OS
if [[ ! -f /etc/os-release ]]; then
    log_error "Cannot detect OS. /etc/os-release not found."
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    log_warn "This script is designed for Ubuntu/Debian. Your OS: $ID $VERSION_ID"
    log_warn "Installation may fail or behave unexpectedly."
fi

# Check Python version
log_info "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    log_error "Python 3 is not installed. Please install Python 3.10+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [[ $PYTHON_MAJOR -lt 3 || ($PYTHON_MAJOR -eq 3 && $PYTHON_MINOR -lt 10) ]]; then
    log_error "Python 3.10+ is required. Found: Python $PYTHON_VERSION"
    exit 1
fi

log_info "Python $PYTHON_VERSION detected"

# Install pip if not present
if ! command -v pip3 &> /dev/null; then
    log_info "Installing pip..."
    apt-get update -qq
    apt-get install -y python3-pip
fi

# Install system dependencies
log_info "Installing system dependencies..."
apt-get install -y python3-venv

# Create installation directory
INSTALL_DIR="/opt/godseye-agent"
log_info "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Create virtual environment
log_info "Creating Python virtual environment..."
python3 -m venv "$INSTALL_DIR/venv"

# Activate venv and install package
log_info "Installing godseye-agent package..."
source "$INSTALL_DIR/venv/bin/activate"

# Install from PyPI (if published) or from GitHub
if [[ -n "${GODSEYE_INSTALL_FROM_SOURCE:-}" ]]; then
    log_info "Installing from source..."
    pip install git+https://github.com/vsithasa/godseye.git#subdirectory=agent
else
    # For now, install from GitHub until we publish to PyPI
    pip install git+https://github.com/vsithasa/godseye.git#subdirectory=agent
fi

deactivate

# Create symlink to make command globally available
log_info "Creating symlink to /usr/local/bin/godseye-agent..."
ln -sf "$INSTALL_DIR/venv/bin/godseye-agent" /usr/local/bin/godseye-agent

# Create config directory
log_info "Creating configuration directory..."
mkdir -p /etc/godseye
chmod 755 /etc/godseye

# Install systemd units
log_info "Installing systemd service units..."

cat > /etc/systemd/system/godseye-agent.service << 'EOF'
[Unit]
Description=Godseye monitoring agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/godseye-agent run
Nice=10
IOSchedulingClass=idle

# Security hardening
PrivateTmp=true
NoNewPrivileges=true
ReadOnlyPaths=/
ReadWritePaths=/etc/godseye
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/godseye-agent.timer << 'EOF'
[Unit]
Description=Run Godseye agent every 5 minutes
Requires=godseye-agent.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Reload systemd
log_info "Reloading systemd daemon..."
systemctl daemon-reload

log_info "Installation complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_info "Next steps:"
echo ""
echo "  1. Enroll the agent:"
echo "     ${GREEN}sudo godseye-agent enroll \\\\${NC}"
echo "       ${GREEN}--api-url https://vwfzujkqfplmvyljoiki.supabase.co \\\\${NC}"
echo "       ${GREEN}--org-secret YOUR_ENROLLMENT_SECRET${NC}"
echo ""
echo "  2. Enable and start the agent:"
echo "     ${GREEN}sudo systemctl enable --now godseye-agent.timer${NC}"
echo ""
echo "  3. Check agent status:"
echo "     ${GREEN}sudo systemctl status godseye-agent.timer${NC}"
echo ""
echo "  4. View agent logs:"
echo "     ${GREEN}sudo journalctl -u godseye-agent -f${NC}"
echo ""
echo "  5. View agent info:"
echo "     ${GREEN}sudo godseye-agent info${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

