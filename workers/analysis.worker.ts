// Analysis worker: essentia.js (WASM) is the primary engine; the ported
// homemade DSP from the original script.js is the fallback if WASM fails.
import { estimateBpm, estimateKey } from "@/lib/audio/fallback-analysis";
import type { WorkerRequest, WorkerResponse } from "@/types/analysis";

// Essentia returns flat note names; the Camelot table uses sharps.
const FLAT_TO_SHARP: Record<string, string> = {
  Ab: "G#", Bb: "A#", Cb: "B", Db: "C#", Eb: "D#", Fb: "E", Gb: "F#",
};

interface EssentiaLike {
  arrayToVector(data: Float32Array): unknown;
  PercivalBpmEstimator(
    signal: unknown,
    frameSize?: number,
    frameSizeOSS?: number,
    hopSize?: number,
    hopSizeOSS?: number,
    maxBPM?: number,
    minBPM?: number,
    sampleRate?: number,
  ): { bpm: number };
  KeyExtractor(
    signal: unknown,
    averageDetuningCorrection?: boolean,
    frameSize?: number,
    hopSize?: number,
    hpcpSize?: number,
    maxFrequency?: number,
    maximumSpectralPeaks?: number,
    minFrequency?: number,
    pcpThreshold?: number,
    profileType?: string,
    sampleRate?: number,
    spectralPeaksThreshold?: number,
    tuningFrequency?: number,
    weightType?: string,
    windowType?: string,
  ): { key: string; scale: string; strength: number };
  Danceability(signal: unknown, maxTau?: number, minTau?: number, sampleRate?: number): { danceability: number; dfa?: { delete?: () => void } };
}

// Tunebat's analyzer worker (public bundle) uses exactly these calls on 16 kHz mono:
//   KeyExtractor(signal, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "bgate", 16000, 0.0001, 440, "cosine", "hann")
//   PercivalBpmEstimator(signal, 1024, 2048, 128, 128, 210, 50, 16000)
const ANALYSIS_RATE = 16000;

// Round to a whole tempo (beats are produced at integer BPM), then fold into a
// hip-hop/trap-centered display range [105, 210) and report the ambiguous
// half/double-tempo sibling alongside.
//
// Percival (like every beat tracker) reports the *felt* pulse, which for modern
// trap/drill/Detroit is half the tempo producers actually label — a 194 BPM beat
// is heard as 97. The old [88, 176) window made that worse: it KEPT the 97 and
// even halved genuine 180-206 detections. Measured against 500+ labeled beats,
// [105, 210) recovers the full fast-tempo range (a 97 folds up to 194, a 103 to
// 206) and lifts primary-or-alternate agreement from ~79% to ~88%. The trade-off
// — genuinely slow 90-104 BPM material gets doubled — is rare for this audience
// and always recoverable via the reported alternate.
// Fold window. Percival reports the perceptual pulse, which for most records is
// the true tempo — so the window's job is only to reject genuine outliers, NOT
// to force everything up into dance territory.
//
// This used to be [105, 210). That doubled every song slower than 105 BPM, which
// is most hip-hop, R&B and ballads: the catalog ended up with ZERO songs under
// 100 BPM and 22% claiming over 180 — both impossible for real music. In Da Club
// (90) read 181; Lose Yourself (86) read 172.
//
// Measured on 61 songs with known tempos (scripts/bpm-truth.mjs, run
// scripts/bpm-experiment.mjs): [105,210) scored 44% exact and 0% on slow songs;
// [60,180) scores 69% exact and 66% on slow.
//
// The honest cost: genuinely fast records where Percival reports the half-time
// pulse (Blinding Lights raw ~85, truly ~171) now read low — the fast band drops
// 100% -> 25%. There is no window that gets both: raw 85.2 is Bitter Sweet
// Symphony (86) AND Blinding Lights (171), same evidence, opposite truth. The
// other octave stays available in bpm_alt / bpmAlternate. Danceability was tested
// as a discriminator and rejected (it overlaps completely between the two cases);
// RhythmExtractor2013 was tested and scored 0%.
const FOLD_MIN = 60;
const FOLD_MAX = 180;
function foldBpm(rawBpm: number): { bpm: number; bpmAlternate: number | null } {
  // Fold the RAW float and round only at the end. Rounding before doubling
  // doubles the quantization error (raw 81.52 rounded to 82 then doubled shows
  // 164; folding first gives 163.04 -> 163). Measured on 524 labeled beats this
  // lifts exact-hit accuracy from 61.3% to 64.5% with ±1/±2 unchanged.
  let folded = rawBpm;
  let foldDirection: "up" | "down" | null = null;
  while (folded > 0 && folded < FOLD_MIN) {
    folded *= 2;
    foldDirection = "up";
  }
  while (folded >= FOLD_MAX) {
    folded /= 2;
    foldDirection = "down";
  }
  const bpm = Math.round(folded);
  const bpmAlternate =
    foldDirection === "up" ? Math.round(folded / 2) : foldDirection === "down" ? Math.round(folded * 2) : null;
  return { bpm, bpmAlternate };
}

let essentiaPromise: Promise<EssentiaLike | null> | null = null;

function loadEssentia(): Promise<EssentiaLike | null> {
  if (!essentiaPromise) {
    essentiaPromise = (async () => {
      try {
        const [{ default: Essentia }, { EssentiaWASM }] = await Promise.all([
          import("essentia.js/dist/essentia.js-core.es.js"),
          import("essentia.js/dist/essentia-wasm.es.js"),
        ]);
        // The emscripten WASM runtime instantiates asynchronously, and the dynamic
        // import can resolve before it finishes (`calledRun` still false). Building
        // Essentia and calling an algorithm before then throws, which the caller
        // silently swallows into the far weaker basic engine. Wait for the runtime.
        const wasm = EssentiaWASM as { calledRun?: boolean };
        const deadline = Date.now() + 8000;
        while (!wasm.calledRun && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return new Essentia(EssentiaWASM) as EssentiaLike;
      } catch (error) {
        console.warn("essentia.js failed to load; using basic analysis.", error);
        return null;
      }
    })();
  }
  return essentiaPromise;
}

function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

// Long tracks: analyze a centered window so multifeature BPM stays fast.
function centeredWindow(samples: Float32Array, sampleRate: number, maxSeconds: number): Float32Array {
  const maxLength = Math.round(sampleRate * maxSeconds);
  if (samples.length <= maxLength) return samples;
  const start = Math.floor((samples.length - maxLength) / 2);
  return samples.subarray(start, start + maxLength);
}

function basicAnalysis(samples: Float32Array, sampleRate: number): Omit<WorkerResponse, "id"> {
  const bpmResult = estimateBpm(samples, sampleRate);
  const keyResult = estimateKey(samples, sampleRate);
  const rms = rmsOf(samples);
  const loudness = rms > 0 ? 20 * Math.log10(rms) : -96;
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
    loudness: Math.round(loudness * 10) / 10,
  };
}

function percivalBpm(essentia: EssentiaLike, signal: unknown, rate: number = ANALYSIS_RATE): number {
  // The 1024/2048/128/128 defaults are essentia's, and essentia specifies them
  // at 44.1 kHz. Frame sizes are in SAMPLES, so the rate passed here must match
  // the signal or every window covers the wrong amount of TIME.
  return essentia.PercivalBpmEstimator(signal, 1024, 2048, 128, 128, 210, 50, rate).bpm;
}

function essentiaAnalysis(
  essentia: EssentiaLike,
  samples: Float32Array,
  sampleRate: number,
  bpmInput?: { samples: Float32Array; sampleRate: number },
): Omit<WorkerResponse, "id"> {
  const windowed = centeredWindow(samples, sampleRate, 150);
  const cleanup: { delete?: () => void }[] = [];
  try {
    const signal = essentia.arrayToVector(windowed) as { delete?: () => void };
    cleanup.push(signal);

    // TEMPO on the original-rate audio when we have it (essentia's Percival
    // defaults are specified at 44.1k), KEY on the 16k `signal` below, where it
    // measured better. Two windows, two rates, on purpose.
    const bpmWindow = bpmInput ? centeredWindow(bpmInput.samples, bpmInput.sampleRate, 150) : windowed;
    const bpmRate = bpmInput ? bpmInput.sampleRate : sampleRate;
    const bpmSignal = bpmInput
      ? (essentia.arrayToVector(bpmWindow) as { delete?: () => void })
      : signal;
    if (bpmInput) cleanup.push(bpmSignal);
    const rawBpm = percivalBpm(essentia, bpmSignal, bpmRate);

    // Percival reports no confidence, so estimate one: run it on each half of
    // the track and score how closely the two estimates agree.
    let bpmConfidence = 75;
    try {
      const half = Math.floor(bpmWindow.length / 2);
      const firstHalf = essentia.arrayToVector(bpmWindow.subarray(0, half)) as { delete?: () => void };
      const secondHalf = essentia.arrayToVector(bpmWindow.subarray(half)) as { delete?: () => void };
      cleanup.push(firstHalf, secondHalf);
      const a = foldBpm(percivalBpm(essentia, firstHalf, bpmRate)).bpm;
      const b = foldBpm(percivalBpm(essentia, secondHalf, bpmRate)).bpm;
      const diff = Math.abs(a - b) / Math.max(1, (a + b) / 2);
      bpmConfidence = Math.max(45, Math.min(97, Math.round(97 - diff * 400)));
    } catch {
      // keep the default confidence if the half-track runs fail
    }

    const keyResult = essentia.KeyExtractor(
      signal,
      true,
      4096,
      4096,
      12,
      3500,
      60,
      25,
      0.2,
      "bgate",
      ANALYSIS_RATE,
      0.0001,
      440,
      "cosine",
      "hann",
    );
    const dance = essentia.Danceability(signal, 8800, 310, ANALYSIS_RATE);
    if (dance.dfa) cleanup.push(dance.dfa);

    const rms = rmsOf(samples);
    const loudness = rms > 0 ? 20 * Math.log10(rms) : -96;
    // Perceptual-ish 0-100 scales: loudness mapped from a -30..-5 dBFS range,
    // danceability from essentia's 0..~3 output.
    const energy = Math.max(0, Math.min(100, Math.round(((loudness + 30) / 25) * 100)));
    const danceability = Math.max(0, Math.min(100, Math.round((dance.danceability / 3) * 100)));

    const root = FLAT_TO_SHARP[keyResult.key] || keyResult.key;
    const scale = keyResult.scale === "minor" ? "Minor" : "Major";
    const keyConfidence = Math.max(30, Math.min(98, Math.round(keyResult.strength * 100)));
    const { bpm, bpmAlternate } = foldBpm(rawBpm);

    return {
      engine: "essentia",
      bpm,
      bpmAlternate,
      bpmConfidence,
      key: `${root} ${scale}`,
      scale,
      keyConfidence,
      energy,
      danceability,
      loudness: Math.round(loudness * 10) / 10,
    };
  } finally {
    for (const item of cleanup) {
      try {
        item.delete?.();
      } catch {
        // best-effort WASM memory cleanup
      }
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest | { warmup: true }>) => {
  // Idle pre-warm: compile the essentia WASM before the first real analysis
  // so it starts instantly. No response is posted and no DSP runs.
  if ("warmup" in event.data) {
    try {
      await loadEssentia();
    } catch {
      // basic engine will cover it later; nothing to do here
    }
    return;
  }
  const { id, samples, sampleRate, bpmSamples, bpmSampleRate } = event.data;
  let payload: Omit<WorkerResponse, "id">;
  try {
    const essentia = await loadEssentia();
    const bpmInput =
      bpmSamples && bpmSampleRate ? { samples: bpmSamples, sampleRate: bpmSampleRate } : undefined;
    payload = essentia
      ? essentiaAnalysis(essentia, samples, sampleRate, bpmInput)
      : basicAnalysis(samples, sampleRate);
  } catch (error) {
    console.warn("essentia analysis failed; using basic analysis.", error);
    payload = basicAnalysis(samples, sampleRate);
  }
  const response: WorkerResponse = { id, ...payload };
  self.postMessage(response);
};

export {};
