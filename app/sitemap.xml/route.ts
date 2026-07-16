import { countSongs, readAllSongs } from "@/lib/server/link-analysis";
import { SITE_URL, SONGS_CAP, SONGS_PER_SHARD, sitemapIndexXml, xmlResponse } from "@/lib/server/sitemap";

// Public URL https://www.tunebad.com/sitemap.xml — must keep resolving here
// (robots.txt points at it, GSC has it registered as the property's
// sitemap). This file replaces the old app/sitemap.ts metadata route with a
// literal route handler so it can return a SITEMAP INDEX instead of a single
// oversized urlset: the catalog is headed past the 50k-URL cap a single
// sitemap file allows once songs + artist pages are both counted.
// 1 day (REVALIDATE_SITEMAP in lib/cache-policy.ts — must be a literal here;
// Next.js statically analyses route segment config). Crawlers re-fetch sitemaps
// constantly, which is exactly why they must not regenerate on every fetch.
export const revalidate = 86400;

/**
 * How many "songs-N" shards to advertise.
 *
 * This needs ONE NUMBER: the row count. It used to get it with
 * `readAllSongs(SONGS_CAP)` — every column of every song, ~49 MB over ~164
 * paged requests — and then read `.length`. That was survivable at 3k songs and
 * became the single most damaging bug on the site at 163k:
 *
 *   - /sitemap.xml is the ONE url robots.txt and GSC point at. If it fails,
 *     Google discovers nothing, no matter how healthy the shards are.
 *   - A deploy gives every route a cold ISR cache, so the very next Googlebot
 *     fetch pays the full 49 MB read and can exceed the function timeout.
 *   - GSC on 2026-07-16 read exactly that: "Couldn't fetch", last read Jul 14,
 *     47,213 pages discovered — a number from back when the catalog was small
 *     enough to load in time. 874 of 163,400 pages indexed as a result.
 *
 * The old comment defended this by noting Next's Data Cache dedupes the call
 * with the shards' identical read. True, and irrelevant: dedup only helps once
 * something has already paid for a WARM cache. Google arrives on the cold path.
 *
 * countSongs() is a header-only `count=exact` request (limit=1, Range 0-0) — it
 * transfers the count and no rows. Same number, ~none of the bytes.
 *
 * Falls back to the old full read only if the count fails, because a wrong
 * shard count is worse than a slow one: under-count and songs vanish from the
 * sitemap entirely.
 */
async function countSongShards(): Promise<number> {
  const total = await countSongs();
  if (total !== null) return Math.max(1, Math.ceil(total / SONGS_PER_SHARD));
  const songs = await readAllSongs(SONGS_CAP);
  return Math.max(1, Math.ceil(songs.length / SONGS_PER_SHARD));
}

export async function GET() {
  const numSongShards = await countSongShards();
  const now = new Date().toISOString();

  const shardNames = ["static", ...Array.from({ length: numSongShards }, (_, i) => `songs-${i}`), "hubs"];

  const xml = sitemapIndexXml(shardNames.map((name) => ({ loc: `${SITE_URL}/sitemaps/${name}`, lastmod: now })));
  return xmlResponse(xml);
}
