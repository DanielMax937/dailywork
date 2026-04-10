#!/usr/bin/env bash
# Stop dailywork Web (port 3310) + worker started by start-bg.sh
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3310}"
WEB_PID_FILE="${DAILYWORK_WEB_PID:-./dailywork-web.pid}"
WORKER_PID_FILE="${DAILYWORK_WORKER_PID:-./dailywork-worker.pid}"

stop_by_pidfile() {
  local file=$1
  local label=$2
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $label (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_by_pidfile "$WORKER_PID_FILE" "worker"

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Stopping Web on port $PORT..."
  lsof -ti:"$PORT" | xargs kill 2>/dev/null || true
  sleep 1
  if lsof -ti:"$PORT" >/dev/null 2>&1; then
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  fi
fi

stop_by_pidfile "$WEB_PID_FILE" "web (pid file)"

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Warning: port $PORT still in use."
else
  echo "✓ dailywork Web + worker stopped"
fi

exit 0
