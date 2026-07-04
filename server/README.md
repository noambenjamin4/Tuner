# TuneBad remote downloader

Tiny standalone yt-dlp server so the Vercel-hosted Next.js app (which can't
shell out) can still power the link downloader. Zero npm dependencies. It
accepts a `url` OR a `query` (`ytsearch1:` search, for Spotify-matched tracks),
supports MP3/WAV/MP4, and exposes `/playlist` (metadata enumerate) alongside
`/job`. The same file runs in two places:

- **Render** (datacenter fallback) — deploy via the Render Blueprint: connect
  this repo, Render reads `render.yaml` at the repo root and builds
  `server/Dockerfile`.
- **Home Bridge** (the operator's Mac) — the primary path, since YouTube
  bot-walls datacenter IPs. Run by `scripts/tunebad-bridge.sh` (launchd),
  bound to `127.0.0.1` behind a Cloudflare tunnel, publishing its rotating
  URL to Vercel Edge Config. See the repo README's "Home Bridge" section.

Env vars (set in Render dashboard / the bridge's gitignored env file, never
committed):
- `API_KEY` — required; the Next.js app sends it as `x-api-key`. Set the
  matching value as `DOWNLOADER_API_KEY` (Render) or `DOWNLOADER_HOME_KEY`
  (Home Bridge) in the Vercel project.
- `HOST` — set to `127.0.0.1` on the Mac bridge so it never binds the LAN;
  unset on Render (binds all interfaces, as the platform requires).
- `YTDLP_MAX_JOB_STARTS` — global job-start ceiling (default 20; the bridge
  sets 60 so a 50-track batch isn't self-throttled).
- `YTDLP_COOKIES` — optional, base64-encoded `cookies.txt`; decoded to
  `/tmp/cookies.txt` at startup and passed via `--cookies` to yt-dlp. Helps
  when YouTube blocks Render's datacenter IPs with a bot check.

`PORT` is injected automatically by Render (the bridge sets `PORT=8080`).

## Redeploying

This repo is connected to Render as a public GitHub URL rather than through
Render's GitHub App integration, so **auto-deploy on push is not active** —
pushing to `main` does not trigger a new build. After merging a change that
touches `server/`, trigger a manual deploy from the Render dashboard
(**Manual Deploy → Deploy latest commit**).
