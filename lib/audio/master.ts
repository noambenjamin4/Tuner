// Audio mastering engine: an in-browser "auto-master" chain rendered with an
// OfflineAudioContext at 48 kHz (the sample rate integratedLoudness from
// lufs.ts requires), followed by a loudness-normalization pre-gain and a
// feed-forward peak limiter. Two modes share the same pipeline:
//   - Target auto-master: a tonal EQ from a fixed STYLE preset plus glue
//     compression, normalized to a LUFS target.
//   - Reference match: the tonal EQ instead follows a per-band curve the
//     caller derives from a reference track (analyzeBandCurve on the reference
//     minus analyzeBandCurve on the source), so the master leans toward the
//     reference's tonal balance and loudness.
// This is an automated master, not a substitute for a mastering engineer.

import { integratedLoudness } from "./lufs";
import { nextPaint, type StageReporter } from "./stages";

const RENDER_RATE = 48000;

export type MasterStyle = "balanced" | "warm" | "bright" | "punchy";

// Per-band target EQ moves, in dB, applied by the 5-band tonal EQ below.
export interface MasterBandCurve {
  subDb: number;
  bassDb: number;
  lowMidDb: number;
  highMidDb: number;
  airDb: number;
}

export interface MasterParams {
  /** Integrated-loudness target in LUFS (e.g. -14 streaming, -9 loud). */
  targetLufs: number;
  /** Tonal preset; ignored when referenceCurve is present. */
  style: MasterStyle;
  /** When set (reference-match mode), overrides the preset/style curve. */
  referenceCurve?: MasterBandCurve | null;
  /** Genre-preset tonal curve; overrides the style but yields to a reference. */
  presetCurve?: MasterBandCurve | null;
  /** Stereo widening amount 0-100 (mid/side side-gain boost); 0 = untouched. */
  widen?: number;
  /**
   * Optional progress reporter, called as each phase BEGINS ("rendering" ->
   * "normalizing" -> "measuringOutput"). Attaching one also makes renderMaster
   * yield a frame after each report so the caller's label can paint before the
   * synchronous meter/limiter phases block the main thread. Omit it and the
   * render runs exactly as before, with no added latency.
   */
  onStage?: StageReporter;
}

export interface MasterMetrics {
  /** Integrated loudness of the final master, LUFS. */
  outputLufs: number;
  /** 4x-oversampled true peak of the final master, dBTP. */
  truePeakDb: number;
  /** Crest factor (peak / RMS) of the final master, dB — a dynamics readout. */
  dynamicRangeDb: number;
}

export interface RenderedAudio extends MasterMetrics {
  channels: Float32Array[];
  sampleRate: number;
}

// Fixed tonal presets (relative dB moves per band). "balanced" is a no-op EQ:
// just glue compression + loudness normalization.
const STYLE_CURVES: Record<MasterStyle, MasterBandCurve> = {
  balanced: { subDb: 0, bassDb: 0, lowMidDb: 0, highMidDb: 0, airDb: 0 },
  warm: { subDb: 1.5, bassDb: 1, lowMidDb: 0.5, highMidDb: -1.5, airDb: -1 },
  bright: { subDb: 0, bassDb: -0.5, lowMidDb: -0.5, highMidDb: 1.5, airDb: 2.5 },
  punchy: { subDb: 1, bassDb: 2, lowMidDb: -1, highMidDb: 1, airDb: 1 },
};

const BAND_CLAMP_DB = 6;
const PRE_GAIN_MIN_DB = -12;
const PRE_GAIN_MAX_DB = 24;
const CEILING_DB = -1.0;

function clampBand(db: number): number {
  return Math.max(-BAND_CLAMP_DB, Math.min(BAND_CLAMP_DB, db));
}

function effectiveCurve(params: MasterParams): MasterBandCurve {
  const raw = params.referenceCurve ?? params.presetCurve ?? STYLE_CURVES[params.style] ?? STYLE_CURVES.balanced;
  return {
    subDb: clampBand(raw.subDb),
    bassDb: clampBand(raw.bassDb),
    lowMidDb: clampBand(raw.lowMidDb),
    highMidDb: clampBand(raw.highMidDb),
    airDb: clampBand(raw.airDb),
  };
}

// Builds the L/R pair integratedLoudness expects (mono passes the same array
// twice) and measures integrated loudness. Callers render at 48 kHz, so this
// just forwards; it throws via integratedLoudness if the rate is wrong.
export function measureLufs(channels: Float32Array[], sampleRate: number): number {
  const left = channels[0];
  const right = channels[1] ?? channels[0];
  return integratedLoudness(left, right, sampleRate);
}

export async function renderMaster(buffer: AudioBuffer, params: MasterParams): Promise<RenderedAudio> {
  // Reports a phase and gives the browser a frame to paint it. A no-op (and
  // zero added latency) when the caller passed no reporter.
  const stage = async (name: Parameters<StageReporter>[0]) => {
    if (!params.onStage) return;
    params.onStage(name);
    await nextPaint();
  };

  const curve = effectiveCurve(params);
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const length = Math.ceil(buffer.duration * RENDER_RATE);
  const offline = new OfflineAudioContext(numberOfChannels, length, RENDER_RATE);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  // Rumble cleanup.
  const highPass = offline.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 30;
  highPass.Q.value = 0.7;

  // 5-band tonal EQ driven by the effective band curve.
  const sub = offline.createBiquadFilter();
  sub.type = "lowshelf";
  sub.frequency.value = 60;
  sub.gain.value = curve.subDb;

  const bass = offline.createBiquadFilter();
  bass.type = "peaking";
  bass.frequency.value = 120;
  bass.Q.value = 1;
  bass.gain.value = curve.bassDb;

  const lowMid = offline.createBiquadFilter();
  lowMid.type = "peaking";
  lowMid.frequency.value = 500;
  lowMid.Q.value = 1;
  lowMid.gain.value = curve.lowMidDb;

  const highMid = offline.createBiquadFilter();
  highMid.type = "peaking";
  highMid.frequency.value = 3500;
  highMid.Q.value = 1;
  highMid.gain.value = curve.highMidDb;

  const air = offline.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 10000;
  air.gain.value = curve.airDb;

  // Gentle "glue" compression.
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 30;
  comp.ratio.value = 2;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  source.connect(highPass);
  highPass.connect(sub);
  sub.connect(bass);
  bass.connect(lowMid);
  lowMid.connect(highMid);
  highMid.connect(air);
  air.connect(comp);
  comp.connect(offline.destination);
  source.start();

  await stage("rendering");
  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }

  // Optional stereo widening (mid/side) before normalization so the limiter
  // and loudness pass account for the level change it introduces.
  if (params.widen && channels.length === 2) applyStereoWidth(channels, params.widen);

  // Loudness normalization: measure, then pre-gain toward the target (clamped
  // to a sane range so a near-silent or already-hot track can't be shoved to
  // an extreme).
  await stage("normalizing");
  const measured = measureLufs(channels, RENDER_RATE);
  let gainDb = params.targetLufs - measured;
  gainDb = Math.max(PRE_GAIN_MIN_DB, Math.min(PRE_GAIN_MAX_DB, gainDb));
  const preGain = 10 ** (gainDb / 20);
  if (preGain !== 1) {
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i += 1) channel[i] *= preGain;
    }
  }

  // Sample-peak limiter catches the bulk of the transients the pre-gain
  // created; the true-peak stage then guarantees the ceiling holds on the
  // inter-sample peaks that lossy playback reconstructs (real dBTP safety).
  limitPeaks(channels, RENDER_RATE, CEILING_DB);
  const truePeakDb = truePeakLimit(channels, CEILING_DB);

  await stage("measuringOutput");
  return {
    channels,
    sampleRate: RENDER_RATE,
    outputLufs: measureLufs(channels, RENDER_RATE),
    truePeakDb,
    dynamicRangeDb: crestFactorDb(channels),
  };
}

// Measures a source buffer's integrated loudness by rendering it unprocessed
// to 48 kHz (the rate the BS.1770 meter requires) and metering. Used for the
// "input" LUFS readout and the loudness-matched A/B compare.
export async function measureIntegratedLufs(buffer: AudioBuffer): Promise<number> {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const length = Math.ceil(buffer.duration * RENDER_RATE);
  const offline = new OfflineAudioContext(numberOfChannels, length, RENDER_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c += 1) channels.push(rendered.getChannelData(c));
  return measureLufs(channels, RENDER_RATE);
}

// Mid/side stereo widener: boosts the side (difference) signal so the image
// spreads. widen 0-100 maps to a side gain of 1x-2x. In place, stereo only.
function applyStereoWidth(channels: Float32Array[], widen: number): void {
  const amount = Math.max(0, Math.min(100, widen)) / 100;
  if (amount === 0) return;
  const sideGain = 1 + amount;
  const left = channels[0];
  const right = channels[1];
  for (let i = 0; i < left.length; i += 1) {
    const mid = (left[i] + right[i]) * 0.5;
    const side = (left[i] - right[i]) * 0.5 * sideGain;
    left[i] = mid + side;
    right[i] = mid - side;
  }
}

// 4x-oversampled true-peak safety: estimates inter-sample peaks with cubic
// (Catmull-Rom) interpolation and, if the true peak exceeds the ceiling,
// applies a single static trim so it lands exactly at it. Returns the final
// true peak in dBTP.
function truePeakLimit(channels: Float32Array[], ceilingDb: number): number {
  const ceiling = 10 ** (ceilingDb / 20);
  let tp = oversampledPeak(channels, 4);
  if (tp > ceiling && tp > 0) {
    const scale = ceiling / tp;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i += 1) channel[i] *= scale;
    }
    tp = ceiling;
  }
  return tp > 0 ? 20 * Math.log10(tp) : -120;
}

function oversampledPeak(channels: Float32Array[], factor: number): number {
  let peak = 0;
  for (const ch of channels) {
    const n = ch.length;
    const at = (i: number) => (i < 0 ? ch[0] : i >= n ? ch[n - 1] : ch[i]);
    for (let i = 0; i < n; i += 1) {
      const base = Math.abs(ch[i]);
      if (base > peak) peak = base;
      const p0 = at(i - 1);
      const p1 = ch[i];
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      for (let k = 1; k < factor; k += 1) {
        const tt = k / factor;
        const a0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
        const a1 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
        const a2 = -0.5 * p0 + 0.5 * p2;
        const v = ((a0 * tt + a1) * tt + a2) * tt + p1;
        const av = Math.abs(v);
        if (av > peak) peak = av;
      }
    }
  }
  return peak;
}

// Crest factor (peak / RMS) in dB across all channels — a simple dynamics
// readout: higher = punchier/more dynamic, lower = more compressed.
function crestFactorDb(channels: Float32Array[]): number {
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
      sumSq += channel[i] * channel[i];
      count += 1;
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, count));
  if (rms <= 0 || peak <= 0) return 0;
  return 20 * Math.log10(peak / rms);
}

// Feed-forward peak limiter with instantaneous attack and a 50 ms exponential
// release, applied in place. Catches the peaks the pre-gain can create.
function limitPeaks(channels: Float32Array[], sampleRate: number, ceilingDb: number): void {
  if (!channels.length || !channels[0].length) return;
  const ceiling = 10 ** (ceilingDb / 20);
  const releaseCoef = Math.exp(-1 / (0.05 * sampleRate));
  const numSamples = channels[0].length;
  let gain = 1;
  for (let i = 0; i < numSamples; i += 1) {
    let peak = 0;
    for (const channel of channels) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
    const desired = peak > ceiling ? ceiling / peak : 1;
    gain = desired < gain ? desired : desired + (gain - desired) * releaseCoef;
    for (const channel of channels) channel[i] *= gain;
  }
}

// --- Spectral band analysis (for reference matching) -----------------------

const FFT_SIZE = 8192;

// Iterative in-place radix-2 Cooley-Tukey FFT. `re`/`im` are length FFT_SIZE.
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k += 1) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half];
        const bIm = im[i + k + half];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + half] = aRe - tRe;
        im[i + k + half] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// Sums all channels of a buffer to a single mono Float32Array.
function monoSum(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) out[i] += data[i] / channels;
  }
  return out;
}

// Band edges in Hz: sub 20-60, bass 60-250, lowMid 250-2000, highMid
// 2000-6000, air 6000-20000.
const BAND_EDGES: [number, number][] = [
  [20, 60],
  [60, 250],
  [250, 2000],
  [2000, 6000],
  [6000, 20000],
];

// Measures a buffer's per-band level in dB, broadband-normalized: each band's
// average magnitude is converted to dB, then the mean of the 5 band dB values
// is subtracted so the result is a relative tonal tilt (not absolute level).
// Uses overlapping Hann-windowed FFT_SIZE frames averaged across the track.
export function analyzeBandCurve(buffer: AudioBuffer): MasterBandCurve {
  const zero: MasterBandCurve = { subDb: 0, bassDb: 0, lowMidDb: 0, highMidDb: 0, airDb: 0 };
  const mono = monoSum(buffer);
  const sampleRate = buffer.sampleRate;
  if (mono.length === 0) return zero;

  // Hann window, precomputed once.
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }

  const magSum = new Float32Array(FFT_SIZE / 2);
  const hop = FFT_SIZE / 2;
  let frames = 0;

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  // Guard for tracks shorter than one frame: analyze a single zero-padded frame.
  const lastStart = mono.length >= FFT_SIZE ? mono.length - FFT_SIZE : 0;
  for (let start = 0; start <= lastStart; start += hop) {
    im.fill(0);
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const idx = start + i;
      re[i] = idx < mono.length ? mono[idx] * window[i] : 0;
    }
    fft(re, im);
    for (let k = 0; k < FFT_SIZE / 2; k += 1) {
      magSum[k] += Math.hypot(re[k], im[k]);
    }
    frames += 1;
    if (mono.length < FFT_SIZE) break;
  }
  if (frames === 0) return zero;

  const binHz = sampleRate / FFT_SIZE;
  const bandDb: number[] = BAND_EDGES.map(([lo, hi]) => {
    const kLo = Math.max(1, Math.floor(lo / binHz));
    const kHi = Math.min(FFT_SIZE / 2 - 1, Math.ceil(hi / binHz));
    let sum = 0;
    let count = 0;
    for (let k = kLo; k <= kHi; k += 1) {
      sum += magSum[k] / frames;
      count += 1;
    }
    const avg = count > 0 ? sum / count : 0;
    return avg > 0 ? 20 * Math.log10(avg) : -120;
  });

  const mean = bandDb.reduce((a, b) => a + b, 0) / bandDb.length;
  return {
    subDb: bandDb[0] - mean,
    bassDb: bandDb[1] - mean,
    lowMidDb: bandDb[2] - mean,
    highMidDb: bandDb[3] - mean,
    airDb: bandDb[4] - mean,
  };
}
