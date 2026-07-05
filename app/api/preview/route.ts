import { NextRequest, NextResponse } from "next/server";
import { allowLookup } from "@/lib/server/rate-limit";
import { isAllowedPreviewUrl } from "@/lib/server/link-analysis";

// Streams a catalog 30s preview to the browser (the CDNs don't send CORS
// headers, so the audio can't be fetched client-side for decoding). Strictly
// host-allowlisted and size-capped so this can never act as an open proxy.
export const maxDuration = 30;

const MAX_PREVIEW_BYTES = 2_500_000;

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowLookup(ip)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const src = request.nextUrl.searchParams.get("src") ?? "";
  const url = isAllowedPreviewUrl(src);
  if (!url) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }
    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ error: "tooLarge" }, { status: 502 });
    }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ error: "tooLarge" }, { status: 502 });
    }
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
        // Previews are stable per URL; let the CDN cache them so repeat
        // analyses of trending songs cost nothing.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
