// Client-side MP3 encoding via LAME compiled to WebAssembly
// (wasm-media-encoders) — roughly 3x faster than the old lamejs JS build and
// fed Float32 PCM directly, so no Int16 conversion pass. The wasm binary is
// self-hosted in /public/vendor/mp3/ (CSP connect-src blocks CDNs; see
// scripts/vendor-ffmpeg.mjs) and the compiled module is cached so repeat
// exports skip the fetch+compile.
import { createEncoder } from "wasm-media-encoders";
import { decodeAudioFile } from "./decode";

type Mp3Encoder = Awaited<ReturnType<typeof createEncoder<"audio/mpeg">>>;

let encoderPromise: Promise<Mp3Encoder> | null = null;

function loadMp3Encoder(): Promise<Mp3Encoder> {
  // One encoder instance reused across exports — configure() fully resets
  // LAME's state between files (per wasm-media-encoders' API contract).
  if (!encoderPromise) {
    encoderPromise = createEncoder("audio/mpeg", "/vendor/mp3/mp3.wasm").catch((error) => {
      encoderPromise = null;
      throw error instanceof Error ? error : new Error("MP3 encoder failed to load.");
    });
  }
  return encoderPromise;
}

const SILENCE_THRESHOLD_DB = -50;
const SILENCE_THRESHOLD_LINEAR = 10 ** (SILENCE_THRESHOLD_DB / 20);

// Finds where the leading silence ends. A short RMS gate robustly locates the
// first sustained sound (ignoring isolated clicks), then we walk to the exact
// first sample above threshold — the true onset — and back off just 2ms so the
// attack isn't clipped. This lands the downbeat effectively on sample zero, so
// the exported file drops onto a DAW bar line without a manual nudge.
// Mirrors the server-side silenceremove filter (start_silence=0.002).
function findLeadingSilenceEnd(channels: Float32Array[], sampleRate: number): number {
  const length = channels[0]?.length ?? 0;
  const windowSize = Math.round(sampleRate * 0.003);
  const preRoll = Math.round(sampleRate * 0.002);
  const mixAt = (i: number) => {
    let mix = 0;
    for (const channel of channels) mix += channel[i];
    return mix / channels.length;
  };

  for (let windowStart = 0; windowStart < length; windowStart += windowSize) {
    const windowEnd = Math.min(length, windowStart + windowSize);
    let sumSquares = 0;
    for (let i = windowStart; i < windowEnd; i += 1) {
      const mix = mixAt(i);
      sumSquares += mix * mix;
    }
    const rms = windowEnd > windowStart ? Math.sqrt(sumSquares / (windowEnd - windowStart)) : 0;
    if (rms > SILENCE_THRESHOLD_LINEAR) {
      // Refine to the exact onset sample within/just before this window.
      let onset = windowStart;
      const scanFrom = Math.max(0, windowStart - windowSize);
      for (let i = scanFrom; i < windowEnd; i += 1) {
        if (Math.abs(mixAt(i)) > SILENCE_THRESHOLD_LINEAR) {
          onset = i;
          break;
        }
      }
      return Math.max(0, onset - preRoll);
    }
  }
  return 0;
}

// Decode + optionally trim leading silence; shared by the MP3 and WAV paths.
async function decodeAndTrim(file: File, trimSilence: boolean): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const { buffer } = await decodeAudioFile(file);
  const channelCount = Math.min(2, buffer.numberOfChannels);
  const rawChannels: Float32Array[] = [];
  for (let i = 0; i < channelCount; i += 1) rawChannels.push(buffer.getChannelData(i));

  const startIndex = trimSilence ? findLeadingSilenceEnd(rawChannels, buffer.sampleRate) : 0;
  const channels = startIndex > 0 ? rawChannels.map((data) => data.subarray(startIndex)) : rawChannels;
  return { channels, sampleRate: buffer.sampleRate };
}

// Sample-exact 16-bit PCM WAV — no codec priming/padding at all, so with the
// silence trim the first transient lands at sample 0.
export function encodeWavFromChannels(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const dataSize = numFrames * numChannels * 2;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function convertFileToWav(file: File, trimSilence: boolean): Promise<Blob> {
  const { channels, sampleRate } = await decodeAndTrim(file, trimSilence);
  return encodeWavFromChannels(channels, sampleRate);
}

// LAME only accepts the standard CBR rates; snap anything else to the nearest.
const MP3_BITRATES = [8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] as const;

export async function encodeMp3FromChannels(inputChannels: Float32Array[], sampleRate: number, kbps: number): Promise<Blob> {
  const encoder = await loadMp3Encoder();
  const channels = Math.min(2, inputChannels.length) as 1 | 2;
  const left = inputChannels[0];
  const right = channels > 1 ? inputChannels[1] : left;
  const bitrate = MP3_BITRATES.reduce((best, rate) => (Math.abs(rate - kbps) < Math.abs(best - kbps) ? rate : best));
  encoder.configure({ channels, sampleRate, bitrate });

  const chunks: Uint8Array[] = [];
  // Feed ~1s blocks so the wasm heap never holds the whole track at once.
  const blockSize = 1152 * 40;
  for (let index = 0; index < left.length; index += blockSize) {
    const frame =
      channels > 1
        ? [left.subarray(index, index + blockSize), right.subarray(index, index + blockSize)]
        : [left.subarray(index, index + blockSize)];
    // encode()/finalize() return views into the encoder's internal buffer,
    // only valid until the next encoder call — copy before continuing.
    const encoded = encoder.encode(frame as [Float32Array] | [Float32Array, Float32Array]);
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }

  const flushed = encoder.finalize();
  if (flushed.length) chunks.push(new Uint8Array(flushed));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

export async function convertFileToMp3(file: File, kbps: number, trimSilence: boolean): Promise<Blob> {
  const { channels, sampleRate } = await decodeAndTrim(file, trimSilence);
  return encodeMp3FromChannels(channels, sampleRate, kbps);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
