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
  const guide = (path: string): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  });
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    tool("/key-bpm-finder"),
    tool("/converter"),
    tool("/loudness"),
    tool("/slowed-reverb"),
    tool("/mp3-cutter"),
    tool("/pitch-shifter"),
    tool("/delay-reverb-calculator"),
    tool("/bpm-tap"),
    guide("/guides/find-key-and-bpm-of-any-song"),
    guide("/guides/camelot-wheel-harmonic-mixing"),
    guide("/guides/what-is-lufs-streaming-loudness"),
    guide("/guides/how-to-make-slowed-and-reverb"),
    { url: `${base}/copyright`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
