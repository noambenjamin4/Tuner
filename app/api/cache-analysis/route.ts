import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowLookup } from "@/lib/server/rate-limit";
import { writeCachedAnalysis } from "@/lib/server/link-analysis";

// Write-through for the shared link-analysis cache. The DB enforces the same
// bounds via CHECK constraints and rows are immutable (first write wins), so
// this endpoint's validation is defense in depth, not the only gate.
export const maxDuration = 15;

const KEY_PATTERN = /^[A-G][#b]? (Major|Minor)$/;

// nullish (not just nullable): runtime values can be undefined, and
// JSON.stringify drops undefined keys entirely.
const resultSchema = z.object({
  id: z.string().min(4).max(120),
  title: z.string().min(1).max(200),
  artist: z.string().max(200).nullish(),
  bpm: z.number().min(40).max(260),
  bpm_alt: z.number().min(20).max(520).nullish(),
  key: z.string().max(24).regex(KEY_PATTERN),
  camelot: z.string().max(4).nullish(),
  energy: z.number().min(0).max(1).nullish(),
  danceability: z.number().min(0).max(1).nullish(),
  loudness_db: z.number().min(-100).max(10).nullish(),
  duration_s: z.number().positive().max(36000).nullish(),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLookup(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const d = parsed.data;
  await writeCachedAnalysis({
    id: d.id,
    title: d.title,
    artist: d.artist ?? null,
    bpm: d.bpm,
    bpm_alt: d.bpm_alt ?? null,
    key: d.key,
    camelot: d.camelot ?? null,
    energy: d.energy ?? null,
    danceability: d.danceability ?? null,
    loudness_db: d.loudness_db ?? null,
    duration_s: d.duration_s ?? null,
    source: "preview",
  });
  return new NextResponse(null, { status: 204 });
}
