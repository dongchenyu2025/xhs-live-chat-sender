#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

node_is_ready() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'
}

if ! node_is_ready; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Installing Homebrew from the official installer..."
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  echo "Installing Node.js with Homebrew..."
  brew install node
  hash -r
fi

node_is_ready || { echo "Node.js 18+ and npm are still unavailable." >&2; exit 1; }
if [ "${SETUP_VALIDATE_ONLY:-0}" = "1" ]; then
  echo "macOS setup validation passed."
  exit 0
fi
npm ci --ignore-scripts

if [ ! -f xhs_config.json ]; then
  cp xhs_config.example.json xhs_config.json
fi

node check_config.js
node xhs_daemon.js start --immediate
echo "Setup complete. Keep the independent Chrome window open and scan to log in if prompted."
