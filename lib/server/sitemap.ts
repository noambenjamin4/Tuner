// Shared building blocks for the hand-rolled sitemap shards (replaces the old
// single-file app/sitemap.ts, which caps out at 50k URLs — this catalog is
// headed well past that once songs + artist pages are both counted).
//
// Route handlers can't use next-sitemap's MetadataRoute typed helpers, so
// these emit raw XML strings directly per the sitemaps.org schema.

export const SITE_URL = "https://www.tunebad.com";

// Song URLs per shard. 20,000 keeps each shard file comfortably under the
// sitemap protocol's 50k-URL / 50MB-uncompressed caps with headroom.
export const SONGS_PER_SHARD = 20000;

// readAllSongs pages through Supabase 1000 rows at a time; a 100k cap bounds
// worst-case shard-generation cost (5 song shards) while still covering the
// catalog for a long while past the "thousands more being seeded" scale
// mentioned for this task. Raise this (and re-check shard math) if the
// catalog outgrows it.
export const SONGS_CAP = 100000;

type UrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
};

type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

// Slugs are already URL-safe (alnum + hyphens), but escape XML entities
// anyway — the artist column is free text and a stray "&" would produce
// invalid XML if it ever leaked into a URL.
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function urlsetXml(urls: UrlEntry[]): string {
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority != null) parts.push(`    <priority>${u.priority}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: SitemapEntry[]): string {
  const body = sitemaps
    .map((s) => {
      const parts = [`    <loc>${escapeXml(s.loc)}</loc>`];
      if (s.lastmod) parts.push(`    <lastmod>${s.lastmod}</lastmod>`);
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Belt-and-suspenders: `export const revalidate = 3600` on the route
      // handlers gives Next's Data Cache / ISR the same interval, but pin it
      // in the response header too in case a route handler's ISR behavior
      // ever changes under a Next upgrade.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
