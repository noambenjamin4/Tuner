"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { getAudioContextClass } from "@/lib/audio/decode";
import { decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { PLATFORM_TARGETS } from "@/lib/audio/lufs";
import { useI18n } from "@/lib/i18n";
import { GaugeIcon } from "@/components/ui/icons";
import { setNowPlaying } from "@/lib/audio/now-playing";

const NOW_PLAYING_SOURCE = "loudness-preview";

interface LoudnessWorkerResult {
  id: number;
  lufs?: number;
  peakDb?: number;
  error?: string;
}

function formatDb(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded < 0 ? "−" : rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)} dB`;
}

function toneFor(penalty: number): "down" | "neutral" | "ok" {
  if (penalty < -0.05) return "down";
  if (penalty > 0.05) return "ok";
  return "neutral";
}

// Resample each channel independently to 48000 Hz with an OfflineAudioContext
// (mirrors resampleMono in lib/audio/decode.ts, but keeps channels separate so
// the BS.1770 meter sees true stereo data).
async function resampleTo48k(channels: Float32Array[], sampleRate: number): Promise<Float32Array[]> {
  const targetRate = 48000;
  if (sampleRate === targetRate) return channels;

  const numberOfChannels = channels.length;
  const duration = channels[0].length / sampleRate;
  const offline = new OfflineAudioContext(numberOfChannels, Math.ceil(duration * targetRate), targetRate);
  const buffer = offline.createBuffer(numberOfChannels, channels[0].length, sampleRate);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    buffer.copyToChannel(channels[channel] as Float32Array<ArrayBuffer>, channel);
  }
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const output: Float32Array[] = [];
  for (let channel = 0; channel < numberOfChannels; channel += 1) output.push(rendered.getChannelData(channel).slice());
  return output;
}

export function LoudnessPanel() {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lufs, setLufs] = useState<number | null>(null);
  const [peakDb, setPeakDb] = useState<number | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(new Map<number, { resolve: (r: LoudnessWorkerResult) => void; reject: (e: unknown) => void }>());

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      audioCtxRef.current?.close();
      setNowPlaying(NOW_PLAYING_SOURCE, false);
    },
    [],
  );

  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = new Worker(new URL("../../workers/loudness.worker.ts", import.meta.url));
      worker.onmessage = (event: MessageEvent<LoudnessWorkerResult>) => {
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

  const measure = useCallback(
    async (left: Float32Array, right: Float32Array, sampleRate: number): Promise<LoudnessWorkerResult> => {
      const worker = getWorker();
      if (!worker) throw new Error("Web Workers are unavailable in this browser.");
      return new Promise<LoudnessWorkerResult>((resolve, reject) => {
        const id = ++requestIdRef.current;
        pendingRef.current.set(id, { resolve, reject });
        // Mono files reuse one buffer for both channels; transferring the same
        // ArrayBuffer twice throws a DataCloneError, so dedupe the transfer list.
        const transfers = left.buffer === right.buffer ? [left.buffer] : [left.buffer, right.buffer];
        worker.postMessage({ id, left, right, sampleRate }, transfers);
      });
    },
    [getWorker],
  );

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setLufs(null);
    setPeakDb(null);
    setSelectedPlatform(null);
    setMeasuring(false);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    if (gainRef.current) gainRef.current.gain.value = 1;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    gainRef.current = null;
    sourceRef.current = null;
    audioElRef.current = null;
    setNowPlaying(NOW_PLAYING_SOURCE, false);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const audioFile = files.find((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
      if (!audioFile) return;

      reset();
      setFile(audioFile);
      setMeasuring(true);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(audioFile);
      setPreviewUrl(previewUrlRef.current);

      try {
        const { buffer } = await decodeAudioFileCached(audioFile);
        const channelCount = Math.min(2, buffer.numberOfChannels);
        const channels: Float32Array[] = [];
        for (let c = 0; c < channelCount; c += 1) channels.push(buffer.getChannelData(c).slice());
        if (channelCount === 1) channels.push(channels[0]);

        const resampled = await resampleTo48k(channels, buffer.sampleRate);
        const left = resampled[0];
        const right = resampled[1] ?? resampled[0];

        const result = await measure(left, right, 48000);
        if (result.error) throw new Error(result.error);
        setLufs(result.lufs ?? null);
        setPeakDb(result.peakDb ?? null);
      } catch (err) {
        console.error("Loudness measurement failed", err);
        setError(err instanceof Error ? err.message : t("loudness.errorTitle"));
      } finally {
        setMeasuring(false);
      }
    },
    [measure, reset, t],
  );

  const handleDrag = (event: DragEvent, active: boolean) => {
    event.preventDefault();
    setDragging(active);
  };

  const ensureAudioGraph = useCallback(() => {
    if (gainRef.current) return gainRef.current;
    const audioEl = audioElRef.current;
    if (!audioEl) return null;
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return null;
    const ctx = audioCtxRef.current || new AudioContextClass();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaElementSource(audioEl);
    const gain = ctx.createGain();
    source.connect(gain).connect(ctx.destination);
    sourceRef.current = source;
    gainRef.current = gain;
    return gain;
  }, []);

  const applyGainDb = useCallback(
    (db: number) => {
      const gain = ensureAudioGraph();
      if (!gain) return;
      if (audioCtxRef.current?.state === "suspended") void audioCtxRef.current.resume();
      gain.gain.value = 10 ** (db / 20);
    },
    [ensureAudioGraph],
  );

  const selectPlatform = (platformName: string, penalty: number) => {
    if (penalty >= 0) return;
    setSelectedPlatform(platformName);
    applyGainDb(penalty);
  };

  const selectOriginal = () => {
    setSelectedPlatform(null);
    applyGainDb(0);
  };

  const selectedPenalty = selectedPlatform ? PLATFORM_TARGETS.find((p) => p.name === selectedPlatform) : null;

  return (
    <article className="panel hero-tool loudness-panel">
      <div className="panel-heading hero-heading">
        <div>
          <h1>
            <GaugeIcon className="panel-title-icon" />
            {t("loudness.title")}
          </h1>
          <p>{t("loudness.subtitle")}</p>
        </div>
        {file && (
          <div className="hero-actions">
            <button className="text-button danger-pill" type="button" onClick={reset}>
              {t("common.reset")}
            </button>
          </div>
        )}
      </div>

      {!file && (
        <div
          className={`drop-zone${dragging ? " dragging" : ""}`}
          onDragEnter={(event) => handleDrag(event, true)}
          onDragOver={(event) => handleDrag(event, true)}
          onDragLeave={(event) => handleDrag(event, false)}
          onDrop={(event) => {
            handleDrag(event, false);
            void handleFiles([...event.dataTransfer.files]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
            onChange={(event) => {
              void handleFiles([...(event.target.files || [])]);
              event.target.value = "";
            }}
          />
          <div className="upload-copy">
            <small>{t("common.dropAudioFile")}</small>
            <span>{t("loudness.dropHint")}</span>
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
              {t("common.browseFiles")}
            </button>
          </div>
        </div>
      )}

      {measuring && (
        <div className="status-box" role="status">
          <strong>{t("loudness.measuringTitle")}</strong>
          <span>{t("loudness.measuringMessage")}</span>
        </div>
      )}

      {error && (
        <div className="status-box" data-tone="warning" role="status">
          <strong>{t("loudness.errorTitle")}</strong>
          <span>{error}</span>
        </div>
      )}

      {file && lufs !== null && peakDb !== null && !measuring && (
        <>
          <div className="loudness-metrics">
            <div className="loudness-metric">
              <small>{t("loudness.integratedLoudness")}</small>
              <strong>{lufs.toFixed(1)} LUFS</strong>
            </div>
            <div className="loudness-metric">
              <small>{t("loudness.samplePeak")}</small>
              <strong>{peakDb.toFixed(1)} dBFS</strong>
            </div>
          </div>

          <div className="loudness-grid">
            {PLATFORM_TARGETS.map((platform) => {
              const penalty = platform.lufs - lufs;
              const tone = toneFor(penalty);
              const toneClass = tone === "down" ? "loudness-down" : tone === "ok" ? "loudness-ok" : "loudness-neutral";
              const caption =
                tone === "down" ? t("loudness.turnedDown") : tone === "ok" ? t("loudness.quietPlaysAsIs") : t("loudness.playsAsIs");
              const selected = selectedPlatform === platform.name;
              return (
                <button
                  key={platform.name}
                  type="button"
                  className={`loudness-platform-card${selected ? " selected" : ""}`}
                  onClick={() => selectPlatform(platform.name, penalty)}
                  disabled={penalty >= 0}
                >
                  <span className="loudness-platform-name">{platform.name}</span>
                  <span className={`loudness-penalty ${toneClass}`}>{formatDb(penalty)}</span>
                  <span className="loudness-caption">{caption}</span>
                </button>
              );
            })}
          </div>

          <p className="loudness-note">{t("loudness.note")}</p>

          <div className="loudness-preview">
            <audio
              ref={audioElRef}
              controls
              src={previewUrl || undefined}
              onPlay={() => {
                if (!gainRef.current) ensureAudioGraph();
                if (audioCtxRef.current?.state === "suspended") void audioCtxRef.current.resume();
                setNowPlaying(NOW_PLAYING_SOURCE, true);
              }}
              onPause={() => setNowPlaying(NOW_PLAYING_SOURCE, false)}
              onEnded={() => setNowPlaying(NOW_PLAYING_SOURCE, false)}
            />
            <div className="loudness-preview-actions">
              <button
                type="button"
                className={`secondary-button${selectedPlatform === null ? " active-accent" : ""}`}
                onClick={selectOriginal}
              >
                {t("loudness.original")}
              </button>
              {selectedPlatform && (
                <button type="button" className="secondary-button active-accent">
                  {selectedPlatform}
                </button>
              )}
            </div>
            <span className="loudness-preview-label">
              {selectedPlatform && selectedPenalty
                ? t("loudness.previewingAt", { platform: selectedPlatform, value: formatDb(selectedPenalty.lufs - lufs) })
                : t("loudness.previewingOriginal")}
            </span>
          </div>
        </>
      )}
    </article>
  );
}
