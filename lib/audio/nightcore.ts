// Nightcore engine: speeds a track up and pitches it up TOGETHER by resampling
// via AudioBufferSourceNode.playbackRate — this is the classic nightcore
// effect (speed and pitch are coupled, not independent; that's the honest
// trade-off, unlike the Slowed + Reverb studio's pitch-locked time-stretch
// path in lib/audio/remix.ts, which is left untouched).

export interface NightcoreParams {
  /** Playback rate, ~1.05-1.5. Higher = faster tempo and higher pitch. */
  rate: number;
}

export interface RenderedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

export async function renderNightcore(buffer: AudioBuffer, params: NightcoreParams): Promise<RenderedAudio> {
  const rate = Math.min(3, Math.max(1, params.rate));
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const length = Math.max(1, Math.ceil(buffer.length / rate));
  const offline = new OfflineAudioContext(numberOfChannels, length, buffer.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  return { channels, sampleRate: rendered.sampleRate };
}
