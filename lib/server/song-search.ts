// Full-catalog song search backing GET /api/songs?q=. A new file rather than
// an addition to lib/server/link-analysis.ts (that file's core functions stay
// untouched per house rule) — mirrors its fetch/header/env-var pattern.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const FETCH_TIMEOUT_MS = 6000;

export type SongSearchRow = {
  slug: string;
  title: string;
  artist: string | null;
  key_name: string;
  camelot: string | null;
  bpm: number;
};

/**
 * Quote + backslash-escape a value for a PostgREST filter, so a search term
 * containing a comma, parenthesis, or quote can't break out of the
 * `or=(...)` group. Same double-quote convention link-analysis.ts already
 * uses for its `in.()` filter (readSongsByCamelot).
 */
function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

type Row = { slug: string; title: string; artist: string | null; key: string; camelot: string | null; bpm: number };

/** title/artist ilike search over the whole catalog, newest matches first. */
export async function searchSongs(query: string, limit = 30): Promise<SongSearchRow[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const pattern = encodeURIComponent(quotePostgrestValue(`*${query}*`));
  const or = `or=(title.ilike.${pattern},artist.ilike.${pattern})`;
  const url =
    `${SUPABASE_URL}/rest/v1/link_analysis?select=slug,title,artist,key,camelot,bpm&${or}` +
    `&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Row[];
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      artist: r.artist,
      key_name: r.key,
      camelot: r.camelot,
      bpm: r.bpm,
    }));
  } catch {
    return [];
  }
}
