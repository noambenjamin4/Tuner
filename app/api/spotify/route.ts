import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSpotifyUrl } from "@/lib/media-url";

// Enumerates a Spotify playlist/album/track via Spotify's PUBLIC EMBED page —
// no Spotify account, OAuth, or API credentials involved. This is a plain
// HTTP fetch to a public URL, so (unlike the yt-dlp job pipeline) it runs
// entirely on Vercel; no home/remote backend proxying is needed here.
export const maxDuration = 30;

const spotifyRequestSchema = z.object({
  url: z.string().max(2048),
});

const EMBED_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const MAX_ITEMS = 50;

export interface SpotifyTrackItem {
  title: string;
  artist: string;
}

// Recursively walks the __NEXT_DATA__ tree looking for a `trackList` array —
// Spotify's embed payload nests it at a path that shifts between playlist,
// album, and track embeds, so structural search is more robust than a fixed
// key path.
function findTrackList(node: unknown, depth = 0): unknown[] | null {
  if (depth > 12 || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findTrackList(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  if (Array.isArray(record.trackList)) return record.trackList as unknown[];

  for (const value of Object.values(record)) {
    const found = findTrackList(value, depth + 1);
    if (found) return found;
  }
  return null;
}

// Splits a combined "Title - Artist" / "Title (feat. X)" style string only as
// a last resort, when the embed gives us a single string instead of a
// separate subtitle. Sensible-effort, not exhaustive.
function splitCombinedTitle(combined: string): SpotifyTrackItem {
  const dashSplit = combined.split(/\s[-–]\s/);
  if (dashSplit.length >= 2) {
    return { title: dashSplit[0].trim(), artist: dashSplit.slice(1).join(" - ").trim() };
  }
  return { title: combined.trim(), artist: "" };
}

function extractItems(trackList: unknown[]): SpotifyTrackItem[] {
  const items: SpotifyTrackItem[] = [];
  for (const entry of trackList) {
    if (!entry || typeof entry !== "object") continue;
    const rawTitle = (entry as { title?: unknown }).title;
    const rawSubtitle = (entry as { subtitle?: unknown }).subtitle;

    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (!title) continue;

    let artist = typeof rawSubtitle === "string" ? rawSubtitle.trim() : "";
    let finalTitle = title;
    if (!artist) {
      const split = splitCombinedTitle(title);
      finalTitle = split.title;
      artist = split.artist;
    }

    items.push({ title: finalTitle, artist });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = spotifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a Spotify playlist, album, or track URL." }, { status: 400 });
  }

  const spotify = validateSpotifyUrl(parsed.data.url);
  if (!spotify) {
    return NextResponse.json({ error: "Paste a Spotify playlist, album, or track link." }, { status: 400 });
  }

  const embedUrl = `https://open.spotify.com/embed/${spotify.kind}/${spotify.id}`;

  let html: string;
  try {
    const upstream = await fetch(embedUrl, {
      headers: { "User-Agent": EMBED_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Could not read that Spotify link." }, { status: 502 });
    }
    html = await upstream.text();
  } catch (error) {
    console.error("Failed to fetch Spotify embed", error);
    return NextResponse.json({ error: "Could not reach Spotify." }, { status: 502 });
  }

  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) {
    return NextResponse.json({ error: "Could not read that Spotify link." }, { status: 502 });
  }

  let nextData: unknown;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    return NextResponse.json({ error: "Could not read that Spotify link." }, { status: 502 });
  }

  const trackList = findTrackList(nextData);
  if (!trackList) {
    return NextResponse.json({ error: "Could not find any tracks on that Spotify link." }, { status: 502 });
  }

  const items = extractItems(trackList);
  if (items.length === 0) {
    return NextResponse.json({ error: "Could not find any tracks on that Spotify link." }, { status: 502 });
  }

  return NextResponse.json({ items });
}
