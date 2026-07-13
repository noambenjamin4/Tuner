"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n/locales/en";
import { getAudioContextClass, decodeAudioFile } from "@/lib/audio/decode";
import { decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { encodeMp3FromChannels, encodeWavFromChannels, downloadBlob } from "@/lib/audio/mp3-encoder";
import { computeWaveformBars } from "@/lib/audio/waveform";
import { SeekableWaveform } from "@/components/ui/SeekableWaveform";
import { setNowPlaying } from "@/lib/audio/now-playing";
import { formatBytes } from "@/lib/files/image";
import { analyzeBandCurve, measureIntegratedLufs, renderMaster, type MasterBandCurve, type MasterMetrics, type MasterStyle } from "@/lib/audio/master";
import { CheckRow } from "@/components/ui/CheckRow";
import { FileDrop } from "./FileDrop";
import { AudioFormatPicker, type AudioOutputFormat } from "./AudioFormatPicker";

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPT = "audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.opus,.wma,.aiff,.aif,.weba";
const NOW_PLAYING_SOURCE = "master-preview";
const DEBOUNCE_MS = 400;

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };
type AbMode = "before" | "after";

const STYLES: MasterStyle[] = ["balanced", "warm", "bright", "punchy"];
const STYLE_LABELS: Record<MasterStyle, "audiomasteringtool.styleBalanced" | "audiomasteringtool.styleWarm" | "audiomasteringtool.styleBright" | "audiomasteringtool.stylePunchy"> = {
  balanced: "audiomasteringtool.styleBalanced",
  warm: "audiomasteringtool.styleWarm",
  bright: "audiomasteringtool.styleBright",
  punchy: "audiomasteringtool.stylePunchy",
};

// Genre presets: each sets a loudness target, a stereo width, and a tonal
// curve tuned for that style. "custom" = manual (target + tone style + width).
type GenreKey = "custom" | "edm" | "hiphop" | "pop" | "rock" | "acoustic" | "lofi";
const GENRE_ORDER: GenreKey[] = ["custom", "edm", "hiphop", "pop", "rock", "acoustic", "lofi"];
const GENRE_LABELS: Record<GenreKey, DictKey> = {
  custom: "audiomasteringtool.genreCustom",
  edm: "audiomasteringtool.genreEdm",
  hiphop: "audiomasteringtool.genreHiphop",
  pop: "audiomasteringtool.genrePop",
  rock: "audiomasteringtool.genreRock",
  acoustic: "audiomasteringtool.genreAcoustic",
  lofi: "audiomasteringtool.genreLofi",
};
type GenrePreset = { targetLufs: number; widen: number; curve: MasterBandCurve };
const GENRE_PRESETS: Record<Exclude<GenreKey, "custom">, GenrePreset> = {
  edm: { targetLufs: -9, widen: 45, curve: { subDb: 2, bassDb: 1.5, lowMidDb: -1.5, highMidDb: 1, airDb: 2.5 } },
  hiphop: { targetLufs: -9, widen: 12, curve: { subDb: 3, bassDb: 2, lowMidDb: -1, highMidDb: 0.5, airDb: 1 } },
  pop: { targetLufs: -14, widen: 30, curve: { subDb: 0, bassDb: 0.5, lowMidDb: -1, highMidDb: 1.5, airDb: 2.5 } },
  rock: { targetLufs: -14, widen: 8, curve: { subDb: 0, bassDb: 1, lowMidDb: 1, highMidDb: 1.5, airDb: 1 } },
  acoustic: { targetLufs: -14, widen: 5, curve: { subDb: -1, bassDb: 0, lowMidDb: 0.5, highMidDb: 1, airDb: 1.5 } },
  lofi: { targetLufs: -14, widen: 20, curve: { subDb: 1.5, bassDb: 1, lowMidDb: 0.5, highMidDb: -2, airDb: -3 } },
};

// Per-band difference (reference minus source), clamped to +/-6 dB, so the
// master leans toward the reference's tonal balance without extreme moves.
function differenceCurve(reference: MasterBandCurve, source: MasterBandCurve): MasterBandCurve {
  const clamp = (v: number) => Math.max(-6, Math.min(6, v));
  return {
    subDb: clamp(reference.subDb - source.subDb),
    bassDb: clamp(reference.bassDb - source.bassDb),
    lowMidDb: clamp(reference.lowMidDb - source.lowMidDb),
    highMidDb: clamp(reference.highMidDb - source.highMidDb),
    airDb: clamp(reference.airDb - source.airDb),
  };
}

// Bars for the mastered output: computeWaveformBars only reads getChannelData(0)
// and its length, so a lightweight shim avoids materializing a real AudioBuffer.
function barsFromChannels(channels: Float32Array[]): number[] {
  return computeWaveformBars({ getChannelData: () => channels[0], length: channels[0].length } as unknown as AudioBuffer);
}

export function AudioMasteringTool() {
  const { t } = useI18n();

  // Controls
  const [targetLufs, setTargetLufs] = useState(-14);
  const [style, setStyle] = useState<MasterStyle>("balanced");
  const [genre, setGenre] = useState<GenreKey>("custom");
  const [widen, setWiden] = useState(0);
  const [referenceCurve, setReferenceCurve] = useState<MasterBandCurve | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  // Audio
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [masteredChannels, setMasteredChannels] = useState<Float32Array[] | null>(null);
  const masteredRateRef = useRef(48000);

  // Measurements + honest A/B: input loudness (for the readout and the
  // loudness-matched compare) and the mastered metrics.
  const [inputLufs, setInputLufs] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MasterMetrics | null>(null);
  const [matchLoudness, setMatchLoudness] = useState(false);
  const inputLufsRef = useRef<number | null>(null);
  inputLufsRef.current = inputLufs;
  const matchLoudnessRef = useRef(false);
  matchLoudnessRef.current = matchLoudness;
  const targetLufsRef = useRef(-14);
  targetLufsRef.current = targetLufs;

  // A/B + playback
  const [ab, setAb] = useState<AbMode>("before");
  const abRef = useRef<AbMode>("before");
  abRef.current = ab;
  const [playing, setPlaying] = useState(false);
  const [startOffset, setStartOffset] = useState(0);

  // Progress
  const [processing, setProcessing] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [format, setFormat] = useState<AudioOutputFormat>("mp3");
  const [mp3Kbps, setMp3Kbps] = useState(320);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const startOffsetRef = useRef(0);
  const durationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processTokenRef = useRef(0);
  const autoSwitchedRef = useRef(false);

  const hasReference = referenceCurve !== null;
  const hasGenre = genre !== "custom";
  const hasMaster = masteredChannels !== null;

  // Selecting a genre applies its loudness target + width and switches the tone
  // to its curve; "custom" hands tone/target/width back to the manual controls.
  const selectGenre = (next: GenreKey) => {
    setGenre(next);
    if (next !== "custom") {
      setTargetLufs(GENRE_PRESETS[next].targetLufs);
      setWiden(GENRE_PRESETS[next].widen);
    }
  };
  const duration = original?.duration ?? 0;
  durationRef.current = duration;

  const beforeBars = useMemo(() => (original ? computeWaveformBars(original) : []), [original]);
  const afterBars = useMemo(() => (masteredChannels ? barsFromChannels(masteredChannels) : []), [masteredChannels]);
  const activeBars = ab === "after" && afterBars.length ? afterBars : beforeBars;

  const getElapsed = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !sourceRef.current) return startOffsetRef.current;
    return Math.min(durationRef.current, startOffsetRef.current + (ctx.currentTime - startedAtRef.current));
  }, []);

  const stopPreview = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setPlaying(false);
  }, []);

  // Starts playback of the requested version (before = original buffer, after =
  // a buffer built from the mastered channels) at `offset` seconds. An
  // AudioBufferSourceNode has no in-place seek, so seeking = stop + restart.
  const startAt = useCallback(
    (offset: number, which: AbMode) => {
      const AudioContextClass = getAudioContextClass();
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      // Some browsers start the context suspended until a gesture resumes it.
      void ctx.resume();

      let buf: AudioBuffer | null = null;
      if (which === "after" && masteredChannels) {
        buf = ctx.createBuffer(masteredChannels.length, masteredChannels[0].length, masteredRateRef.current);
        for (let c = 0; c < masteredChannels.length; c += 1) buf.copyToChannel(masteredChannels[c] as Float32Array<ArrayBuffer>, c);
      } else if (original) {
        buf = original;
      }
      if (!buf) {
        void ctx.close();
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = buf;
      // Loudness-matched compare: raise the (quieter) original to the master's
      // loudness target so Before/After differ in TONE, not just volume. The
      // mastered "after" is already at target, so it needs no gain.
      let matchGain = 1;
      if (which === "before" && matchLoudnessRef.current && inputLufsRef.current != null) {
        const db = targetLufsRef.current - inputLufsRef.current;
        matchGain = Math.min(8, Math.max(0.125, 10 ** (db / 20)));
      }
      if (matchGain !== 1) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = matchGain;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
          setPlaying(false);
          setStartOffset(0);
          startOffsetRef.current = 0;
        }
      };
      source.start(0, Math.min(offset, buf.duration));

      audioCtxRef.current = ctx;
      sourceRef.current = source;
      startedAtRef.current = ctx.currentTime;
      startOffsetRef.current = offset;
      durationRef.current = buf.duration;
      setPlaying(true);
    },
    [masteredChannels, original],
  );

  const togglePlayback = useCallback(() => {
    if (playing) {
      stopPreview();
      return;
    }
    if (!original) return;
    startAt(startOffset, abRef.current);
  }, [playing, original, startOffset, startAt, stopPreview]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const clamped = Math.min(Math.max(0, seconds), duration);
      setStartOffset(clamped);
      startOffsetRef.current = clamped;
      if (playing) {
        stopPreview();
        startAt(clamped, abRef.current);
      }
    },
    [duration, playing, startAt, stopPreview],
  );

  const switchAb = useCallback(
    (next: AbMode) => {
      if (next === abRef.current) return;
      if (next === "after" && !masteredChannels) return;
      const wasPlaying = playing;
      const offset = getElapsed();
      abRef.current = next;
      setAb(next);
      if (wasPlaying) {
        stopPreview();
        startAt(offset, next);
      }
    },
    [masteredChannels, playing, getElapsed, startAt, stopPreview],
  );

  // Reset transport state (used on new file / reset).
  const resetPlayback = useCallback(() => {
    stopPreview();
    setStartOffset(0);
    startOffsetRef.current = 0;
    setAb("before");
    abRef.current = "before";
    autoSwitchedRef.current = false;
  }, [stopPreview]);

  const resetAll = useCallback(() => {
    resetPlayback();
    setFile(null);
    setOriginal(null);
    setMasteredChannels(null);
    setReferenceCurve(null);
    setReferenceName(null);
    setReferenceError(false);
    setStatus(null);
    setInputLufs(null);
    setMetrics(null);
    setMatchLoudness(false);
    setWiden(0);
    setTargetLufs(-14);
    setStyle("balanced");
    setGenre("custom");
  }, [resetPlayback]);

  useEffect(() => stopPreview, [stopPreview]);
  useEffect(() => {
    setNowPlaying(NOW_PLAYING_SOURCE, playing);
  }, [playing]);
  useEffect(() => () => setNowPlaying(NOW_PLAYING_SOURCE, false), []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const audioFile = files[0];
      if (!audioFile) return;
      if (audioFile.size > MAX_BYTES) {
        setStatus({ title: t("files.tooLarge"), message: formatBytes(MAX_BYTES), tone: "warning" });
        return;
      }
      resetPlayback();
      setMasteredChannels(null);
      setMetrics(null);
      setInputLufs(null);
      setFile(audioFile);
      setOriginal(null);
      setStatus({ title: t("files.processing"), message: audioFile.name, tone: "neutral" });
      try {
        const { buffer } = await decodeAudioFileCached(audioFile);
        if (!buffer.length || !buffer.numberOfChannels) throw new Error("Empty audio buffer.");
        setOriginal(buffer);
        // Measure the untouched loudness once for the readout + level-matched A/B.
        measureIntegratedLufs(buffer)
          .then((lufs) => setInputLufs(lufs))
          .catch(() => setInputLufs(null));
        // The master itself is computed by the effect below (also re-runs when
        // the target/style/reference/width change).
      } catch {
        setStatus({ title: t("files.failed"), message: audioFile.name, tone: "warning" });
        setFile(null);
      }
    },
    [resetPlayback, t],
  );

  // Compute (and re-compute) the master whenever the source or any control
  // changes. Debounced so rapid toggles don't render several masters.
  useEffect(() => {
    if (!original) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const token = ++processTokenRef.current;
    setProcessing(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const curve = referenceCurve ? differenceCurve(referenceCurve, analyzeBandCurve(original)) : null;
          const { channels, sampleRate, outputLufs, truePeakDb, dynamicRangeDb } = await renderMaster(original, {
            targetLufs,
            style,
            widen,
            referenceCurve: curve,
            presetCurve: genre !== "custom" ? GENRE_PRESETS[genre].curve : null,
          });
          if (processTokenRef.current !== token) return;
          masteredRateRef.current = sampleRate;
          setMasteredChannels(channels);
          setMetrics({ outputLufs, truePeakDb, dynamicRangeDb });
          setStatus({ title: t("files.done"), message: t("audiomasteringtool.compareHint"), tone: "success" });
          // First master for this file: jump to "After" so the result is heard
          // immediately; restart playback on the new master if already playing.
          if (!autoSwitchedRef.current) {
            autoSwitchedRef.current = true;
            abRef.current = "after";
            setAb("after");
            if (sourceRef.current) {
              const offset = getElapsed();
              stopPreview();
              startAt(offset, "after");
            }
          } else if (sourceRef.current && abRef.current === "after") {
            const offset = getElapsed();
            stopPreview();
            startAt(offset, "after");
          }
        } catch {
          if (processTokenRef.current === token) setStatus({ title: t("files.failed"), message: "", tone: "warning" });
        } finally {
          if (processTokenRef.current === token) setProcessing(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // startAt/getElapsed/stopPreview are stable-enough refs; re-running on them
    // would restart the master unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, targetLufs, style, genre, widen, referenceCurve, t]);

  const onReferenceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const refFile = event.target.files?.[0];
    event.target.value = "";
    if (!refFile) return;
    setReferenceError(false);
    if (refFile.size > MAX_BYTES) {
      setReferenceError(true);
      return;
    }
    try {
      const { buffer } = await decodeAudioFile(refFile);
      if (!buffer.length || !buffer.numberOfChannels) throw new Error("Empty reference.");
      setReferenceCurve(analyzeBandCurve(buffer));
      setReferenceName(refFile.name);
    } catch {
      setReferenceCurve(null);
      setReferenceName(null);
      setReferenceError(true);
    }
  };

  const removeReference = () => {
    setReferenceCurve(null);
    setReferenceName(null);
    setReferenceError(false);
  };

  const onExport = async () => {
    if (!file || !masteredChannels) return;
    setWorking(true);
    setStatus({ title: t("files.processing"), message: file.name, tone: "neutral" });
    try {
      const rate = masteredRateRef.current;
      const base = file.name.replace(/\.[^./\\]+$/, "");
      const name = `${base}-mastered.${format}`;
      const blob =
        format === "mp3"
          ? await encodeMp3FromChannels(masteredChannels, rate, mp3Kbps)
          : encodeWavFromChannels(masteredChannels, rate);
      downloadBlob(blob, name);
      setStatus({ title: t("files.done"), message: formatBytes(blob.size), tone: "success" });
    } catch {
      setStatus({ title: t("files.failed"), message: file.name, tone: "warning" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="panel hero-tool">
      <div className="panel-heading hero-heading">
        <div>
          <h1>{t("audiomasteringtool.title")}</h1>
          <p>{t("audiomasteringtool.subtitle")}</p>
        </div>
        {file && (
          <div className="hero-actions">
            <button className="text-button danger-pill" type="button" onClick={resetAll}>
              {t("common.reset")}
            </button>
          </div>
        )}
      </div>

      <article className="utility-card">
        {/* Genre preset */}
        <fieldset className="quality-field">
          <legend>{t("audiomasteringtool.genreLabel")}</legend>
          <div className="master-genre-options" role="group" aria-label={t("audiomasteringtool.genreLabel")}>
            {GENRE_ORDER.map((g) => (
              <button
                key={g}
                type="button"
                className={`quality-button${genre === g ? " active" : ""}`}
                aria-pressed={genre === g}
                disabled={working}
                onClick={() => selectGenre(g)}
              >
                <strong>{t(GENRE_LABELS[g])}</strong>
              </button>
            ))}
          </div>
        </fieldset>

        {/* 1. Loudness target */}
        <fieldset className="quality-field">
          <legend>{t("audiomasteringtool.targetLabel")}</legend>
          <div className="quality-options">
            <button
              type="button"
              className={`quality-button${targetLufs === -14 ? " active" : ""}`}
              disabled={working}
              onClick={() => setTargetLufs(-14)}
            >
              <strong>{t("audiomasteringtool.targetStreaming")}</strong>
            </button>
            <button
              type="button"
              className={`quality-button${targetLufs === -9 ? " active" : ""}`}
              disabled={working}
              onClick={() => setTargetLufs(-9)}
            >
              <strong>{t("audiomasteringtool.targetLoud")}</strong>
            </button>
          </div>
        </fieldset>

        {/* 2. Tone style (overridden by a genre preset or a reference track) */}
        <fieldset className="quality-field" aria-disabled={hasReference || hasGenre}>
          <legend>{t("audiomasteringtool.styleLabel")}</legend>
          <div className="quality-options" style={hasReference || hasGenre ? { opacity: 0.5 } : undefined}>
            {STYLES.map((option) => (
              <button
                key={option}
                type="button"
                className={`quality-button${style === option && !hasReference && !hasGenre ? " active" : ""}`}
                disabled={working || hasReference || hasGenre}
                onClick={() => setStyle(option)}
              >
                <strong>{t(STYLE_LABELS[option])}</strong>
              </button>
            ))}
          </div>
          {hasReference ? (
            <p className="tool-note">{t("audiomasteringtool.referenceOverrides")}</p>
          ) : hasGenre ? (
            <p className="tool-note">{t("audiomasteringtool.genreSetsTone")}</p>
          ) : null}
        </fieldset>

        {/* Stereo width */}
        <label className="field-label" htmlFor="masterWiden">
          {t("audiomasteringtool.width")} ({widen}%)
          <input
            id="masterWiden"
            type="range"
            min={0}
            max={100}
            step={5}
            value={widen}
            disabled={working}
            onChange={(event) => setWiden(Number(event.target.value))}
          />
        </label>

        {/* 3. Drop the file in (moved up, right under Tone style) */}
        {!original ? (
          <FileDrop
            accept={ACCEPT}
            disabled={working}
            onFiles={handleFiles}
            hint={t("mediatool.dropAudio", { size: formatBytes(MAX_BYTES) })}
          />
        ) : (
          <div className="master-preview">
            <fieldset className="quality-field">
              <legend>{t("audiomasteringtool.compareLabel")}</legend>
              <div className="quality-options format-options" role="group" aria-label={t("audiomasteringtool.compareLabel")}>
                <button
                  type="button"
                  className={`quality-button${ab === "before" ? " active" : ""}`}
                  aria-pressed={ab === "before"}
                  onClick={() => switchAb("before")}
                >
                  <strong>{t("audiomasteringtool.before")}</strong>
                  <span>{t("audiomasteringtool.beforeSub")}</span>
                </button>
                <button
                  type="button"
                  className={`quality-button${ab === "after" ? " active" : ""}`}
                  aria-pressed={ab === "after"}
                  disabled={!hasMaster}
                  onClick={() => switchAb("after")}
                >
                  <strong>{t("audiomasteringtool.after")}</strong>
                  <span>{t("audiomasteringtool.afterSub")}</span>
                </button>
              </div>
            </fieldset>

            <SeekableWaveform
              bars={activeBars}
              duration={duration}
              playing={playing}
              getCurrentTime={getElapsed}
              onSeek={handleSeek}
              onTogglePlay={togglePlayback}
              disabled={ab === "after" && processing}
            />

            <CheckRow
              checked={matchLoudness}
              onChange={(v) => {
                setMatchLoudness(v);
                matchLoudnessRef.current = v;
                if (playing && abRef.current === "before") {
                  const off = getElapsed();
                  stopPreview();
                  startAt(off, "before");
                }
              }}
            >
              {t("audiomasteringtool.matchLoudness")}
            </CheckRow>

            <p className="tool-note">
              {processing ? t("audiomasteringtool.applying") : t("audiomasteringtool.compareHint")}
            </p>

            {metrics && (
              <dl className="master-metrics">
                <div>
                  <dt>{t("audiomasteringtool.metricInput")}</dt>
                  <dd>{inputLufs != null ? `${inputLufs.toFixed(1)} LUFS` : "—"}</dd>
                </div>
                <div>
                  <dt>{t("audiomasteringtool.metricOutput")}</dt>
                  <dd>{metrics.outputLufs.toFixed(1)} LUFS</dd>
                </div>
                <div>
                  <dt>{t("audiomasteringtool.metricTruePeak")}</dt>
                  <dd>{metrics.truePeakDb.toFixed(1)} dBTP</dd>
                </div>
                <div>
                  <dt>{t("audiomasteringtool.metricDynamics")}</dt>
                  <dd>{metrics.dynamicRangeDb.toFixed(1)} dB</dd>
                </div>
              </dl>
            )}
          </div>
        )}

        {/* 4. Match a reference track (below the drop) */}
        <div className="field-label">
          <span>{t("audiomasteringtool.referenceLabel")}</span>
          <input
            ref={referenceInputRef}
            type="file"
            accept={ACCEPT}
            disabled={working}
            onChange={onReferenceChange}
            aria-label={t("audiomasteringtool.referenceLabel")}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, opacity: 0, pointerEvents: "none" }}
          />
          <button
            type="button"
            className="secondary-button"
            style={{ justifySelf: "start" }}
            disabled={working}
            onClick={() => referenceInputRef.current?.click()}
          >
            {t("files.browse")}
          </button>
        </div>
        {referenceName ? (
          <p className="imgtool-single-result">
            {t("audiomasteringtool.referenceLoaded")}: {referenceName}{" "}
            <button type="button" className="secondary-button" disabled={working} onClick={removeReference}>
              {t("audiomasteringtool.referenceRemove")}
            </button>
          </p>
        ) : (
          <p className="tool-note">{t("audiomasteringtool.referenceHint")}</p>
        )}
        {referenceError ? <p className="tool-note">{t("audiomasteringtool.referenceError")}</p> : null}

        <p className="tool-note">{t("audiomasteringtool.note")}</p>

        {/* 5. Export (only once a file is loaded) */}
        {original && (
          <>
            <AudioFormatPicker format={format} setFormat={setFormat} mp3Kbps={mp3Kbps} setMp3Kbps={setMp3Kbps} disabled={working} />
            <button
              className="convert-button"
              type="button"
              onClick={() => void onExport()}
              disabled={working || processing || !hasMaster}
            >
              {working ? t("files.processing") : t("audiomasteringtool.exportFormat", { format: format.toUpperCase() })}
            </button>
          </>
        )}
      </article>

      <div className="status-box" data-tone={(status ?? { tone: "neutral" }).tone} role="status">
        <strong>{status ? status.title : t("files.idle")}</strong>
        <span>{status ? status.message : t("files.localNote")}</span>
      </div>
    </article>
  );
}
