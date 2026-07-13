// "8D audio" engine: an auto-panning effect built by driving a
// StereoPannerNode's `pan` AudioParam with a slow sine oscillator, so the
// sound sweeps left <-> right over a period the user controls. Optional light
// reverb reuses lib/audio/remix.ts's synthetic impulse-response generator
// (imported, not duplicated) for a sense of space. Always renders to stereo.

import { generateImpulseResponse } from "./remix";

export interface EightDParams {
  /** Seconds per full left-right-left sweep, ~4-20. */
  periodSeconds: number;
  /** 0-100 reverb send amount. 0 disables the reverb path entirely. */
  reverbAmount: number;
}

export interface RenderedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

const REVERB_SECONDS = 1.4;
const REVERB_DECAY = 4;
const REVERB_TAIL_SECONDS = 2;

export async function renderEightD(buffer: AudioBuffer, params: EightDParams): Promise<RenderedAudio> {
  const periodSeconds = Math.min(30, Math.max(1, params.periodSeconds));
  const reverbAmount = Math.min(100, Math.max(0, params.reverbAmount));
  const hasReverb = reverbAmount > 0;
  const tail = hasReverb ? REVERB_TAIL_SECONDS : 0;
  const length = Math.max(1, Math.ceil(buffer.length + tail * buffer.sampleRate));
  // Always render stereo output — the whole point of the effect is a
  // left/right sweep, so a mono source still needs two output channels.
  const offline = new OfflineAudioContext(2, length, buffer.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = buffer;

  const panner = offline.createStereoPanner();

  // Drive the pan AudioParam at audio rate with a slow oscillator scaled to
  // +/-1 (pan's native range) via a gain node.
  const oscillator = offline.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = 1 / periodSeconds;
  const oscillatorGain = offline.createGain();
  oscillatorGain.gain.value = 1;
  oscillator.connect(oscillatorGain);
  oscillatorGain.connect(panner.pan);
  oscillator.start();

  if (hasReverb) {
    const dry = offline.createGain();
    const wet = offline.createGain();
    const amount = reverbAmount / 100;
    dry.gain.value = 1 - 0.3 * amount;
    wet.gain.value = 0.35 * amount;

    const convolver = offline.createConvolver();
    convolver.buffer = generateImpulseResponse(offline, REVERB_SECONDS, REVERB_DECAY);

    source.connect(dry);
    source.connect(convolver);
    convolver.connect(wet);
    dry.connect(panner);
    wet.connect(panner);
  } else {
    source.connect(panner);
  }

  panner.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  return { channels, sampleRate: rendered.sampleRate };
}
