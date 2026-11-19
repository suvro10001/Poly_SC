/**
 * Web Audio API synthesizer for offline ambient soundscapes and subtle completion bells.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private binauralOscLeft: OscillatorNode | null = null;
  private binauralOscRight: OscillatorNode | null = null;
  private currentType: string = 'none';

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(volume: number) {
    if (this.gainNode && this.ctx) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.gainNode.gain.setValueAtTime(clamped * 0.4, this.ctx.currentTime);
    }
  }

  public stopAmbient() {
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioBufferSourceNode).stop?.();
        this.noiseNode.disconnect();
      } catch {
        // ignore
      }
      this.noiseNode = null;
    }
    if (this.binauralOscLeft) {
      try {
        this.binauralOscLeft.stop();
        this.binauralOscLeft.disconnect();
      } catch {
        // ignore
      }
      this.binauralOscLeft = null;
    }
    if (this.binauralOscRight) {
      try {
        this.binauralOscRight.stop();
        this.binauralOscRight.disconnect();
      } catch {
        // ignore
      }
      this.binauralOscRight = null;
    }
    this.currentType = 'none';
  }

  public playAmbient(type: 'none' | 'brown-noise' | 'rain' | 'binaural' | 'stream', volume: number = 0.5) {
    this.stopAmbient();
    if (type === 'none') return;

    this.initContext();
    if (!this.ctx) return;

    this.gainNode = this.ctx.createGain();
    this.setVolume(volume);
    this.gainNode.connect(this.ctx.destination);
    this.currentType = type;

    if (type === 'brown-noise' || type === 'rain' || type === 'stream') {
      const bufferSize = this.ctx.sampleRate * 4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'brown-noise') {
          // Brown noise integration
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.5;
        } else if (type === 'rain') {
          // Pink/Rain filter
          lastOut = lastOut * 0.95 + white * 0.05;
          data[i] = lastOut * 2.5;
        } else {
          // Stream / Gentle water
          lastOut = lastOut * 0.9 + white * 0.1;
          data[i] = (lastOut + Math.sin(i / 1200) * 0.05) * 2;
        }
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Filter to soften high harshness
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(type === 'brown-noise' ? 400 : type === 'rain' ? 1200 : 800, this.ctx.currentTime);

      source.connect(filter);
      filter.connect(this.gainNode);
      source.start();
      this.noiseNode = source;
    } else if (type === 'binaural') {
      // 432Hz in Left ear, 436Hz in Right ear -> creates 4Hz Theta beat
      const merger = this.ctx.createChannelMerger(2);

      const oscLeft = this.ctx.createOscillator();
      oscLeft.type = 'sine';
      oscLeft.frequency.setValueAtTime(432, this.ctx.currentTime);

      const oscRight = this.ctx.createOscillator();
      oscRight.type = 'sine';
      oscRight.frequency.setValueAtTime(436, this.ctx.currentTime);

      const pannerLeft = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      const pannerRight = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      if (pannerLeft && pannerRight) {
        pannerLeft.pan.setValueAtTime(-1, this.ctx.currentTime);
        pannerRight.pan.setValueAtTime(1, this.ctx.currentTime);

        oscLeft.connect(pannerLeft);
        pannerLeft.connect(this.gainNode);

        oscRight.connect(pannerRight);
        pannerRight.connect(this.gainNode);
      } else {
        oscLeft.connect(merger, 0, 0);
        oscRight.connect(merger, 0, 1);
        merger.connect(this.gainNode);
      }

      oscLeft.start();
      oscRight.start();

      this.binauralOscLeft = oscLeft;
      this.binauralOscRight = oscRight;
    }
  }

  public playChime() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(528, now); // 528Hz Solfeggio tone (peace/restoration)
    osc1.frequency.exponentialRampToValueAtTime(528, now + 2.5);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1056, now); // Harmonics

    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

    osc1.connect(chimeGain);
    osc2.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2.6);
    osc2.stop(now + 2.6);
  }

  public playClick() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }
}

export const soundManager = new SoundSynthesizer();
