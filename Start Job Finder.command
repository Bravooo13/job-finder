#!/bin/bash
# Double-click this file in Finder to start Job Finder.
# First run: installs what's needed (a minute or two).
# Every run: updates the database, starts the app and opens http://localhost:3737.
# Keep the Terminal window open while you use Job Finder; press Ctrl+C there to stop it.

cd "$(dirname "$0")" || exit 1

pause_and_exit() {
  echo
  read -n 1 -s -r -p "Press any key to close this window..."
  exit "${1:-1}"
}

# Finder doesn't load your shell profile, so add the usual Node locations.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
export NEXT_TELEMETRY_DISABLED=1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed."
  echo "Install the LTS version from https://nodejs.org (or run: brew install node), then double-click this file again."
  pause_and_exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) is too old. Job Finder needs version 20 or newer: https://nodejs.org"
  pause_and_exit 1
fi

# If the port is taken, open Job Finder if that's what's running; otherwise explain.
if lsof -iTCP:3737 -sTCP:LISTEN >/dev/null 2>&1; then
  if curl -s --max-time 5 http://127.0.0.1:3737/dashboard | grep -q "Job Finder"; then
    echo "Job Finder is already running. Opening it..."
    open http://localhost:3737
    exit 0
  fi
  echo "Another app (maybe the old JobSync) is using port 3737."
  echo "Close the Terminal window that is running it (or press Ctrl+C in it), then double-click this file again."
  pause_and_exit 1
fi

# Install dependencies on first run, after package-lock.json changes, or when
# node_modules was installed on a different kind of computer.
PLATFORM="$(node -p 'process.platform + "-" + process.arch')"
MARKER="node_modules/.installed-for"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ] || [ "$(cat "$MARKER" 2>/dev/null)" != "$PLATFORM" ]; then
  echo "Installing dependencies (the first run takes a minute or two)..."
  rm -rf node_modules
  npm install --no-audit --no-fund || { echo "npm install failed (see the messages above)."; pause_and_exit 1; }
  echo "$PLATFORM" > "$MARKER"
fi

# Open the browser as soon as the app answers.
(
  for _ in $(seq 1 120); do
    sleep 2
    if curl -s -o /dev/null http://127.0.0.1:3737; then open http://localhost:3737; break; fi
  done
) &

echo
echo "Starting Job Finder at http://localhost:3737"
echo "Keep this window open while you use it. Press Ctrl+C to stop."
echo
npm run dev
