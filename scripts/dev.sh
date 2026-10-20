#!/usr/bin/env bash
# One command for local development.
#
#   ./scripts/dev.sh            # start the API and the web app together (Ctrl+C stops both)
#   ./scripts/dev.sh backend    # API only  -> http://localhost:8000
#   ./scripts/dev.sh web        # web app only -> http://localhost:5173
#
# First run (and whenever requirements.txt / package-lock.json change) it also creates .venv,
# installs dependencies and creates web/.env.local. Override ports with BACKEND_PORT / WEB_PORT.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_PORT="${BACKEND_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
MODE="${1:-all}"

setup_backend() {
  [ -d .venv ] || { echo "==> Creating .venv"; python3 -m venv .venv; }
  # reinstall only when requirements changed since the last install
  if [ ! -f .venv/.deps-stamp ] || [ requirements-dev.txt -nt .venv/.deps-stamp ] || [ requirements.txt -nt .venv/.deps-stamp ]; then
    echo "==> Installing backend dependencies"
    .venv/bin/python -m pip install --quiet --upgrade pip
    .venv/bin/python -m pip install --quiet -r requirements-dev.txt
    touch .venv/.deps-stamp
  fi
}

setup_web() {
  if [ ! -d web/node_modules ] || [ web/package-lock.json -nt web/node_modules/.package-lock.json ]; then
    echo "==> Installing web dependencies"
    (cd web && npm ci)
  fi
  [ -f web/.env.local ] || { echo "==> Creating web/.env.local from .env.example"; cp web/.env.example web/.env.local; }
}

run_backend() {
  export MONETARY_ENV=development
  export MONETARY_CORS_ORIGINS="${MONETARY_CORS_ORIGINS:-http://localhost:$WEB_PORT}"
  exec .venv/bin/python -m uvicorn monetary.presentation.api.app:app --reload --port "$BACKEND_PORT"
}

run_web() {
  cd web && exec npm run dev -- --port "$WEB_PORT" --strictPort
}

# Prefix every output line with its source so two servers stay readable in one terminal.
# (Pure bash on purpose: awk/sed buffer or differ between macOS and Linux.)
tag() { local line; while IFS= read -r line || [ -n "$line" ]; do printf '[%s] %s\n' "$1" "$line"; done; }

case "$MODE" in
  backend) setup_backend; run_backend ;;
  web)     setup_web; run_web ;;
  all)
    setup_backend; setup_web
    set -m   # job control: each server gets its own process group, so we can stop exactly those
    stop_all() {
      trap - INT TERM EXIT
      local pid
      for pid in $(jobs -p); do kill -TERM -- "-$pid" 2>/dev/null || true; done
      wait 2>/dev/null || true
    }
    trap stop_all INT TERM EXIT   # Ctrl+C, or either server exiting, stops both
    echo "==> API  http://localhost:$BACKEND_PORT   (docs: /docs)"
    echo "==> Web  http://localhost:$WEB_PORT"
    (run_backend 2>&1 | tag api) &
    (run_web 2>&1 | tag web) &
    wait -n 2>/dev/null || wait   # bash >= 4.3 returns when one exits; older bash waits for both
    ;;
  *) echo "usage: $0 [all|backend|web]" >&2; exit 2 ;;
esac
