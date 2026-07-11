#!/bin/zsh
# TuneBad local launcher: starts the site on this Mac with the link
# downloader enabled (it is disabled on the public Vercel deployment
# because yt-dlp cannot run there) and opens the converter tab.
set -u

DIR="$HOME/Code/Tunebad"
PORT=3002
URL="http://localhost:$PORT/#converter"
LOG="/tmp/tunebad-local.log"

cd "$DIR" || exit 1

# First-run provisioning: yt-dlp binary + node modules.
[ -f bin/yt-dlp ] || npm run setup:ytdlp >> "$LOG" 2>&1
[ -d node_modules ] || npm install >> "$LOG" 2>&1

# Start the dev server only if nothing is already serving the port.
if ! lsof -ti:"$PORT" > /dev/null 2>&1; then
  nohup npx next dev -p "$PORT" >> "$LOG" 2>&1 &
fi

# Wait (up to ~60s) for the server, then open the browser.
for _ in {1..120}; do
  if curl -s -o /dev/null "http://localhost:$PORT"; then
    open "$URL"
    exit 0
  fi
  sleep 0.5
done

# Server never came up — show the log location.
osascript -e 'display alert "TuneBad could not start" message "Check /tmp/tunebad-local.log for details."'
exit 1
