#!/bin/bash
# FleetOps offline: serves the app from this folder at http://127.0.0.1:8765, reachable only from this computer.
# Your fleet data is kept by your browser for this address; use the same browser and keep the same port.
cd "$(dirname "$0")/app" || exit 1
PORT=8765
URL="http://127.0.0.1:$PORT/"
if command -v python3 >/dev/null 2>&1; then python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
elif command -v ruby >/dev/null 2>&1; then ruby -run -e httpd . -b 127.0.0.1 -p "$PORT" >/dev/null 2>&1 &
elif command -v php >/dev/null 2>&1; then php -S "127.0.0.1:$PORT" >/dev/null 2>&1 &
elif command -v npx >/dev/null 2>&1; then npx --yes http-server -a 127.0.0.1 -p "$PORT" -s &
else echo "No local web server found. Install Python 3 (python.org) and run this again."; read -r; exit 1; fi
SERVER=$!
sleep 1
open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null
echo "FleetOps is running at $URL"
echo "Close this window (or press Ctrl+C) to stop it."
trap 'kill $SERVER 2>/dev/null' EXIT
wait $SERVER
