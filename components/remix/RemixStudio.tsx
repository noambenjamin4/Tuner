"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";
import { getAudioContextClass } from "@/lib/audio/decode";
import { clearDecodeCache, decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { downloadBlob } from "@/lib/files/download";
import { FormatPicker, type OutputFormat } from "@/components/converter/QualityPicker";
import { useTunebad } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import { CheckRow } from "@/components/ui/CheckRow";
import { SeekableWaveform } from "@/components/ui/SeekableWaveform";
import { computeWaveformBars } from "@/lib/audio/waveform";
import { SlowedIcon } from "@/components/ui/icons";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import {
  applyReverbEqParams,
  buildRemixGraph,
  coupledSemitones,
  NEUTRAL_REVERB_EQ,
  renderRemix,
  timeStretch,
  type RemixGraph,
  type RemixParams,
  type ReverbEqParams,
  type ReverbType,
} from "@/lib/audio/remix";
import { ReverbEq } from "@/components/remix/ReverbEq";
import { setNowPlaying } from "@/lib/audio/now-playing";

const NOW_PLAYING_SOURCE = "remix-preview";

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };

type Preset = { name: string; speed: number; reverb: number; bassBoostDb: number };

const PRESETS: Preset[] = [
  { name: "Slowed + Reverb", speed: 0.8, reverb: 40, bassBoostDb: 0 },
  { name: "Nightcore", speed: 1.25, reverb: 0, bassBoostDb: 0 },
];

const DEBOUNCE_MS = 400;

// Reverb-character pill labels come from i18n; the type values feed
// REVERB_TYPES in lib/audio/remix.ts.
const REVERB_TYPE_OPTIONS = [
  { type: "room", labelKey: "remix.typeRoom" },
  { type: "plate", labelKey: "remix.typePlate" },
  { type: "hall", labelKey: "remix.typeHall" },
  { type: "cathedral", labelKey: "remix.typeCathedral" },
  { type: "saturated", labelKey: "remix.typeSaturated" },
] as const;

function matchesPreset(preset: Preset, speed: number, reverb: number, bassBoostDb: number): boolean {
  return Math.abs(preset.speed - speed) < 0.005 && preset.reverb === reverb && preset.bassBoostDb === bassBoostDb;
}

function formatSemitones(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)} st`;
}

export function RemixStudio() {
  const { t } = useI18n();
  const { pendingFiles, pendingTarget, clearPendingFiles } = useTunebad();
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  const [speed, setSpeed] = useState(0.8);
  const [reverb, setReverb] = useState(40);
  const [bassBoostDb, setBassBoostDb] = useState(0);
  const [lockPitch, setLockPitch] = useState(false);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [reverbType, setReverbType] = useState<ReverbType>("hall");
  const [reverbEq, setReverbEq] = useState<ReverbEqParams>(NEUTRAL_REVERB_EQ);

  const [playing, setPlaying] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [working, setWorking] = useState(false);
  useUnloadGuard(working);
  const [format, setFormat] = useState<OutputFormat>("mp3");
  // null = idle; the idle status is derived at render time so it follows the active locale.
  const [status, setStatus] = useState<Status | null>(null);

  // Scrubbing: an AudioBufferSourceNode can't be seeked in place once
  // started, so "seeking" means stopping the current source and starting a
  // new one at `startOffset`. Elapsed time is computed on demand from
  // wall-clock refs (startOffsetRef/startedAtRef/speedMultiplierRef) via
  // `getElapsed()` — SeekableWaveform's own rAF loop calls this every frame,
  // so we don't need a per-frame setState here.
  const [startOffset, setStartOffset] = useState(0);

  const previewUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<RemixGraph | null>(null);
  const stretchedBufferRef = useRef<AudioBuffer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stretchTokenRef = useRef(0);
  const startedAtRef = useRef(0);
  const startOffsetRef = useRef(0);
  const bufferDurationRef = useRef(0);

  const params: RemixParams = useMemo(
    () => ({ speed, reverb, bassBoostDb, lockPitch, pitchSemitones, reverbType, reverbEq }),
    [speed, reverb, bassBoostDb, lockPitch, pitchSemitones, reverbType, reverbEq],
  );

  const bars = useMemo(() => (buffer ? computeWaveformBars(buffer) : []), [buffer]);
  const bufferDuration = buffer?.duration ?? 0;
  bufferDurationRef.current = bufferDuration;

  // Kept in sync with the live `speed`/`lockPitch` state so `getElapsed()`
  // (called every frame by SeekableWaveform's own rAF loop) always reads the
  // current value instead of a stale one.
  const speedMultiplierRef = useRef(1);

  // Computes elapsed time on demand from wall-clock refs — no per-frame
  // setState. Passed to SeekableWaveform as `getCurrentTime`.
  const getElapsed = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !graphRef.current) return startOffsetRef.current;
    return Math.min(
      bufferDurationRef.current,
      startOffsetRef.current + (ctx.currentTime - startedAtRef.current) * speedMultiplierRef.current,
    );
  }, []);

  const stopPreview = useCallback(() => {
    if (graphRef.current) {
      try {
        graphRef.current.source.stop();
      } catch {
        // already stopped
      }
      graphRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setPlaying(false);
  }, []);

  const resetAll = useCallback(() => {
    stopPreview();
    clearDecodeCache();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    stretchedBufferRef.current = null;
    setFile(null);
    setBuffer(null);
    setSpeed(0.8);
    setReverb(40);
    setBassBoostDb(0);
    setLockPitch(false);
    setPitchSemitones(0);
    setReverbType("hall");
    setReverbEq(NEUTRAL_REVERB_EQ);
    setStatus(null);
    setStartOffset(0);
    startOffsetRef.current = 0;
  }, [stopPreview]);

  // Cleanup on unmount.
  useEffect(() => stopPreview, [stopPreview]);

  useEffect(() => {
    setNowPlaying(NOW_PLAYING_SOURCE, playing);
  }, [playing]);

  useEffect(() => () => setNowPlaying(NOW_PLAYING_SOURCE, false), []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const audioFile = files.find((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
      if (!audioFile) return;

      stopPreview();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      stretchedBufferRef.current = null;

      setFile(audioFile);
      setBuffer(null);
      setStartOffset(0);
      startOffsetRef.current = 0;
      setStatus({ title: t("remix.decodingTitle"), message: t("remix.decodingMessage", { name: audioFile.name }), tone: "neutral" });

      try {
        const { buffer: decoded } = await decodeAudioFileCached(audioFile);
        previewUrlRef.current = URL.createObjectURL(audioFile);
        setBuffer(decoded);
        setStatus({
          title: t("remix.readyTitle"),
          message: t("remix.readyMessage", { name: audioFile.name }),
          tone: "success",
        });
      } catch (error) {
        console.error(error);
        setStatus({
          title: t("remix.decodeFailedTitle"),
          message: t("remix.decodeFailedFallback"),
          tone: "warning",
        });
      }
    },
    [stopPreview, t],
  );

  // A track handed over from another tool (e.g. "Send to" on the analyzer)
  // loads here without a re-pick. Guarded by pendingTarget: every panel is
  // mounted at once, so an unaddressed read would steal another tool's file.
  useEffect(() => {
    if (!pendingFiles?.length || pendingTarget !== "remix") return;
    void handleFiles(pendingFiles);
    clearPendingFiles();
  }, [pendingFiles, pendingTarget, clearPendingFiles, handleFiles]);

  const { dragging, dropZoneProps, inputProps, openPicker } = useFileDrop({
    onFiles: (files) => void handleFiles(files),
  });

  // Keeps a stretched copy of the buffer ready whenever lock-pitch (or its
  // semitone/speed inputs) change. Debounced so slider drags don't trigger a
  // stretch per frame.
  useEffect(() => {
    if (!buffer) return;
    if (!lockPitch) {
      stretchedBufferRef.current = null;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const token = ++stretchTokenRef.current;
    setReprocessing(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const stretched = await timeStretch(buffer, speed, pitchSemitones);
          if (stretchTokenRef.current !== token) return;
          stretchedBufferRef.current = stretched;
        } catch (error) {
          console.error("Time-stretch failed", error);
        } finally {
          if (stretchTokenRef.current === token) setReprocessing(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buffer, lockPitch, speed, pitchSemitones]);

  // Live-update the playing graph's params in place (no restart needed) for
  // everything except lock-pitch changes, which require a re-stretched buffer.
  useEffect(() => {
    const graph = graphRef.current;
    const ctx = audioCtxRef.current;
    if (!graph || !ctx) return;
    if (!lockPitch) graph.source.playbackRate.value = speed;
    const amount = reverb / 100;
    graph.wetGain.gain.value = 0.65 * amount;
    graph.dryGain.gain.value = 1 - 0.35 * amount;
    graph.bassFilter.gain.value = bassBoostDb;

    // Speed affects how fast elapsed time should advance. Re-base the
    // reference point to "now" at the new speed so the playhead doesn't jump
    // when the speed slider moves mid-playback.
    const nextMultiplier = lockPitch ? 1 : speed;
    if (speedMultiplierRef.current !== nextMultiplier) {
      startOffsetRef.current = getElapsed();
      startedAtRef.current = ctx.currentTime;
      speedMultiplierRef.current = nextMultiplier;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, reverb, bassBoostDb, lockPitch]);

  // EQ changes apply live to the current graph's wet-path filters — no
  // rebuild needed (the BiquadFilterNodes stay in place; only their values
  // move).
  const handleReverbEqChange = useCallback((eq: ReverbEqParams) => {
    setReverbEq(eq);
    if (graphRef.current) applyReverbEqParams(graphRef.current.reverbEq, eq);
  }, []);

  // Changing the reverb TYPE swaps the convolver's impulse response, which
  // requires rebuilding the playback graph — the same stop-and-restart
  // mechanism seeking uses. This runs after render so `startAt` (and the
  // `params` it captures) already reflect the new type.
  useEffect(() => {
    if (!graphRef.current || !audioCtxRef.current) return;
    const offset = getElapsed();
    stopPreview();
    startAt(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverbType]);

  const applyPreset = (preset: Preset) => {
    setSpeed(preset.speed);
    setReverb(preset.reverb);
    setBassBoostDb(preset.bassBoostDb);
  };

  // Starts (or restarts) playback at `offset` seconds into the source
  // buffer. Used both by the transport button and by seeking while playing
  // (seeking an AudioBufferSourceNode requires tearing down and rebuilding
  // the graph — it has no in-place seek).
  const startAt = useCallback(
    (offset: number) => {
      if (!buffer) return;
      const AudioContextClass = getAudioContextClass();
      if (!AudioContextClass) {
        setStatus({ title: t("remix.playbackUnavailableTitle"), message: t("remix.playbackUnavailableMessage"), tone: "warning" });
        return;
      }

      const playBuffer = lockPitch ? stretchedBufferRef.current ?? buffer : buffer;
      const ctx = new AudioContextClass();
      const graph = buildRemixGraph(ctx, playBuffer, params, offset);
      graph.source.onended = () => {
        if (graphRef.current === graph) {
          graphRef.current = null;
          setPlaying(false);
          setStartOffset(0);
          startOffsetRef.current = 0;
        }
      };
      audioCtxRef.current = ctx;
      graphRef.current = graph;
      startedAtRef.current = ctx.currentTime;
      startOffsetRef.current = offset;
      speedMultiplierRef.current = lockPitch ? 1 : speed;
      bufferDurationRef.current = playBuffer.duration;
      setPlaying(true);
    },
    [buffer, lockPitch, params, speed, t],
  );

  const togglePlayback = async () => {
    if (playing) {
      stopPreview();
      return;
    }
    if (!buffer) return;
    startAt(startOffset);
  };

  const handleSeek = useCallback(
    (seconds: number) => {
      const clamped = Math.min(Math.max(0, seconds), bufferDuration);
      setStartOffset(clamped);
      startOffsetRef.current = clamped;
      if (playing) {
        stopPreview();
        startAt(clamped);
      }
    },
    [bufferDuration, playing, startAt, stopPreview],
  );

  const onExport = async () => {
    if (!file || !buffer) return;
    setWorking(true);
    setStatus({ title: t("remix.rendering"), message: t("remix.renderingMessage"), tone: "neutral" });
    try {
      let renderSource = buffer;
      let renderParams = params;
      if (lockPitch) {
        setStatus({ title: t("remix.reprocessingTitle"), message: t("remix.reprocessingForLockMessage"), tone: "neutral" });
        renderSource = await timeStretch(buffer, speed, pitchSemitones);
        renderParams = { ...params, speed: 1 };
      }

      setStatus({ title: t("remix.rendering"), message: t("remix.renderingMessage"), tone: "neutral" });
      const { channels, sampleRate } = await renderRemix(renderSource, renderParams);

      const baseName = file.name.replace(/\.[^.]+$/, "") || "tunebad-audio";
      const suffix = speed > 1 ? "nightcore" : speed < 1 ? "slowed-reverb" : "remix";

      let blob: Blob;
      if (format === "wav") {
        blob = encodeWavFromChannels(channels, sampleRate);
        downloadBlob(blob, `${baseName}-${suffix}.wav`);
      } else {
        blob = await encodeMp3FromChannels(channels, sampleRate, 320);
        downloadBlob(blob, `${baseName}-${suffix}.mp3`);
      }

      setStatus({ title: t("remix.doneTitle"), message: t("remix.doneMessage", { format: format.toUpperCase() }), tone: "success" });
    } catch (error) {
      console.error(error);
      setStatus({
        title: t("remix.exportFailedTitle"),
        message: t("remix.exportFailedFallback"),
        tone: "warning",
      });
    } finally {
      setWorking(false);
    }
  };

  const pitchReadout = lockPitch
    ? t("remix.pitchLocked")
    : t("remix.pitchReadout", { value: formatSemitones(coupledSemitones(speed)) });
  const activePreset = PRESETS.find((preset) => matchesPreset(preset, speed, reverb, bassBoostDb));

  return (
    <article className="panel hero-tool remix-panel">
      <div className="panel-heading hero-heading">
        <div>
          <h1>
            <SlowedIcon className="panel-title-icon" />
            {t("remix.title")}
          </h1>
          <p>{t("remix.subtitle")}</p>
        </div>
        {file && (
          <div className="hero-actions">
            <button className="text-button danger-pill" type="button" onClick={resetAll}>
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
            <span>{t("remix.dropHint")}</span>
            <button className="secondary-button" type="button" onClick={openPicker}>
              {t("common.browseFiles")}
            </button>
          </div>
        </div>
      )}

      {file && buffer && (
        <article className="utility-card remix-controls-card">
          <div className="tool-heading">
            <div>
              <h3>{file.name}</h3>
              <p>{t("remix.controlsSubtitle")}</p>
            </div>
          </div>

          <div className="wave-card remix-wave-card">
            <SeekableWaveform
              bars={bars}
              getCurrentTime={getElapsed}
              duration={bufferDuration}
              playing={playing}
              onTogglePlay={() => void togglePlayback()}
              onSeek={handleSeek}
              disabled={reprocessing}
            />
          </div>

          <div className="remix-presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={`quality-button${activePreset?.name === preset.name ? " active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                {/* Preset names ("Slowed + Reverb", "Nightcore") are proper nouns — never translated. */}
                <strong>{preset.name}</strong>
                <span>{t("remix.presetSummary", { speed: preset.speed, reverb: preset.reverb })}</span>
              </button>
            ))}
          </div>

          <div className="remix-slider-row">
            <label className="field-label" htmlFor="speedSlider">
              {t("remix.speed", { x: speed.toFixed(2) })}
            </label>
            <input
              id="speedSlider"
              className="remix-slider"
              type="range"
              min={0.5}
              max={1.5}
              step={0.01}
              value={speed}
              onChange={(event) => setSpeed(Number.parseFloat(event.target.value))}
            />
            <span className="remix-pitch-readout">{pitchReadout}</span>
          </div>

          <div className="remix-slider-row">
            <label className="field-label" htmlFor="reverbSlider">
              {t("remix.reverb", { x: reverb })}
            </label>
            <input
              id="reverbSlider"
              className="remix-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={reverb}
              onChange={(event) => setReverb(Number.parseInt(event.target.value, 10))}
            />
          </div>

          <div className="reverb-eq-section">
            <span className="field-label" id="reverbTypeLegend">
              {t("remix.reverbTypeLegend")}
            </span>
            <div className="quality-options reverb-eq-types" role="group" aria-labelledby="reverbTypeLegend">
              {REVERB_TYPE_OPTIONS.map(({ type, labelKey }) => (
                <button
                  key={type}
                  type="button"
                  className={`quality-button${reverbType === type ? " active" : ""}`}
                  aria-pressed={reverbType === type}
                  onClick={() => setReverbType(type)}
                >
                  <strong>{t(labelKey)}</strong>
                </button>
              ))}
            </div>

            <div className="reverb-eq-heading">
              <span className="field-label">{t("remix.reverbEqTitle")}</span>
              <button className="text-button" type="button" onClick={() => handleReverbEqChange(NEUTRAL_REVERB_EQ)}>
                {t("remix.reverbEqReset")}
              </button>
            </div>
            <ReverbEq eq={reverbEq} onChange={handleReverbEqChange} disabled={working} />
          </div>

          <div className="remix-slider-row">
            <label className="field-label" htmlFor="bassSlider">
              {t("remix.bassBoost", { sign: bassBoostDb > 0 ? "+" : "", db: bassBoostDb })}
            </label>
            <input
              id="bassSlider"
              className="remix-slider"
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={bassBoostDb}
              onChange={(event) => setBassBoostDb(Number.parseFloat(event.target.value))}
            />
          </div>

          <div className="remix-pitch-row">
            <CheckRow checked={lockPitch} onChange={setLockPitch}>
              {t("remix.lockPitch")}
            </CheckRow>
            <input
              className="remix-slider"
              type="range"
              min={-12}
              max={12}
              step={1}
              value={pitchSemitones}
              disabled={!lockPitch}
              onChange={(event) => setPitchSemitones(Number.parseInt(event.target.value, 10))}
              aria-label={t("remix.pitchSemitoneShift")}
            />
            <span className="remix-pitch-readout">{formatSemitones(pitchSemitones)}</span>
          </div>

          {reprocessing && (
            <div className="status-box" role="status">
              <strong>{t("remix.reprocessingTitle")}</strong>
              <span>{t("remix.reprocessingMessage")}</span>
            </div>
          )}

          <div className="remix-export-row">
            <FormatPicker value={format} onChange={setFormat} />
            <button className="convert-button" type="button" onClick={() => void onExport()} disabled={working || reprocessing}>
              {working ? t("remix.rendering") : t("remix.exportFormat", { format: format.toUpperCase() })}
            </button>
          </div>
        </article>
      )}

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("remix.uploadTitle")}</strong>
        <span>{status ? status.message : t("remix.uploadMessage")}</span>
      </div>
    </article>
  );
}
