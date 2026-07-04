import { spawn } from "node:child_process";
import { access, constants, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { jobs, sweepJobs, YT_BASE_DIR, type YtJob } from "./jobs";
import type { YtFormat } from "@/types/analysis";

export class SetupError extends Error {
  constructor(public code: "YTDLP_MISSING" | "FFMPEG_MISSING") {
    super(code);
  }
}

// Trims leading dead air so playback starts right at the first transient. RMS
// detection avoids false triggers on quiet-but-present room tone; a 2ms pre-roll
// keeps the attack intact while landing the downbeat effectively on sample zero
// (so the file drops onto a DAW's bar line with no manual nudge).
export const SILENCE_TRIM_FILTER =
  "silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.02:start_silence=0.002:detection=rms";

// Mirrors server/server.js's stripInternalPaths: error text can reach the
// client, so absolute filesystem paths (e.g. the resolved yt-dlp binary in an
// ENOENT message) must never leak through.
function stripInternalPaths(message: string): string {
  return message.split(YT_BASE_DIR).join("<workdir>").replace(/\B\/(?:[\w.-]+\/)+[\w.-]+/g, "<path>");
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveYtdlp(): Promise<string> {
  const candidates = [process.env.YT_DLP_PATH, path.join(process.cwd(), "bin", "yt-dlp")].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  // Fall back to PATH
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    if (dir && (await isExecutable(path.join(dir, "yt-dlp")))) return path.join(dir, "yt-dlp");
  }
  throw new SetupError("YTDLP_MISSING");
}

export function resolveFfmpeg(): string {
  if (!ffmpegPath) throw new SetupError("FFMPEG_MISSING");
  return ffmpegPath;
}

function classifyError(stderr: string): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("video unavailable")) return "That video is unavailable.";
  if (lower.includes("age") && lower.includes("restrict")) return "That video is age-restricted and can't be downloaded.";
  if (lower.includes("match-filter") || lower.includes("does not pass filter")) return "That video is longer than the 90 minute limit.";
  if (lower.includes("max-filesize") || lower.includes("file is larger")) return "That download exceeds the size limit.";
  if (lower.includes("private video")) return "That video is private.";
  if (lower.includes("sign in")) return "YouTube requires a sign-in for that video.";
  if (lower.includes("unsupported url") || lower.includes("is not a valid url")) return "That link isn't supported.";
  const lastLine = stderr.trim().split("\n").filter(Boolean).pop() || "Download failed.";
  return stripInternalPaths(lastLine.replace(/^ERROR:\s*/i, "")).slice(0, 300);
}

export async function startYouTubeJob(
  sanitizedUrl: string | null,
  sourceLabel: string,
  quality: string,
  format: YtFormat,
  trimSilence: boolean,
  searchQuery?: string | null,
): Promise<YtJob> {
  void sweepJobs();
  const ytdlpPath = await resolveYtdlp();
  const ffmpeg = resolveFfmpeg();

  const id = randomUUID();
  const workdir = path.join(YT_BASE_DIR, id);
  await mkdir(workdir, { recursive: true });

  const job: YtJob = {
    id,
    videoId: sourceLabel,
    format,
    status: "starting",
    progress: 0,
    title: null,
    workdir,
    createdAt: Date.now(),
  };
  jobs.set(id, job);

  const args = [
    "--no-playlist",
    ...(format === "mp4"
      ? [
          "-f",
          `bv*[height<=${quality}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${quality}]+ba/b[height<=${quality}]`,
          "--merge-output-format", "mp4",
          "--postprocessor-args", "Merger:-movflags +faststart",
        ]
      : [
          "-f", "bestaudio/best",
          "-x",
          "--audio-format", format,
          // WAV is lossless PCM; bitrate only applies to MP3
          ...(format === "mp3" ? ["--audio-quality", `${quality}K`] : []),
        ]),
    "--ffmpeg-location", ffmpeg,
    "--match-filter", "duration <= 5400",
    "--max-filesize", format === "mp4" ? "2G" : "300M",
    "--no-mtime",
    "--newline",
    "--progress",
    "--print-to-file", "%(title)s", path.join(workdir, "title.txt"),
    "-o", path.join(workdir, "media.%(ext)s"),
  ];

  if (trimSilence && format !== "mp4") {
    args.push("--postprocessor-args", `ExtractAudio:-af ${SILENCE_TRIM_FILTER}`);
  }

  // Spotify-matched tracks (no direct URL) resolve via a yt-dlp search
  // pseudo-URL. This is still a single argv element after `--`, spawned with
  // shell:false — never interpolated into a shell string.
  const target = searchQuery ? `ytsearch1:${searchQuery}` : sanitizedUrl;
  args.push("--", target as string);

  const child = spawn(ytdlpPath, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  job.child = child;

  let stderrTail = "";

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split("\n")) {
      const progressMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (progressMatch) {
        job.status = "downloading";
        job.progress = Math.min(99, Number.parseFloat(progressMatch[1]) || 0);
      } else if (line.includes("[ExtractAudio]")) {
        job.status = "converting";
        job.progress = 99;
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
  });

  child.on("error", (error) => {
    job.status = "error";
    job.error = `Could not run yt-dlp: ${stripInternalPaths(error.message)}`;
  });

  child.on("close", async (code) => {
    job.child = undefined;
    if (code === 0) {
      try {
        job.title = (await readFile(path.join(workdir, "title.txt"), "utf8")).trim().split("\n")[0] || null;
      } catch {
        job.title = null;
      }
      job.status = "done";
      job.progress = 100;
    } else {
      // yt-dlp exits 101 when --match-filter rejects the video (not a failure of ours)
      job.status = "error";
      job.error = code === 101 ? "That video is longer than the 90 minute limit." : classifyError(stderrTail);
    }
  });

  return job;
}

export function mediaPathForJob(job: YtJob): string {
  return path.join(job.workdir, `media.${job.format}`);
}

export interface PlaylistItem {
  id: string;
  title: string | null;
}

// Enumerates a YouTube playlist's entries without creating a download job —
// this is a quick metadata fetch (--flat-playlist never touches ffmpeg or
// writes a workdir), so it deliberately does not count against the
// job-start rate limit. Mirrors the /playlist handler in server/server.js.
export async function enumeratePlaylist(canonicalPlaylistUrl: string): Promise<PlaylistItem[]> {
  const ytdlpPath = await resolveYtdlp();

  const args = ["--flat-playlist", "--dump-single-json", "--playlist-end", "50", "--no-warnings", "--", canonicalPlaylistUrl];

  const child = spawn(ytdlpPath, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderrTail = "";

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Playlist lookup timed out."));
    }, 30_000);
    timer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(stripInternalPaths(classifyError(stderrTail)));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Could not read that playlist.");
  }

  const entries = (parsed as { entries?: unknown[] })?.entries;
  if (!Array.isArray(entries)) return [];

  const items: PlaylistItem[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !id) continue;
    const rawTitle = (entry as { title?: unknown }).title;
    const title = typeof rawTitle === "string" && rawTitle ? rawTitle : null;
    items.push({ id, title });
    if (items.length >= 50) break;
  }
  return items;
}
