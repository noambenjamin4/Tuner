"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, WorkerRequest, WorkerResponse } from "@/types/analysis";
import { describeBitDepth, monoSamples, resampleMono } from "@/lib/audio/decode";
import { clearDecodeCache, decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { estimateBpm, estimateKey } from "@/lib/audio/fallback-analysis";
import { camelotLabel } from "@/lib/audio/constants";
import { computeWaveformBars } from "@/lib/audio/waveform";

// Tunebat's analyzer (recovered from their public worker bundle) runs
// PercivalBpmEstimator + KeyExtractor on 16 kHz mono audio; match it exactly.
const ANALYSIS_SAMPLE_RATE = 16000;
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

// The phases a single file actually passes through. Reported per file (a batch
// analyzes them one at a time) so a multi-second wait shows where it is instead
// of one frozen "Analyzing …" for the whole job.
export type AnalyzeStage = "decoding" | "resampling" | "analyzing";

export interface AnalyzerState {
  results: AnalysisResult[];
  analyzingNames: string[];
  analyzingStages: Record<string, AnalyzeStage>;
  failedNames: string[];
  oversizedNames: string[];
  current: AnalysisResult | null;
  waveformBars: number[];
  previewUrl: string | null;
  previewDuration: number;
}

export function useAnalyzer(onResult?: (result: AnalysisResult) => void) {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [analyzingNames, setAnalyzingNames] = useState<string[]>([]);
  const [analyzingStages, setAnalyzingStages] = useState<Record<string, AnalyzeStage>>({});
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const [oversizedNames, setOversizedNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<AnalysisResult | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // The File behind `current`, kept so the analyzer can hand the exact same
  // decoded track to another tool (cut / slow / loudness) without a re-pick.
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(new Map<number, { resolve: (response: WorkerResponse) => void; reject: (error: unknown) => void }>());
  const previewUrlRef = useRef<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
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
        console.warn("Analysis worker crashed; falling back to main-thread analysis.", event.message);
        for (const [, pending] of pendingRef.current) pending.reject(new Error(event.message || "Worker error"));
        pendingRef.current.clear();
        worker.terminate();
        workerRef.current = null;
      };
      workerRef.current = worker;
      return worker;
    } catch (error) {
      console.warn("Web Worker unavailable; analysis will run on the main thread.", error);
      return null;
    }
  }, []);

  // Pre-warm the worker + essentia WASM so the FIRST analysis starts
  // instantly. The chunk is ~700KB, so warming during initial load hurts LCP
  // on slow connections; instead we wait for the first user gesture (real
  // users take seconds before picking a file) with a long fallback timer.
  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    let done = false;
    const kick = () => {
      if (done) return;
      done = true;
      cleanup();
      try {
        getWorker()?.postMessage({ warmup: true });
      } catch {
        // never let warm-up break anything
      }
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    const cleanup = () => events.forEach((e) => window.removeEventListener(e, kick));
    events.forEach((e) => window.addEventListener(e, kick, { once: true, passive: true }));
    const timer = setTimeout(kick, 10_000);
    return () => {
      cleanup();
      clearTimeout(timer);
    };
  }, [getWorker]);

  const analyzeSamples = useCallback(
    async (
      samples: Float32Array,
      sampleRate: number,
      bpmInput?: { samples: Float32Array; sampleRate: number },
    ): Promise<Omit<WorkerResponse, "id">> => {
      const worker = getWorker();
      if (worker) {
        try {
          return await new Promise<WorkerResponse>((resolve, reject) => {
            const id = ++requestIdRef.current;
            pendingRef.current.set(id, { resolve, reject });
            const request: WorkerRequest = {
              id,
              samples,
              sampleRate,
              bpmSamples: bpmInput?.samples,
              bpmSampleRate: bpmInput?.sampleRate,
            };
            // Structured-clone everything; transfer nothing. Transferring a
            // buffer DETACHES it on the main thread, and the fallback below
            // (used when the worker errors — e.g. essentia WASM fails to load)
            // reads `samples` directly. An earlier version transferred
            // `samples.buffer` and left only `bpmSamples` intact, but the
            // fallback never reads bpmSamples — so a worker crash produced
            // "0 BPM, C Major" from a zero-length array instead of a real
            // estimate. The clone costs one copy of a 16 kHz mono buffer on a
            // once-per-file, user-initiated path; a detached buffer costs a
            // wrong answer. Correctness wins that trade.
            worker.postMessage(request);
          });
        } catch {
          // fall through to the main-thread fallback
        }
      }
      const bpmResult = estimateBpm(samples, sampleRate);
      const keyResult = estimateKey(samples, sampleRate);
      return {
        engine: "basic",
        bpm: Math.round(bpmResult.bpm),
        bpmAlternate: bpmResult.bpmAlternate === null ? null : Math.round(bpmResult.bpmAlternate),
        bpmConfidence: bpmResult.confidence,
        key: keyResult.key,
        scale: keyResult.scale,
        keyConfidence: keyResult.confidence,
        energy: null,
        danceability: null,
        loudness: null,
      };
    },
    [getWorker],
  );

  const analyzeFiles = useCallback(
    async (files: File[]) => {
      const isAudioLike = (file: File) => file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name);
      const oversized = files.filter((file) => isAudioLike(file) && file.size > MAX_FILE_BYTES);
      if (oversized.length) {
        setOversizedNames((names) => [...oversized.map((file) => file.name), ...names]);
      }

      const audioFiles = files.filter((file) => isAudioLike(file) && file.size <= MAX_FILE_BYTES);
      if (!audioFiles.length) return;

      for (const file of audioFiles) {
        setFailedNames((names) => names.filter((name) => name !== file.name));
        setOversizedNames((names) => names.filter((name) => name !== file.name));
        setAnalyzingNames((names) => [file.name, ...names]);
        const setStage = (stage: AnalyzeStage) => setAnalyzingStages((stages) => ({ ...stages, [file.name]: stage }));
        setStage("decoding");
        try {
          const { buffer, arrayBuffer } = await decodeAudioFileCached(file);
          setStage("resampling");
          const bars = computeWaveformBars(buffer);
          const mono = monoSamples(buffer);
          const analysisInput = await resampleMono(mono, buffer.sampleRate, ANALYSIS_SAMPLE_RATE);
          setStage("analyzing");
          // Tempo gets the ORIGINAL-rate audio; key gets the 16k resample.
          // Percival's frame/hop defaults are specified at 44.1k, so running it
          // at 16k stretched every window ~2.76x in time and cost accuracy on
          // every band (measured: 61%->64% exact, slow 70%->74%, fast 10%->14%,
          // for +167ms). The key detector is the opposite — it measured better
          // at 16k (47% vs 45%) — so each estimator now gets the rate it wants.
          const analysis = await analyzeSamples(analysisInput, ANALYSIS_SAMPLE_RATE, {
            samples: mono,
            sampleRate: buffer.sampleRate,
          });

          const result: AnalysisResult = {
            name: file.name,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            bitDepthLabel: describeBitDepth(file.name, arrayBuffer),
            fileSize: file.size,
            bpm: analysis.bpm,
            bpmAlternate: analysis.bpmAlternate,
            key: analysis.key,
            scale: analysis.scale,
            camelot: camelotLabel(analysis.key),
            confidence: Math.round((analysis.bpmConfidence + analysis.keyConfidence) / 2),
            energy: analysis.energy,
            danceability: analysis.danceability,
            loudness: analysis.loudness,
            engine: analysis.engine,
            analyzedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          };

          setResults((current) => [result, ...current]);
          setCurrent(result);
          setCurrentFile(file);
          setWaveformBars(bars);
          setPreviewDuration(buffer.duration);
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = URL.createObjectURL(file);
          setPreviewUrl(previewUrlRef.current);
          onResultRef.current?.(result);
        } catch (error) {
          console.error(`Could not analyze ${file.name}`, error);
          setFailedNames((names) => [file.name, ...names]);
        } finally {
          setAnalyzingNames((names) => names.filter((name) => name !== file.name));
          setAnalyzingStages((stages) => {
            const { [file.name]: _done, ...rest } = stages;
            return rest;
          });
        }
      }
    },
    [analyzeSamples],
  );

  const clearResults = useCallback(() => {
    clearDecodeCache();
    setResults([]);
    setAnalyzingStages({});
    setCurrent(null);
    setCurrentFile(null);
    setWaveformBars([]);
    setFailedNames([]);
    setOversizedNames([]);
    setPreviewDuration(0);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  return {
    results,
    analyzingNames,
    analyzingStages,
    failedNames,
    oversizedNames,
    current,
    currentFile,
    waveformBars,
    previewUrl,
    previewDuration,
    analyzeFiles,
    clearResults,
  };
}
