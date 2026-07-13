import { readAllSongs } from "@/lib/server/link-analysis";
import { groupSongsByArtist } from "@/lib/server/artists";
import { ALL_KEYS, keyToSlug } from "@/lib/audio/harmonic";
import { SITE_URL, SONGS_CAP, SONGS_PER_SHARD, urlsetXml, xmlResponse } from "@/lib/server/sitemap";

// Individual sitemap shards, listed by app/sitemap.xml/route.ts's index:
//   - "static": tools/guides/landing/static pages (ported 1:1 from the old
//     single-file app/sitemap.ts, minus the hub and song routes below, which
//     now live in their own shards so this one never grows).
//   - "songs-0", "songs-1", ...: 20,000 song URLs each (SONGS_PER_SHARD),
//     sliced from the same readAllSongs(SONGS_CAP) call the index uses to
//     compute the shard count, so the two stay in sync.
//   - "hubs": key hubs, BPM hubs, and artist pages — same emptiness rules as
//     the pages themselves (key hubs need >0 songs, BPM hubs need >=3 in the
//     ±2 window, artist pages need >=2 songs) so this never links to a 404.
export const revalidate = 3600;

type ToolEntry = { path: string; changefreq: string; priority: number };

// Exact list from the old app/sitemap.ts's tool()/guide() calls and inline
// entries, minus `...hubRoutes` and `...songRoutes` (now their own shards).
const STATIC_ENTRIES: ToolEntry[] = [
  { path: "/", changefreq: "weekly", priority: 1 },
  { path: "/playlist-analyzer", changefreq: "weekly", priority: 0.8 },
  { path: "/key-bpm-finder", changefreq: "weekly", priority: 0.9 },
  { path: "/converter", changefreq: "weekly", priority: 0.9 },
  { path: "/loudness", changefreq: "weekly", priority: 0.9 },
  { path: "/slowed-reverb", changefreq: "weekly", priority: 0.9 },
  { path: "/mp3-cutter", changefreq: "weekly", priority: 0.9 },
  { path: "/pitch-shifter", changefreq: "weekly", priority: 0.9 },
  { path: "/delay-reverb-calculator", changefreq: "weekly", priority: 0.9 },
  { path: "/bpm-tap", changefreq: "weekly", priority: 0.9 },
  { path: "/camelot-wheel", changefreq: "weekly", priority: 0.9 },
  { path: "/guides/find-key-and-bpm-of-any-song", changefreq: "monthly", priority: 0.6 },
  { path: "/guides/camelot-wheel-harmonic-mixing", changefreq: "monthly", priority: 0.6 },
  { path: "/guides/what-is-lufs-streaming-loudness", changefreq: "monthly", priority: 0.6 },
  { path: "/guides/how-to-make-slowed-and-reverb", changefreq: "monthly", priority: 0.6 },
  { path: "/guides/how-to-make-a-ringtone", changefreq: "monthly", priority: 0.6 },
  { path: "/tunebad-vs-tunebat", changefreq: "monthly", priority: 0.6 },
  { path: "/tools", changefreq: "weekly", priority: 0.8 },
  { path: "/image-converter", changefreq: "weekly", priority: 0.9 },
  { path: "/compress-image", changefreq: "weekly", priority: 0.9 },
  { path: "/resize-image", changefreq: "weekly", priority: 0.9 },
  { path: "/resize-image-for-instagram", changefreq: "weekly", priority: 0.9 },
  { path: "/compress-image-to-100kb", changefreq: "weekly", priority: 0.9 },
  { path: "/compress-video", changefreq: "weekly", priority: 0.9 },
  { path: "/compress-video-for-discord", changefreq: "weekly", priority: 0.9 },
  { path: "/compress-video-for-whatsapp", changefreq: "weekly", priority: 0.9 },
  { path: "/video-converter", changefreq: "weekly", priority: 0.9 },
  { path: "/audio-converter", changefreq: "weekly", priority: 0.9 },
  { path: "/mkv-to-mp4", changefreq: "weekly", priority: 0.9 },
  { path: "/mov-to-mp4", changefreq: "weekly", priority: 0.9 },
  { path: "/flac-to-mp3", changefreq: "weekly", priority: 0.9 },
  { path: "/wav-to-mp3", changefreq: "weekly", priority: 0.9 },
  { path: "/merge-pdf", changefreq: "weekly", priority: 0.9 },
  { path: "/split-pdf", changefreq: "weekly", priority: 0.9 },
  { path: "/jpg-to-pdf", changefreq: "weekly", priority: 0.9 },
  { path: "/unzip-files", changefreq: "weekly", priority: 0.9 },
  { path: "/songs", changefreq: "daily", priority: 0.7 },
  { path: "/copyright", changefreq: "yearly", priority: 0.3 },
];

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  const now = new Date().toISOString();

  if (shard === "static") {
    const xml = urlsetXml(
      STATIC_ENTRIES.map((e) => ({
        loc: `${SITE_URL}${e.path}`,
        lastmod: now,
        changefreq: e.changefreq,
        priority: e.priority,
      })),
    );
    return xmlResponse(xml);
  }

  const songShardMatch = /^songs-(\d+)$/.exec(shard);
  if (songShardMatch) {
    const shardIndex = Number(songShardMatch[1]);
    const songs = await readAllSongs(SONGS_CAP);
    const start = shardIndex * SONGS_PER_SHARD;
    const slice = songs.slice(start, start + SONGS_PER_SHARD);
    // Shard 0 always resolves (even to an empty urlset pre-launch); any
    // higher shard index that's out of range is a stale/guessed URL, 404 it.
    // (notFound() from next/navigation only works inside the React render
    // tree — this is a plain Route Handler, so a real 404 Response is used.)
    if (slice.length === 0 && shardIndex > 0) {
      return new Response("Not found", { status: 404 });
    }
    const xml = urlsetXml(
      slice.map((s) => ({
        loc: `${SITE_URL}/song/${s.slug}`,
        lastmod: now,
        changefreq: "monthly",
        priority: 0.5,
      })),
    );
    return xmlResponse(xml);
  }

  if (shard === "hubs") {
    const songs = await readAllSongs(SONGS_CAP);

    const keyCounts = new Map<string, number>();
    const bpmCounts = new Map<number, number>();
    for (const s of songs) {
      keyCounts.set(s.key, (keyCounts.get(s.key) ?? 0) + 1);
      const b = Math.round(s.bpm);
      for (let n = b - 2; n <= b + 2; n += 1) bpmCounts.set(n, (bpmCounts.get(n) ?? 0) + 1);
    }

    const keyUrls = ALL_KEYS.filter((k) => (keyCounts.get(k) ?? 0) > 0).map((k) => ({
      loc: `${SITE_URL}/songs/key/${keyToSlug(k)}`,
      lastmod: now,
      changefreq: "weekly",
      priority: 0.6,
    }));

    const bpmUrls = [...bpmCounts.entries()]
      .filter(([bpm, count]) => bpm >= 40 && bpm <= 220 && count >= 3)
      .map(([bpm]) => ({
        loc: `${SITE_URL}/songs/bpm/${bpm}`,
        lastmod: now,
        changefreq: "weekly",
        priority: 0.55,
      }));

    // Same >=2-songs rule as app/artist/[slug]/page.tsx, so every URL here
    // resolves to a real page (no dynamicParams surprises for the crawler).
    const artistUrls = [...groupSongsByArtist(songs).values()]
      .filter((a) => a.songs.length >= 2)
      .map((a) => ({
        loc: `${SITE_URL}/artist/${a.slug}`,
        lastmod: now,
        changefreq: "weekly",
        priority: 0.5,
      }));

    const xml = urlsetXml([...keyUrls, ...bpmUrls, ...artistUrls]);
    return xmlResponse(xml);
  }

  return new Response("Not found", { status: 404 });
}
