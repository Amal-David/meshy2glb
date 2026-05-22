#!/usr/bin/env bash
# First run: fetch the runtime into ./vendor. Then serve on localhost.
set -euo pipefail
cd "$(dirname "$0")"

VENDOR_BASE='https://www.meshy.ai/resource/decrypt'
PORT="${PORT:-8765}"

mkdir -p vendor
need_files=(loader-worker.min.js mesh_loader.js mesh_loader.wasm)
missing=0
for f in "${need_files[@]}"; do [ -f "vendor/$f" ] || missing=1; done

if [ "$missing" = "1" ]; then
  echo "First run — populating ./vendor"
  for f in "${need_files[@]}"; do
    echo "  fetching $f"
    curl -fsSL -o "vendor/$f" "$VENDOR_BASE/$f"
  done
  echo "Done."
fi

echo
echo "==> http://localhost:$PORT/"
echo "==> Drop a .meshy file in the browser."
echo "==> Use the URL exactly as printed — 127.0.0.1 and LAN IPs are rejected."
echo

# Bind only to localhost — never expose this on the LAN.
exec python3 -m http.server --bind 127.0.0.1 "$PORT"
