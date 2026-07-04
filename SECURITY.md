# TuneBad — Security Review

Scope: the full TuneBad codebase (Next.js 15 app on Vercel + an optional standalone remote downloader server on Render). Reviewed by the security-review pass; each item below was traced from untrusted input to sink.

## Summary

**No high or medium severity exploitable vulnerabilities found.** The public (Vercel) deployment is a static app plus RLS-guarded Supabase writes, with one additional server surface: `/api/youtube*`, which proxies (never executes locally) to a key-gated Render service. Command injection, path traversal, URL injection, XSS, and secret-exposure vectors were each checked and are not exploitable.

## Architecture: the link downloader

The link downloader (YouTube/SoundCloud/Bandcamp/Vimeo/Mixcloud/Audiomack → MP3/WAV) shells out to `yt-dlp` + `ffmpeg`, which can't run on Vercel's serverless runtime. Two modes exist, both gated by `lib/runtime.ts`:

1. **Local dev** (`ENABLE_LINK_DOWNLOADER=1`): the Next.js route handlers (`app/api/youtube/*`) spawn `yt-dlp` directly via `lib/server/ytdlp.ts`.
2. **Production (proxy mode)**: when `DOWNLOADER_REMOTE_URL` + `DOWNLOADER_API_KEY` are set, the same route handlers instead proxy to a standalone Node server (`server/server.js`) deployed on Render, which does the actual spawning.

**Trust chain for proxy mode:**

- **Vercel side validates first.** `app/api/youtube/route.ts` parses the request body with a zod schema (`startJobSchema`), then canonicalizes/allowlists the URL with `validateMediaUrl` (`lib/media-url.ts`) *before* anything is forwarded. Only the zod-parsed, canonicalized fields are sent upstream — never the raw request body.
- **Per-IP rate limiting on the proxy.** `lib/server/rate-limit.ts` caps job starts per IP (10 per 10-minute sliding window) before the request is forwarded to Render.
- **The API key is server-side only.** `DOWNLOADER_API_KEY` is read from `process.env` in route handlers (never a `NEXT_PUBLIC_*` var) and sent as `x-api-key` to the Render service. It never reaches the client bundle (verified — see below).
- **The remote server re-validates independently.** `server/server.js` does not trust the Vercel proxy: it re-parses and re-validates the body (zod-equivalent hand rolled checks), re-runs the same canonical URL + host-allowlist logic (`server/media-url.js`, kept in sync with `lib/media-url.ts`), and requires a valid `x-api-key` compared with `crypto.timingSafeEqual` against a SHA-256 digest (not a raw string compare, to avoid timing side-channels).
- **Defense-in-depth on the remote server**, independent of the API key: a global sliding-window job-start rate limit (20 job starts / 10 minutes) so a single leaked key can't drive unbounded `yt-dlp` spawning; a 2-job concurrency cap; an 8 KB request body size cap (413 beyond it); and a UUID-pattern check on `jobId` before any map lookup or filesystem path use.
- **No internals leak in error responses.** Error messages returned to clients are yt-dlp's own user-relevant classification (`classifyError`) or a small fixed set of strings; absolute filesystem paths (the tmpdir-based workdir, resolved binary paths) are stripped from any message before it's sent (`stripInternalPaths`).

## Verified-safe findings

1. **Command injection (link downloader) — NOT exploitable.** Both `lib/server/ytdlp.ts` (local) and `server/server.js` (remote) spawn `yt-dlp` with `spawn(path, argsArray, { shell: false })` and a `--` separator before the URL. The URL is never the raw user string: `lib/media-url.ts` / `server/media-url.js` parse it, enforce `http(s)` only, check a host allowlist, and for YouTube rebuild a canonical `https://www.youtube.com/watch?v=<id>` where `<id>` matches `^[A-Za-z0-9_-]{11}$`. With no shell and the URL as a single argv element, shell/flag injection is structurally impossible.
2. **Path traversal (file download) — NOT exploitable.** Job working directories are server-generated (`os.tmpdir()/tuner-yt/<uuid>` locally, `os.tmpdir()/tunebad-remote/<uuid>` remotely); the served path is `<workdir>/audio.<format>` where `format` is a validated `mp3|wav` enum. `jobId` is validated against a strict UUID pattern before any map lookup or path use, in all three places it's accepted: the Next.js `[jobId]` and `[jobId]/file` routes (before the upstream fetch URL is built) and the remote server's `/job/:id` handler (before path use). No user-controlled path segment reaches the filesystem.
3. **URL injection into the upstream fetch — NOT exploitable.** `app/api/youtube/[jobId]/route.ts` and `[jobId]/file/route.ts` validate `jobId` against `UUID_PATTERN` before interpolating it into the `fetch(`${remoteDownloaderUrl}/job/${jobId}`)` call, so a malicious `jobId` can't alter the upstream path or inject extra segments/query.
4. **Open proxy — NOT exploitable.** `app/api/youtube/wake/route.ts` fetches only the fixed, server-configured `${remoteDownloaderUrl}/health` endpoint. No user input reaches the URL, and no upstream response body is ever returned to the caller (fire-and-forget, always responds `204`).
5. **HTTP header injection (Content-Disposition) — NOT exploitable.** The download filename derives from the video title but is sanitized to `[\w\s.-]` for the ASCII `filename` and `encodeURIComponent`-encoded for the RFC 5987 `filename*` — CR/LF cannot survive either path. The remote server's `contentDisposition()` mirrors the local route's logic exactly.
6. **XSS — no sink.** Zero `dangerouslySetInnerHTML` in the tree. All rendering is React auto-escaped.
7. **Secrets — none exposed to the client.** `DOWNLOADER_API_KEY` and `DOWNLOADER_REMOTE_URL` are read only in server-side route handlers and are absent from the client bundle (`.next/static`) — confirmed by grep after `npm run build`. No service-role key or server secret anywhere. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design and safe **because RLS is enforced** (see below). `NEXT_PUBLIC_DOWNLOADER` is a boolean UI feature flag by design and is expected to appear in the client bundle.
8. **Supabase RLS — correct.** `supabase/schema.sql` enables RLS on `analysis_history` and scopes `select`/`insert`/`delete` to `auth.uid() = user_id` (insert also has `with check`). Anonymous sign-in gives each browser its own `auth.uid()`, so users can only read/write their own rows. The `cap_history_rows` trigger is `security definer` with a pinned `search_path = public`. Stored data is non-sensitive (track name, BPM, key) — no PII, no credentials.
9. **CSP.** Set statically in `next.config.mjs` (compatible with prerendered pages): `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (`'unsafe-eval'` only in dev for React Refresh), `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self' https://*.supabase.co wss://*.supabase.co`. The Render downloader origin does **not** need to appear here: the browser only ever talks to `/api/youtube*` on the same origin — the Vercel server function is the one making the outbound `fetch` to Render, which isn't subject to the page's CSP. Also sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`. `'unsafe-inline'` for scripts is required because the pages are statically prerendered (a per-request nonce can't match build-time HTML); the residual XSS risk is low since the app has no HTML-injection sinks.

## Attack surface by deployment

| Surface | Local (`ENABLE_LINK_DOWNLOADER=1`) | Vercel + Render (proxy mode configured) |
|---|---|---|
| `/api/youtube*` | Active, spawns `yt-dlp` directly, bound to localhost | Active, proxies to Render after zod + allowlist validation + per-IP rate limit |
| Remote downloader (`server/server.js`) | N/A | Key-gated (`x-api-key`, timing-safe compare), independently re-validates URL, global rate cap, 2-job concurrency, 8 KB body cap |
| Static app + Web Audio analysis | Client-only | Client-only |
| Supabase history writes | Optional, RLS-scoped | Optional, RLS-scoped |

If `DOWNLOADER_REMOTE_URL` / `DOWNLOADER_API_KEY` are unset and `ENABLE_LINK_DOWNLOADER` is unset, `/api/youtube*` returns `404` and the deployment has no server attack surface beyond Supabase.

## Bot / abuse exposure

Beyond the gated downloader described above, the only other writable resource is the Supabase `analysis_history` table, protected by: RLS isolation per anonymous user, a 50-row-per-user cap trigger, and Supabase's platform-level anon rate limits. Worst case for an abusive client is filling *its own* 50-row quota. No cross-user read/write is possible.

## Recommendations (defense-in-depth, not blockers)

- After running `schema.sql`, confirm in the Supabase dashboard that RLS shows **enabled** on `analysis_history` and that no permissive `USING (true)` policy exists.
- Rotate `DOWNLOADER_API_KEY` periodically and if it's ever suspected of leaking (e.g. via a Render dashboard screenshot).
- Keep `ENABLE_LINK_DOWNLOADER` unset in the Vercel project — proxy mode is the intended production path, not local spawning.
- Enable Vercel's built-in Attack Challenge / bot protection on the project if abuse is observed.
