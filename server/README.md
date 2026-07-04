# TuneBad remote downloader

Tiny standalone yt-dlp server so the Vercel-hosted Next.js app (which can't
shell out) can still power the link downloader. Zero npm dependencies.

Deploy via the Render Blueprint: connect this repo, Render reads
`render.yaml` at the repo root, and builds `server/Dockerfile`.

Env vars (set in Render dashboard, not committed):
- `API_KEY` — required; the Next.js app sends it as `x-api-key`. Set the
  matching value as `DOWNLOADER_API_KEY` in the Vercel project.
- `YTDLP_COOKIES` — optional, base64-encoded `cookies.txt`; decoded to
  `/tmp/cookies.txt` at startup and passed via `--cookies` to yt-dlp. Helps
  when YouTube blocks Render's datacenter IPs with a bot check.

`PORT` is injected automatically by Render.

## Redeploying

This repo is connected to Render as a public GitHub URL rather than through
Render's GitHub App integration, so **auto-deploy on push is not active** —
pushing to `main` does not trigger a new build. After merging a change that
touches `server/`, trigger a manual deploy from the Render dashboard
(**Manual Deploy → Deploy latest commit**).
