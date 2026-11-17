#!/bin/sh
set -e
if [ ! -f /fleet/fleet.yml ]; then
  echo "No /fleet/fleet.yml found: starting with the demo fleet."
  fleetkpi demo /fleet
else
  # A blocked build keeps the last good warehouse; the Pipeline page shows why.
  fleetkpi build || echo "Build blocked: see the Pipeline page."
fi
exec fleetkpi serve --host 0.0.0.0 --port 8501
