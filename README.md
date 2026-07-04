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
- **Converter** — local audio → MP3 or sample-exact WAV with automatic silent-intro trimming. A local-only link downloader (yt-dlp + ffmpeg) supports YouTube/SoundCloud/Bandcamp/Vimeo/Mixcloud/Audiomack when running on your own machine.
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

`ffmpeg` is provided by the `ffmpeg-static` npm package. The downloader is intentionally disabled in production deployments.

## Optional: cloud history (Supabase)

Without any configuration the app uses on-device history. To sync history anonymously across a browser session:

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable **Anonymous sign-ins** under Authentication → Providers.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (locally in `.env.local`, or in your host's environment variables).

Row-level security scopes every row to its anonymous user; the anon key is safe to expose. See `SECURITY.md`.

## Deployment

Deploys to Vercel as a standard Next.js app — no configuration required. Leave `ENABLE_LINK_DOWNLOADER` / `NEXT_PUBLIC_DOWNLOADER` unset in production so the downloader stays disabled. Add the Supabase environment variables if you want cloud history.
