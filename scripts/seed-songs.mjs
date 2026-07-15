// One-off / re-runnable seeder for the programmatic /song/<slug> pages.
//
// For each popular track from Deezer's public charts it downloads the free 30s
// preview, decodes it with the bundled ffmpeg, and runs the SAME essentia
// analysis the browser worker uses (same PercivalBpmEstimator at 44.1k + KeyExtractor at 16k
// params and the same [105,210) BPM fold), then upserts a row into the Supabase
// `link_analysis` table — the exact table the live "analyze from link" feature
// writes to. The DB trigger fills the SEO slug. Results are labeled source
// "preview" so pages can disclose they come from a 30-second sample.
//
//   node scripts/seed-songs.mjs            # full run (~300 songs)
//   node scripts/seed-songs.mjs 3          # smoke test: first 3 only
//
// Env: reads SUPABASE_URL + SUPABASE_ANON_KEY from .env.local.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { foldBpm } from "./bpm-fold.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// essentia's emscripten wasm build takes its Node branch (process exists) and
// references CommonJS `__dirname`/`require`, which don't exist in an ESM module.
// Shim them as globals, pointed at the dist dir so it can locate the .wasm.
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(ROOT, "node_modules/essentia.js/dist");
const FFMPEG = resolve(ROOT, "node_modules/ffmpeg-static/ffmpeg");
const LIMIT = Number(process.argv[2]) || Infinity;

// ---- env ------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing Supabase creds in .env.local");

// ---- analysis constants (mirror workers/analysis.worker.ts) ----------------
const ANALYSIS_RATE = 16000;
// Tempo runs at the rate essentia's Percival defaults were specified for. The
// browser worker was moved to this in 02fe16d (61% -> 64% exact, better on
// EVERY band); the seeder was left behind at 16k, so the CATALOG was being
// written by a measurably worse analyzer than the one visitors run. Same
// engine, same rates, or the two silently drift — which is exactly what
// happened.
const BPM_RATE = 44100;
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
// other octave stays available in bpm_alt. Danceability was tested
// as a discriminator and rejected (it overlaps completely between the two cases);
// RhythmExtractor2013 was tested and scored 0%.
const FLAT_TO_SHARP = { Ab: "G#", Bb: "A#", Cb: "B", Db: "C#", Eb: "D#", Fb: "E", Gb: "F#" };
const CAMELOT = {
  "C Major": "8B", "G Major": "9B", "D Major": "10B", "A Major": "11B", "E Major": "12B", "B Major": "1B",
  "F# Major": "2B", "C# Major": "3B", "G# Major": "4B", "D# Major": "5B", "A# Major": "6B", "F Major": "7B",
  "A Minor": "8A", "E Minor": "9A", "B Minor": "10A", "F# Minor": "11A", "C# Minor": "12A", "G# Minor": "1A",
  "D# Minor": "2A", "A# Minor": "3A", "F Minor": "4A", "C Minor": "5A", "G Minor": "6A", "D Minor": "7A",
};


// ---- essentia (same ES builds as the worker) -------------------------------
// Some emscripten globals are browser-shaped; shim before importing the wasm.
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
let essentia = null;
async function getEssentia() {
  if (essentia) return essentia;
  const [{ default: Essentia }, { EssentiaWASM }] = await Promise.all([
    import("essentia.js/dist/essentia.js-core.es.js"),
    import("essentia.js/dist/essentia-wasm.es.js"),
  ]);
  const wasm = EssentiaWASM;
  const deadline = Date.now() + 8000;
  while (!wasm.calledRun && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  essentia = new Essentia(EssentiaWASM);
  return essentia;
}

function rms(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, s.length));
}

function analyze(es, samples, bpmSamples) {
  const cleanup = [];
  try {
    const signal = es.arrayToVector(samples);
    cleanup.push(signal);
    // TEMPO on the 44.1k signal, KEY on the 16k one below — the same split the
    // browser worker uses. Key measured BETTER at 16k (47% vs 45%), tempo
    // measures better at 44.1k, so they genuinely want different rates.
    const bpmSignal = bpmSamples ? es.arrayToVector(bpmSamples) : signal;
    if (bpmSamples) cleanup.push(bpmSignal);
    const rawBpm = es.PercivalBpmEstimator(
      bpmSignal, 1024, 2048, 128, 128, 210, 50, bpmSamples ? BPM_RATE : ANALYSIS_RATE,
    ).bpm;
    const k = es.KeyExtractor(signal, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "bgate", ANALYSIS_RATE, 0.0001, 440, "cosine", "hann");
    const dance = es.Danceability(signal, 8800, 310, ANALYSIS_RATE);
    if (dance.dfa) cleanup.push(dance.dfa);
    const loud = rms(samples) > 0 ? 20 * Math.log10(rms(samples)) : -96;
    const energy = Math.max(0, Math.min(1, (loud + 30) / 25));
    const danceability = Math.max(0, Math.min(1, dance.danceability / 3));
    const root = FLAT_TO_SHARP[k.key] || k.key;
    const scale = k.scale === "minor" ? "Minor" : "Major";
    const { bpm, alt } = foldBpm(rawBpm);
    const key = `${root} ${scale}`;
    return {
      bpm, bpm_alt: alt, key, camelot: CAMELOT[key] ?? null,
      energy: Math.round(energy * 1000) / 1000,
      danceability: Math.round(danceability * 1000) / 1000,
      loudness_db: Math.round(loud * 10) / 10,
    };
  } finally {
    for (const c of cleanup) { try { c.delete?.(); } catch {} }
  }
}

// ---- ffmpeg decode: mp3 buffer -> 16kHz mono Float32Array -------------------
function decode(mp3, rate = ANALYSIS_RATE) {
  return new Promise((res, rej) => {
    const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"]);
    const out = [];
    ff.stdout.on("data", (d) => out.push(d));
    ff.on("error", rej);
    ff.on("close", (code) => {
      if (code !== 0) return rej(new Error("ffmpeg exit " + code));
      const buf = Buffer.concat(out);
      res(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)));
    });
    ff.stdin.on("error", () => {});
    ff.stdin.end(mp3);
  });
}

// ---- Deezer sources (keyless) ----------------------------------------------
// Every genre chart Deezer publishes (fetched dynamically), plus that genre's
// editorial playlists, plus a few well-known "Top <country>" playlists. Invalid
// playlist ids just log and skip, so the list is safe to extend.
const COUNTRY_PLAYLISTS = [
  ["top-worldwide", 3155776842],
  ["top-usa", 1313621735],
  ["top-france", 1109890291],
  ["top-uk", 1111142221],
  ["top-germany", 1111143121],
  ["top-brazil", 1111141961],
  ["top-canada", 1652248171],
  ["top-spain", 1116190041],
  ["top-italy", 1111142421],
  ["top-mexico", 1111142361],
];

function addTracks(byId, list, label) {
  let added = 0;
  for (const t of list || []) {
    if (t.preview && t.id && t.title && !byId.has(t.id)) {
      byId.set(t.id, { id: t.id, title: t.title, artist: t.artist?.name || "", artistId: t.artist?.id || null, preview: t.preview, duration: t.duration || null });
      added += 1;
    }
  }
  console.log(`${label}: +${added} (${byId.size} unique so far)`);
}

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
}

async function collectTracks() {
  const byId = new Map();

  // 1. Every genre chart (24 genres x up to 100 tracks).
  let genres = [{ id: 0, name: "All" }];
  try {
    const g = await getJson("https://api.deezer.com/genre");
    genres = g.data ?? genres;
  } catch (e) {
    console.log(`genre list failed (${e.message}); using All only`);
  }
  for (const g of genres) {
    try {
      const j = await getJson(`https://api.deezer.com/chart/${g.id}/tracks?limit=100`);
      addTracks(byId, j.data, `chart ${g.name}`);
    } catch (e) {
      console.log(`chart ${g.name}: failed (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 250)); // stay polite, ~50 req/5s quota
  }

  // 2. Country/editorial Top playlists.
  for (const [name, id] of COUNTRY_PLAYLISTS) {
    try {
      const j = await getJson(`https://api.deezer.com/playlist/${id}/tracks?limit=100`);
      addTracks(byId, j.data, `playlist ${name}`);
    } catch (e) {
      console.log(`playlist ${name}: failed (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // 3. Each chart artist's own top tracks. Charts only surface the hit of the
  // moment; the artist's catalog is where the long-tail song pages come from.
  const artistIds = new Map();
  for (const t of byId.values()) {
    if (t.artistId && !artistIds.has(t.artistId)) artistIds.set(t.artistId, t.artist);
  }
  // Fisher-Yates: successive runs sample a different slice of the frontier,
  // so a forever-loop keeps finding new songs instead of re-treading the
  // same first-N artists every cycle.
  const shuffled = (m) => {
    const a = [...m.entries()];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const ARTIST_CAP = 1200;
  let done = 0;
  for (const [artistId, artistName] of shuffled(artistIds).slice(0, ARTIST_CAP)) {
    try {
      const j = await getJson(`https://api.deezer.com/artist/${artistId}/top?limit=35`);
      addTracks(byId, j.data, `artist ${artistName}`);
    } catch (e) {
      console.log(`artist ${artistName}: failed (${e.message})`);
    }
    done += 1;
    if (done % 50 === 0) console.log(`--- artist sweep ${done}/${Math.min(artistIds.size, ARTIST_CAP)} ---`);
    await new Promise((r) => setTimeout(r, 250));
  }

  // 4. Related-artist expansion: chart artists are the head of the catalog;
  // their related artists are the body. Bounded fan-out so the API stays polite.
  const RELATED_SOURCES = 500;
  const RELATED_ARTIST_CAP = 2500;
  const relatedIds = new Map();
  for (const [artistId] of shuffled(artistIds).slice(0, RELATED_SOURCES)) {
    if (relatedIds.size >= RELATED_ARTIST_CAP) break;
    try {
      const j = await getJson(`https://api.deezer.com/artist/${artistId}/related?limit=20`);
      for (const a of j.data || []) {
        if (a.id && !artistIds.has(a.id) && !relatedIds.has(a.id)) relatedIds.set(a.id, a.name);
      }
    } catch {
      // skip quietly; related lookup is best-effort
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`--- related-artist pool: ${relatedIds.size} new artists ---`);
  let relDone = 0;
  for (const [artistId, artistName] of shuffled(relatedIds).slice(0, RELATED_ARTIST_CAP)) {
    try {
      const j = await getJson(`https://api.deezer.com/artist/${artistId}/top?limit=15`);
      addTracks(byId, j.data, `related ${artistName}`);
    } catch (e) {
      console.log(`related ${artistName}: failed (${e.message})`);
    }
    relDone += 1;
    if (relDone % 100 === 0) console.log(`--- related sweep ${relDone}/${Math.min(relatedIds.size, RELATED_ARTIST_CAP)} ---`);
    await new Promise((r) => setTimeout(r, 250));
  }

  return [...byId.values()];
}

async function upsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/link_analysis`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(10000),
  });
  return r.ok;
}

// ---- main ------------------------------------------------------------------
const es = await getEssentia();
console.log("essentia ready:", !!es);

// Skip tracks already cached (re-runs shouldn't redownload analyzed previews).
const existing = new Set();
try {
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/link_analysis?select=id&limit=1000&offset=${from}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    const rows = await r.json();
    for (const row of rows) existing.add(row.id);
    if (rows.length < 1000) break;
  }
} catch {
  // no pre-filter; ignore-duplicates still protects correctness
}
console.log(`already cached: ${existing.size}`);

const tracks = (await collectTracks()).filter((t) => !existing.has(`dz:${t.id}`)).slice(0, LIMIT);
console.log(`\nseeding ${tracks.length} new tracks...\n`);

let ok = 0, fail = 0;
for (const [i, t] of tracks.entries()) {
  const label = `${t.artist} - ${t.title}`.slice(0, 50);
  try {
    // Preview URLs carry expiring tokens; ones collected at startup go 403 by
    // the time the queue tail runs. Re-fetch the track for a fresh URL.
    let previewUrl = t.preview;
    try {
      const fresh = await getJson(`https://api.deezer.com/track/${t.id}`);
      if (fresh.preview) previewUrl = fresh.preview;
    } catch {
      // keep the collected URL; it may still be valid
    }
    const resp = await fetch(previewUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error("preview " + resp.status);
    const mp3 = Buffer.from(await resp.arrayBuffer());
    // Two decodes of the same mp3: 16k for key/danceability/loudness, 44.1k
    // for tempo. Costs one extra ffmpeg pass per song; the seeder is bound by
    // Deezer's rate limit (250ms spacing), not by decode, so throughput is
    // unaffected.
    const [samples, bpmSamples] = await Promise.all([decode(mp3), decode(mp3, BPM_RATE)]);
    if (samples.length < ANALYSIS_RATE * 5) throw new Error("too short");
    const a = analyze(es, samples, bpmSamples);
    const row = {
      id: `dz:${t.id}`,
      title: t.title.slice(0, 200),
      artist: (t.artist || null)?.slice(0, 200) ?? null,
      ...a,
      duration_s: t.duration || null,
      source: "preview",
    };
    const wrote = await upsert(row);
    if (wrote) { ok++; console.log(`[${i + 1}/${tracks.length}] OK   ${label}  ->  ${a.bpm} BPM ${a.key} ${a.camelot ?? ""}`); }
    else { fail++; console.log(`[${i + 1}/${tracks.length}] WRITE-FAIL ${label}`); }
  } catch (e) {
    fail++;
    console.log(`[${i + 1}/${tracks.length}] SKIP ${label} (${e.message})`);
  }
}
console.log(`\ndone: ${ok} written, ${fail} skipped`);
