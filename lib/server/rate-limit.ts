// Simple in-memory sliding-window rate limiter (per-IP). Fine for a
// local single-user tool; stored on globalThis to survive dev HMR.
// A 50-track playlist/Spotify batch fires up to 50 job-starts from one IP in
// quick succession, so the ceiling has to clear that (plus retries). Downloads
// are further bounded downstream: the Mac bridge caps concurrent + total job
// starts (YTDLP_MAX_JOB_STARTS), so this is only a coarse abuse guard.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_STARTS = 80;

const globalStore = globalThis as unknown as { __tunerRateLimit?: Map<string, number[]> };
const store = (globalStore.__tunerRateLimit ??= new Map<string, number[]>());

export function allowJobStart(key: string): boolean {
  const now = Date.now();
  const recent = (store.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_STARTS) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}
