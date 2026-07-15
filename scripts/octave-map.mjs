// Map Percival's octave behaviour with PERFECT ground truth.
//
// WHY SYNTHETIC. Every hypothesis so far died the same death: the real-song
// truth set is 61 entries, so a 3-point delta is ~2 songs — indistinguishable
// from noise. You cannot tune an octave rule on that. Synthetic click tracks
// have EXACT ground truth and unlimited n, so they can answer one specific,
// falsifiable question that real songs cannot at this sample size:
//
//     At which true tempos does Percival report the wrong octave?
//
// If the halving is SYSTEMATIC (e.g. "always halves above ~140"), that is a
// characterisable bias with a principled correction. If it is scattered, there
// is no rule to find and we stop.
//
// HONEST LIMIT, stated up front: synthetic clicks are NOT music. They have no
// syncopation, no swing, no backbeat, and a perfectly steady grid. A pattern
// found here is a hypothesis about the ALGORITHM, and must still be validated
// against the real truth set before shipping. This measures the estimator, not
// the world.
//
//   node scripts/octave-map.mjs                 (16k, the old shipped rate)
//   RATE=44100 node scripts/octave-map.mjs       (44.1k, what ships now)
//   RATE=44100 ESTIMATOR=beattracker node scripts/octave-map.mjs
//
// ======================= RESULT: THE CEILING IS ALGORITHMIC ==================
// Percival halves EVERY tempo >= 136 — and does so IDENTICALLY at 16 kHz and at
// 44.1 kHz, and identically across all four drum patterns:
//     16k    ok=17/31   halves at 136,140,144,...,180
//     44.1k  ok=17/31   halves at 136,140,144,...,180   <- byte-for-byte same
//
// THIS IS THE IMPORTANT PART: the ceiling does NOT move with sample rate, frame
// size, or onset density. It is not a mis-tuned parameter — it is Percival's
// internal tempo prior. It will never report above ~134, so it DELETES the
// octave of every fast track before you ever see the number.
//
// That single fact retroactively explains every failed experiment:
//   - onset density / danceability / beat salience / LoopBpmConfidence all
//     failed because they tried to recover information the algorithm destroys.
//   - the old [105,210) fold "worked" on EDM only by accident: it doubled
//     everything under 105, undoing the halving while wrecking slow songs.
//   - 44.1k helps (+4 fast) by improving the ESTIMATE, not by lifting the
//     ceiling. A true 171 track still reports 86.
//
// DO NOT tune Percival's parameters hoping to fix fast tempos. The only routes
// left are (a) a different estimator for fast material — BeatTrackerMultiFeature
// scores 28/31 here vs Percival's 17/31, with no ceiling — or (b) a per-song
// discriminator to choose between them. Note the two have OPPOSITE biases:
// Percival halves fast tracks, BeatTracker doubles slow ones (real-music bands:
// Percival slow 74%/fast 14%, BeatTracker slow 49%/fast 19%). That opposition is
// the most promising thing left and needs the fast truth set to grow further.
// =============================================================================

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RATE = Number(process.env.RATE || 16000);

if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(ROOT, "node_modules/essentia.js/dist");

let es = null;
async function getEssentia() {
  if (es) return es;
  const [{ default: Essentia }, { EssentiaWASM }] = await Promise.all([
    import("essentia.js/dist/essentia.js-core.es.js"),
    import("essentia.js/dist/essentia-wasm.es.js"),
  ]);
  const deadline = Date.now() + 8000;
  while (!EssentiaWASM.calledRun && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  es = new Essentia(EssentiaWASM);
  return es;
}

/** One percussive hit: fast attack, exponential decay, band-limited noise+tone. */
function hit(buf, at, rate, { freq, decay, amp }) {
  const len = Math.floor(rate * decay);
  for (let i = 0; i < len; i += 1) {
    const idx = at + i;
    if (idx >= buf.length) break;
    const t = i / rate;
    const env = Math.exp(-t / (decay * 0.25));
    const tone = Math.sin(2 * Math.PI * freq * t);
    const noise = Math.random() * 2 - 1;
    buf[idx] += amp * env * (tone * 0.7 + noise * 0.3);
  }
}

/**
 * A drum-pattern-shaped click track at `bpm`.
 * `pattern` controls what sits between the beats — that is the whole point:
 * a kick-only 4/4 and a kick+hat 4/4 have the SAME tempo but very different
 * onset density, which is exactly the confound the octave decision faces.
 */
function makeTrack(bpm, seconds, rate, pattern) {
  const buf = new Float32Array(Math.floor(seconds * rate));
  const beat = 60 / bpm;
  const beats = Math.floor(seconds / beat);
  for (let b = 0; b < beats; b += 1) {
    const at = Math.floor(b * beat * rate);
    // Downbeat kick every beat.
    hit(buf, at, rate, { freq: 60, decay: 0.18, amp: 0.9 });
    if (pattern === "kick-snare" && b % 2 === 1) {
      hit(buf, at, rate, { freq: 200, decay: 0.12, amp: 0.7 });
    }
    if (pattern === "with-offbeat") {
      // Hat on the &, i.e. an onset at DOUBLE the beat rate. This is the
      // classic reason an estimator reports 2x — or, read the other way, why a
      // real 90 BPM track with hats can look like 180.
      hit(buf, at + Math.floor(beat * 0.5 * rate), rate, { freq: 6000, decay: 0.04, amp: 0.35 });
    }
    if (pattern === "with-16ths") {
      for (const frac of [0.25, 0.5, 0.75]) {
        hit(buf, at + Math.floor(beat * frac * rate), rate, { freq: 6000, decay: 0.03, amp: 0.25 });
      }
    }
  }
  return buf;
}

const PATTERNS = ["kick-only", "kick-snare", "with-offbeat", "with-16ths"];

// Which estimator to map. Percival has a hard ceiling near 134 (it reports HALF
// for every synthetic tempo >= 136, identically across all four patterns — so
// the octave information is destroyed inside the algorithm and no amount of
// post-processing its single output can recover it). BeatTrackerMultiFeature is
// a different algorithm with a different prior; this asks whether it shares the
// ceiling.
const ESTIMATOR = process.env.ESTIMATOR || "percival";

/** Tempo from BeatTrackerMultiFeature's tick positions: the median inter-beat
 *  interval, which is robust to a few dropped/extra beats. */
function beatTrackerBpm(engine, sig) {
  const r = engine.BeatTrackerMultiFeature(sig, 208, 40);  // 44100-only per essentia docs
  const ticks = engine.vectorToArray(r.ticks);
  r.ticks?.delete?.();
  r.confidence?.delete?.();
  if (!ticks || ticks.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < ticks.length; i += 1) gaps.push(ticks[i] - ticks[i - 1]);
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  return med > 0 ? 60 / med : null;
}

async function main() {
  const engine = await getEssentia();
  const tempos = [];
  for (let b = 60; b <= 180; b += 4) tempos.push(b);

  const results = {};
  for (const p of PATTERNS) results[p] = [];

  console.log(`estimator: ${ESTIMATOR}  rate: ${RATE}`);
  console.log("true  " + PATTERNS.map((p) => p.padStart(13)).join(""));
  for (const bpm of tempos) {
    const row = [];
    for (const p of PATTERNS) {
      const samples = makeTrack(bpm, 30, RATE, p);
      const sig = engine.arrayToVector(samples);
      let raw = null;
      try {
        raw = ESTIMATOR === "percival"
          ? engine.PercivalBpmEstimator(sig, 1024, 2048, 128, 128, 210, 50, RATE).bpm
          : beatTrackerBpm(engine, sig);
      } catch { raw = null; }
      sig.delete?.();
      const ratio = raw ? raw / bpm : 0;
      // Which octave did it land on?
      let tag = "?";
      if (Math.abs(ratio - 1) < 0.06) tag = "ok";
      else if (Math.abs(ratio - 0.5) < 0.06) tag = "HALF";
      else if (Math.abs(ratio - 2) < 0.12) tag = "DBL";
      else if (Math.abs(ratio - 0.75) < 0.06) tag = "3/4";
      else if (Math.abs(ratio - 1.5) < 0.09) tag = "1.5x";
      results[p].push({ bpm, raw: raw ? +raw.toFixed(1) : null, tag });
      row.push(`${String(raw ? raw.toFixed(0) : "-").padStart(5)} ${tag.padEnd(5)}`.padStart(13));
    }
    console.log(String(bpm).padStart(4) + "  " + row.join(""));
  }

  console.log(`\n${"=".repeat(72)}\nOCTAVE BEHAVIOUR BY PATTERN\n${"=".repeat(72)}`);
  for (const p of PATTERNS) {
    const r = results[p];
    const count = (tag) => r.filter((x) => x.tag === tag).length;
    const halves = r.filter((x) => x.tag === "HALF").map((x) => x.bpm);
    console.log(
      `${p.padEnd(14)} ok=${String(count("ok")).padStart(2)}/${r.length}  HALF=${String(count("HALF")).padStart(2)}  DBL=${String(count("DBL")).padStart(2)}  other=${count("?") + count("3/4") + count("1.5x")}`,
    );
    if (halves.length) {
      console.log(`${" ".repeat(14)}   halves at true bpm: ${halves.join(", ")}`);
    }
  }
  console.log("\nA SYSTEMATIC halving band (e.g. all fast tempos) is correctable.");
  console.log("Scattered halving is not — and would end this line of attack.");
}

main().catch((e) => { console.error(e); process.exit(1); });
