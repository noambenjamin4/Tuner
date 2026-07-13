// Bass booster engine: a low-shelf boost around 90Hz (the "sub/bass" region),
// plus an optional gentle high-shelf cut so the extra low end doesn't just
// make everything louder. A peak-scan safety limiter clamps the output so it
// never exceeds -1 dBFS, since a naive low-shelf boost can clip hot masters.

export interface BassBoostParams {
  /** Low-shelf gain in dB, 0 to +12. */
  gainDb: number;
  /** Whether to apply a gentle high-shelf cut to balance the extra bass. */
  highCut: boolean;
}

export interface RenderedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

const LOW_SHELF_HZ = 90;
const HIGH_SHELF_HZ = 8000;
const HIGH_SHELF_CUT_DB = -3;
const SAFETY_CEILING_DB = -1;

/** Scans peak amplitude across all channels and scales down if it exceeds the ceiling. */
export function limitPeak(channels: Float32Array[], ceilingDb: number = SAFETY_CEILING_DB): void {
  const ceiling = 10 ** (ceilingDb / 20);
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak > ceiling && peak > 0) {
    const scale = ceiling / peak;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i += 1) channel[i] *= scale;
    }
  }
}

export async function renderBassBoost(buffer: AudioBuffer, params: BassBoostParams): Promise<RenderedAudio> {
  const gainDb = Math.min(12, Math.max(0, params.gainDb));
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const offline = new OfflineAudioContext(numberOfChannels, buffer.length, buffer.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  const lowShelf = offline.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = LOW_SHELF_HZ;
  lowShelf.gain.value = gainDb;

  const highShelf = offline.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = HIGH_SHELF_HZ;
  highShelf.gain.value = params.highCut ? HIGH_SHELF_CUT_DB : 0;

  source.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  limitPeak(channels);
  return { channels, sampleRate: rendered.sampleRate };
}
