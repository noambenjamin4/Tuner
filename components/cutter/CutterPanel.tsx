"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { computeWaveformBars } from "@/lib/audio/waveform";
import { encodeMp3FromChannels, encodeWavFromChannels, downloadBlob } from "@/lib/audio/mp3-encoder";
import { SeekableWaveform } from "@/components/ui/SeekableWaveform";
import { CheckRow } from "@/components/ui/CheckRow";
import { FormatPicker, type OutputFormat } from "@/components/converter/QualityPicker";
import { useI18n } from "@/lib/i18n";
import { WaveformIcon } from "@/components/ui/icons";
import { setNowPlaying } from "@/lib/audio/now-playing";

const NOW_PLAYING_SOURCE = "cutter-preview";
const MIN_SELECTION_SECONDS = 0.1;
const FADE_SECONDS = 0.5;

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };

// mm:ss.s readout for the selection sliders — lib/format.ts's formatTime only
// gives whole seconds, and the cutter needs tenth-second precision for
// accurate trims.
function formatMmSsTenths(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${secs}`;
}

// Applies a linear fade in/out in place on each channel. Ramp length is
// clamped to half the selection so short clips still fade sensibly.
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
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  const [playing, setPlaying] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const [format, setFormat] = useState<OutputFormat>("mp3");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
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

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const handleSeek = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
  }, []);

  const resetAll = useCallback(() => {
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
          title: t("cutter.tooShort"),
          message: error instanceof Error ? error.message : t("cutter.tooShort"),
          tone: "warning",
        });
      }
    },
    [t],
  );

  const handleDrag = (event: DragEvent, active: boolean) => {
    event.preventDefault();
    setDragging(active);
  };

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
        title: t("cutter.tooShort"),
        message: error instanceof Error ? error.message : t("cutter.tooShort"),
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
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
              {t("common.browseFiles")}
            </button>
          </div>
        </div>
      )}

      {file && buffer && (
        <article className="utility-card cutter-controls-card">
          <div className="tool-heading">
            <div>
              <h3>{file.name}</h3>
            </div>
          </div>

          <div className="wave-card cutter-wave-card">
            <SeekableWaveform
              bars={bars}
              duration={duration}
              playing={playing}
              getCurrentTime={getCurrentTime}
              onTogglePlay={() => void togglePlayback()}
              onSeek={handleSeek}
            />
            <audio
              ref={audioRef}
              src={previewUrlRef.current ?? undefined}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </div>

          <div className="cutter-selection">
            <div className="cutter-slider-row">
              <label className="field-label" htmlFor="cutterStart">
                {t("cutter.start")}
              </label>
              <input
                id="cutterStart"
                className="cutter-slider"
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={start}
                onChange={(event) => handleStartChange(Number.parseFloat(event.target.value))}
              />
              <span className="cutter-times font-mono">{formatMmSsTenths(start)}</span>
              <button className="secondary-button" type="button" onClick={useCurrentAsStart}>
                {t("cutter.useCurrentStart")}
              </button>
            </div>

            <div className="cutter-slider-row">
              <label className="field-label" htmlFor="cutterEnd">
                {t("cutter.end")}
              </label>
              <input
                id="cutterEnd"
                className="cutter-slider"
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(event) => handleEndChange(Number.parseFloat(event.target.value))}
              />
              <span className="cutter-times font-mono">{formatMmSsTenths(end)}</span>
              <button className="secondary-button" type="button" onClick={useCurrentAsEnd}>
                {t("cutter.useCurrentEnd")}
              </button>
            </div>

            <div className="cutter-fade-row">
              <CheckRow checked={fadeIn} onChange={setFadeIn}>
                {t("cutter.fadeIn")}
              </CheckRow>
              <CheckRow checked={fadeOut} onChange={setFadeOut}>
                {t("cutter.fadeOut")}
              </CheckRow>
            </div>
          </div>

          <div className="cutter-export-row">
            <FormatPicker value={format} onChange={setFormat} />
            <button className="convert-button" type="button" onClick={() => void onExport()} disabled={working}>
              {working ? t("cutter.exporting") : t("cutter.export")}
            </button>
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
