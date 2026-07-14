"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";
import { clearDecodeCache, decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { computeWaveformBars } from "@/lib/audio/waveform";
import { encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { downloadBlob } from "@/lib/files/download";
import { FADE_SECONDS, fadeEnvelopeGain } from "@/lib/audio/fade";
import { TrimWaveform } from "./TrimWaveform";
import type { OutputFormat } from "@/components/converter/QualityPicker";
import { useTunebad } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import { WaveformIcon } from "@/components/ui/icons";
import { setNowPlaying } from "@/lib/audio/now-playing";
import { formatTimeTenths } from "@/lib/format";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";

const NOW_PLAYING_SOURCE = "cutter-preview";
const MIN_SELECTION_SECONDS = 0.1;
const STEP_SECONDS = 0.1;

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };

// Applies a linear fade in/out in place on each channel. Ramp length is
// clamped to half the selection so short clips still fade sensibly. This is
// the sample-domain twin of lib/audio/fade's fadeEnvelopeGain, which drives
// the preview volume and the waveform's tapered bars.
function applyFades(channels: Float32Array[], sampleRate: number, fadeIn: boolean, fadeOut: boolean): void {
  const length = channels[0]?.length ?? 0;
  if (!length) return;
  const maxRamp = Math.floor(length / 2);
  const rampSamples = Math.min(Math.floor(FADE_SECONDS * sampleRate), maxRamp);
  if (rampSamples <= 0) return;

  for (const data of channels) {
    if (fadeIn) {
      for (let i = 0; i < rampSamples; i += 1) {
        data[i] *= i / rampSamples;
      }
    }
    if (fadeOut) {
      for (let i = 0; i < rampSamples; i += 1) {
        const idx = length - 1 - i;
        data[idx] *= i / rampSamples;
      }
    }
  }
}

export function CutterPanel() {
  const { t } = useI18n();
  const { pendingFiles, pendingTarget, clearPendingFiles } = useTunebad();
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const [format, setFormat] = useState<OutputFormat>("mp3");
  const [working, setWorking] = useState(false);
  useUnloadGuard(working);
  const [status, setStatus] = useState<Status | null>(null);
  // Bumped after programmatic seeks while paused so the waveform playhead
  // repositions (its rAF loop only runs during playback).
  const [headSignal, setHeadSignal] = useState(0);

  const previewUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const bars = useMemo(() => (buffer ? computeWaveformBars(buffer, 240) : []), [buffer]);
  const duration = buffer?.duration ?? 0;

  useEffect(() => {
    setNowPlaying(NOW_PLAYING_SOURCE, playing);
  }, [playing]);

  useEffect(() => () => setNowPlaying(NOW_PLAYING_SOURCE, false), []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const getCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  // Play previews the SELECTION: starts at the trim start and auto-pauses at
  // the trim end (checked on timeupdate below), so what you hear is exactly
  // what you'd export.
  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.currentTime < start || audio.currentTime >= end) {
        audio.currentTime = start;
      }
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio && !audio.paused && audio.currentTime >= end) {
      audio.pause();
      setPlaying(false);
    }
  };

  // Click-to-play from the waveform: pressing the open wave (away from the
  // grip bars) jumps the playhead there and starts playback — no trip to the
  // transport button. If we're already playing, it just relocates. The
  // play() rejection guard covers autoplay policies (e.g. an untrusted
  // synthetic event): the seek still lands, playback simply waits for a
  // real gesture.
  const handleSeek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setHeadSignal((n) => n + 1);
    if (audio.paused) {
      audio.play().then(
        () => setPlaying(true),
        () => {
          /* Autoplay blocked; the moved playhead is kept. */
        },
      );
    }
  }, []);

  // AUDIBLE fades: while playing with a fade enabled, ride audio.volume
  // along the same envelope the export bakes into the samples, every frame.
  // Volume snaps back to 1 whenever playback stops, a fade is toggled off,
  // or the component unmounts, so nothing else ever hears a stale fade.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing || (!fadeIn && !fadeOut)) {
      audio.volume = 1;
      return;
    }
    let raf = 0;
    const apply = () => {
      audio.volume = fadeEnvelopeGain(audio.currentTime, start, end, fadeIn, fadeOut);
    };
    const tick = () => {
      apply();
      raf = requestAnimationFrame(tick);
    };
    tick();
    // rAF pauses in background tabs while audio keeps playing; timeupdate
    // (~4 Hz) keeps the envelope tracking so a tab switch mid-fade can't
    // freeze the volume low.
    audio.addEventListener("timeupdate", apply);
    return () => {
      cancelAnimationFrame(raf);
      audio.removeEventListener("timeupdate", apply);
      audio.volume = 1;
    };
  }, [playing, start, end, fadeIn, fadeOut]);

  const resetAll = useCallback(() => {
    clearDecodeCache();
    if (audioRef.current) audioRef.current.pause();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setFile(null);
    setBuffer(null);
    setPlaying(false);
    setStart(0);
    setEnd(0);
    setFadeIn(false);
    setFadeOut(false);
    setStatus(null);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const audioFile = files.find((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
      if (!audioFile) return;

      if (audioRef.current) audioRef.current.pause();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

      setFile(audioFile);
      setBuffer(null);
      setPlaying(false);
      setFadeIn(false);
      setFadeOut(false);
      setStatus({ title: t("cutter.selection"), message: t("common.dropAudioFile"), tone: "neutral" });

      try {
        const { buffer: decoded } = await decodeAudioFileCached(audioFile);
        previewUrlRef.current = URL.createObjectURL(audioFile);
        setBuffer(decoded);
        setStart(0);
        setEnd(decoded.duration);
        setStatus({ title: t("cutter.ready"), message: audioFile.name, tone: "success" });
      } catch (error) {
        console.error(error);
        setStatus({
          title: t("cutter.decodeFailedTitle"),
          message: t("cutter.decodeFailedFallback"),
          tone: "warning",
        });
      }
    },
    [t],
  );

  // A track handed over from another tool (e.g. "Send to" on the analyzer)
  // loads here without a re-pick. Guarded by pendingTarget: every panel is
  // mounted at once, so an unaddressed read would steal another tool's file.
  useEffect(() => {
    if (!pendingFiles?.length || pendingTarget !== "cutter") return;
    void handleFiles(pendingFiles);
    clearPendingFiles();
  }, [pendingFiles, pendingTarget, clearPendingFiles, handleFiles]);

  const { dragging, dropZoneProps, inputProps, openPicker } = useFileDrop({
    onFiles: (files) => void handleFiles(files),
  });

  const handleStartChange = (value: number) => {
    const clamped = Math.min(value, end - MIN_SELECTION_SECONDS);
    setStart(Math.max(0, clamped));
  };

  const handleEndChange = (value: number) => {
    const clamped = Math.max(value, start + MIN_SELECTION_SECONDS);
    setEnd(Math.min(duration, clamped));
  };

  const useCurrentAsStart = () => {
    const current = getCurrentTime();
    handleStartChange(current);
  };

  const useCurrentAsEnd = () => {
    const current = getCurrentTime();
    handleEndChange(current);
  };

  // ±0.1s steppers. Snap to a whole tenth so repeated nudges never
  // accumulate float drift (0.30000000000000004 in the readout).
  const nudgeStart = (delta: number) => {
    handleStartChange(Math.round((start + delta) * 10) / 10);
  };

  const nudgeEnd = (delta: number) => {
    handleEndChange(Math.round((end + delta) * 10) / 10);
  };

  const backToStart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    setHeadSignal((n) => n + 1);
  };

  const onExport = async () => {
    if (!file || !buffer) return;
    if (end - start < MIN_SELECTION_SECONDS) {
      setStatus({ title: t("cutter.tooShort"), message: t("cutter.tooShort"), tone: "warning" });
      return;
    }

    setWorking(true);
    setStatus({ title: t("cutter.exporting"), message: t("cutter.exporting"), tone: "neutral" });
    try {
      const sr = buffer.sampleRate;
      const startSample = Math.floor(start * sr);
      const endSample = Math.floor(end * sr);

      const channels: Float32Array[] = [];
      for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
        channels.push(buffer.getChannelData(ch).slice(startSample, endSample));
      }

      if (fadeIn || fadeOut) applyFades(channels, sr, fadeIn, fadeOut);

      const baseName = file.name.replace(/\.[^.]+$/, "") || "tunebad-audio";

      let blob: Blob;
      if (format === "wav") {
        blob = encodeWavFromChannels(channels, sr);
        downloadBlob(blob, `${baseName}-cut.wav`);
      } else {
        blob = await encodeMp3FromChannels(channels, sr, 320);
        downloadBlob(blob, `${baseName}-cut.mp3`);
      }

      setStatus({ title: t("cutter.exported"), message: t("cutter.exported"), tone: "success" });
    } catch (error) {
      console.error(error);
      setStatus({
        title: t("cutter.exportFailedTitle"),
        message: t("cutter.exportFailedFallback"),
        tone: "warning",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="panel hero-tool cutter-panel">
      <div className="panel-heading hero-heading">
        <div>
          <h1>
            <WaveformIcon className="panel-title-icon" />
            {t("cutter.title")}
          </h1>
          <p>{t("cutter.subtitle")}</p>
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
          <input
            {...inputProps}
            aria-label={t("common.browseFiles")}
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
          />
          <div className="upload-copy">
            <small>{t("common.dropAudioFile")}</small>
            <button className="secondary-button" type="button" onClick={openPicker}>
              {t("common.browseFiles")}
            </button>
          </div>
        </div>
      )}

      {file && buffer && (
        <article className="utility-card cutter-controls-card">
          {/* Hero block: file name (small, right-aligned) over the trim wave. */}
          <div className="wave-card cutter-wave-card">
            <div className="cutter-wave-name">{file.name}</div>
            <TrimWaveform
              bars={bars}
              duration={duration}
              start={start}
              end={end}
              playing={playing}
              getCurrentTime={getCurrentTime}
              onChangeStart={handleStartChange}
              onChangeEnd={handleEndChange}
              onSeek={handleSeek}
              fadeIn={fadeIn}
              fadeOut={fadeOut}
              onToggleFadeIn={() => setFadeIn((v) => !v)}
              onToggleFadeOut={() => setFadeOut((v) => !v)}
              headSignal={headSignal}
            />
            <audio
              ref={audioRef}
              src={previewUrlRef.current ?? undefined}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>

          {/* Bottom control bar: transport | start/end steppers | format + save. */}
          <div className="cutter-bar">
            <div className="cutter-transport">
              <button
                className="cutter-play-pill"
                type="button"
                aria-label={playing ? t("analysis.pausePreview") : t("analysis.playPreview")}
                onClick={() => void togglePlayback()}
              >
                {playing ? (
                  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3" y="2.5" width="3.4" height="11" rx="1" fill="currentColor" />
                    <rect x="9.6" y="2.5" width="3.4" height="11" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.5 2.8v10.4c0 .8.9 1.3 1.6.9l8-5.2c.6-.4.6-1.4 0-1.8l-8-5.2c-.7-.4-1.6.1-1.6.9z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                className="round-button cutter-skip-btn"
                type="button"
                aria-label={t("cutter.backToStart")}
                title={t("cutter.backToStart")}
                onClick={backToStart}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="2.8" y="2.5" width="2.4" height="11" rx="1" fill="currentColor" />
                  <path d="M13.2 3.7v8.6c0 .8-.9 1.3-1.6.9L5.4 9.1c-.6-.4-.6-1.4 0-1.8l6.2-4.3c.7-.5 1.6 0 1.6.7z" fill="currentColor" />
                </svg>
              </button>
            </div>

            <div className="cutter-steppers">
              <div className="cutter-stepper">
                <div className="cutter-stepper-row">
                  <span className="cutter-stepper-label">{t("cutter.start")}:</span>
                  <div className="cutter-stepper-pill">
                    <span className="cutter-stepper-time" data-testid="cutter-start-time">
                      {formatTimeTenths(start)}
                    </span>
                    <span className="cutter-stepper-arrows">
                      <button
                        type="button"
                        aria-label={`${t("cutter.start")} +0.1s`}
                        onClick={() => nudgeStart(STEP_SECONDS)}
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                          <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("cutter.start")} -0.1s`}
                        onClick={() => nudgeStart(-STEP_SECONDS)}
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>
                <button className="text-button cutter-set-btn" type="button" onClick={useCurrentAsStart}>
                  {t("cutter.useCurrentStart")}
                </button>
              </div>

              <div className="cutter-stepper">
                <div className="cutter-stepper-row">
                  <span className="cutter-stepper-label">{t("cutter.end")}:</span>
                  <div className="cutter-stepper-pill">
                    <span className="cutter-stepper-time" data-testid="cutter-end-time">
                      {formatTimeTenths(end)}
                    </span>
                    <span className="cutter-stepper-arrows">
                      <button
                        type="button"
                        aria-label={`${t("cutter.end")} +0.1s`}
                        onClick={() => nudgeEnd(STEP_SECONDS)}
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                          <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("cutter.end")} -0.1s`}
                        onClick={() => nudgeEnd(-STEP_SECONDS)}
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>
                <button className="text-button cutter-set-btn" type="button" onClick={useCurrentAsEnd}>
                  {t("cutter.useCurrentEnd")}
                </button>
              </div>
            </div>

            <div className="cutter-output">
              <div className="cutter-format-compact">
                <span className="cutter-stepper-label">{t("converter.formatLegend")}:</span>
                <div className="cutter-format-pills" role="group" aria-label={t("converter.formatLegend")}>
                  {(["mp3", "wav"] as const).map((value) => (
                    <button
                      key={value}
                      className={`cutter-format-pill${format === value ? " active" : ""}`}
                      type="button"
                      aria-pressed={format === value}
                      onClick={() => setFormat(value)}
                    >
                      {value.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button className="convert-button" type="button" onClick={() => void onExport()} disabled={working}>
                {working ? t("cutter.exporting") : t("cutter.export")}
              </button>
            </div>
          </div>
        </article>
      )}

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("cutter.selection")}</strong>
        <span>{status ? status.message : t("common.dropAudioFile")}</span>
      </div>
    </article>
  );
}
