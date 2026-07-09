import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validatePlaylistUrl } from "@/lib/media-url";
import { isDownloaderEnabled } from "@/lib/runtime";
import { allowEnumerate } from "@/lib/server/rate-limit";
import { fetchYouTubeTracklist } from "@/lib/server/youtube-playlist";

// Enumerating a playlist spawns yt-dlp (metadata only, no download/workdir);
// rate-limited on a separate, tighter per-IP bucket so it can't be spun in a loop.
export const maxDuration = 60;

const playlistRequestSchema = z.object({
  url: z.string().max(2048),
});

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

  const parsed = playlistRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a YouTube playlist URL." }, { status: 400 });
  }

  const canonicalPlaylistUrl = validatePlaylistUrl(parsed.data.url);
  if (!canonicalPlaylistUrl) {
    return NextResponse.json({ error: "Paste a YouTube playlist link." }, { status: 400 });
  }

  const result = await fetchYouTubeTracklist(canonicalPlaylistUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ items: result.items });
}
