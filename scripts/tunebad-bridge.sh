#!/bin/zsh
# TuneBad Home Bridge — runs the hardened download server on this Mac plus a
# free Cloudflare tunnel, so the live website can route YouTube/MP4/playlist
# downloads through this machine's home IP (YouTube bot-walls datacenter IPs;
# a residential IP is not blocked). Cloudflare tunnels are unmetered, so large
# video/playlist files transfer fine.
#
# The server binds to 127.0.0.1 (never the LAN); only the key-gated cloudflare
# tunnel reaches it. The tunnel URL changes each restart, so on every startup
# the bridge publishes its current URL to the site's Edge Config store — the
# proxy always routes to wherever this Mac currently is (self-healing).
#
# Managed by launchd (com.tunebad.bridge): starts at login, restarts on crash.
set -u

DIR="$HOME/Code/Tuner"
PORT=8080
LOG=/tmp/tunebad-bridge.log

# Secrets (API_KEY, EDGE_CONFIG_ID) live in a gitignored env file — never in
# this tracked script. See scripts/tunebad-bridge.env.example.
ENV_FILE="$DIR/scripts/tunebad-bridge.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy tunebad-bridge.env.example and fill it in." >> "$LOG"
  exit 1
fi
source "$ENV_FILE"

export PORT HOST=127.0.0.1
export API_KEY
export YTDLP_PATH="$DIR/bin/yt-dlp"
export FFMPEG_PATH="$DIR/node_modules/ffmpeg-static/ffmpeg"
export YTDLP_MAX_JOB_STARTS=60

cd "$DIR" || exit 1
[ -x bin/yt-dlp ] || npm run setup:ytdlp >> "$LOG" 2>&1

# Publishes a tunnel URL to the Edge Config store the website reads. Uses the
# Mac's persistent Vercel CLI auth (no token stored in this script).
publish_url() {
  local url="$1"
  npx --yes vercel edge-config update "$EDGE_CONFIG_ID" \
    --patch "{\"items\":[{\"operation\":\"upsert\",\"key\":\"bridgeUrl\",\"value\":\"$url\"}]}" \
    >> "$LOG" 2>&1 && echo "$(date '+%H:%M:%S') published $url" >> "$LOG"
}

# Start the download server (loopback only).
node server/server.js >> "$LOG" 2>&1 &
SERVER_PID=$!

cleanup() { kill "$SERVER_PID" "${TUNNEL_PID:-}" 2>/dev/null; exit 0; }
trap cleanup TERM INT

# Wait for the server to answer before opening the tunnel.
for _ in {1..60}; do curl -s -o /dev/null "http://127.0.0.1:$PORT/health" && break; sleep 0.5; done

LAST_URL=""
# (Re)start cloudflared, capture its URL, publish it; if cloudflared dies,
# loop restarts it and republishes the new URL.
while kill -0 "$SERVER_PID" 2>/dev/null; do
  : > /tmp/tunebad-cf.log
  "$DIR/bin/cloudflared" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> /tmp/tunebad-cf.log 2>&1 &
  TUNNEL_PID=$!
  URL=""
  for _ in {1..40}; do
    sleep 3
    URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tunebad-cf.log | head -1)
    [ -n "$URL" ] && break
  done
  if [ -n "$URL" ] && [ "$URL" != "$LAST_URL" ]; then
    publish_url "$URL"
    LAST_URL="$URL"
  fi
  # Wait for cloudflared to exit (crash / network change), then loop to restart.
  wait "$TUNNEL_PID" 2>/dev/null
done
