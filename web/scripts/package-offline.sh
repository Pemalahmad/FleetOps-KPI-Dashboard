#!/usr/bin/env bash
# Build the offline package: the app built for the root path, plus launchers, zipped with a checksum.
# Usage (from web/): bash scripts/package-offline.sh 0.5.0   -> dist/FleetOps-offline-0.5.0.zip
set -euo pipefail
VERSION="${1:-dev}"
cd "$(dirname "$0")/.."
NEXT_PUBLIC_BASE_PATH="" npm run build
rm -rf dist && mkdir -p "dist/FleetOps-offline/app"
cp -R out/. "dist/FleetOps-offline/app/"
cp offline/start-mac.command offline/start-linux.sh offline/start-windows.bat offline/serve.ps1 offline/README.txt dist/FleetOps-offline/
chmod +x dist/FleetOps-offline/start-mac.command dist/FleetOps-offline/start-linux.sh
(cd dist && zip -qr "FleetOps-offline-${VERSION}.zip" FleetOps-offline && shasum -a 256 "FleetOps-offline-${VERSION}.zip" > SHA256SUMS.txt)
echo "dist/FleetOps-offline-${VERSION}.zip ($(du -h "dist/FleetOps-offline-${VERSION}.zip" | cut -f1))"
cat dist/SHA256SUMS.txt
