// Homemade DSP analysis, ported from the original script.js. Used as the
// fallback engine when the essentia.js WASM module fails to load.
import { majorProfile, minorProfile, noteNames } from "./constants";

function getEnergyEnvelope(samples: Float32Array, sampleRate: number) {
  const frameSize = Math.round(sampleRate * 0.05);
  const hopSize = Math.round(sampleRate * 0.025);
  const envelope: number[] = [];
  for (let start = 0; start + frameSize < samples.length; start += hopSize) {
    let sum = 0;
    for (let i = start; i < start + frameSize; i += 1) sum += samples[i] * samples[i];
    envelope.push(Math.sqrt(sum / frameSize));
  }
  return { envelope, hopSize };
}

export function estimateBpm(samples: Float32Array, sampleRate: number): { bpm: number; confidence: number; bpmAlternate: number | null } {
  const { envelope, hopSize } = getEnergyEnvelope(samples, sampleRate);
  if (envelope.length < 24) return { bpm: 0, confidence: 0, bpmAlternate: null };

  const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
  const centered = envelope.map((value) => value - mean);
  const candidates: { bpm: number; score: number }[] = [];

  for (let bpm = 60; bpm <= 190; bpm += 0.5) {
    const lag = Math.round(((60 / bpm) * sampleRate) / hopSize);
    if (lag < 1 || lag >= centered.length) continue;
    let score = 0;
    for (let i = lag; i < centered.length; i += 1) score += centered[i] * centered[i - lag];
    candidates.push({ bpm, score: score / (centered.length - lag) });
  }

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0] || { bpm: 0, score: 0 };
  // Match the primary engine's hip-hop/trap-centered fold range [105, 210)
  // (see foldBpm in analysis.worker.ts).
  let foldDirection: "up" | "down" | null = null;
  while (best.bpm > 0 && best.bpm < 105) {
    best = { ...best, bpm: best.bpm * 2 };
    foldDirection = "up";
  }
  while (best.bpm >= 210) {
    best = { ...best, bpm: best.bpm / 2 };
    foldDirection = "down";
  }

  const runnerUp = candidates[1]?.score || 0.0001;
  const confidence = Math.max(42, Math.min(96, Math.round((best.score / (best.score + runnerUp)) * 100)));
  const bpm = Math.round(best.bpm * 100) / 100;
  const bpmAlternate =
    foldDirection === "up" ? Math.round((bpm / 2) * 100) / 100 : foldDirection === "down" ? Math.round(bpm * 2 * 100) / 100 : null;
  return { bpm, confidence, bpmAlternate };
}

function goertzel(samples: Float32Array, sampleRate: number, frequency: number, start: number, size: number): number {
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < size; i += 1) {
    const sample = samples[start + i] || 0;
    s0 = sample + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

export function estimateKey(samples: Float32Array, sampleRate: number): { key: string; scale: string; confidence: number } {
  const chroma = new Array(12).fill(0);
  const windowSize = Math.min(samples.length, Math.round(sampleRate * 0.75));
  const maxWindows = 28;
  const stride = Math.max(windowSize, Math.floor(samples.length / maxWindows));

  for (let start = 0; start + windowSize < samples.length; start += stride) {
    for (let note = 0; note < 12; note += 1) {
      for (let octave = 2; octave <= 6; octave += 1) {
        const midi = (octave + 1) * 12 + note;
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        if (frequency > 70 && frequency < 1800) {
          chroma[note] += Math.sqrt(goertzel(samples, sampleRate, frequency, start, windowSize));
        }
      }
    }
  }

  const max = Math.max(...chroma) || 1;
  const normalized = chroma.map((value) => value / max);
  const scoreMode = (profile: number[], root: number) =>
    profile.reduce((sum, weight, index) => sum + weight * normalized[(index + root) % 12], 0);

  let best = { root: 0, mode: "Major", score: -Infinity };
  for (let root = 0; root < 12; root += 1) {
    const majorScore = scoreMode(majorProfile, root);
    const minorScore = scoreMode(minorProfile, root);
    if (majorScore > best.score) best = { root, mode: "Major", score: majorScore };
    if (minorScore > best.score) best = { root, mode: "Minor", score: minorScore };
  }

  const total = normalized.reduce((sum, value) => sum + value, 0) || 1;
  const confidence = Math.max(45, Math.min(94, Math.round((Math.max(...normalized) / total) * 220)));
  return { key: `${noteNames[best.root]} ${best.mode}`, scale: best.mode, confidence };
}
