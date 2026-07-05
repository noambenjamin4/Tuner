import { NextRequest, NextResponse } from "next/server";
import { allowLookup } from "@/lib/server/rate-limit";
import { readRecentAnalyses } from "@/lib/server/link-analysis";

// Last few community link-analyses for the "recently analyzed" strip.
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLookup(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const rows = await readRecentAnalyses(8);
  return NextResponse.json(
    {
      recent: rows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        bpm: r.bpm,
        key: r.key,
        camelot: r.camelot,
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
