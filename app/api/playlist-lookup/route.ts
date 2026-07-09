import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSpotifyUrl, validatePlaylistUrl } from "@/lib/media-url";
import { isDownloaderEnabled } from "@/lib/runtime";
import { allowEnumerate } from "@/lib/server/rate-limit";
import {
  cleanSongTitle,
  findDeezerPreview,
  readCachedAnalysis,
  splitCombinedTitle,
  type CachedAnalysis,
} from "@/lib/server/link-analysis";
import { fetchSpotifyTracklist } from "@/lib/server/spotify-playlist";
import { fetchYouTubeTracklist } from "@/lib/server/youtube-playlist";

// Resolves a pasted Spotify/YouTube playlist to a per-track table: title,
// artist, a stable Deezer-backed source id, and (when the community DB
// already has it) the cached key/BPM/Camelot row. Never touches the download
// bridge — every step here is either a public embed/enumerate fetch or the
// same free Deezer catalog search the single-link analyzer already uses.
export const maxDuration = 60;

const MAX_TRACKS = 100;
// Deezer's public search tolerates roughly 50 requests / 5s. A small worker
// pool with a short per-worker pause keeps sustained throughput safely under
// that ceiling while still resolving a 100-track playlist in well under a
// minute.
const SEARCH_CONCURRENCY = 4;
const SEARCH_PAUSE_MS = 130;

const querySchema = z.object({ url: z.string().min(8).max(2048) });

export interface PlaylistLookupTrack {
  title: string;
  artist: string | null;
  sourceId: string | null;
  previewUrl: string | null;
  cached: CachedAnalysis | null;
}

type SourceTrack = { title: string; artist: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `task` over `items` with a bounded number of concurrent workers, each
 *  pausing briefly between tasks — keeps outbound Deezer search traffic
 *  spaced out instead of firing all at once. */
async function runPool<T, R>(items: T[], concurrency: number, pauseMs: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
      if (cursor < items.length) await sleep(pauseMs);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveTrack(track: SourceTrack): Promise<PlaylistLookupTrack> {
  const query = cleanSongTitle(track.artist ? `${track.artist} ${track.title}` : track.title);
  const match = await findDeezerPreview(query);
  if (!match) {
    return { title: track.title, artist: track.artist || null, sourceId: null, previewUrl: null, cached: null };
  }
  const sourceId = `dz:${match.id}`;
  const cached = await readCachedAnalysis(sourceId);
  return {
    title: match.title || track.title,
    artist: match.artist || track.artist || null,
    sourceId,
    previewUrl: match.previewUrl,
    cached,
  };
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowEnumerate(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const parsed = querySchema.safeParse({ url: request.nextUrl.searchParams.get("url") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const inputUrl = parsed.data.url;

  const spotify = validateSpotifyUrl(inputUrl);
  const isSpotifyPlaylist = spotify && (spotify.kind === "playlist" || spotify.kind === "album");
  const youtubePlaylistUrl = validatePlaylistUrl(inputUrl);

  if (!isSpotifyPlaylist && !youtubePlaylistUrl) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Both playlist sources currently reuse the converter's enumeration
  // machinery (public Spotify embed fetch, or the yt-dlp/downloader-backend
  // path for YouTube); gated behind the same operator kill-switch as those
  // routes so this feature never runs ahead of that flag.
  if (!isDownloaderEnabled) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  let sourceTracks: SourceTrack[];
  if (isSpotifyPlaylist) {
    const result = await fetchSpotifyTracklist(spotify!, MAX_TRACKS);
    if (!result.ok) {
      return NextResponse.json({ error: "notFound" }, { status: 502 });
    }
    sourceTracks = result.items;
  } else {
    const result = await fetchYouTubeTracklist(youtubePlaylistUrl!);
    if (!result.ok) {
      return NextResponse.json({ error: "notFound" }, { status: result.status === 404 ? 404 : 502 });
    }
    sourceTracks = result.items.slice(0, MAX_TRACKS).map((item) => splitCombinedTitle(item.title || item.id));
  }

  if (sourceTracks.length === 0) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const tracks = await runPool(sourceTracks, SEARCH_CONCURRENCY, SEARCH_PAUSE_MS, resolveTrack);

  return NextResponse.json({ tracks });
}
