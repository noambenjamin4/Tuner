// Shared Spotify tracklist fetcher — extracted so both the converter's
// enumerate-then-download flow (app/api/spotify/route.ts) and the playlist
// analyzer (app/api/playlist-lookup/route.ts) hit the exact same parsing
// logic instead of drifting apart. Uses Spotify's PUBLIC EMBED page — no
// Spotify account, OAuth, or API credentials, and (unlike the yt-dlp job
// pipeline) this is a plain HTTP fetch that runs entirely on Vercel.
import { splitCombinedTitle } from "./link-analysis";

const EMBED_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export interface SpotifyTrackItem {
  title: string;
  artist: string;
}

export type SpotifyTracklistResult =
  | { ok: true; items: SpotifyTrackItem[] }
  | { ok: false; reason: "fetch" | "parse" | "notrack" | "empty" };

// Recursively walks the __NEXT_DATA__ tree looking for a `trackList` array —
// Spotify's embed payload nests it at a path that shifts between playlist,
// album, and track embeds, so structural search is more robust than a fixed
// key path.
function findTrackList(node: unknown, depth = 0): unknown[] | null {
  if (depth > 12 || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findTrackList(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  if (Array.isArray(record.trackList)) return record.trackList as unknown[];

  for (const value of Object.values(record)) {
    const found = findTrackList(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractItems(trackList: unknown[], maxItems: number): SpotifyTrackItem[] {
  const items: SpotifyTrackItem[] = [];
  for (const entry of trackList) {
    if (!entry || typeof entry !== "object") continue;
    const rawTitle = (entry as { title?: unknown }).title;
    const rawSubtitle = (entry as { subtitle?: unknown }).subtitle;

    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (!title) continue;

    let artist = typeof rawSubtitle === "string" ? rawSubtitle.trim() : "";
    let finalTitle = title;
    if (!artist) {
      const split = splitCombinedTitle(title);
      finalTitle = split.title;
      artist = split.artist;
    }

    items.push({ title: finalTitle, artist });
    if (items.length >= maxItems) break;
  }
  return items;
}

/** Fetches and parses a Spotify playlist/album/track's tracklist via the
 *  public embed page. Caller is responsible for any feature-flag gating and
 *  for validating/parsing the URL into { kind, id } first. */
export async function fetchSpotifyTracklist(
  spotify: { kind: "playlist" | "album" | "track"; id: string },
  maxItems = 50,
): Promise<SpotifyTracklistResult> {
  const embedUrl = `https://open.spotify.com/embed/${spotify.kind}/${spotify.id}`;

  let html: string;
  try {
    const upstream = await fetch(embedUrl, {
      headers: { "User-Agent": EMBED_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return { ok: false, reason: "fetch" };
    html = await upstream.text();
  } catch {
    return { ok: false, reason: "fetch" };
  }

  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) return { ok: false, reason: "parse" };

  let nextData: unknown;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    return { ok: false, reason: "parse" };
  }

  const trackList = findTrackList(nextData);
  if (!trackList) return { ok: false, reason: "notrack" };

  const items = extractItems(trackList, maxItems);
  if (items.length === 0) return { ok: false, reason: "empty" };

  return { ok: true, items };
}
