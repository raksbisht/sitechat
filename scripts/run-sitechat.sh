#!/usr/bin/env bash
# Start SiteChat and open the app in your browser (macOS/Linux).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
URL="http://127.0.0.1:8000"
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "$URL") &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "$URL") &
fi
echo "SiteChat → $URL (Ctrl+C to stop)"
exec python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
