#!/usr/bin/env bash
# Start dailywork Web (Next.js) + automation worker in background.
# Web: PORT 3310 (override with PORT=xxxx)
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3310}"
WEB_PID_FILE="${DAILYWORK_WEB_PID:-./dailywork-web.pid}"
WORKER_PID_FILE="${DAILYWORK_WORKER_PID:-./dailywork-worker.pid}"
LOG_DIR="${DAILYWORK_LOG_DIR:-./logs}"
WEB_LOG="${LOG_DIR}/dailywork-web.log"
WORKER_LOG="${LOG_DIR}/dailywork-worker.log"

mkdir -p "$LOG_DIR"

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT already in use. Stop first: ./stop-bg.sh"
  exit 1
fi

if [[ -f "$WORKER_PID_FILE" ]] && kill -0 "$(cat "$WORKER_PID_FILE")" 2>/dev/null; then
  echo "Worker already running (PID $(cat "$WORKER_PID_FILE")). Stop first: ./stop-bg.sh"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

echo "──────────────────────────────────────────"
echo "  dailywork — Web + Worker"
echo ""
echo "  Web:    http://127.0.0.1:${PORT}"
echo "  API:    ./docs/API.md"
echo "  Web log:  $WEB_LOG"
echo "  Worker log: $WORKER_LOG"
echo "──────────────────────────────────────────"

nohup npx next dev -H 0.0.0.0 -p "$PORT" >>"$WEB_LOG" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" >"$WEB_PID_FILE"

nohup npx tsx src/automation/index.ts >>"$WORKER_LOG" 2>&1 &
WORKER_PID=$!
echo "$WORKER_PID" >"$WORKER_PID_FILE"

sleep 2

ok=1
if ! kill -0 "$WEB_PID" 2>/dev/null; then
  echo "✗ Web failed to start (see $WEB_LOG)"
  ok=0
fi
if ! kill -0 "$WORKER_PID" 2>/dev/null; then
  echo "✗ Worker failed to start (see $WORKER_LOG)"
  ok=0
fi

if [[ "$ok" -ne 1 ]]; then
  bash ./stop-bg.sh || true
  exit 1
fi

echo ""
echo "✓ Web started (PID: $WEB_PID)"
echo "✓ Worker started (PID: $WORKER_PID)"
echo ""
echo "  Stop: ./stop-bg.sh"
echo "  Health: curl -sf http://127.0.0.1:${PORT}/api/health"
