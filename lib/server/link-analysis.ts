// Server-side helpers for the "analyze from link" feature. Everything here is
// deliberately zero-cost for the operator: song identity comes from free
// keyless oEmbed endpoints, preview audio comes from Deezer/iTunes public
// catalogs, and results are cached in a Supabase table (server-only env vars;
// the browser never talks to Supabase directly).
import { canonicalYouTubeUrl, validateSpotifyUrl, validateMediaUrl } from "@/lib/media-url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const isLinkAnalysisConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type CachedAnalysis = {
  id: string;
  slug: string;
  title: string;
  artist: string | null;
  bpm: number;
  bpm_alt: number | null;
  key: string;
  camelot: string | null;
  energy: number | null;
  danceability: number | null;
  loudness_db: number | null;
  duration_s: number | null;
  source: string;
  created_at: string;
};

const FETCH_TIMEOUT_MS = 6000;

function restHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Canonicalize a pasted link to a stable cache id, or null if unsupported. */
export function sourceIdForUrl(input: string): string | null {
  const yt = canonicalYouTubeUrl(input);
  if (yt) return `yt:${yt.videoId}`;
  const sp = validateSpotifyUrl(input);
  if (sp && sp.kind === "track") return `sp:${sp.id}`;
  const media = validateMediaUrl(input);
  if (media) {
    // Generic platforms (SoundCloud etc.): host + path, trimmed and bounded.
    try {
      const u = new URL(media.url);
      const path = u.pathname.replace(/\/+$/, "").slice(0, 90);
      return `${media.platform}:${u.hostname}${path}`;
    } catch {
      return null;
    }
  }
  return null;
}

export async function readCachedAnalysis(id: string): Promise<CachedAnalysis | null> {
  if (!isLinkAnalysisConfigured) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as CachedAnalysis[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function readRecentAnalyses(limit: number): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?order=created_at.desc&limit=${Math.min(limit, 12)}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  } catch {
    return [];
  }
}

/** A cached song by its SEO slug — backs the /song/<slug> pages. */
export async function readAnalysisBySlug(slug: string): Promise<CachedAnalysis | null> {
  if (!isLinkAnalysisConfigured) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as CachedAnalysis[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Cached songs whose Camelot code is in `codes` — powers harmonic-mix links.
 *  `exclude` drops the current song so a page never links to itself. */
export async function readSongsByCamelot(
  codes: string[],
  exclude: string,
  limit = 12,
): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured || codes.length === 0) return [];
  try {
    const inList = codes.map((c) => `"${encodeURIComponent(c)}"`).join(",");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?camelot=in.(${inList})&slug=neq.${encodeURIComponent(exclude)}&order=created_at.desc&limit=${limit}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  } catch {
    return [];
  }
}

/** Cached songs in one musical key — backs the /songs/key/<slug> hub pages. */
export async function readSongsByKey(key: string, limit = 300): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?key=eq.${encodeURIComponent(key)}&order=created_at.desc&limit=${limit}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  } catch {
    return [];
  }
}

/** Cached songs whose Camelot code matches, case-insensitively — backs the
 *  /songs/camelot/<code> hub pages. */
export async function readSongsByCamelotCode(code: string, limit = 300): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?camelot=ilike.${encodeURIComponent(code)}&order=created_at.desc&limit=${limit}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  } catch {
    return [];
  }
}

/** Cached songs within a BPM window — backs the /songs/bpm/<n> hub pages. */
export async function readSongsByBpmRange(min: number, max: number, limit = 300): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?bpm=gte.${min}&bpm=lte.${max}&order=created_at.desc&limit=${limit}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  } catch {
    return [];
  }
}

/** All cached songs (slug + title + artist) for the sitemap and /songs index.
 *  Supabase silently caps any single query at 1000 rows (db-max-rows), so this
 *  pages through in 1000-row chunks until a short page or `limit` is reached —
 *  otherwise every song past the first thousand vanishes from the sitemap.
 *
 *  Pages are fetched in parallel batches: at 100k+ songs a sequential walk is
 *  ~100 round-trips (tens of seconds on a cold render, enough to time out an
 *  ISR function), while batches of 10 keep cold renders to a couple of
 *  seconds. Each 1000-row page stays its own request on purpose — Vercel's
 *  data cache stores small GET responses per-URL, so warm renders skip the
 *  network entirely, which one giant response would be too large to do. */
export async function readAllSongs(limit = 10000): Promise<CachedAnalysis[]> {
  if (!isLinkAnalysisConfigured) return [];
  const PAGE = 1000;
  const BATCH = 10;
  const all: CachedAnalysis[] = [];
  const fetchPage = async (offset: number): Promise<CachedAnalysis[]> => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/link_analysis?select=*&order=created_at.desc&limit=${Math.min(PAGE, limit - offset)}&offset=${offset}`,
      { headers: restHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as CachedAnalysis[];
  };
  try {
    for (let batchStart = 0; batchStart < limit; batchStart += PAGE * BATCH) {
      const offsets: number[] = [];
      for (let o = batchStart; o < Math.min(batchStart + PAGE * BATCH, limit); o += PAGE) offsets.push(o);
      const pages = await Promise.all(offsets.map(fetchPage));
      let done = false;
      for (const page of pages) {
        all.push(...page);
        // A short page marks the end of the table; later offsets in this
        // batch came back empty and pushed nothing.
        if (page.length < PAGE) done = true;
      }
      if (done) break;
    }
    return all;
  } catch {
    return all;
  }
}

/** Total number of analyzed songs, without fetching rows (PostgREST exact count). */
export async function countSongs(): Promise<number | null> {
  if (!isLinkAnalysisConfigured) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/link_analysis?select=id&limit=1`, {
      headers: { ...restHeaders(), Prefer: "count=exact", Range: "0-0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const range = res.headers.get("content-range");
    const total = range?.split("/")[1];
    const n = total ? Number(total) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Exact count of songs credited to one artist name (case-sensitive exact
 *  match on the `artist` column) — a targeted PostgREST count, not a full
 *  table scan. Backs the /song/[slug] "link to artist page only if it has
 *  >=2 songs" check: cheap because it doesn't need to know the artist's
 *  slug, just the exact name already on hand from the song row.
 *  NOTE: this undercounts artists stored under multiple spellings/casings
 *  (those all merge into one /artist page via groupSongsByArtist, but this
 *  exact-match count won't see the merge) — the only failure mode is a
 *  same-artist song that doesn't get an artist link even though the artist's
 *  page exists, never a link to a 404. */
export async function countSongsByArtistName(name: string): Promise<number> {
  if (!isLinkAnalysisConfigured || !name.trim()) return 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/link_analysis?select=id&artist=eq.${encodeURIComponent(name)}&limit=1`, {
      headers: { ...restHeaders(), Prefer: "count=exact", Range: "0-0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 0;
    const range = res.headers.get("content-range");
    const total = range?.split("/")[1];
    const n = total ? Number(total) : NaN;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** First write wins: duplicate ids are ignored (no update policy server-side either).
 *  `slug` is filled by a DB trigger from title+artist, so callers never send it. */
export async function writeCachedAnalysis(row: Omit<CachedAnalysis, "created_at" | "slug">): Promise<boolean> {
  if (!isLinkAnalysisConfigured) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/link_analysis`, {
      method: "POST",
      headers: { ...restHeaders(), Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve a link to a human title via the platform's free, keyless oEmbed endpoint. */
export async function resolveTitle(url: string): Promise<{ title: string; author: string | null } | null> {
  let endpoint: string | null = null;
  const yt = canonicalYouTubeUrl(url);
  const sp = validateSpotifyUrl(url);
  if (yt) endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(yt.url)}&format=json`;
  else if (sp && sp.kind === "track") endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  else {
    const media = validateMediaUrl(url);
    if (media?.platform === "soundcloud") {
      endpoint = `https://soundcloud.com/oembed?url=${encodeURIComponent(media.url)}&format=json`;
    }
  }
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title) return null;
    return { title: data.title.slice(0, 200), author: data.author_name?.slice(0, 200) ?? null };
  } catch {
    return null;
  }
}

/** Strip video-title noise so catalog search matches ("(Official Video)" etc.). */
export function cleanSongTitle(raw: string): string {
  return raw
    .replace(/[\[(](official|lyric|lyrics|audio|video|visualizer|hd|4k|remaster(ed)?( \d{4})?|explicit|clean)[^\])]*[\])]/gi, " ")
    .replace(/\b(official (music )?video|official audio|lyric video|lyrics|visualizer)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/** Splits a combined "Title - Artist" string only as a last resort, when a
 *  source (Spotify embed, YouTube flat-playlist entry) gives one string
 *  instead of separate title/artist fields. Sensible-effort, not exhaustive. */
export function splitCombinedTitle(combined: string): { title: string; artist: string } {
  const dashSplit = combined.split(/\s[-–]\s/);
  if (dashSplit.length >= 2) {
    return { title: dashSplit[0].trim(), artist: dashSplit.slice(1).join(" - ").trim() };
  }
  return { title: combined.trim(), artist: "" };
}

export type PreviewMatch = { title: string; artist: string; previewUrl: string };

/** Search Deezer's keyless public API for a 30s preview; fall back to iTunes. */
export async function findPreview(query: string): Promise<PreviewMatch | null> {
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { title?: string; preview?: string; artist?: { name?: string } }[] };
      const hit = data.data?.find((d) => d.preview);
      if (hit?.preview && hit.title) {
        return { title: hit.title.slice(0, 200), artist: hit.artist?.name?.slice(0, 200) ?? "", previewUrl: hit.preview };
      }
    }
  } catch {
    // fall through to iTunes
  }
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=3`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (res.ok) {
      const data = (await res.json()) as { results?: { trackName?: string; previewUrl?: string; artistName?: string }[] };
      const hit = data.results?.find((r) => r.previewUrl);
      if (hit?.previewUrl && hit.trackName) {
        return { title: hit.trackName.slice(0, 200), artist: hit.artistName?.slice(0, 200) ?? "", previewUrl: hit.previewUrl };
      }
    }
  } catch {
    // no preview found anywhere
  }
  return null;
}

export type DeezerPreviewMatch = { id: string; title: string; artist: string; previewUrl: string };

/** Search Deezer only (no iTunes fallback) and keep the track's numeric id —
 *  the playlist analyzer needs a stable `dz:<id>` cache key per track, and
 *  iTunes' catalog doesn't expose one worth keying on. */
export async function findDeezerPreview(query: string): Promise<DeezerPreviewMatch | null> {
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { id?: number; title?: string; preview?: string; artist?: { name?: string } }[];
    };
    const hit = data.data?.find((d) => d.preview && typeof d.id === "number");
    if (hit?.preview && hit.title && typeof hit.id === "number") {
      return {
        id: String(hit.id),
        title: hit.title.slice(0, 200),
        artist: hit.artist?.name?.slice(0, 200) ?? "",
        previewUrl: hit.preview,
      };
    }
  } catch {
    // no preview found
  }
  return null;
}

// Preview audio may only be proxied from these catalog CDNs (never an open proxy).
const PREVIEW_HOST_PATTERN = /^(?:[a-z0-9-]+\.)*(?:dzcdn\.net|mzstatic\.com|itunes\.apple\.com)$/i;

export function isAllowedPreviewUrl(input: string): URL | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:") return null;
    if (!PREVIEW_HOST_PATTERN.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}
