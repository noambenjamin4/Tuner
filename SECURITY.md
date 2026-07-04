# Tuner — Security Review

Scope: the full Tuner codebase (Next.js 15 app), with focus on the internet-facing surface once deployed to Vercel. Reviewed by the security-review pass; each item below was traced from untrusted input to sink.

## Summary

**No high or medium severity exploitable vulnerabilities found.** The public (Vercel) deployment exposes essentially no server attack surface: the only server routes (the link downloader) return `404` in production, leaving a static app plus RLS-guarded Supabase writes. Command injection, path traversal, XSS, and secret-exposure vectors were each checked and are not exploitable.

## Attack surface by deployment

| Surface | Local (`ENABLE_LINK_DOWNLOADER=1`) | Vercel (flag unset) |
|---|---|---|
| `/api/youtube*` (yt-dlp/ffmpeg) | Active, bound to localhost | **404 — disabled** |
| Static app + Web Audio analysis | Client-only | Client-only |
| Supabase history writes | Optional, RLS-scoped | Optional, RLS-scoped |

## Verified-safe findings

1. **Command injection (link downloader) — NOT exploitable.** `lib/server/ytdlp.ts` spawns yt-dlp with `spawn(path, argsArray, { shell: false })` and a `--` separator before the URL. The URL is never the raw user string: `lib/media-url.ts` parses it, enforces `http(s)` only, checks a host allowlist, and for YouTube rebuilds a canonical `https://www.youtube.com/watch?v=<id>` where `<id>` matches `^[A-Za-z0-9_-]{11}$`. With no shell and the URL as a single argv element, shell/flag injection is structurally impossible.
2. **Path traversal (file download) — NOT exploitable.** Job working directories are `os.tmpdir()/tuner-yt/<server-generated-uuid>`; the served path is `<workdir>/audio.<format>` where `format` is a validated `mp3|wav` enum. `jobId` is validated against a UUID pattern before map lookup. No user-controlled path segment reaches the filesystem.
3. **HTTP header injection (Content-Disposition) — NOT exploitable.** The download filename derives from the video title but is sanitized to `[\w\s.-]` for the ASCII `filename` and `encodeURIComponent`-encoded for the RFC 5987 `filename*` — CR/LF cannot survive either path.
4. **XSS — no sink.** Zero `dangerouslySetInnerHTML` in the tree (the pre-hydration theme script was removed in the redesign). All rendering is React auto-escaped.
5. **Secrets — none exposed.** No service-role key or server secret anywhere. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design and safe **because RLS is enforced** (see below). yt-dlp/ffmpeg are local binaries, never shipped to the client.
6. **Supabase RLS — correct.** `supabase/schema.sql` enables RLS on `analysis_history` and scopes `select`/`insert`/`delete` to `auth.uid() = user_id` (insert also has `with check`). Anonymous sign-in gives each browser its own `auth.uid()`, so users can only read/write their own rows. The `cap_history_rows` trigger is `security definer` with a pinned `search_path = public`. Stored data is non-sensitive (track name, BPM, key) — no PII, no credentials.
7. **CSP.** Set statically in `next.config.mjs` (compatible with prerendered pages): `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (`'unsafe-eval'` only in dev for React Refresh), `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self' https://*.supabase.co wss://*.supabase.co`. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`. Note: `'unsafe-inline'` for scripts is required because the pages are statically prerendered (a per-request nonce can't match build-time HTML); the residual XSS risk is low since the app has no HTML-injection sinks (no `dangerouslySetInnerHTML`; all rendering React-escaped).

## Bot / abuse exposure

The deployed site has no server endpoints and no user accounts, so there is nothing for a bot to brute-force. The only writable resource is the Supabase `analysis_history` table, protected by: RLS isolation per anonymous user, a 50-row-per-user cap trigger, and Supabase's platform-level anon rate limits. Worst case for an abusive client is filling *its own* 50-row quota. No cross-user read/write is possible.

## Recommendations (defense-in-depth, not blockers)

- After running `schema.sql`, confirm in the Supabase dashboard that RLS shows **enabled** on `analysis_history` and that no permissive `USING (true)` policy exists.
- Keep `ENABLE_LINK_DOWNLOADER` / `NEXT_PUBLIC_DOWNLOADER` **unset** in the Vercel project (default) so the downloader stays disabled in production.
- Enable Vercel's built-in Attack Challenge / bot protection on the project if you later add any server routes.
