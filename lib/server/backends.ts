// Picks and validates which downloader backend (home Mac vs Render remote)
// a job talks to. See lib/runtime.ts for why home is preferred: YouTube
// bot-walls the Render datacenter IP but not a home IP.
import { get } from "@vercel/edge-config";
import { homeDownloaderUrl, homeDownloaderKey, remoteDownloaderUrl, remoteDownloaderKey } from "@/lib/runtime";
import { UUID_PATTERN } from "@/lib/server/validate";

export type BackendTag = "home" | "remote";
export type Backend = { base: string; key: string; tag: BackendTag };

// What pickBackend found:
//  - "ready":  a backend that answered a health check and can take a job now.
//  - "waking": the only candidate left is the remote, and it didn't answer
//              inside its health window — it's almost certainly cold-starting.
//              Callers should tell the user to retry shortly instead of
//              burning the 60s function budget on a request that will very
//              likely time out anyway.
//  - "none":   nothing usable is configured.
export type BackendPick = { status: "ready"; backend: Backend } | { status: "waking" } | { status: "none" };

// The Mac bridge's public tunnel URL changes whenever cloudflared restarts
// (e.g. on reboot). The bridge writes its current URL into the Edge Config
// `bridgeUrl` key on every startup, so the proxy always routes to wherever
// the Mac currently is — no redeploy needed. The DOWNLOADER_HOME_URL env is a
// static fallback/override (used in local dev or if Edge Config is absent).
// Cached briefly so we don't read Edge Config on every request.
let homeUrlCache: { value: string | null; at: number } | null = null;
const HOME_URL_TTL_MS = 20_000;

// Defense-in-depth: only ever route to the bridge's own tunnel host. Even if a
// bad value reached Edge Config or the env, the proxy can't be pointed at an
// attacker-controlled server (SSRF). The bridge always publishes a
// `https://<random>.trycloudflare.com` URL.
function isTrustedBridgeUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  try {
    const u = new URL(candidate);
    return u.protocol === "https:" && (u.hostname === "trycloudflare.com" || u.hostname.endsWith(".trycloudflare.com"));
  } catch {
    return false;
  }
}

async function resolveHomeUrl(): Promise<string | null> {
  if (homeUrlCache && Date.now() - homeUrlCache.at < HOME_URL_TTL_MS) return homeUrlCache.value;
  let value: string | null = null;
  try {
    const fromStore = await get<string>("bridgeUrl");
    if (isTrustedBridgeUrl(fromStore)) value = fromStore;
  } catch {
    // Edge Config not configured/reachable — fall back to the env override.
  }
  if (!value && isTrustedBridgeUrl(homeDownloaderUrl)) value = homeDownloaderUrl;
  homeUrlCache = { value, at: Date.now() };
  return value;
}

async function homeBackend(): Promise<Backend | null> {
  if (!homeDownloaderKey) return null;
  const base = await resolveHomeUrl();
  return base ? { base, key: homeDownloaderKey, tag: "home" } : null;
}

function remoteBackend(): Backend | null {
  if (!remoteDownloaderUrl || !remoteDownloaderKey) return null;
  return { base: remoteDownloaderUrl, key: remoteDownloaderKey, tag: "remote" };
}

// Health-check budgets. Home gets 2s: it's either on the LAN-ish tunnel and
// answers immediately, or the Mac is off and we shouldn't wait. Remote gets a
// little more headroom for ordinary internet latency — a warm instance answers
// this in well under a second either way.
const HOME_HEALTH_TIMEOUT_MS = 2000;
const REMOTE_HEALTH_TIMEOUT_MS = 3000;

// GET /health is unauthenticated on both backends (server/server.js) and
// returns 200 {ok:true}, so this leaks nothing and needs no key.
async function isHealthy(backend: Backend, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${backend.base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    // Unreachable, or timed out.
    return false;
  }
}

// Picks the backend a new job should start on: home if it's reachable right
// now, else remote. Health-check timeouts keep this from stalling the
// POST /api/youtube request when the Mac is off or the tunnel is down.
//
// The remote is checked too, rather than assumed usable: Render's free
// instances spin down when idle and the first request after that hangs ~50s
// while the container boots — longer than the route's 60s budget once the
// actual download is added on top, so the user just sees a generic failure.
// A short health check separates warm from cold, and the check itself is what
// triggers the spin-up, so a retry a minute later lands on a warm server.
export async function pickBackend(): Promise<BackendPick> {
  const home = await homeBackend();
  if (home && (await isHealthy(home, HOME_HEALTH_TIMEOUT_MS))) return { status: "ready", backend: home };

  const remote = remoteBackend();
  if (!remote) return { status: "none" };
  if (await isHealthy(remote, REMOTE_HEALTH_TIMEOUT_MS)) return { status: "ready", backend: remote };
  return { status: "waking" };
}

// Parses a prefixed job id (e.g. "home_<uuid>" / "remote_<uuid>") back into
// the backend it was created on plus the bare upstream uuid. This is the
// path-traversal / injection guard for the two proxy GET routes, so it's
// intentionally strict: bad prefix, malformed uuid, or a backend that isn't
// currently configured all return null.
export async function backendForJob(jobId: string): Promise<{ backend: Backend; upstreamId: string } | null> {
  const separatorIndex = jobId.indexOf("_");
  if (separatorIndex === -1) return null;

  const prefix = jobId.slice(0, separatorIndex);
  const upstreamId = jobId.slice(separatorIndex + 1);
  if (!UUID_PATTERN.test(upstreamId)) return null;

  if (prefix === "home") {
    const backend = await homeBackend();
    return backend ? { backend, upstreamId } : null;
  }
  if (prefix === "remote") {
    const backend = remoteBackend();
    return backend ? { backend, upstreamId } : null;
  }
  return null;
}
