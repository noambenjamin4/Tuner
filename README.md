# TuneBad

A fast, private, browser-based music utility for producers. Analyze a track's BPM and key, calculate tempo-locked delay and reverb, check streaming loudness penalties, make slowed + reverb edits, and convert audio — all in a clean black-and-white interface that follows your system light/dark theme.

**Live:** deployed on Vercel. **Stack:** Next.js 15, React 19, TypeScript, Web Audio API, essentia.js (WASM), optional Supabase.

## Features

- **File Analysis** — BPM, key, Camelot, energy, danceability, and loudness, computed in-browser with essentia.js (matched to Tunebat's algorithm). Full-width, click-to-seek waveform.
- **Delay & Reverb** — tempo-locked delay times (normal/dotted/triplet, ms + Hz) and reverb presets, matched to anotherproducer.com.
- **BPM Tool** — precise metronome and tap tempo, shared across every tool.
- **Pitch** — frequency-to-note conversion via the MIDI formula.
- **Loudness Penalty** — integrated LUFS (ITU-R BS.1770-4) with per-platform penalties (Spotify, YouTube, Apple Music, etc.) and a "preview at platform volume" player.
- **Slowed + Reverb Studio** — speed, reverb, bass, and pitch-lock controls with a seekable preview and MP3/WAV export.
- **Converter** — local audio → MP3 or sample-exact WAV with automatic silent-intro trimming. A link downloader (yt-dlp + ffmpeg) supports YouTube/SoundCloud/Bandcamp/Vimeo/Mixcloud/Audiomack, both locally and on the deployed site via an optional self-hosted, key-gated download server.
- **Auto-analyze** — downloaded tracks are analyzed automatically and feed the delay tool.
- **8 languages** — English, French, Spanish, German, Portuguese, Italian, Japanese, Chinese (auto-detected).
- **Private by default** — all analysis runs client-side. History is stored on-device (localStorage), with optional Supabase sync.

## Local development

```bash
npm install
npm run dev          # http://localhost:3002 (or the default Next port)
```

The link downloader is off by default. To enable it locally, create `.env.local`:

```
ENABLE_LINK_DOWNLOADER=1
NEXT_PUBLIC_DOWNLOADER=1
```

then install the media tools once:

```bash
npm run setup:ytdlp   # downloads a verified yt-dlp binary into ./bin (gitignored)
```

`ffmpeg` is provided by the `ffmpeg-static` npm package.

Or just run `./scripts/tunebad-local.sh` — it provisions `yt-dlp` and `node_modules` on first run, starts the dev server if it isn't already running, and opens the converter tab.

## Optional: cloud history (Supabase)

Without any configuration the app uses on-device history. To sync history anonymously across a browser session:

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable **Anonymous sign-ins** under Authentication → Providers.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (locally in `.env.local`, or in your host's environment variables).

Row-level security scopes every row to its anonymous user; the anon key is safe to expose. See `SECURITY.md`.

## Deployment

Deploys to Vercel as a standard Next.js app — no configuration required. Leave `ENABLE_LINK_DOWNLOADER` unset in production (Vercel's serverless runtime can't shell out to `yt-dlp`). Add the Supabase environment variables if you want cloud history.

The link downloader can still work on the deployed site via an optional self-hosted remote download server (`server/` + `render.yaml`), deployed separately (e.g. on Render) and key-gated with an API key the Vercel app sends server-side. To wire it up:

1. Deploy `server/` (see `server/README.md`) and note its public URL.
2. In the Vercel project, set `DOWNLOADER_REMOTE_URL` (the server's URL) and `DOWNLOADER_API_KEY` (matching its `API_KEY`), plus `NEXT_PUBLIC_DOWNLOADER=1` to surface the UI.
3. Redeploy. `/api/youtube*` now proxies to the remote server instead of running locally; see `SECURITY.md` for the full trust chain.

This is entirely optional — without it, the deployed site works normally minus the link downloader, and local dev is unaffected either way.
