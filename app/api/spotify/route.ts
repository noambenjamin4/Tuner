import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSpotifyUrl } from "@/lib/media-url";
import { isDownloaderEnabled } from "@/lib/runtime";
import { allowEnumerate } from "@/lib/server/rate-limit";
import { fetchSpotifyTracklist } from "@/lib/server/spotify-playlist";

// Enumerates a Spotify playlist/album/track via Spotify's PUBLIC EMBED page —
// no Spotify account, OAuth, or API credentials involved. This is a plain
// HTTP fetch to a public URL, so (unlike the yt-dlp job pipeline) it runs
// entirely on Vercel; no home/remote backend proxying is needed here.
export const maxDuration = 30;

const spotifyRequestSchema = z.object({
  url: z.string().max(2048),
});

const MAX_ITEMS = 50;

export async function POST(request: NextRequest) {
  if (!isDownloaderEnabled) return new NextResponse("Not found", { status: 404 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowEnumerate(ip)) {
    return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
  }

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

  const result = await fetchSpotifyTracklist(spotify, MAX_ITEMS);
  if (!result.ok) {
    if (result.reason === "fetch") return NextResponse.json({ error: "Could not read that Spotify link." }, { status: 502 });
    if (result.reason === "parse") return NextResponse.json({ error: "Could not read that Spotify link." }, { status: 502 });
    if (result.reason === "notrack")
      return NextResponse.json({ error: "Could not find any tracks on that Spotify link." }, { status: 502 });
    return NextResponse.json({ error: "Could not find any tracks on that Spotify link." }, { status: 502 });
  }

  return NextResponse.json({ items: result.items });
}
