// Audio joiner engine: concatenates multiple decoded AudioBuffers into one,
// resampling every input to a common sample rate (the max across inputs, via
// OfflineAudioContext) so pitch/speed stay correct regardless of each file's
// original rate. Supports an optional short crossfade (blending the tail of
// one track into the head of the next) or a fixed silent gap between tracks.

export interface JoinOptions {
  /** Crossfade length in seconds. 0 disables crossfading. */
  crossfadeSeconds: number;
  /** Silent gap inserted between tracks, in seconds. Ignored when crossfading. */
  gapSeconds: number;
}

export interface RenderedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

export async function resampleBuffer(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetRate) return buffer;
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const length = Math.max(1, Math.ceil((buffer.length / buffer.sampleRate) * targetRate));
  const offline = new OfflineAudioContext(numberOfChannels, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

function channelDataFor(buffer: AudioBuffer, channelIndex: number, totalChannels: number): Float32Array {
  if (buffer.numberOfChannels > channelIndex) return buffer.getChannelData(channelIndex);
  // Mono source feeding a stereo join: duplicate channel 0 for any extra
  // output channel so mono files join cleanly with stereo ones.
  if (totalChannels > 1) return buffer.getChannelData(0);
  return buffer.getChannelData(0);
}

export async function renderJoin(buffers: AudioBuffer[], options: JoinOptions): Promise<RenderedAudio> {
  if (buffers.length < 2) throw new Error("Need at least two audio files to join.");

  const targetRate = Math.max(...buffers.map((b) => b.sampleRate));
  const targetChannels = Math.min(2, Math.max(...buffers.map((b) => b.numberOfChannels)));
  const resampled = await Promise.all(buffers.map((b) => resampleBuffer(b, targetRate)));

  const crossfadeSeconds = Math.max(0, options.crossfadeSeconds);
  const gapSeconds = crossfadeSeconds > 0 ? 0 : Math.max(0, options.gapSeconds);
  const gapFrames = Math.round(gapSeconds * targetRate);

  // First pass: figure out the total output length, accounting for
  // crossfade overlap (each crossfade shortens the total by the overlap
  // length) or gap padding (each gap lengthens it).
  let totalLength = 0;
  resampled.forEach((buf, index) => {
    totalLength += buf.length;
    if (index > 0) {
      const overlap = Math.min(Math.round(crossfadeSeconds * targetRate), buf.length, resampled[index - 1].length);
      totalLength -= overlap;
      totalLength += gapFrames;
    }
  });
  totalLength = Math.max(1, totalLength);

  const out: Float32Array[] = Array.from({ length: targetChannels }, () => new Float32Array(totalLength));

  let cursor = 0;
  resampled.forEach((buf, index) => {
    const channelsData: Float32Array[] = [];
    for (let c = 0; c < targetChannels; c += 1) channelsData.push(channelDataFor(buf, c, targetChannels));

    if (index === 0) {
      for (let c = 0; c < targetChannels; c += 1) out[c].set(channelsData[c], 0);
      cursor = buf.length;
      return;
    }

    const overlap = Math.min(Math.round(crossfadeSeconds * targetRate), buf.length, resampled[index - 1].length);
    const startAt = cursor - overlap + gapFrames;

    for (let c = 0; c < targetChannels; c += 1) {
      const dst = out[c];
      const src = channelsData[c];
      for (let f = 0; f < overlap; f += 1) {
        const t = f / overlap;
        const i = startAt + f;
        dst[i] = dst[i] * (1 - t) + src[f] * t;
      }
      for (let f = overlap; f < src.length; f += 1) {
        dst[startAt + f] = src[f];
      }
    }
    cursor = startAt + buf.length;
  });

  return { channels: out, sampleRate: targetRate };
}
