import { NextRequest, NextResponse } from "next/server";
import { startJobSchema, validateMediaUrl } from "@/lib/server/validate";
import { allowJobStart } from "@/lib/server/rate-limit";
import { runningJobCount } from "@/lib/server/jobs";
import { SetupError, startYouTubeJob } from "@/lib/server/ytdlp";
import { isDownloaderEnabled, remoteDownloaderUrl, remoteDownloaderKey, homeDownloaderUrl, homeDownloaderKey } from "@/lib/runtime";
import { pickBackend } from "@/lib/server/backends";
import en from "@/lib/i18n/locales/en";

const MAX_CONCURRENT_JOBS = 2;

// Render's free instances spin down when idle and cold-start in ~50s; Fluid
// Compute is enabled on the Vercel project so 60s is allowed on Hobby.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isDownloaderEnabled) return new NextResponse("Not found", { status: 404 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowJobStart(ip)) {
    return NextResponse.json({ error: "Too many downloads started. Wait a few minutes and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = startJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a YouTube URL and a quality of 320, 256, 192, or 128." }, { status: 400 });
  }

  // Two mutually-exclusive job shapes: a direct URL (existing flow) or a
  // search query (Spotify-matched track — no direct URL, resolved via
  // yt-dlp's ytsearch1: pseudo-URL). startJobSchema's refine guarantees
  // exactly one of these is present.
  const isSearchJob = Boolean(parsed.data.query);

  let canonicalUrl: string | null = null;
  let sourceLabel = "search";
  if (!isSearchJob) {
    const canonical = validateMediaUrl(parsed.data.url!);
    if (!canonical) {
      return NextResponse.json(
        { error: "Paste a YouTube, SoundCloud, Bandcamp, Vimeo, Mixcloud, or Audiomack link." },
        { status: 400 },
      );
    }
    canonicalUrl = canonical.url;
    sourceLabel = canonical.platform;
  }

  // Never forward unvalidated input — the body reaching a proxy backend is
  // the zod-parsed and canonicalized data, not the raw request body.
  const homeConfigured = Boolean(homeDownloaderUrl && homeDownloaderKey);
  const remoteConfigured = Boolean(remoteDownloaderUrl && remoteDownloaderKey);

  if (homeConfigured || remoteConfigured) {
    const backend = await pickBackend();
    if (!backend) {
      return NextResponse.json({ error: "Could not start the download." }, { status: 502 });
    }

    try {
      const upstream = await fetch(`${backend.base}/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": backend.key },
        body: JSON.stringify({
          ...(isSearchJob ? { query: parsed.data.query } : { url: canonicalUrl }),
          quality: parsed.data.quality,
          format: parsed.data.format,
          trimSilence: parsed.data.trimSilence,
        }),
      });
      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        // Home was down (we fell back to remote) and remote itself failed to
        // start the job — surface a clear, actionable message rather than
        // whatever the remote server returned.
        if (backend.tag === "remote" && homeConfigured) {
          return NextResponse.json({ error: payload.error || en["ytDownloader.homeOffline"] }, { status: upstream.status });
        }
        return NextResponse.json(payload, { status: upstream.status });
      }

      if (typeof payload.jobId === "string") {
        return NextResponse.json({ ...payload, jobId: `${backend.tag}_${payload.jobId}` }, { status: upstream.status });
      }
      return NextResponse.json(payload, { status: upstream.status });
    } catch (error) {
      console.error(`Failed to reach ${backend.tag} downloader`, error);
      if (backend.tag === "remote" && homeConfigured) {
        return NextResponse.json({ error: en["ytDownloader.homeOffline"] }, { status: 502 });
      }
      return NextResponse.json({ error: "Could not start the download." }, { status: 502 });
    }
  }

  if (runningJobCount() >= MAX_CONCURRENT_JOBS) {
    return NextResponse.json({ error: "Two downloads are already running. Let one finish first." }, { status: 429 });
  }

  try {
    const job = await startYouTubeJob(
      canonicalUrl,
      sourceLabel,
      parsed.data.quality,
      parsed.data.format,
      parsed.data.trimSilence,
      isSearchJob ? parsed.data.query : null,
    );
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json({ code: error.code }, { status: 503 });
    }
    console.error("Failed to start YouTube job", error);
    return NextResponse.json({ error: "Could not start the download." }, { status: 500 });
  }
}
