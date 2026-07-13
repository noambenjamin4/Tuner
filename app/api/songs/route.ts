import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowLookup } from "@/lib/server/rate-limit";
import { searchSongs } from "@/lib/server/song-search";

// Full-catalog song search for the /songs page search island: the server list
// only ships the latest 2000 rows, so this hits Supabase directly for anything
// beyond that. Cheap read-only ilike query, so it shares the lookups rate
// bucket with /api/similar rather than getting its own.
export const maxDuration = 10;

// Printable, non-control-character string — allows every locale's song/artist
// titles (accents, CJK, etc.) while rejecting control-character noise.
const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[^\x00-\x1F\x7F]+$/),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLookup(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const songs = await searchSongs(parsed.data.q, 30);

  return NextResponse.json(
    { songs },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
