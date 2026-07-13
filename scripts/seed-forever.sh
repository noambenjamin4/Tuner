#!/bin/bash
# Perpetual catalog growth: run the Deezer seeder back to back, forever.
# Installed as the com.tunebad.seeder launchd agent (KeepAlive), so it
# survives reboots and restarts itself if it ever dies. Each cycle:
#   1. waits for any already-running seeder to finish (never two at once —
#      that would double-hit Deezer's API),
#   2. runs one 50k-cap pass (the script itself skips cached songs and, with
#      shuffled frontier sampling, explores a different slice each time),
#   3. rests 5 minutes, then goes again.
# Logs rotate per cycle under logs/seed/ and only the last 20 are kept.
set -u

cd "$(dirname "$0")/.." || exit 1
mkdir -p logs/seed

while true; do
  # One seeder at a time, ever. Covers both a manually-started run and the
  # previous cycle somehow still winding down.
  while pgrep -f "node scripts/seed-songs.mjs" > /dev/null 2>&1; do
    sleep 60
  done

  STAMP=$(date +%Y%m%d-%H%M%S)
  LOG="logs/seed/run-$STAMP.log"
  echo "[seed-forever] starting cycle $STAMP" >> logs/seed/forever.log
  node scripts/seed-songs.mjs 50000 > "$LOG" 2>&1
  echo "[seed-forever] cycle $STAMP exited $? — $(tail -1 "$LOG" 2>/dev/null)" >> logs/seed/forever.log

  # Keep the 20 most recent cycle logs.
  ls -t logs/seed/run-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null

  sleep 300
done
