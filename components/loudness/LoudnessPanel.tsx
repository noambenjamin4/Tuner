"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";
import { getAudioContextClass } from "@/lib/audio/decode";
import { decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { PLATFORM_TARGETS } from "@/lib/audio/lufs";
import { encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { downloadBlob } from "@/lib/files/download";
import { useTunebad } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import { GaugeIcon } from "@/components/ui/icons";
import { setNowPlaying } from "@/lib/audio/now-playing";

const NOW_PLAYING_SOURCE = "loudness-preview";

// Normalize-and-export targets. "custom" swaps the pill value for a numeric
// input clamped to CUSTOM_TARGET_MIN..CUSTOM_TARGET_MAX LUFS.
const EXPORT_TARGETS = [
  { id: "spotify", name: "Spotify", lufs: -14 },
  { id: "youtube", name: "YouTube", lufs: -14 },
  { id: "apple", name: "Apple Music", lufs: -16 },
] as const;
const CUSTOM_TARGET_MIN = -24;
const CUSTOM_TARGET_MAX = -6;
// Gain is capped so sample peaks never exceed -1 dBFS after normalizing.
const EXPORT_PEAK_CEILING = 10 ** (-1 / 20);

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
  const { pendingFiles, pendingTarget, clearPendingFiles } = useTunebad();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lufs, setLufs] = useState<number | null>(null);
  const [peakDb, setPeakDb] = useState<number | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<string>("spotify");
  const [customTarget, setCustomTarget] = useState("-14");
  const [exporting, setExporting] = useState(false);

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
    setExportTarget("spotify");
    setCustomTarget("-14");
    setExporting(false);
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
        setError(t("loudness.errorTitle"));
      } finally {
        setMeasuring(false);
      }
    },
    [measure, reset, t],
  );

  // A track handed over from another tool (e.g. "Send to" on the analyzer)
  // loads here without a re-pick. Guarded by pendingTarget: every panel is
  // mounted at once, so an unaddressed read would steal another tool's file.
  useEffect(() => {
    if (!pendingFiles?.length || pendingTarget !== "loudness") return;
    void handleFiles(pendingFiles);
    clearPendingFiles();
  }, [pendingFiles, pendingTarget, clearPendingFiles, handleFiles]);

  const { dragging, dropZoneProps, inputProps, openPicker } = useFileDrop({
    onFiles: (files) => void handleFiles(files),
  });

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

  // The target LUFS the export will aim for, or null when the custom value is
  // not a usable number.
  const preset = EXPORT_TARGETS.find((target) => target.id === exportTarget);
  let targetLufs: number | null = preset ? preset.lufs : null;
  if (exportTarget === "custom") {
    const parsed = Number.parseFloat(customTarget);
    targetLufs = Number.isFinite(parsed) ? Math.min(CUSTOM_TARGET_MAX, Math.max(CUSTOM_TARGET_MIN, parsed)) : null;
  }

  const exportNormalized = async (encodeAs: "wav" | "mp3") => {
    if (!file || lufs === null || targetLufs === null || exporting) return;
    setExporting(true);
    setError(null);
    try {
      // Re-decode from the module cache (the measurement pass transferred its
      // resampled copies to the worker, so the AudioBuffer is the source of
      // truth here). Export keeps the file's own sample rate and duration.
      const { buffer } = await decodeAudioFileCached(file);
      const channelCount = Math.min(2, buffer.numberOfChannels);
      const channels: Float32Array[] = [];
      for (let c = 0; c < channelCount; c += 1) channels.push(buffer.getChannelData(c).slice());

      let linear = 10 ** ((targetLufs - lufs) / 20);
      // Peak-safe cap: if the gain would push the sample peak above -1 dBFS,
      // reduce the gain so the peak lands exactly at -1 dBFS instead. This is
      // a gain limit, not a true-peak limiter.
      let peak = 0;
      for (const channel of channels) {
        for (let i = 0; i < channel.length; i += 1) {
          const abs = Math.abs(channel[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 0 && peak * linear > EXPORT_PEAK_CEILING) linear = EXPORT_PEAK_CEILING / peak;

      for (const channel of channels) {
        for (let i = 0; i < channel.length; i += 1) channel[i] *= linear;
      }

      const blob =
        encodeAs === "wav"
          ? encodeWavFromChannels(channels, buffer.sampleRate)
          : await encodeMp3FromChannels(channels, buffer.sampleRate, 320);
      const stem = file.name.replace(/\.[^.]+$/, "") || "track";
      const targetLabel = `${targetLufs}`.replace(/\.\d+$/, (frac) => frac.replace(".", "p"));
      downloadBlob(blob, `${stem} ${targetLabel}LUFS.${encodeAs}`);
    } catch (err) {
      console.error("Loudness export failed", err);
      setError(t("loudness.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

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
        <div className={`drop-zone${dragging ? " dragging" : ""}`} {...dropZoneProps}>
          <input {...inputProps} accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" />
          <div className="upload-copy">
            <small>{t("common.dropAudioFile")}</small>
            <span>{t("loudness.dropHint")}</span>
            <button className="secondary-button" type="button" onClick={openPicker}>
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

          <div className="loudness-export">
            <strong className="loudness-export-title">{t("loudness.exportTitle")}</strong>
            <div className="quality-options" role="group" aria-label={t("loudness.exportTargetAria")}>
              {EXPORT_TARGETS.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={`quality-button${exportTarget === target.id ? " active" : ""}`}
                  aria-pressed={exportTarget === target.id}
                  disabled={exporting}
                  onClick={() => setExportTarget(target.id)}
                >
                  <strong>{target.lufs}</strong>
                  <span>{target.name}</span>
                </button>
              ))}
              <button
                type="button"
                className={`quality-button${exportTarget === "custom" ? " active" : ""}`}
                aria-pressed={exportTarget === "custom"}
                disabled={exporting}
                onClick={() => setExportTarget("custom")}
              >
                <strong>{exportTarget === "custom" && targetLufs !== null ? targetLufs : "±"}</strong>
                <span>{t("loudness.exportCustom")}</span>
              </button>
            </div>

            {exportTarget === "custom" && (
              <label className="field-label loudness-export-custom">
                {t("loudness.exportCustomLabel")}
                <input
                  className="imgtool-number"
                  type="number"
                  min={CUSTOM_TARGET_MIN}
                  max={CUSTOM_TARGET_MAX}
                  step={0.5}
                  value={customTarget}
                  disabled={exporting}
                  onChange={(event) => setCustomTarget(event.target.value)}
                />
                {targetLufs === null ? (
                  <p className="loudness-export-note">{t("loudness.exportCustomHint")}</p>
                ) : null}
              </label>
            )}

            <div className="loudness-export-actions">
              <button
                className="convert-button"
                type="button"
                disabled={exporting || targetLufs === null}
                onClick={() => void exportNormalized("wav")}
              >
                {exporting ? t("loudness.exporting") : t("loudness.exportWav")}
              </button>
              <button
                className="convert-button"
                type="button"
                disabled={exporting || targetLufs === null}
                onClick={() => void exportNormalized("mp3")}
              >
                {exporting ? t("loudness.exporting") : t("loudness.exportMp3")}
              </button>
            </div>

            <p className="loudness-export-note">{t("loudness.exportNote")}</p>
          </div>
        </>
      )}
    </article>
  );
}
