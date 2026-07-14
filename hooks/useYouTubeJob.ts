"use client";

import { useCallback, useEffect, useState } from "react";
import type { YtJobPublic } from "@/types/analysis";
import { useI18n } from "@/lib/i18n";

const POLL_MS = 750;

export type YouTubeJobState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "working"; jobId: string; status: YtJobPublic["status"]; progress: number; title: string | null }
  | { phase: "done"; jobId: string; title: string | null }
  | { phase: "setup"; code: "YTDLP_MISSING" | "FFMPEG_MISSING" }
  // The download server was asleep and is spinning up — not a failure, just
  // "come back in a minute", so it gets its own phase instead of reading as
  // "Download failed".
  | { phase: "waking" }
  | { phase: "error"; message: string };

export function useYouTubeJob() {
  const { t } = useI18n();
  const [state, setState] = useState<YouTubeJobState>({ phase: "idle" });

  const activeJobId = state.phase === "working" ? state.jobId : null;

  // Effect-driven polling keyed on the job id: survives remounts and dev
  // Fast Refresh (an imperative interval started in start() would be killed
  // by any cleanup cycle and never come back, stranding the UI mid-download).
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;

    const tick = async () => {
      let job: YtJobPublic;
      try {
        const statusResponse = await fetch(`/api/youtube/${activeJobId}`);
        if (!statusResponse.ok) throw new Error();
        job = await statusResponse.json();
      } catch {
        if (!cancelled) setState({ phase: "error", message: t("ytDownloader.lostTrack") });
        return;
      }
      if (cancelled) return;
      if (job.status === "done") {
        setState({ phase: "done", jobId: activeJobId, title: job.title });
      } else if (job.status === "error") {
        // job.error is a server-originated message (e.g. from yt-dlp) and is not translated.
        setState({ phase: "error", message: job.error || t("ytDownloader.downloadFailedFallback") });
      } else {
        setState({ phase: "working", jobId: activeJobId, status: job.status, progress: job.progress, title: job.title });
      }
    };

    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJobId, t]);

  const start = useCallback(
    async (
      url: string,
      quality: string,
      format: string,
      trimSilence: boolean,
      section?: { start: number; end: number } | null,
    ) => {
    setState({ phase: "starting" });

    let response: Response;
    try {
      response = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          quality,
          format,
          trimSilence,
          ...(section ? { sectionStart: section.start, sectionEnd: section.end } : {}),
        }),
      });
    } catch {
      setState({ phase: "error", message: t("ytDownloader.couldNotReachServer") });
      return;
    }

    const payload = await response.json().catch(() => ({}));
    if (response.status === 503 && (payload.code === "YTDLP_MISSING" || payload.code === "FFMPEG_MISSING")) {
      setState({ phase: "setup", code: payload.code });
      return;
    }
    if (response.status === 503 && payload.waking === true) {
      setState({ phase: "waking" });
      return;
    }
    if (!response.ok || !payload.jobId) {
      // payload.error is a server-originated message and is not translated.
      setState({ phase: "error", message: payload.error || t("ytDownloader.couldNotStart") });
      return;
    }

    setState({ phase: "working", jobId: payload.jobId, status: "starting", progress: 0, title: null });
    },
    [t],
  );

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, start, reset };
}
