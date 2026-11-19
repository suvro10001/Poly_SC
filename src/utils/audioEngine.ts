// Web Audio API Polyphonic Synthesizer for Polyrhythms and Geometric Sonification

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  public init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isInitialized = true;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public playTone(
    freq: number,
    type: 'marimba' | 'synth' | 'bell' | 'pluck' | 'percussion' | 'kalimba' = 'marimba',
    volume: number = 0.6
  ) {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(volume * 0.5, t);
    masterGain.connect(this.ctx.destination);

    switch (type) {
      case 'marimba': {
        // Wooden mallet strike with rich fundamental and brief sub-harmonic
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        // Body resonance
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 3, t);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.3);

        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.4);
        break;
      }

      case 'bell': {
        // Dual oscillator FM crystalline bell chime
        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(freq, t);

        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(freq * 2.76, t); // inharmonic bell ratio

        modGain.gain.setValueAtTime(freq * 1.5, t);
        modGain.gain.exponentialRampToValueAtTime(0.1, t + 0.8);

        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

        modulator.connect(carrier.frequency);
        carrier.connect(gain);
        gain.connect(masterGain);

        carrier.start(t);
        modulator.start(t);
        carrier.stop(t + 1.3);
        modulator.stop(t + 1.3);
        break;
      }

      case 'pluck': {
        // Karplus-Strong / fast decay pluck
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 4, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + 0.25);

        gain.gain.setValueAtTime(0.85, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.28);
        break;
      }

      case 'kalimba': {
        // Gentle metallic tine
        const osc = this.ctx.createOscillator();
        const overtone = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.01, t);

        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        overtone.start(t);
        osc.stop(t + 0.65);
        overtone.stop(t + 0.65);
        break;
      }

      case 'percussion': {
        // Punchy 808-style tom / kick
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);

        gain.gain.setValueAtTime(1.0, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.25);
        break;
      }

      case 'synth':
      default: {
        // Warm polyphonic synth pad
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq, t);
        osc2.frequency.setValueAtTime(freq * 1.004, t); // Slight chorus detune

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 2.5, t);

        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.5);
        osc2.stop(t + 0.5);
        break;
      }
    }
  }
}

export const audioEngine = new AudioEngine();
