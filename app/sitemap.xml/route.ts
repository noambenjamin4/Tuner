import { readAllSongs } from "@/lib/server/link-analysis";
import { SITE_URL, SONGS_CAP, SONGS_PER_SHARD, sitemapIndexXml, xmlResponse } from "@/lib/server/sitemap";

// Public URL https://www.tunebad.com/sitemap.xml — must keep resolving here
// (robots.txt points at it, GSC has it registered as the property's
// sitemap). This file replaces the old app/sitemap.ts metadata route with a
// literal route handler so it can return a SITEMAP INDEX instead of a single
// oversized urlset: the catalog is headed past the 50k-URL cap a single
// sitemap file allows once songs + artist pages are both counted.
export const revalidate = 3600;

export async function GET() {
  // Same call the "songs-N" shards make (see app/sitemaps/[shard]/route.ts) —
  // reusing it here means the shard count in the index always matches what
  // the shards themselves will actually serve. Next's Data Cache dedupes this
  // fetch across the two route handlers within the revalidate window, so this
  // isn't a second full table scan on every index request.
  const songs = await readAllSongs(SONGS_CAP);
  const numSongShards = Math.max(1, Math.ceil(songs.length / SONGS_PER_SHARD));
  const now = new Date().toISOString();

  const shardNames = ["static", ...Array.from({ length: numSongShards }, (_, i) => `songs-${i}`), "hubs"];

  const xml = sitemapIndexXml(shardNames.map((name) => ({ loc: `${SITE_URL}/sitemaps/${name}`, lastmod: now })));
  return xmlResponse(xml);
}
