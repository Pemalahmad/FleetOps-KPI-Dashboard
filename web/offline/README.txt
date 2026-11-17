FleetOps KPI · offline package
================================

Run FleetOps on your own computer, with no internet connection needed after download.

  Mac:      double-click "start-mac.command"   (first time: right-click > Open, because it is not from the App Store)
  Windows:  double-click "start-windows.bat"
  Linux:    run ./start-linux.sh

The app opens at http://127.0.0.1:8765 (Windows: http://localhost:8765). The server listens only on this computer;
nobody else on your network can reach it.

Your data
  - Everything you import or scan is stored by your browser, for that address, on this computer. Nothing is uploaded.
  - Use the same browser and the same launcher each time so your fleet is there when you come back.
  - "Delete my fleet data" on the Import page removes it.
  - The only optional online feature is VIN decoding (NHTSA vPIC), and only when you click it.

Check the download
  SHA256SUMS.txt next to the zip on the release page lists the expected checksum.
    Mac/Linux: shasum -a 256 FleetOps-offline-*.zip      Windows: Get-FileHash FleetOps-offline-*.zip

Licence: MIT. During early access every feature is unlocked; no key is needed.
