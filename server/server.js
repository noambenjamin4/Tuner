"use strict";

// Standalone remote downloader server (Node 22 built-ins only, zero npm deps).
// Deployed on Render as a Docker web service; proxied to by the Next.js
// /api/youtube* routes when DOWNLOADER_REMOTE_URL / DOWNLOADER_API_KEY are set.
// Mirrors the local implementation in lib/server/ytdlp.ts + lib/server/jobs.ts
// as closely as possible so both code paths behave identically to the client.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { validateMediaUrl } = require("./media-url");

const PORT = Number(process.env.PORT) || 8787;
const API_KEY = process.env.API_KEY;
const YTDLP_PATH = process.env.YTDLP_PATH || "/usr/local/bin/yt-dlp";
// Debian's apt package puts ffmpeg at /usr/bin/ffmpeg. A bare "ffmpeg" would
// break yt-dlp: --ffmpeg-location treats it as a relative path, which
// overrides normal PATH discovery and then fails.
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg";

if (!API_KEY) {
  console.error("API_KEY environment variable is required. Refusing to start.");
  process.exit(1);
}

const API_KEY_HASH = crypto.createHash("sha256").update(API_KEY).digest();

const MAX_CONCURRENT_JOBS = 2;
const JOB_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const BASE_DIR = path.join(os.tmpdir(), "tunebad-remote");

// Same silence-trim filter as lib/server/ytdlp.ts's SILENCE_TRIM_FILTER.
const SILENCE_TRIM_FILTER =
  "silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.02:start_silence=0.002:detection=rms";

/** @type {Map<string, any>} */
const jobs = new Map();

function runningJobCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === "starting" || job.status === "downloading" || job.status === "converting") count += 1;
  }
  return count;
}

async function sweepJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      try {
        job.child?.kill("SIGKILL");
      } catch {
        // already exited
      }
      jobs.delete(id);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fsp.rm(job.workdir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

const sweepTimer = setInterval(() => void sweepJobs(), SWEEP_INTERVAL_MS);
sweepTimer.unref?.();

function classifyError(stderr) {
  const lower = stderr.toLowerCase();
  if (lower.includes("video unavailable")) return "That video is unavailable.";
  if (lower.includes("age") && lower.includes("restrict")) return "That video is age-restricted and can't be downloaded.";
  if (lower.includes("match-filter") || lower.includes("does not pass filter")) return "That video is longer than the 90 minute limit.";
  if (lower.includes("max-filesize") || lower.includes("file is larger")) return "That video's audio exceeds the 300 MB limit.";
  if (lower.includes("private video")) return "That video is private.";
  if (lower.includes("sign in")) return "YouTube requires a sign-in for that video.";
  if (lower.includes("unsupported url") || lower.includes("is not a valid url")) return "That link isn't supported.";
  const lastLine = stderr.trim().split("\n").filter(Boolean).pop() || "Download failed.";
  return lastLine.replace(/^ERROR:\s*/i, "").slice(0, 300);
}

async function startJob(sanitizedUrl, quality, format, trimSilence) {
  void sweepJobs();

  const id = crypto.randomUUID();
  const workdir = path.join(BASE_DIR, id);
  await fsp.mkdir(workdir, { recursive: true });

  const job = {
    id,
    format,
    status: "starting",
    progress: 0,
    title: null,
    error: undefined,
    workdir,
    createdAt: Date.now(),
    child: undefined,
  };
  jobs.set(id, job);

  const args = [
    "--no-playlist",
    "-f", "bestaudio/best",
    "-x",
    "--audio-format", format,
    // WAV is lossless PCM; bitrate only applies to MP3
    ...(format === "mp3" ? ["--audio-quality", `${quality}K`] : []),
    "--ffmpeg-location", FFMPEG_PATH,
    "--match-filter", "duration <= 5400",
    "--max-filesize", "300M",
    "--no-mtime",
    "--newline",
    "--progress",
    "--print-to-file", "%(title)s", path.join(workdir, "title.txt"),
    "-o", path.join(workdir, "audio.%(ext)s"),
  ];

  if (process.env.YTDLP_COOKIES) {
    args.push("--cookies", "/tmp/cookies.txt");
  }

  if (trimSilence) {
    args.push("--postprocessor-args", `ExtractAudio:-af ${SILENCE_TRIM_FILTER}`);
  }

  args.push("--", sanitizedUrl);

  const child = spawn(YTDLP_PATH, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  job.child = child;

  let stderrTail = "";

  child.stdout.on("data", (chunk) => {
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

  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
  });

  child.on("error", (error) => {
    job.status = "error";
    job.error = `Could not run yt-dlp: ${error.message}`;
  });

  child.on("close", async (code) => {
    job.child = undefined;
    if (code === 0) {
      try {
        job.title = (await fsp.readFile(path.join(workdir, "title.txt"), "utf8")).trim().split("\n")[0] || null;
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

function mediaPathForJob(job) {
  return path.join(job.workdir, `audio.${job.format}`);
}

function publicJob(job) {
  return { status: job.status, progress: job.progress, title: job.title, error: job.error };
}

function contentDisposition(title, ext) {
  const fallback = `tuner-download.${ext}`;
  const base = (title || "").replace(/[^\w\s.-]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  const asciiName = base ? `${base}.${ext}` : fallback;
  const utf8Name = encodeURIComponent(title ? `${title.slice(0, 120)}.${ext}` : fallback);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

function timingSafeKeyCheck(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const candidateHash = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(candidateHash, API_KEY_HASH);
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUALITY_VALUES = new Set(["320", "256", "192", "128"]);
const FORMAT_VALUES = new Set(["mp3", "wav"]);

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const apiKey = req.headers["x-api-key"];
  if (!timingSafeKeyCheck(Array.isArray(apiKey) ? apiKey[0] : apiKey)) {
    sendJson(res, 401, { error: "Unauthorized." });
    return;
  }

  if (method === "POST" && pathname === "/job") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid request body." });
      return;
    }

    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "Invalid request body." });
      return;
    }

    const { url: rawUrl, quality, format = "mp3", trimSilence = true } = body;

    if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2048) {
      sendJson(res, 400, { error: "Provide a YouTube URL and a quality of 320, 256, 192, or 128." });
      return;
    }
    if (typeof quality !== "string" || !QUALITY_VALUES.has(quality)) {
      sendJson(res, 400, { error: "Provide a YouTube URL and a quality of 320, 256, 192, or 128." });
      return;
    }
    if (typeof format !== "string" || !FORMAT_VALUES.has(format)) {
      sendJson(res, 400, { error: "Provide a YouTube URL and a quality of 320, 256, 192, or 128." });
      return;
    }
    if (typeof trimSilence !== "boolean") {
      sendJson(res, 400, { error: "Provide a YouTube URL and a quality of 320, 256, 192, or 128." });
      return;
    }

    const canonical = validateMediaUrl(rawUrl);
    if (!canonical) {
      sendJson(res, 400, {
        error: "Paste a YouTube, SoundCloud, Bandcamp, Vimeo, Mixcloud, or Audiomack link.",
      });
      return;
    }

    if (runningJobCount() >= MAX_CONCURRENT_JOBS) {
      sendJson(res, 429, { error: "Two downloads are already running. Let one finish first." });
      return;
    }

    try {
      const job = await startJob(canonical.url, quality, format, trimSilence);
      sendJson(res, 202, { jobId: job.id });
    } catch (error) {
      console.error("Failed to start job:", error instanceof Error ? error.message : error);
      sendJson(res, 500, { error: "Could not start the download." });
    }
    return;
  }

  const jobMatch = pathname.match(/^\/job\/([^/]+)(?:\/(file))?$/);
  if (method === "GET" && jobMatch) {
    const [, jobId, sub] = jobMatch;
    if (!UUID_PATTERN.test(jobId)) {
      sendJson(res, 400, { error: "Invalid job id." });
      return;
    }
    const job = jobs.get(jobId);
    if (!job) {
      sendJson(res, 404, { error: "Job not found. It may have expired." });
      return;
    }

    if (sub === "file") {
      if (job.status !== "done") {
        sendJson(res, 409, { error: "That download isn't finished." });
        return;
      }
      const filePath = mediaPathForJob(job);
      let stat;
      try {
        stat = await fsp.stat(filePath);
      } catch {
        sendJson(res, 410, { error: "The file has been cleaned up. Start the download again." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": job.format === "wav" ? "audio/wav" : "audio/mpeg",
        "Content-Length": String(stat.size),
        "Content-Disposition": contentDisposition(job.title, job.format),
        "Cache-Control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 200, publicJob(job));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function main() {
  if (process.env.YTDLP_COOKIES) {
    try {
      const decoded = Buffer.from(process.env.YTDLP_COOKIES, "base64");
      await fsp.writeFile("/tmp/cookies.txt", decoded);
    } catch (error) {
      console.error("Failed to decode YTDLP_COOKIES:", error instanceof Error ? error.message : error);
    }
  }

  await fsp.mkdir(BASE_DIR, { recursive: true });

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error("Unhandled request error:", error instanceof Error ? error.message : error);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error." });
    });
  });

  server.listen(PORT, () => {
    console.log(`Remote downloader server listening on port ${PORT}`);
  });
}

void main();
