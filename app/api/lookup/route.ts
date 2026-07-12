import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowLookup } from "@/lib/server/rate-limit";
import {
  sourceIdForUrl,
  readCachedAnalysis,
  resolveTitle,
  cleanSongTitle,
  findPreview,
  findDeezerPreview,
} from "@/lib/server/link-analysis";

// Resolves a pasted music link — or a free-text song name (?q=) — to either a
// cached analysis (instant) or a 30s-preview match the browser can analyze
// itself. Never touches the download bridge — this endpoint is
// free-tier-only by design.
export const maxDuration = 30;

const querySchema = z.object({ url: z.string().min(8).max(2048) });
const idSchema = z.string().min(4).max(120);
// Free-text song search: 2-120 printable characters (no control chars).
const searchSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^\P{C}+$/u);

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLookup(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  // Permalink mode: ?id=<sourceId> resolves straight from the shared cache
  // (used by shareable /key-bpm-finder?song=... links).
  const idParam = request.nextUrl.searchParams.get("id");
  if (idParam) {
    const parsedId = idSchema.safeParse(idParam);
    if (!parsedId.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const row = await readCachedAnalysis(parsedId.data);
    if (!row) return NextResponse.json({ error: "notFound" }, { status: 404 });
    return NextResponse.json({ cached: row });
  }

  // Free-text mode: ?q=<song name> searches the Deezer catalog for the top
  // preview-backed match, then follows the exact same cache-first contract as
  // the link flow (the stable id is `dz:<deezerId>`, shared with the playlist
  // analyzer's per-track ids).
  const qParam = request.nextUrl.searchParams.get("q");
  if (qParam !== null) {
    const parsedQ = searchSchema.safeParse(qParam);
    if (!parsedQ.success) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const query = cleanSongTitle(parsedQ.data) || parsedQ.data;
    const match = await findDeezerPreview(query);
    if (!match) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    const sourceId = `dz:${match.id}`;
    const cached = await readCachedAnalysis(sourceId);
    if (cached) {
      return NextResponse.json({ cached });
    }
    return NextResponse.json({
      sourceId,
      title: match.title,
      artist: match.artist,
      previewUrl: match.previewUrl,
    });
  }

  const parsed = querySchema.safeParse({ url: request.nextUrl.searchParams.get("url") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const sourceId = sourceIdForUrl(parsed.data.url);
  if (!sourceId) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // 1) Shared cache — instant, zero outbound work.
  const cached = await readCachedAnalysis(sourceId);
  if (cached) {
    return NextResponse.json({ cached });
  }

  // 2) Resolve the song's title via keyless oEmbed, then find an official
  //    30s preview in the Deezer/iTunes public catalogs.
  const resolved = await resolveTitle(parsed.data.url);
  if (!resolved) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  const query = cleanSongTitle(
    resolved.author && !resolved.title.toLowerCase().includes(resolved.author.toLowerCase())
      ? `${resolved.author} ${resolved.title}`
      : resolved.title,
  );
  const match = await findPreview(query);
  if (!match) {
    return NextResponse.json({ error: "noPreview", title: resolved.title }, { status: 404 });
  }

  return NextResponse.json({
    sourceId,
    title: match.title,
    artist: match.artist,
    previewUrl: match.previewUrl,
  });
}
