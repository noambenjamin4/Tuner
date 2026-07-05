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

/** First write wins: duplicate ids are ignored (no update policy server-side either). */
export async function writeCachedAnalysis(row: Omit<CachedAnalysis, "created_at">): Promise<boolean> {
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
