// Simple in-memory sliding-window rate limiter (per-IP). Fine for a
// local single-user tool; stored on globalThis to survive dev HMR.
// A 50-track playlist/Spotify batch fires up to 50 job-starts from one IP in
// quick succession, so the ceiling has to clear that (plus retries). Downloads
// are further bounded downstream: the Mac bridge caps concurrent + total job
// starts (YTDLP_MAX_JOB_STARTS), so this is only a coarse abuse guard.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_STARTS = 80;
// Enumerate endpoints (playlist/spotify) spawn yt-dlp or fetch Spotify but don't
// download — a separate, tighter bucket so they can't be spun in a loop.
const MAX_ENUMERATE = 20;
// Link-analysis lookups/preview proxying (oEmbed + Deezer/iTunes + ~0.5MB
// preview streams) — cheap but outbound, so a moderate dedicated bucket.
const MAX_LOOKUPS = 40;

type Buckets = { starts: Map<string, number[]>; enumerate: Map<string, number[]>; lookups: Map<string, number[]> };
const globalStore = globalThis as unknown as { __tunebadRateLimit?: Buckets };
const buckets = (globalStore.__tunebadRateLimit ??= { starts: new Map(), enumerate: new Map(), lookups: new Map() });
// HMR-persisted stores from before this bucket existed need the new map.
buckets.lookups ??= new Map();

function allow(store: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const recent = (store.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= max) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

export function allowJobStart(key: string): boolean {
  return allow(buckets.starts, key, MAX_STARTS);
}

export function allowEnumerate(key: string): boolean {
  return allow(buckets.enumerate, key, MAX_ENUMERATE);
}

export function allowLookup(key: string): boolean {
  return allow(buckets.lookups, key, MAX_LOOKUPS);
}

// Periodic sweep so buckets don't grow unbounded under many distinct IPs. Only
// arm one interval per process (dev HMR re-imports this module).
const timerHost = globalStore as unknown as { __tunebadRateLimitSweep?: boolean };
if (!timerHost.__tunebadRateLimitSweep) {
  timerHost.__tunebadRateLimitSweep = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const store of [buckets.starts, buckets.enumerate, buckets.lookups]) {
      for (const [key, times] of store) {
        const recent = times.filter((t: number) => now - t < WINDOW_MS);
        if (recent.length === 0) store.delete(key);
        else store.set(key, recent);
      }
    }
  }, WINDOW_MS);
  timer.unref?.();
}
