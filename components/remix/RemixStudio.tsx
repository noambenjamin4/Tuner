"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";
import { getAudioContextClass } from "@/lib/audio/decode";
import { clearDecodeCache, decodeAudioFileCached } from "@/lib/audio/decode-cache";
import { encodeMp3FromChannels, encodeWavFromChannels } from "@/lib/audio/mp3-encoder";
import { downloadBlob } from "@/lib/files/download";
import { formatTime } from "@/lib/format";
import { FormatPicker, type OutputFormat } from "@/components/converter/QualityPicker";
import { useTunebad } from "../TunebadApp";
import { useI18n } from "@/lib/i18n";
import { CheckRow } from "@/components/ui/CheckRow";
import { SeekableWaveform } from "@/components/ui/SeekableWaveform";
import { computeWaveformBars } from "@/lib/audio/waveform";
import { SlowedIcon } from "@/components/ui/icons";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import {
  applyEffectParams,
  applyReverbEqParams,
  buildRemixGraph,
  coupledSemitones,
  NEUTRAL_REVERB_EQ,
  renderRemix,
  renderRemixAutomated,
  timeStretch,
  type AutomationEvent,
  type EffectId,
  type RemixGraph,
  type RemixParams,
  type ReverbEqParams,
  type ReverbType,
} from "@/lib/audio/remix";
import { ReverbEq } from "@/components/remix/ReverbEq";
import { setNowPlaying } from "@/lib/audio/now-playing";

const NOW_PLAYING_SOURCE = "remix-preview";

type Status = { title: string; message: string; tone: "neutral" | "success" | "warning" };

type Preset = { name: string; speed: number; reverb: number; bassBoostDb: number; effect: EffectId };

const PRESETS: Preset[] = [
  { name: "Slowed + Reverb", speed: 0.8, reverb: 40, bassBoostDb: 0, effect: "none" },
  { name: "Nightcore", speed: 1.25, reverb: 0, bassBoostDb: 0, effect: "none" },
  // Lo-Fi is the whole look in one click: slowed a touch, a small room rather
  // than a hall, and the tape/vinyl filter over it. Bass is left ALONE — the
  // preset used to add +3dB, which changed the low end rather than the
  // character, so lo-fi didn't sound like the same song any more.
  { name: "Lo-Fi", speed: 0.85, reverb: 22, bassBoostDb: 0, effect: "lofi" },
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

// Character-effect pills; the values feed EFFECTS in lib/audio/remix.ts.
const EFFECT_OPTIONS = [
  { effect: "none", labelKey: "remix.effectNone" },
  { effect: "underwater", labelKey: "remix.effectUnderwater" },
  { effect: "phone", labelKey: "remix.effectPhone" },
  { effect: "lofi", labelKey: "remix.effectLofi" },
] as const;

/**
 * One recorded pass over the track. Takes accumulate — recording again never
 * touches an earlier one — so the user can keep several and pick a favourite.
 * `startOffset` is the SONG position the pass began at (see takeOutputStart in
 * lib/audio/remix.ts for how that maps onto the render's timeline).
 */
interface RemixTake {
  id: string;
  label: string;
  base: RemixParams;
  events: AutomationEvent[];
  startOffset: number;
  outDuration: number;
}

// `Omit` over a union collapses it to the common keys, which would let a
// "speed" move carry a ReverbType. Distributing keeps each member's kind/value
// pair correlated.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type AutomationMove = DistributiveOmit<AutomationEvent, "t">;

function matchesPreset(
  preset: Preset,
  speed: number,
  reverb: number,
  bassBoostDb: number,
  effect: EffectId,
): boolean {
  return (
    Math.abs(preset.speed - speed) < 0.005 &&
    preset.reverb === reverb &&
    preset.bassBoostDb === bassBoostDb &&
    preset.effect === effect
  );
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
  const [effect, setEffect] = useState<EffectId>("none");

  // Remix recording. Finished passes land in `takes` and are never mutated by
  // a later recording; `selectedTakeId` picks which one Export renders (null =
  // plain static export of the live controls).
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<RemixTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);

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
  // Distinguishes a lock-pitch TOGGLE from a speed/pitch drag, so only the
  // drag pays the debounce.
  const prevLockRef = useRef(lockPitch);
  const startedAtRef = useRef(0);
  const startOffsetRef = useRef(0);
  const bufferDurationRef = useRef(0);
  const recordingRef = useRef(false);
  // Output seconds banked before the CURRENT AudioContext. Changing the reverb
  // type mid-recording rebuilds the graph on a fresh context (whose clock
  // restarts at ~0), so the recording clock can't just be
  // `ctx.currentTime - startedAt` — it accumulates across rebuilds instead.
  const recordBaseRef = useRef(0);
  // The recording clock's own origin. Deliberately NOT startedAtRef: that one
  // gets re-based to "now" on every speed change so the waveform playhead
  // doesn't jump, which would silently restart the recording clock at each
  // speed move and stamp every later event too early.
  const recordStartedAtRef = useRef(0);
  // In-progress take. Events live in a ref rather than state so that stopping
  // can read them synchronously without a state-updater side effect (`moveCount`
  // mirrors the length purely for the readout).
  const eventsRef = useRef<AutomationEvent[]>([]);
  const takeBaseRef = useRef<RemixParams | null>(null);
  const takeStartOffsetRef = useRef(0);
  // Monotonic take counter: gives stable ids/labels without Date.now() or
  // Math.random(), and keeps numbering sane when earlier takes are deleted.
  const takeCounterRef = useRef(0);
  // Indirection so the source's `onended` (created in startAt, which is defined
  // above finishTake) always calls the current implementation.
  const finishTakeRef = useRef<(outDuration: number) => void>(() => {});

  const params: RemixParams = useMemo(
    () => ({ speed, reverb, bassBoostDb, lockPitch, pitchSemitones, reverbType, reverbEq, effect }),
    [speed, reverb, bassBoostDb, lockPitch, pitchSemitones, reverbType, reverbEq, effect],
  );

  // Elapsed OUTPUT time: seconds of playback since Record was hit. Distinct
  // from `getElapsed()` (song position), which advances at `speed` and so
  // diverges the moment speed is automated. Automation timestamps are in
  // output time because that's the reference that reproduces what was heard.
  const getOutputTime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !graphRef.current) return recordBaseRef.current;
    return recordBaseRef.current + (ctx.currentTime - recordStartedAtRef.current);
  }, []);

  const recordMove = useCallback(
    (move: AutomationMove) => {
      if (!recordingRef.current) return;
      const t = getOutputTime();
      eventsRef.current = [...eventsRef.current, { ...move, t } as AutomationEvent];
      setMoveCount(eventsRef.current.length);
    },
    [getOutputTime],
  );

  // The take Export renders. null = static export of the live controls.
  const selectedTake = takes.find((take) => take.id === selectedTakeId) ?? null;

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
    setEffect("none");
    setStatus(null);
    setStartOffset(0);
    startOffsetRef.current = 0;
    recordingRef.current = false;
    recordBaseRef.current = 0;
    eventsRef.current = [];
    takeBaseRef.current = null;
    takeStartOffsetRef.current = 0;
    takeCounterRef.current = 0;
    setRecording(false);
    setMoveCount(0);
    setTakes([]);
    setSelectedTakeId(null);
    setRecordElapsed(0);
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
    // A checkbox toggle is a discrete action; a slider drag is a stream of
    // them. Only the drag deserves a debounce — waiting one out after a click
    // is what makes the toggle feel dead.
    const lockJustToggled = prevLockRef.current !== lockPitch;
    prevLockRef.current = lockPitch;

    if (!lockPitch) {
      stretchedBufferRef.current = null;
      // Turning lock pitch OFF also needs the graph rebuilt: it is still
      // playing the STRETCHED buffer, so without this the toggle changed
      // nothing you could hear. Nothing to re-render first — the original
      // buffer is already in hand, so this is immediate.
      if (lockJustToggled && graphRef.current && audioCtxRef.current) {
        const prevDuration = bufferDurationRef.current;
        const elapsed = getElapsed();
        const fraction = prevDuration > 0 ? Math.min(1, elapsed / prevDuration) : 0;
        recordBaseRef.current = getOutputTime();
        stopPreview();
        // Back onto the ORIGINAL buffer, so map the fraction onto its length.
        startAt(fraction * buffer.duration);
      }
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

          // The OLD play buffer's length, read before the swap — needed below.
          const prevDuration = bufferDurationRef.current;
          stretchedBufferRef.current = stretched;

          // Storing the ref is not enough: the graph that's PLAYING was built
          // from the previous buffer and keeps playing it, so moving pitch (or
          // speed) with lock-pitch on changed the readout but not the sound
          // until some unrelated control — a reverb type — forced a rebuild.
          // Swap it in the same way seeking does: stop and restart in place.
          if (graphRef.current && audioCtxRef.current) {
            // Carry the FRACTION, not the seconds. A re-stretch at a new speed
            // gives a buffer of a different length, so the same elapsed time
            // would land on a different part of the song.
            const elapsed = getElapsed();
            const fraction = prevDuration > 0 ? Math.min(1, elapsed / prevDuration) : 0;
            // The rebuild lands on a fresh AudioContext whose clock starts at
            // ~0; bank the output time so a recording timeline can't restart.
            recordBaseRef.current = getOutputTime();
            stopPreview();
            startAt(fraction * stretched.duration);
          }
        } catch (error) {
          console.error("Time-stretch failed", error);
        } finally {
          if (stretchTokenRef.current === token) setReprocessing(false);
        }
      })();
    }, lockJustToggled ? 0 : DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Intentionally keyed only on what should trigger a RE-STRETCH. The
    // rebuild helpers (getElapsed/stopPreview/startAt) are called inside, but
    // listing them would re-stretch whenever their identity changed — the same
    // reason the reverb-type rebuild below opts out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleReverbEqChange = useCallback(
    (eq: ReverbEqParams) => {
      setReverbEq(eq);
      if (graphRef.current) applyReverbEqParams(graphRef.current.reverbEq, eq);
      recordMove({ kind: "reverbEq", value: eq });
    },
    [recordMove],
  );

  // Effects apply live too: the chain is fixed, so switching a character is
  // just new filter/drive values plus the clean/fx crossfade gains — never a
  // rebuild (unlike reverb TYPE, which has to swap an impulse response).
  const handleEffectChange = useCallback(
    (next: EffectId) => {
      setEffect(next);
      if (graphRef.current) applyEffectParams(graphRef.current.effect, next);
      recordMove({ kind: "effect", value: next });
    },
    [recordMove],
  );

  // Changing the reverb TYPE swaps the convolver's impulse response, which
  // requires rebuilding the playback graph — the same stop-and-restart
  // mechanism seeking uses. This runs after render so `startAt` (and the
  // `params` it captures) already reflect the new type.
  useEffect(() => {
    if (!graphRef.current || !audioCtxRef.current) return;
    const offset = getElapsed();
    // The rebuild lands on a new AudioContext whose clock starts at ~0. Bank
    // the output time reached so far, or the recording timeline would restart
    // from zero here and every later move would be timestamped too early.
    recordBaseRef.current = getOutputTime();
    stopPreview();
    startAt(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverbType]);

  const handleReverbTypeChange = (next: ReverbType) => {
    setReverbType(next);
    recordMove({ kind: "reverbType", value: next });
  };

  const applyPreset = (preset: Preset) => {
    setSpeed(preset.speed);
    setReverb(preset.reverb);
    setBassBoostDb(preset.bassBoostDb);
    setEffect(preset.effect);
    // The character applies live to the playing graph, exactly as clicking the
    // pill would — otherwise a preset would set the value but not the sound.
    if (graphRef.current) applyEffectParams(graphRef.current.effect, preset.effect);
    recordMove({ kind: "speed", value: preset.speed });
    recordMove({ kind: "reverb", value: preset.reverb });
    recordMove({ kind: "bassBoostDb", value: preset.bassBoostDb });
    recordMove({ kind: "effect", value: preset.effect });
  };

  // Starts (or restarts) playback at `offset` seconds into the source
  // buffer. Used both by the transport button and by seeking while playing
  // (seeking an AudioBufferSourceNode requires tearing down and rebuilding
  // the graph — it has no in-place seek).
  // `override` exists for the Record path: it turns lock-pitch off and starts
  // playback in the same tick, so the `lockPitch`/`params` captured in this
  // closure are still the pre-Record values. Passing the intended params
  // explicitly avoids starting one render behind.
  const startAt = useCallback(
    (offset: number, override?: { params: RemixParams }) => {
      if (!buffer) return;
      const AudioContextClass = getAudioContextClass();
      if (!AudioContextClass) {
        setStatus({ title: t("remix.playbackUnavailableTitle"), message: t("remix.playbackUnavailableMessage"), tone: "warning" });
        return;
      }

      const effectiveParams = override?.params ?? params;
      const effectiveLock = effectiveParams.lockPitch;
      const playBuffer = effectiveLock ? stretchedBufferRef.current ?? buffer : buffer;
      const ctx = new AudioContextClass();
      const graph = buildRemixGraph(ctx, playBuffer, effectiveParams, offset);
      graph.source.onended = () => {
        if (graphRef.current === graph) {
          graphRef.current = null;
          setPlaying(false);
          setStartOffset(0);
          startOffsetRef.current = 0;
          // The track ran out: bank the final clock reading and close the
          // take, keeping whatever was captured.
          if (recordingRef.current) {
            finishTakeRef.current(recordBaseRef.current + (ctx.currentTime - recordStartedAtRef.current));
          }
        }
      };
      audioCtxRef.current = ctx;
      graphRef.current = graph;
      startedAtRef.current = ctx.currentTime;
      recordStartedAtRef.current = ctx.currentTime;
      startOffsetRef.current = offset;
      speedMultiplierRef.current = effectiveLock ? 1 : effectiveParams.speed;
      bufferDurationRef.current = playBuffer.duration;
      setPlaying(true);
    },
    [buffer, params, t],
  );

  // Closes the in-progress take and files it. Never touches earlier takes —
  // that's the whole point: a second Record must not cost you the first pass.
  const finishTake = useCallback(
    (outDuration: number) => {
      recordingRef.current = false;
      setRecording(false);
      const base = takeBaseRef.current;
      if (!base) return;
      const n = takeCounterRef.current + 1;
      takeCounterRef.current = n;
      const take: RemixTake = {
        id: `take-${n}`,
        label: t("remix.takeLabel", { n }),
        base,
        events: eventsRef.current,
        startOffset: takeStartOffsetRef.current,
        outDuration,
      };
      setTakes((prev) => [...prev, take]);
      setSelectedTakeId(take.id);
      eventsRef.current = [];
      takeBaseRef.current = null;
      setMoveCount(0);
    },
    [t],
  );
  finishTakeRef.current = finishTake;

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    finishTake(getOutputTime());
  }, [finishTake, getOutputTime]);

  // Recording starts wherever the playhead already is — you can drop an effect
  // in at 1:30 without replaying the intro. Event timestamps stay relative to
  // the take's own start (output seconds from zero); the take remembers the
  // SONG position it began at so the render can place them correctly.
  const startRecording = useCallback(() => {
    if (!buffer) return;
    // lockPitch routes through SoundTouch offline rather than an AudioParam,
    // so it cannot be automated. Rather than fake it, turn it off and say so —
    // with it off, speed and pitch couple, which IS the slowed/nightcore move
    // and does automate (via source.playbackRate).
    const lockWasOn = lockPitch;
    const base: RemixParams = { ...params, lockPitch: false, speed, reverb, bassBoostDb, reverbType, reverbEq, effect };

    // Where we are in the track right now. `getElapsed()` is a position in the
    // buffer currently PLAYING — with lock-pitch on that's the time-stretched
    // copy, whose timeline runs at 1/speed of the original. Recording drops
    // lock-pitch and plays the original buffer, so convert the position back.
    const playHead = playing ? getElapsed() : startOffset;
    const songPos = Math.min(Math.max(0, lockWasOn ? playHead * speed : playHead), Math.max(0, buffer.duration - 0.001));

    if (lockWasOn) setLockPitch(false);

    stopPreview();
    eventsRef.current = [];
    takeBaseRef.current = base;
    takeStartOffsetRef.current = songPos;
    setMoveCount(0);
    setRecordElapsed(0);
    recordBaseRef.current = 0;
    setStartOffset(songPos);
    startOffsetRef.current = songPos;
    recordingRef.current = true;
    setRecording(true);
    startAt(songPos, { params: base });

    setStatus(
      lockWasOn
        ? { title: t("remix.lockPitchOffTitle"), message: t("remix.lockPitchOffMessage"), tone: "warning" }
        : { title: t("remix.recordingTitle"), message: t("remix.recordingMessage"), tone: "neutral" },
    );
  }, [
    buffer, lockPitch, params, speed, reverb, bassBoostDb, reverbType, reverbEq, effect,
    playing, getElapsed, startOffset, stopPreview, startAt, t,
  ]);

  const deleteTake = useCallback((id: string) => {
    setTakes((prev) => prev.filter((take) => take.id !== id));
    // Dropping the active take falls back to the static export rather than
    // silently promoting a different pass.
    setSelectedTakeId((current) => (current === id ? null : current));
  }, []);

  // Clicking the active take deselects it, which is how you get back to a
  // plain static export without deleting anything.
  const toggleTake = useCallback((id: string) => {
    setSelectedTakeId((current) => (current === id ? null : id));
  }, []);

  // Static text, ticked a few times a second — no animation, just a readout.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecordElapsed(getOutputTime()), 250);
    return () => clearInterval(id);
  }, [recording, getOutputTime]);

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
      stopPreview();
      return;
    }
    startRecording();
  };

  const togglePlayback = async () => {
    if (playing) {
      stopRecording();
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
      // A selected take exports its moves; otherwise it's the plain static
      // render of wherever the controls currently sit.
      if (!recording && selectedTake) {
        setStatus({ title: t("remix.rendering"), message: t("remix.renderingMovesMessage"), tone: "neutral" });
        const { channels, sampleRate } = await renderRemixAutomated(
          buffer,
          selectedTake.base,
          selectedTake.events,
          selectedTake.startOffset,
        );
        const baseName = file.name.replace(/\.[^.]+$/, "") || "tunebad-audio";
        let blob: Blob;
        if (format === "wav") {
          blob = encodeWavFromChannels(channels, sampleRate);
          downloadBlob(blob, `${baseName}-remix.wav`);
        } else {
          blob = await encodeMp3FromChannels(channels, sampleRate, 320);
          downloadBlob(blob, `${baseName}-remix.mp3`);
        }
        setStatus({ title: t("remix.doneTitle"), message: t("remix.doneMessage", { format: format.toUpperCase() }), tone: "success" });
        return;
      }

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
  const activePreset = PRESETS.find((preset) => matchesPreset(preset, speed, reverb, bassBoostDb, effect));

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
              disabled={reprocessing || recording}
            />
          </div>

          {/* Recording transport. Seeking is disabled above while recording:
              the timeline is output seconds from zero, and a mid-recording
              seek would put the render's source somewhere the timestamps
              can't describe. */}
          <div className="remix-record-row">
            <button
              className="secondary-button"
              type="button"
              onClick={toggleRecording}
              disabled={!buffer || working || reprocessing}
              aria-pressed={recording}
            >
              {recording ? t("remix.stopRecording") : t("remix.record")}
            </button>
            {recording && (
              <span className="remix-record-readout" role="status">
                {t("remix.recordingReadout", { time: formatTime(recordElapsed), count: moveCount })}
              </span>
            )}
          </div>

          <p className="tool-note">{t("remix.recordExplainer")}</p>

          {takes.length > 0 && (
            <div className="remix-takes">
              <span className="field-label" id="takesLegend">
                {t("remix.takesLegend")}
              </span>
              <div className="remix-take-list" role="group" aria-labelledby="takesLegend">
                {takes.map((take) => (
                  <div key={take.id} className="remix-take-row">
                    <button
                      type="button"
                      className={`quality-button${selectedTakeId === take.id ? " active" : ""}`}
                      aria-pressed={selectedTakeId === take.id}
                      onClick={() => toggleTake(take.id)}
                      disabled={recording || working}
                    >
                      <strong>{take.label}</strong>
                      <span>
                        {t("remix.takeSummary", {
                          time: formatTime(take.outDuration),
                          count: take.events.length,
                          start: formatTime(take.startOffset),
                        })}
                      </span>
                    </button>
                    <button
                      className="text-button danger-pill"
                      type="button"
                      onClick={() => deleteTake(take.id)}
                      disabled={recording || working}
                    >
                      {t("remix.deleteTake")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                setSpeed(next);
                recordMove({ kind: "speed", value: next });
              }}
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
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setReverb(next);
                recordMove({ kind: "reverb", value: next });
              }}
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
                  onClick={() => handleReverbTypeChange(type)}
                >
                  <strong>{t(labelKey)}</strong>
                </button>
              ))}
            </div>

            <span className="field-label" id="effectLegend">
              {t("remix.effectLegend")}
            </span>
            <div className="quality-options reverb-eq-types remix-effect-types" role="group" aria-labelledby="effectLegend">
              {EFFECT_OPTIONS.map(({ effect: id, labelKey }) => (
                <button
                  key={id}
                  type="button"
                  className={`quality-button${effect === id ? " active" : ""}`}
                  aria-pressed={effect === id}
                  onClick={() => handleEffectChange(id)}
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
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                setBassBoostDb(next);
                recordMove({ kind: "bassBoostDb", value: next });
              }}
            />
          </div>

          {/* Lock-pitch is unavailable while recording: it time-stretches the
              buffer through SoundTouch rather than driving an AudioParam, so
              there is nothing to automate. */}
          <div className="remix-pitch-row">
            <CheckRow checked={lockPitch} onChange={setLockPitch} disabled={recording}>
              {t("remix.lockPitch")}
            </CheckRow>
            <input
              className="remix-slider"
              type="range"
              min={-12}
              max={12}
              step={1}
              value={pitchSemitones}
              disabled={!lockPitch || recording}
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
            <button
              className="convert-button"
              type="button"
              onClick={() => void onExport()}
              disabled={working || reprocessing || recording}
            >
              {working
                ? t("remix.rendering")
                : selectedTake
                  ? t("remix.exportTakeFormat", { take: selectedTake.label, format: format.toUpperCase() })
                  : t("remix.exportFormat", { format: format.toUpperCase() })}
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
