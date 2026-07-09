import type { MetadataRoute } from "next";
import { readAllSongs } from "@/lib/server/link-analysis";
import { ALL_KEYS, keyToSlug } from "@/lib/audio/harmonic";

// Revalidate hourly so newly analyzed songs get listed for crawlers.
export const revalidate = 3600;

// Real crawlable routes. Each tool now has its own indexable URL (they render the
// same app, opened on that tool) so Google can rank each one for its own search.
// Song pages are appended dynamically from the shared analysis cache.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const songs = await readAllSongs(5000);
  const songRoutes: MetadataRoute.Sitemap = songs.map((s) => ({
    url: `${base}/song/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Key/BPM hub pages, mirroring the pages' own emptiness rules (key hubs 404
  // with zero songs; BPM hubs 404 below 3 songs in the ±2 window).
  const keyCounts = new Map<string, number>();
  const bpmCounts = new Map<number, number>();
  for (const s of songs) {
    keyCounts.set(s.key, (keyCounts.get(s.key) ?? 0) + 1);
    const b = Math.round(s.bpm);
    for (let n = b - 2; n <= b + 2; n += 1) bpmCounts.set(n, (bpmCounts.get(n) ?? 0) + 1);
  }
  const hubRoutes: MetadataRoute.Sitemap = [
    ...ALL_KEYS.filter((k) => (keyCounts.get(k) ?? 0) > 0).map((k) => ({
      url: `${base}/songs/key/${keyToSlug(k)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...[...bpmCounts.entries()]
      .filter(([bpm, count]) => bpm >= 40 && bpm <= 220 && count >= 3)
      .map(([bpm]) => ({
        url: `${base}/songs/bpm/${bpm}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.55,
      })),
  ];

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/playlist-analyzer`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
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
    guide("/tunebad-vs-tunebat"),
    { url: `${base}/songs`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...hubRoutes,
    ...songRoutes,
    { url: `${base}/copyright`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
