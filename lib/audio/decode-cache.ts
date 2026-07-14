import { decodeAudioFile } from "@/lib/audio/decode";

// Module-level cache of the single most recently decoded file. Several panels
// (analyzer, loudness, remix) may decode the same file in quick succession —
// e.g. a user re-opening the same preview — so this avoids a redundant
// decodeAudioData pass. Only the AudioBuffer is cached; the arrayBuffer is
// NOT cached because hooks/useAnalyzer.ts reads the raw bytes independently
// and decodeAudioFile's caller may still hold/transfer that buffer elsewhere,
// so re-decoding from the File on a cache hit keeps arrayBuffer semantics
// exactly as before for any caller that needs it.
// A decoded AudioBuffer is raw Float32 PCM — roughly 10MB per stereo minute
// at 44.1kHz, so an hour-long WAV pins ~600MB. Holding that for the tab's
// lifetime after the user has moved on is the one real retention risk in the
// audio path, so anything above this ceiling is decoded but never cached
// (the cache only exists to skip a redundant re-decode of the SAME file
// across panels — a miss just costs one decode).
const MAX_CACHED_BYTES = 120 * 1024 * 1024;

let cacheKey: string | null = null;
let cachedBuffer: AudioBuffer | null = null;

function keyFor(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function bytesOf(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** Drop the cached buffer (call when a tool unloads its file). */
export function clearDecodeCache(): void {
  cacheKey = null;
  cachedBuffer = null;
}

export async function decodeAudioFileCached(file: File): Promise<{ buffer: AudioBuffer; arrayBuffer: ArrayBuffer }> {
  const key = keyFor(file);
  if (key === cacheKey && cachedBuffer) {
    // Cache hit: still need the arrayBuffer for callers that use it (e.g.
    // bit-depth detection), so read it fresh from the File — cheap compared
    // to the decode itself, and avoids any risk of a detached/transferred
    // ArrayBuffer being handed out twice.
    const arrayBuffer = await file.arrayBuffer();
    return { buffer: cachedBuffer, arrayBuffer };
  }

  const result = await decodeAudioFile(file);
  if (bytesOf(result.buffer) <= MAX_CACHED_BYTES) {
    cacheKey = key;
    cachedBuffer = result.buffer;
  } else {
    // Too big to hold: make sure we're not still pinning a previous file.
    clearDecodeCache();
  }
  return result;
}
