#!/usr/bin/env bash
# One command for local development.
#
#   ./scripts/dev.sh            # open the API and the web app in two separate terminal windows
#                                 (macOS Terminal/iTerm, or a Linux terminal emulator); if none can be
#                                 opened (SSH, no display) it falls back to `inline`
#   ./scripts/dev.sh inline     # both in THIS terminal, output prefixed [api]/[web]; Ctrl+C stops both
#   ./scripts/dev.sh backend    # API only  -> http://localhost:8000
#   ./scripts/dev.sh web        # web app only -> http://localhost:5173
#
# In VS Code, use the task "Dev: start API + web" instead: it opens two *integrated* terminals.
#
# First run (and whenever backend/requirements*.txt / web/package-lock.json change) it also creates .venv,
# installs dependencies and creates web/.env.local. Override ports with BACKEND_PORT / WEB_PORT.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_PORT="${BACKEND_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
MODE="${1:-auto}"

setup_backend() {
  [ -d .venv ] || { echo "==> Creating .venv"; python3 -m venv .venv; }
  # reinstall only when requirements changed since the last install
  if [ ! -f .venv/.deps-stamp ] || [ backend/requirements-dev.txt -nt .venv/.deps-stamp ] || [ backend/requirements.txt -nt .venv/.deps-stamp ]; then
    echo "==> Installing backend dependencies"
    .venv/bin/python -m pip install --quiet --upgrade pip
    .venv/bin/python -m pip install --quiet -r backend/requirements-dev.txt
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
  cd backend && exec ../.venv/bin/python -m uvicorn monetary.presentation.api.app:app --reload --port "$BACKEND_PORT"
}

run_web() {
  cd web && exec npm run dev -- --port "$WEB_PORT" --strictPort
}

# Prefix every output line with its source so two servers stay readable in one terminal.
# (Pure bash on purpose: awk/sed buffer or differ between macOS and Linux.)
tag() { local line; while IFS= read -r line || [ -n "$line" ]; do printf '[%s] %s\n' "$1" "$line"; done; }

# Open `./scripts/dev.sh <backend|web>` in a new terminal window. Returns non-zero if no terminal app
# could be used. DEV_DRY_RUN=1 prints the command instead of running it (used for testing).
open_terminal() {
  local what="$1" root cmd
  root="$(pwd)"
  cmd="cd $(printf '%q' "$root") && ./scripts/dev.sh $what"
  if [ -n "${DEV_DRY_RUN:-}" ]; then echo "would open: $cmd"; return 0; fi

  case "$(uname -s)" in
    Darwin)
      local esc="${cmd//\\/\\\\}"; esc="${esc//\"/\\\"}"   # escape for AppleScript string
      if [ "${TERM_PROGRAM:-}" = "iTerm.app" ]; then
        osascript -e "tell application \"iTerm\" to create window with default profile command \"bash -lc '$cmd; exec \$SHELL'\"" >/dev/null
      else
        osascript -e "tell application \"Terminal\" to do script \"$esc\"" -e 'tell application "Terminal" to activate' >/dev/null
      fi ;;
    *)
      [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] || return 1
      local full="$cmd; exec \"\${SHELL:-bash}\""
      if   command -v gnome-terminal   >/dev/null; then gnome-terminal --title="monetary $what" -- bash -c "$full"
      elif command -v konsole          >/dev/null; then konsole -e bash -c "$full" &
      elif command -v x-terminal-emulator >/dev/null; then x-terminal-emulator -e bash -c "$full" &
      elif command -v xterm            >/dev/null; then xterm -T "monetary $what" -e bash -c "$full" &
      else return 1; fi ;;
  esac
}

case "$MODE" in
  backend) setup_backend; run_backend ;;
  web)     setup_web; run_web ;;
  auto)
    # install once here, so the two new terminals do not race each other (pip / npm)
    setup_backend; setup_web
    if open_terminal backend && open_terminal web; then
      echo "==> Opened two terminals: API http://localhost:$BACKEND_PORT  |  Web http://localhost:$WEB_PORT"
      echo "    Stop each server with Ctrl+C in its own terminal."
    else
      echo "==> Could not open separate terminals here; running both in this one instead."
      exec bash "$0" inline
    fi
    ;;
  inline|all)
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
  *) echo "usage: $0 [inline|backend|web]" >&2; exit 2 ;;
esac
