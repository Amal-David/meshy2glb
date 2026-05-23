#!/usr/bin/env bash
# Static-file server. The decoder is pure JS (WebCrypto + three.js), so
# this works from any hostname — no localhost requirement, no vendor blobs.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8765}"
echo "==> http://localhost:$PORT/"
echo "==> Drop a .meshy file in the browser."
exec python3 -m http.server "$PORT"
