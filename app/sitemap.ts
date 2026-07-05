import type { MetadataRoute } from "next";

// Real crawlable routes. Each tool now has its own indexable URL (they render the
// same app, opened on that tool) so Google can rank each one for its own search.
export default function sitemap(): MetadataRoute.Sitemap {
  // Must match SITE_URL in app/layout.tsx (www is the Vercel primary domain).
  const base = "https://www.tunebad.com";
  const now = new Date();
  const tool = (path: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
  });
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    tool("/key-bpm-finder"),
    tool("/converter"),
    tool("/loudness"),
    tool("/slowed-reverb"),
    tool("/pitch-shifter"),
    tool("/delay-reverb-calculator"),
    tool("/bpm-tap"),
    { url: `${base}/copyright`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
