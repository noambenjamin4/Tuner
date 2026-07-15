// Pure DSP for the Slowed + Reverb studio: speed/pitch, convolution reverb,
// and a bass-boosting low shelf. No React here — see components/remix/RemixStudio.tsx
// for the UI that wires this graph up to the transport controls.

// soundtouchjs ships no type declarations, so we import it with a suppressed
// check and describe the small slice of its API this file uses (SoundTouch
// tempo/pitch processor and the SimpleFilter that pulls stretched frames
// from a source object) via casts below. It's also a sizeable dependency only
// needed by the pitch-lock/time-stretch path, so it's loaded dynamically (and
// cached) the first time `timeStretch` actually runs, instead of being part
// of the main bundle.
interface SoundTouchInstance {
  tempo: number;
  pitch: number;
  pitchOctaves: number;
  pitchSemitones: number;
  rate: number;
}

interface SoundTouchSource {
  extract(target: Float32Array, numFrames: number, position: number): number;
}

interface SimpleFilterInstance {
  extract(target: Float32Array, numFrames: number): number;
  sourcePosition: number;
}

type SoundTouchCtorType = new () => SoundTouchInstance;
type SimpleFilterCtorType = new (
  sourceSound: SoundTouchSource,
  pipe: SoundTouchInstance,
  callback?: () => void,
) => SimpleFilterInstance;

// soundtouchjs has no bundled or published type declarations, so the dynamic
// import is suppressed the same way the old static import was.
function importSoundTouchJs(): Promise<any> {
  // @ts-expect-error - soundtouchjs has no bundled or published type declarations
  return import("soundtouchjs");
}

let soundTouchModulePromise: Promise<{ SoundTouchCtor: SoundTouchCtorType; SimpleFilterCtor: SimpleFilterCtorType }> | null = null;

function loadSoundTouch(): Promise<{ SoundTouchCtor: SoundTouchCtorType; SimpleFilterCtor: SimpleFilterCtorType }> {
  if (!soundTouchModulePromise) {
    soundTouchModulePromise = importSoundTouchJs().then((SoundTouchJs) => ({
      SoundTouchCtor: SoundTouchJs.SoundTouch as unknown as SoundTouchCtorType,
      SimpleFilterCtor: SoundTouchJs.SimpleFilter as unknown as SimpleFilterCtorType,
    }));
  }
  return soundTouchModulePromise;
}

// Reverb characters: each is an impulse-response recipe (length + decay rate),
// and "saturated" additionally drives the wet signal through a soft clipper.
export type ReverbType = "room" | "plate" | "hall" | "cathedral" | "saturated";

export const REVERB_TYPES: Record<ReverbType, { seconds: number; decay: number; drive: number }> = {
  room: { seconds: 0.9, decay: 6, drive: 0 },
  plate: { seconds: 1.8, decay: 4.5, drive: 0 },
  hall: { seconds: 2.8, decay: 3.5, drive: 0 },
  cathedral: { seconds: 5.5, decay: 2.2, drive: 0 },
  saturated: { seconds: 2.8, decay: 3.0, drive: 3 },
};

// Parametric EQ applied to the WET (reverb) path only, so the reverb can sit
// in just the highs, just the lows, or any shape in between. Neutral defaults
// leave the sound untouched.
export interface ReverbEqParams {
  highpassHz: number; // 20 = off
  lowpassHz: number; // 20000 = off
  lowShelf: { hz: number; db: number };
  peak: { hz: number; db: number };
  highShelf: { hz: number; db: number };
}

export const NEUTRAL_REVERB_EQ: ReverbEqParams = {
  highpassHz: 20,
  lowpassHz: 20000,
  lowShelf: { hz: 150, db: 0 },
  peak: { hz: 1000, db: 0 },
  highShelf: { hz: 6000, db: 0 },
};

// Character effects: a fixed chain (highpass -> lowpass -> drive ->
// waveshaper) crossfaded against the clean signal. BiquadFilterNode.type is
// not an AudioParam, so the filter TYPES stay put and only frequency/gain are
// automated — that's what makes these presets reachable from a timeline.
// `level` is post-shaper makeup: the shared tanh curve has a small-signal gain
// of ~3x, and each preset's bandpass throws away a different amount of energy,
// so the levels below are tuned per preset to land near the clean path's RMS.
export type EffectId = "none" | "underwater" | "phone" | "lofi";

export interface EffectPreset {
  highpassHz: number;
  lowpassHz: number;
  drive: number;
  level: number;
}

// Input gain into the shared waveshaper curve. High enough that the curve has
// flattened by the time the input reaches ±1 (tanh(3) = 0.995), so the
// WaveShaper's implicit clamp outside [-1, 1] is continuous with the curve's
// own asymptote instead of adding a hard-clip corner.
const FX_CURVE_DRIVE = 3;

// Levels below were measured, not guessed: a 200 Hz + 3 kHz tone pair was run
// through each preset and the surviving in-band tone compared against the
// clean path. These land it within ~1 dB, so a character reads as a FILTERED
// version of the track rather than a quieter one. Overall RMS still drops —
// that's the discarded band, which is the point of the effect. fxGain sits
// after the waveshaper, whose output is bounded to ±1, so these cannot clip.
export const EFFECTS: Record<EffectId, EffectPreset> = {
  none: { highpassHz: 20, lowpassHz: 20000, drive: 1, level: 0 },
  underwater: { highpassHz: 20, lowpassHz: 500, drive: 1, level: 0.42 },
  phone: { highpassHz: 400, lowpassHz: 3000, drive: 1.5, level: 0.36 },
  // Lo-fi: the tape/vinyl character — roll the sub off so it stops thumping,
  // roll the air off so it stops sparkling, and drive it enough to round the
  // transients. Deliberately gentler bounds than `phone`: lo-fi should still
  // sound like the song, just older and softer, where phone is a caricature.
  lofi: { highpassHz: 120, lowpassHz: 3800, drive: 2.2, level: 0.38 },
};

export interface RemixParams {
  speed: number;
  reverb: number;
  bassBoostDb: number;
  lockPitch: boolean;
  pitchSemitones: number;
  reverbType: ReverbType;
  reverbEq: ReverbEqParams;
  effect: EffectId;
}

// A short, exponentially-decaying noise burst used as the reverb's impulse
// response. Cheap to generate and avoids shipping a sample asset.
export function generateImpulseResponse(ctx: BaseAudioContext, seconds = 2.8, decay = 3.5): AudioBuffer {
  const length = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-decay * i) / length);
    }
  }
  return impulse;
}

// Soft-clip curve for the "saturated" reverb character (tanh drive).
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

/** The wet-path EQ chain, in series. Exposed so the UI can live-tweak nodes. */
export interface ReverbEqNodes {
  highpass: BiquadFilterNode;
  lowShelf: BiquadFilterNode;
  peak: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  lowpass: BiquadFilterNode;
}

export function applyReverbEqParams(nodes: ReverbEqNodes, eq: ReverbEqParams): void {
  nodes.highpass.frequency.value = eq.highpassHz;
  nodes.lowShelf.frequency.value = eq.lowShelf.hz;
  nodes.lowShelf.gain.value = eq.lowShelf.db;
  nodes.peak.frequency.value = eq.peak.hz;
  nodes.peak.gain.value = eq.peak.db;
  nodes.highShelf.frequency.value = eq.highShelf.hz;
  nodes.highShelf.gain.value = eq.highShelf.db;
  nodes.lowpass.frequency.value = eq.lowpassHz;
}

function buildReverbEqChain(ctx: BaseAudioContext, eq: ReverbEqParams): ReverbEqNodes {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.Q.value = 0.7;

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";

  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.Q.value = 1;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.7;

  const nodes = { highpass, lowShelf, peak, highShelf, lowpass };
  applyReverbEqParams(nodes, eq);

  highpass.connect(lowShelf);
  lowShelf.connect(peak);
  peak.connect(highShelf);
  highShelf.connect(lowpass);
  return nodes;
}

/**
 * The character-effect chain. `bassFilter` fans out into a clean path and an
 * effect path; `cleanGain`/`fxGain` crossfade between them. With effect
 * "none" the fx path is muted (fxGain 0) and the clean path is unity, so the
 * chain is transparent.
 */
export interface EffectNodes {
  cleanGain: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  drive: GainNode;
  shaper: WaveShaperNode;
  fxGain: GainNode;
}

export function applyEffectParams(nodes: EffectNodes, effect: EffectId): void {
  const preset = EFFECTS[effect] ?? EFFECTS.none;
  nodes.highpass.frequency.value = preset.highpassHz;
  nodes.lowpass.frequency.value = preset.lowpassHz;
  nodes.drive.gain.value = preset.drive;
  nodes.fxGain.gain.value = preset.level;
  nodes.cleanGain.gain.value = effect === "none" ? 1 : 0;
}

// Builds the clean/fx fan-out. `input` feeds both paths; both land on
// `output`. The waveshaper's curve is FIXED (a WaveShaper's curve is not an
// AudioParam either) — drive is the gain node in front of it.
function buildEffectChain(ctx: BaseAudioContext, input: AudioNode, output: AudioNode, effect: EffectId): EffectNodes {
  const cleanGain = ctx.createGain();

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.7;

  const drive = ctx.createGain();

  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve(FX_CURVE_DRIVE);
  shaper.oversample = "2x";

  const fxGain = ctx.createGain();

  const nodes = { cleanGain, highpass, lowpass, drive, shaper, fxGain };
  applyEffectParams(nodes, effect);

  input.connect(cleanGain);
  cleanGain.connect(output);

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(drive);
  drive.connect(shaper);
  shaper.connect(fxGain);
  fxGain.connect(output);

  return nodes;
}

// Wet/dry mix for the reverb send. Kept as a pure function so it can be unit
// tested without touching the Web Audio API.
export function remixGain(reverb: number): { wet: number; dry: number } {
  const amount = reverb / 100;
  return { wet: 0.65 * amount, dry: 1 - 0.35 * amount };
}

// Coupled-pitch display helper: when speed changes without pitch lock, the
// pitch shifts along with it (tape-style). Returns semitone offset.
export function coupledSemitones(speed: number): number {
  return 12 * Math.log2(speed);
}

export interface RemixGraph {
  source: AudioBufferSourceNode;
  dryGain: GainNode;
  wetGain: GainNode;
  bassFilter: BiquadFilterNode;
  reverbEq: ReverbEqNodes;
  effect: EffectNodes;
}

// Builds: source -> [dry gain, convolver (-> drive) -> reverb EQ -> wet gain]
// -> bass shelf -> [clean gain | effect chain -> fx gain] -> destination, and
// starts the source immediately (at `offset`
// seconds into the buffer). `offset` lets playback begin partway through the
// buffer, which is how scrubbing works for an AudioBufferSourceNode: it can't
// be seeked in place once started, so seeking means stopping and rebuilding
// this graph with a new offset. The caller can still live-update dryGain/
// wetGain/bassFilter/reverbEq/source.playbackRate afterward; changing the
// reverb TYPE requires a rebuild (the convolver's impulse response swaps).
export function buildRemixGraph(ctx: BaseAudioContext, buffer: AudioBuffer, params: RemixParams, offset = 0): RemixGraph {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = params.lockPitch ? 1 : params.speed;

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const { wet, dry } = remixGain(params.reverb);
  dryGain.gain.value = dry;
  wetGain.gain.value = wet;

  const type = REVERB_TYPES[params.reverbType] ?? REVERB_TYPES.hall;
  const convolver = ctx.createConvolver();
  convolver.buffer = generateImpulseResponse(ctx, type.seconds, type.decay);

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 200;
  bassFilter.gain.value = params.bassBoostDb;

  const reverbEq = buildReverbEqChain(ctx, params.reverbEq);

  source.connect(dryGain);
  source.connect(convolver);

  // Wet path: convolver (-> soft clipper for the saturated character) -> EQ -> wet gain.
  let wetTail: AudioNode = convolver;
  if (type.drive > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(type.drive);
    shaper.oversample = "2x";
    wetTail.connect(shaper);
    wetTail = shaper;
  }
  wetTail.connect(reverbEq.highpass);
  reverbEq.lowpass.connect(wetGain);

  dryGain.connect(bassFilter);
  wetGain.connect(bassFilter);
  const effect = buildEffectChain(ctx, bassFilter, ctx.destination, params.effect);

  const clampedOffset = Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.001));
  source.start(0, clampedOffset);

  return { source, dryGain, wetGain, bassFilter, reverbEq, effect };
}

// Renders the remix graph offline to raw channel data, ready for encoding.
// `buffer` should already be time-stretched by `timeStretch` when lockPitch is
// on (so playbackRate here only needs to apply the semitone shift's rate
// component - see below); when lockPitch is off, playbackRate carries the
// coupled speed change directly.
export async function renderRemix(
  buffer: AudioBuffer,
  params: RemixParams,
): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const effectiveSpeed = params.lockPitch ? 1 : params.speed;
  // Tail padding must cover the selected reverb type's impulse length.
  const tail = (REVERB_TYPES[params.reverbType] ?? REVERB_TYPES.hall).seconds;
  const length = Math.ceil((buffer.duration / effectiveSpeed + tail) * buffer.sampleRate);
  const offline = new OfflineAudioContext(numberOfChannels, length, buffer.sampleRate);

  buildRemixGraph(offline, buffer, params);

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  return { channels, sampleRate: rendered.sampleRate };
}

/* -------------------------------------------------------------------------
   Automation: recording the user's moves and replaying them into a render
   ------------------------------------------------------------------------- */

// `t` is elapsed OUTPUT time in seconds — wall-clock seconds since playback
// started, NOT a position in the source buffer. The two diverge the moment
// speed is automated (at 0.5x, 10s of output is 5s of song), and output time
// is the only reference that reproduces what the user actually heard.
export type AutomationEvent =
  | { t: number; kind: "speed"; value: number }
  | { t: number; kind: "reverb"; value: number }
  | { t: number; kind: "reverbType"; value: ReverbType }
  | { t: number; kind: "bassBoostDb"; value: number }
  | { t: number; kind: "effect"; value: EffectId }
  | { t: number; kind: "reverbEq"; value: ReverbEqParams };

// Crossfade length for the two things that can't be swapped in place: the
// reverb convolver (parallel convolvers, gain-faded) and the clean/fx split.
const XFADE_SECONDS = 0.03;
const MIN_SPEED = 0.01;

/** The speed the source actually runs at under `params` before any automation. */
export function baseEffectiveSpeed(params: RemixParams): number {
  return Math.max(MIN_SPEED, params.lockPitch ? 1 : params.speed);
}

/**
 * Where a take's t=0 sits on the FULL render's output timeline.
 *
 * A take can start partway into the song (song position `startOffset`), but
 * the render always plays the whole track from the beginning. Everything
 * before the take runs at the base params — constant speed — so the source
 * reaches song position S after `S / baseEffectiveSpeed` seconds of OUTPUT.
 * That, not S itself, is where the take's events begin.
 */
export function takeOutputStart(baseParams: RemixParams, startOffset: number): number {
  return Math.max(0, startOffset) / baseEffectiveSpeed(baseParams);
}

// Rebases take-relative event times onto the full render's output timeline.
// The spread needs a cast: TS widens `{...event, t}` over a union rather than
// distributing it, which would decouple each member's kind/value pair.
function shiftEvents(events: AutomationEvent[], offset: number): AutomationEvent[] {
  return events.map((event) => ({ ...event, t: offset + Math.max(0, event.t) }) as AutomationEvent);
}

/**
 * How long the automated render runs, in output seconds, before the reverb
 * tail. Speed is piecewise-constant over output time, so the source is
 * consumed at `speed` seconds-of-buffer per second-of-output; this walks the
 * segments until the buffer is used up. Pure — no Web Audio needed.
 */
export function automatedOutputDuration(bufferDuration: number, baseSpeed: number, events: AutomationEvent[]): number {
  const speedEvents = events
    .filter((event): event is Extract<AutomationEvent, { kind: "speed" }> => event.kind === "speed")
    .sort((a, b) => a.t - b.t);

  let remaining = bufferDuration;
  let speed = Math.max(MIN_SPEED, baseSpeed);
  let cursor = 0;

  for (const event of speedEvents) {
    const span = event.t - cursor;
    if (span > 0) {
      const consumed = speed * span;
      if (consumed >= remaining) return cursor + remaining / speed;
      remaining -= consumed;
      cursor = event.t;
    }
    speed = Math.max(MIN_SPEED, event.value);
  }

  return cursor + remaining / speed;
}

// Every reverb character the render might need, each on its own convolver and
// gain. Type automation is then just gain crossfades between parallel paths —
// a convolver's impulse response can't be swapped mid-render.
function buildParallelConvolvers(
  ctx: BaseAudioContext,
  source: AudioNode,
  wetSum: AudioNode,
  activeType: ReverbType,
): Record<ReverbType, GainNode> {
  const gains = {} as Record<ReverbType, GainNode>;
  for (const key of Object.keys(REVERB_TYPES) as ReverbType[]) {
    const type = REVERB_TYPES[key];
    const convolver = ctx.createConvolver();
    convolver.buffer = generateImpulseResponse(ctx, type.seconds, type.decay);
    source.connect(convolver);

    let tail: AudioNode = convolver;
    if (type.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = saturationCurve(type.drive);
      shaper.oversample = "2x";
      tail.connect(shaper);
      tail = shaper;
    }

    const gain = ctx.createGain();
    gain.gain.value = key === activeType ? 1 : 0;
    tail.connect(gain);
    gain.connect(wetSum);
    gains[key] = gain;
  }
  return gains;
}

// A 3-point approximation of an equal-power crossfade (both legs pass through
// ~0.707 at the midpoint rather than 0.5), which keeps the summed level from
// dipping across the swap. Linear ramps here are deliberate: this is a gain
// crossfade, the one place a ramp genuinely beats a jump.
function crossfade(from: AudioParam, to: AudioParam, start: number): void {
  const mid = start + XFADE_SECONDS / 2;
  const end = start + XFADE_SECONDS;

  from.setValueAtTime(1, start);
  from.linearRampToValueAtTime(Math.SQRT1_2, mid);
  from.linearRampToValueAtTime(0, end);

  to.setValueAtTime(0, start);
  to.linearRampToValueAtTime(Math.SQRT1_2, mid);
  to.linearRampToValueAtTime(1, end);
}

function scheduleReverbEq(nodes: ReverbEqNodes, eq: ReverbEqParams, t: number): void {
  nodes.highpass.frequency.setValueAtTime(eq.highpassHz, t);
  nodes.lowShelf.frequency.setValueAtTime(eq.lowShelf.hz, t);
  nodes.lowShelf.gain.setValueAtTime(eq.lowShelf.db, t);
  nodes.peak.frequency.setValueAtTime(eq.peak.hz, t);
  nodes.peak.gain.setValueAtTime(eq.peak.db, t);
  nodes.highShelf.frequency.setValueAtTime(eq.highShelf.hz, t);
  nodes.highShelf.gain.setValueAtTime(eq.highShelf.db, t);
  nodes.lowpass.frequency.setValueAtTime(eq.lowpassHz, t);
}

/**
 * Renders the remix with the user's recorded moves replayed over output time.
 *
 * Differs from `renderRemix` in two structural ways, both forced by things
 * that aren't AudioParams: all five reverb characters run as PARALLEL
 * convolvers (gain-crossfaded, since an impulse response can't be swapped
 * mid-render), and the effect chain's filter types are fixed while their
 * frequencies/drive are automated.
 *
 * `baseParams` is the state at the moment recording started; `events` are the
 * changes on top of it, timestamped in output seconds from the TAKE's start.
 * lockPitch is ignored here — it routes through SoundTouch offline rather than
 * an AudioParam, so it cannot be automated; the UI turns it off before
 * recording.
 *
 * `startOffset` is the SONG position the take began at. The whole track still
 * renders: audio before the take plays statically under `baseParams`, the
 * events land from `takeOutputStart()` onward, and whatever the take last set
 * simply persists to the end (no reset — that's what the user left it at).
 */
export async function renderRemixAutomated(
  buffer: AudioBuffer,
  baseParams: RemixParams,
  events: AutomationEvent[],
  startOffset = 0,
): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  // Rebase onto the full render's timeline ONCE, up front: duration and
  // scheduling below then both work in output time with no further offsetting.
  const ordered = shiftEvents(events, takeOutputStart(baseParams, startOffset)).sort((a, b) => a.t - b.t);

  // The tail has to cover the longest reverb the recording ever touches, not
  // just the one it ends on.
  const usedTypes: ReverbType[] = [baseParams.reverbType];
  for (const event of ordered) if (event.kind === "reverbType") usedTypes.push(event.value);
  const tail = Math.max(...usedTypes.map((type) => (REVERB_TYPES[type] ?? REVERB_TYPES.hall).seconds));

  const baseSpeed = baseEffectiveSpeed(baseParams);
  const outputDuration = automatedOutputDuration(buffer.duration, baseSpeed, ordered);
  const length = Math.ceil((outputDuration + tail) * buffer.sampleRate);
  const ctx = new OfflineAudioContext(numberOfChannels, length, buffer.sampleRate);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = baseSpeed;

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const { wet, dry } = remixGain(baseParams.reverb);
  dryGain.gain.value = dry;
  wetGain.gain.value = wet;

  const wetSum = ctx.createGain();
  const typeGains = buildParallelConvolvers(ctx, source, wetSum, baseParams.reverbType);

  const reverbEq = buildReverbEqChain(ctx, baseParams.reverbEq);
  wetSum.connect(reverbEq.highpass);
  reverbEq.lowpass.connect(wetGain);

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 200;
  bassFilter.gain.value = baseParams.bassBoostDb;

  source.connect(dryGain);
  dryGain.connect(bassFilter);
  wetGain.connect(bassFilter);

  const effectNodes = buildEffectChain(ctx, bassFilter, ctx.destination, baseParams.effect);

  // Walk the events in order, tracking the state each crossfade starts from.
  // `*FadeEnd` pushes a fade that lands on top of a still-running one out to
  // the previous fade's end, so the tracked "current value" is always a
  // settled value rather than a mid-ramp guess.
  let currentType = baseParams.reverbType;
  let typeFadeEnd = 0;
  let currentEffect = baseParams.effect;
  let effectFadeEnd = 0;

  for (const event of ordered) {
    const t = Math.max(0, event.t);
    switch (event.kind) {
      case "speed":
        // A jump, not a ramp: the user yanked the slider, so the render should
        // yank too.
        source.playbackRate.setValueAtTime(Math.max(MIN_SPEED, event.value), t);
        break;
      case "reverb": {
        const mix = remixGain(event.value);
        wetGain.gain.setValueAtTime(mix.wet, t);
        dryGain.gain.setValueAtTime(mix.dry, t);
        break;
      }
      case "bassBoostDb":
        bassFilter.gain.setValueAtTime(event.value, t);
        break;
      case "reverbEq":
        scheduleReverbEq(reverbEq, event.value, t);
        break;
      case "reverbType": {
        if (event.value === currentType) break;
        const start = Math.max(t, typeFadeEnd);
        crossfade(typeGains[currentType].gain, typeGains[event.value].gain, start);
        currentType = event.value;
        typeFadeEnd = start + XFADE_SECONDS;
        break;
      }
      case "effect": {
        if (event.value === currentEffect) break;
        const preset = EFFECTS[event.value] ?? EFFECTS.none;
        const start = Math.max(t, effectFadeEnd);

        // Filter/drive settings jump at the switch. When the fx path is
        // already audible the jump is masked by the crossfade below; when it
        // is muted (coming from "none") nothing is passing through it yet.
        effectNodes.highpass.frequency.setValueAtTime(preset.highpassHz, start);
        effectNodes.lowpass.frequency.setValueAtTime(preset.lowpassHz, start);
        effectNodes.drive.gain.setValueAtTime(preset.drive, start);

        const wasClean = currentEffect === "none";
        const isClean = event.value === "none";
        if (wasClean !== isClean) {
          // Crossing the clean/fx boundary: fade the two paths against each
          // other, and ride fxGain's makeup level along with it.
          if (isClean) {
            effectNodes.fxGain.gain.setValueAtTime(EFFECTS[currentEffect].level, start);
            effectNodes.fxGain.gain.linearRampToValueAtTime(0, start + XFADE_SECONDS);
            effectNodes.cleanGain.gain.setValueAtTime(0, start);
            effectNodes.cleanGain.gain.linearRampToValueAtTime(1, start + XFADE_SECONDS);
          } else {
            effectNodes.fxGain.gain.setValueAtTime(0, start);
            effectNodes.fxGain.gain.linearRampToValueAtTime(preset.level, start + XFADE_SECONDS);
            effectNodes.cleanGain.gain.setValueAtTime(1, start);
            effectNodes.cleanGain.gain.linearRampToValueAtTime(0, start + XFADE_SECONDS);
          }
        } else {
          // fx -> fx: the clean path stays muted, only the makeup level moves.
          effectNodes.fxGain.gain.setValueAtTime(EFFECTS[currentEffect].level, start);
          effectNodes.fxGain.gain.linearRampToValueAtTime(preset.level, start + XFADE_SECONDS);
        }

        currentEffect = event.value;
        effectFadeEnd = start + XFADE_SECONDS;
        break;
      }
    }
  }

  source.start(0, 0);

  const rendered = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  return { channels, sampleRate: rendered.sampleRate };
}

// Runs SoundTouch's tempo/pitch processor offline over an AudioBuffer's
// channel data. `tempo` changes duration (1/tempo x length); `pitchSemitones`
// shifts pitch independently of tempo. SoundTouch's internal pipeline needs a
// tail of silence fed through it to fully drain its overlap buffers, so we
// pad the source with ~1s of silence and stop once the extracted audio goes
// quiet for good.
export async function timeStretch(buffer: AudioBuffer, tempo: number, pitchSemitones: number): Promise<AudioBuffer> {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const left = buffer.getChannelData(0);
  const right = numberOfChannels > 1 ? buffer.getChannelData(1) : left;

  const padFrames = Math.round(sampleRate * 1);
  const totalSourceFrames = frameCount + padFrames;

  const source = {
    extract(target: Float32Array, numFrames: number, position: number): number {
      let extracted = 0;
      for (let i = 0; i < numFrames; i += 1) {
        const idx = position + i;
        if (idx >= totalSourceFrames) break;
        const l = idx < frameCount ? left[idx] : 0;
        const r = idx < frameCount ? right[idx] : 0;
        target[i * 2] = l;
        target[i * 2 + 1] = r;
        extracted += 1;
      }
      return extracted;
    },
  };

  const { SoundTouchCtor, SimpleFilterCtor } = await loadSoundTouch();
  const soundTouch = new SoundTouchCtor();
  soundTouch.tempo = tempo;
  soundTouch.pitchSemitones = pitchSemitones;

  const filter = new SimpleFilterCtor(source, soundTouch);
  const chunkFrames = 4096;
  const chunk = new Float32Array(chunkFrames * 2);

  // Preallocate the output arrays up front sized to a safe estimate
  // (ceil(inputFrames / tempo) plus generous slack for the drain tail), and
  // write extracted chunks directly into them at a running offset. This
  // avoids the two fresh Float32Array allocations per 4096-frame chunk that
  // the old chunk-array/concat approach required. We only grow-by-copy in
  // the rare case the estimate undershoots.
  let capacity = Math.max(chunkFrames, Math.ceil(totalSourceFrames / tempo) + sampleRate);
  let outLeft = new Float32Array(capacity);
  let outRight = new Float32Array(capacity);

  const ensureCapacity = (needed: number) => {
    if (needed <= capacity) return;
    let nextCapacity = capacity * 2;
    while (nextCapacity < needed) nextCapacity *= 2;
    const grownLeft = new Float32Array(nextCapacity);
    const grownRight = new Float32Array(nextCapacity);
    grownLeft.set(outLeft);
    grownRight.set(outRight);
    outLeft = grownLeft;
    outRight = grownRight;
    capacity = nextCapacity;
  };

  let totalExtracted = 0;
  let lastNonSilentFrame = 0;
  const maxIterations = 200_000;
  let iterations = 0;

  while (iterations < maxIterations) {
    const framesExtracted = filter.extract(chunk, chunkFrames);
    if (framesExtracted === 0) break;

    ensureCapacity(totalExtracted + framesExtracted);
    for (let i = 0; i < framesExtracted; i += 1) {
      const l = chunk[i * 2];
      const r = chunk[i * 2 + 1];
      outLeft[totalExtracted + i] = l;
      outRight[totalExtracted + i] = r;
      if (Math.abs(l) > 1e-6 || Math.abs(r) > 1e-6) {
        lastNonSilentFrame = totalExtracted + i + 1;
      }
    }
    totalExtracted += framesExtracted;
    iterations += 1;
  }

  // Trim to the last non-silent frame (drops the padding tail) but keep a
  // small margin so natural decay/reverb tails aren't clipped.
  const margin = Math.round(sampleRate * 0.05);
  const outputLength = Math.min(totalExtracted, lastNonSilentFrame + margin) || totalExtracted;

  outLeft = outLeft.subarray(0, outputLength);
  outRight = outRight.subarray(0, outputLength);

  const safeLength = Math.max(1, outputLength);

  if (typeof OfflineAudioContext !== "undefined") {
    const offline = new OfflineAudioContext(numberOfChannels, safeLength, sampleRate);
    const outputBuffer = offline.createBuffer(numberOfChannels, safeLength, sampleRate);
    outputBuffer.copyToChannel(outLeft as Float32Array<ArrayBuffer>, 0);
    if (numberOfChannels > 1) outputBuffer.copyToChannel(outRight as Float32Array<ArrayBuffer>, 1);
    return outputBuffer;
  }

  // Fallback (shouldn't be hit in-browser): construct via AudioContext.
  const AudioContextClass =
    typeof window !== "undefined"
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioContextClass) throw new Error("No AudioContext available for time-stretch output.");
  const ctx = new AudioContextClass();
  const outputBuffer = ctx.createBuffer(numberOfChannels, safeLength, sampleRate);
  outputBuffer.copyToChannel(outLeft as Float32Array<ArrayBuffer>, 0);
  if (numberOfChannels > 1) outputBuffer.copyToChannel(outRight as Float32Array<ArrayBuffer>, 1);
  void ctx.close();
  return outputBuffer;
}
