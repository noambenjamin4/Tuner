// Artist-hub helpers. Backs /artist/[slug] and the "Browse by artist" section
// on /songs.
//
// PostgREST can't query by a computed slug (the slug only exists client-side,
// derived from the free-text `artist` column), so there is no cheap targeted
// fetch for "give me the songs for slug X" the way readSongsByKey/BPM work.
// The only correct approach at this scale is: page through the full catalog
// with readAllSongs (already paginated past Supabase's 1000-row cap, already
// used this way by the /songs and /songs/key hubs) and group client-side.
// That's O(n) over the whole cache per call, acceptable because:
//   - generateStaticParams calls it once per build/revalidate window, not per request
//   - the /artist/[slug] page itself calls it once per ISR window (revalidate 3600),
//     not per visitor
//   - grouping uses a Map (not per-song array churn) so it stays linear in memory
// If the catalog grows enough that this becomes a real cost, the fix is a
// generated `artist_slug` column in Supabase with an index, not a smarter
// client-side algorithm.
import { cache } from "react";
import { readArtistNames, readSongsByArtistNames, type CachedAnalysis } from "./link-analysis";

// Generic over the row shape: the grouper only reads `artist`, so both a full
// CachedAnalysis and a slim projection (e.g. the sitemap's facet columns) work.
export type ArtistGroup<T = CachedAnalysis> = {
  slug: string;
  /** Canonical display name for this slug — the most recently added exact
   *  spelling wins (readAllSongs orders newest first). Arbitrary but
   *  deterministic; different capitalizations/spacing of the same artist
   *  collapse into one group instead of one page each. */
  name: string;
  songs: T[];
};

/**
 * Deterministic slugification: lowercase, diacritics stripped, non-alnum runs
 * collapsed to a single hyphen, trimmed. Two different artist strings that
 * normalize to the same slug are meant to collide — groupSongsByArtist merges
 * them into one page rather than erroring, which is the collision-tolerance
 * this needs (PostgREST has no way to recover the exact original string from
 * a slug, so "one slug, ambiguous source string" has to be an accepted
 * outcome, not a bug).
 */
export function artistSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "artist";
}

/** Groups a song list by artistSlug(artist). Songs with no artist are dropped
 *  — there is no page for "unknown artist". */
export function groupSongsByArtist<T extends { artist: string | null }>(
  songs: T[],
): Map<string, ArtistGroup<T>> {
  const groups = new Map<string, ArtistGroup<T>>();
  for (const s of songs) {
    const raw = s.artist?.trim();
    if (!raw) continue;
    const slug = artistSlug(raw);
    const existing = groups.get(slug);
    if (existing) {
      existing.songs.push(s);
    } else {
      groups.set(slug, { slug, name: raw, songs: [s] });
    }
  }
  return groups;
}

/** The artist group for one slug, or null if the slug matches nothing.
 *
 *  Two steps, because a slug is derived client-side and PostgREST can't filter
 *  on it:
 *    1. scan the catalog for ARTIST STRINGS ONLY (~30KB/1000 rows) and find
 *       every raw spelling that slugifies to this slug;
 *    2. fetch that artist's songs with one targeted `artist=in.(...)` query.
 *
 *  The previous version read the newest `cap = 50000` FULL rows and grouped
 *  them. That cap was written when the catalog was small; at 118k+ songs it
 *  silently stopped resolving any artist whose songs were older than the newest
 *  50k — ~40% of artist pages 404'd, including ones linked from song-page H1s.
 *  Passing the full catalog through readAllSongs instead would have been
 *  correct but pulled ~37MB per artist page per ISR window.
 *
 *  Wrapped in React cache() so a page that calls this from both
 *  generateMetadata and the component only pays for it once per render.
 */
export const readSongsByArtist = cache(async (slug: string): Promise<ArtistGroup | null> => {
  const names = await readArtistNames();
  const match = groupSongsByArtist(names).get(slug);
  if (!match) return null;
  // Every distinct raw spelling that collapses into this slug.
  const spellings = [...new Set(match.songs.map((s) => s.artist).filter((a): a is string => Boolean(a)))];
  const songs = await readSongsByArtistNames(spellings);
  if (songs.length === 0) return null;
  return { slug, name: match.name, songs };
});

/** Top artists by song count, for generateStaticParams and the /songs
 *  "Browse by artist" section. `minSongs` mirrors the page's own render rule
 *  (an artist page only renders with >=2 songs — see app/artist/[slug]/page.tsx)
 *  so this never surfaces a link that would 404. */
export function topArtistsByCount<T extends { artist: string | null }>(
  songs: T[],
  limit: number,
  minSongs = 2,
): ArtistGroup<T>[] {
  const groups = [...groupSongsByArtist(songs).values()].filter((g) => g.songs.length >= minSongs);
  groups.sort((a, b) => b.songs.length - a.songs.length || a.name.localeCompare(b.name));
  return groups.slice(0, limit);
}

/** Honest, computed-from-data summary stats for an artist's song list. */
export function artistStats(songs: CachedAnalysis[]): { bpmMin: number; bpmMax: number; topKey: string | null } {
  let bpmMin = Infinity;
  let bpmMax = -Infinity;
  const keyCounts = new Map<string, number>();
  for (const s of songs) {
    if (Number.isFinite(s.bpm)) {
      bpmMin = Math.min(bpmMin, s.bpm);
      bpmMax = Math.max(bpmMax, s.bpm);
    }
    if (s.key) keyCounts.set(s.key, (keyCounts.get(s.key) ?? 0) + 1);
  }
  let topKey: string | null = null;
  let topCount = 0;
  for (const [key, count] of keyCounts) {
    if (count > topCount) {
      topKey = key;
      topCount = count;
    }
  }
  return {
    bpmMin: Number.isFinite(bpmMin) ? Math.round(bpmMin) : 0,
    bpmMax: Number.isFinite(bpmMax) ? Math.round(bpmMax) : 0,
    topKey,
  };
}
