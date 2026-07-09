"use client";

// Analyzes the cache-miss tracks from a pasted playlist, right in the
// browser — same essentia worker + decode pipeline as useAnalyzer, run
// through a small concurrency-2 worker pool (mirrors usePlaylistBatch's
// queue-drain pattern) instead of one file at a time. Strong essentia results
// are written back to the shared community cache exactly like AnalyzerPanel
// does, so the playlist analyzer grows the same DB the single-link tool does.
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerRequest, WorkerResponse } from "@/types/analysis";
import { monoSamples, resampleMono } from "@/lib/audio/decode";
import { camelotLabel } from "@/lib/audio/constants";

const ANALYSIS_SAMPLE_RATE = 16000;
const CONCURRENCY = 2;

export type PlaylistCachedRow = {
  slug: string;
  bpm: number;
  bpm_alt: number | null;
  key: string;
  camelot: string | null;
  energy: number | null;
};

export type PlaylistTrackInput = {
  title: string;
  artist: string | null;
  sourceId: string | null;
  previewUrl: string | null;
  cached: PlaylistCachedRow | null;
};

export type RowStatus = "cached" | "queued" | "analyzing" | "done" | "failed" | "notfound";

export interface PlaylistRow {
  rowKey: string;
  title: string;
  artist: string | null;
  sourceId: string | null;
  previewUrl: string | null;
  slug: string | null;
  status: RowStatus;
  bpm: number | null;
  bpmAlt: number | null;
  keyName: string | null;
  camelot: string | null;
  energy: number | null;
}

function rowsFromTracks(tracks: PlaylistTrackInput[]): PlaylistRow[] {
  return tracks.map((track, index) => {
    const rowKey = track.sourceId ? `${track.sourceId}-${index}` : `row-${index}`;
    if (track.cached) {
      return {
        rowKey,
        title: track.title,
        artist: track.artist,
        sourceId: track.sourceId,
        previewUrl: track.previewUrl,
        slug: track.cached.slug,
        status: "cached",
        bpm: track.cached.bpm,
        bpmAlt: track.cached.bpm_alt,
        keyName: track.cached.key,
        camelot: track.cached.camelot,
        // Cached energy is stored 0-1; freshly analyzed rows report 0-100 —
        // normalize to 0-100 here so the table's Energy column is consistent.
        energy: track.cached.energy == null ? null : Math.round(track.cached.energy * 100),
      };
    }
    if (!track.sourceId || !track.previewUrl) {
      return {
        rowKey,
        title: track.title,
        artist: track.artist,
        sourceId: track.sourceId,
        previewUrl: null,
        slug: null,
        status: "notfound",
        bpm: null,
        bpmAlt: null,
        keyName: null,
        camelot: null,
        energy: null,
      };
    }
    return {
      rowKey,
      title: track.title,
      artist: track.artist,
      sourceId: track.sourceId,
      previewUrl: track.previewUrl,
      slug: null,
      status: "queued",
      bpm: null,
      bpmAlt: null,
      keyName: null,
      camelot: null,
      energy: null,
    };
  });
}

export function usePlaylistAnalyzer(tracks: PlaylistTrackInput[] | null) {
  const [rows, setRows] = useState<PlaylistRow[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: unknown) => void }>());
  const runIdRef = useRef(0);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url));
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = pendingRef.current.get(event.data.id);
        if (pending) {
          pendingRef.current.delete(event.data.id);
          pending.resolve(event.data);
        }
      };
      worker.onerror = (event) => {
        for (const [, pending] of pendingRef.current) pending.reject(new Error(event.message || "Worker error"));
        pendingRef.current.clear();
        worker.terminate();
        workerRef.current = null;
      };
      workerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  }, []);

  const analyzeSamples = useCallback(
    (samples: Float32Array, sampleRate: number): Promise<WorkerResponse> => {
      const worker = getWorker();
      if (!worker) return Promise.reject(new Error("No worker available"));
      return new Promise<WorkerResponse>((resolve, reject) => {
        const id = ++requestIdRef.current;
        pendingRef.current.set(id, { resolve, reject });
        const request: WorkerRequest = { id, samples, sampleRate };
        worker.postMessage(request, [samples.buffer]);
      });
    },
    [getWorker],
  );

  const updateRow = useCallback((rowKey: string, patch: Partial<PlaylistRow>) => {
    setRows((current) => current.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)));
  }, []);

  // Rebuild rows and kick off analysis of the cache misses whenever a new
  // lookup result set arrives. Cached rows render instantly; queued rows run
  // through a concurrency-2 pool below.
  useEffect(() => {
    const thisRun = ++runIdRef.current;
    const newRows = tracks ? rowsFromTracks(tracks) : [];
    setRows(newRows);

    const queue = newRows.filter((row) => row.status === "queued");
    if (queue.length === 0) return;

    const unit = (v: number | null | undefined) => (v == null ? null : Math.min(1, Math.max(0, v > 1 ? v / 100 : v)));

    const runOne = async (row: PlaylistRow) => {
      if (runIdRef.current !== thisRun || !row.previewUrl) return;
      updateRow(row.rowKey, { status: "analyzing" });
      try {
        const previewRes = await fetch(`/api/preview?src=${encodeURIComponent(row.previewUrl)}`);
        if (!previewRes.ok) throw new Error("Preview fetch failed");
        const blob = await previewRes.blob();

        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error("No AudioContext");
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new AudioContextClass();
        let buffer: AudioBuffer;
        try {
          buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        } finally {
          void audioContext.close();
        }

        const mono = monoSamples(buffer);
        const resampled = await resampleMono(mono, buffer.sampleRate, ANALYSIS_SAMPLE_RATE);
        const analysis = await analyzeSamples(resampled, ANALYSIS_SAMPLE_RATE);
        if (runIdRef.current !== thisRun) return;

        const camelotFull = camelotLabel(analysis.key);
        const camelotCode = camelotFull.match(/(1[0-2]|[1-9])[AB]/)?.[0] ?? null;

        updateRow(row.rowKey, {
          status: "done",
          bpm: analysis.bpm || null,
          bpmAlt: analysis.bpmAlternate ?? null,
          keyName: analysis.key,
          camelot: camelotCode,
          energy: analysis.energy,
        });

        if (analysis.engine === "essentia" && analysis.bpm && row.sourceId) {
          void fetch("/api/cache-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: row.sourceId,
              title: row.title,
              artist: row.artist ?? null,
              bpm: analysis.bpm,
              bpm_alt: analysis.bpmAlternate ?? null,
              key: analysis.key.includes(analysis.scale) ? analysis.key : `${analysis.key} ${analysis.scale}`,
              camelot: camelotCode,
              energy: unit(analysis.energy),
              danceability: unit(analysis.danceability),
              loudness_db: analysis.loudness ?? null,
              duration_s: buffer.duration || null,
            }),
          }).catch(() => {});
        }
      } catch {
        if (runIdRef.current === thisRun) updateRow(row.rowKey, { status: "failed" });
      }
    };

    void (async () => {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (cursor < queue.length && runIdRef.current === thisRun) {
          const next = queue[cursor];
          cursor += 1;
          await runOne(next);
        }
      });
      await Promise.all(workers);
    })();
    // analyzeSamples/updateRow are stable (empty-deps useCallbacks); only
    // re-run this whole pipeline when the lookup result set itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const totalCount = rows.length;
  const analyzedCount = rows.filter((r) => r.status === "done" || r.status === "cached").length;
  const cachedCount = rows.filter((r) => r.status === "cached").length;
  const unavailableCount = rows.filter((r) => r.status === "failed" || r.status === "notfound").length;
  const busy = rows.some((r) => r.status === "queued" || r.status === "analyzing");

  return { rows, totalCount, analyzedCount, cachedCount, unavailableCount, busy };
}
