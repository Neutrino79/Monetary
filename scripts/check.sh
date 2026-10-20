#!/usr/bin/env bash
# One-command validation: run this after ANY change to confirm the system
# still works end to end. Exits non-zero on the first failure.
#
# Usage:
#   ./scripts/check.sh            # compile check + full test suite + coverage
#   ./scripts/check.sh fast       # skip the slower config/subprocess tests
#   ./scripts/check.sh live       # also boot a real uvicorn and curl it
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo "==> Creating virtualenv (.venv)"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
export PYTHONPATH="$PWD"

echo "==> Installing dependencies"
pip install --quiet --upgrade pip
pip install --quiet -r requirements-dev.txt

echo "==> Byte-compiling every module (catches syntax errors fast)"
python -m compileall -q monetary

echo "==> Importing the FastAPI app (catches wiring/import errors)"
python -c "
from monetary.presentation.api.app import app
n = sum(1 for item in app.openapi()['paths'].values() for m in item if m.upper() in {'GET','POST','PATCH','PUT','DELETE'})
print(f'  {n} operations registered across {len(app.openapi()[\"paths\"])} paths')
"

MODE="${1:-full}"

if [ "$MODE" = "fast" ]; then
  echo "==> Running unit + service + api tests (skipping config subprocess tests)"
  python -m pytest tests -q -m "not config"
else
  echo "==> Running the full test suite with coverage"
  python -m pytest tests -q --cov=monetary --cov-report=term-missing
fi

if [ "$MODE" = "live" ]; then
  echo "==> Booting a real server and exercising it over HTTP"
  DB="$(mktemp -u).db"
  MONETARY_DB_PATH="$DB" MONETARY_ENV=production \
    uvicorn monetary.presentation.api.app:app --port 8931 --log-level warning &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true; rm -f "$DB" "$DB-wal" "$DB-shm"' EXIT
  for _ in $(seq 1 20); do
    curl -s -o /dev/null http://127.0.0.1:8931/health && break
    sleep 0.25
  done
  STATUS=$(curl -s http://127.0.0.1:8931/health | python -c "import json,sys; print(json.load(sys.stdin)['status'])")
  [ "$STATUS" = "ok" ] || { echo "Live health check failed"; exit 1; }
  DOCS_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8931/docs)
  [ "$DOCS_CODE" = "404" ] || { echo "Expected docs disabled (404) in production, got $DOCS_CODE"; exit 1; }
  echo "  live server OK (health=ok, docs correctly disabled in production)"
fi

echo
echo "==> ALL CHECKS PASSED"
