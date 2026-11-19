class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMusicPlaying = false;
  private musicVolume = 0.45;
  private sfxVolume = 0.6;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Music sequencer state
  private tempo = 125; // BPM
  private currentStep = 0;
  private sequencerTimer: number | null = null;
  private scale = [130.81, 155.56, 174.61, 196.00, 233.08, 261.63, 311.13, 349.23, 392.00, 466.16]; // C minor pentatonic

  constructor() {
    // Lazily initialize on first interaction
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    }
  }

  public startMusic() {
    this.initContext();
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.currentStep = 0;
    this.scheduleNextBeat();
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.sequencerTimer !== null) {
      clearTimeout(this.sequencerTimer);
      this.sequencerTimer = null;
    }
  }

  public updateTempo(speedRatio: number) {
    // Speed ratio from 1.0 to 2.2
    this.tempo = Math.min(160, Math.max(115, 120 + (speedRatio - 1.0) * 35));
  }

  private scheduleNextBeat() {
    if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;

    const stepInterval = (60 / this.tempo) / 4; // 16th note in seconds
    const time = this.ctx.currentTime;

    // Bass note every quarter note (step % 4 === 0)
    if (this.currentStep % 4 === 0) {
      this.playSynthBass(time, this.currentStep % 16 === 0 ? 65.41 : 77.78);
    }

    // Hi-hat / shaker on off-beats
    if (this.currentStep % 2 === 1) {
      this.playHiHat(time);
    }

    // Polyrhythmic arpeggiated melodic lead (every 3 steps over 16 steps creates polyrhythm!)
    if ((this.currentStep * 3) % 4 === 0 || this.currentStep % 3 === 0) {
      const noteIndex = (this.currentStep * 2 + Math.floor(this.currentStep / 4)) % this.scale.length;
      const freq = this.scale[noteIndex];
      this.playSynthArp(time, freq);
    }

    this.currentStep = (this.currentStep + 1) % 64;

    const nextDelayMs = stepInterval * 1000;
    this.sequencerTimer = window.setTimeout(() => {
      this.scheduleNextBeat();
    }, nextDelayMs);
  }

  private playSynthBass(time: number, freq: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, time);
    filter.frequency.exponentialRampToValueAtTime(70, time + 0.25);

    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  private playSynthArp(time: number, freq: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, time);
    filter.Q.setValueAtTime(3, time);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  private playHiHat(time: number) {
    if (!this.ctx || !this.musicGain) return;
    // Short noise burst
    const bufferSize = this.ctx.sampleRate * 0.03;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.03);
  }

  // --- SFX METHODS ---

  public playCrystal(combo = 0) {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const baseFreq = 523.25; // C5
    const pentatonicRatios = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5];
    const pitchRatio = pentatonicRatios[combo % pentatonicRatios.length];
    const freq = baseFreq * pitchRatio;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.2, time + 0.12);

    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  public playJump() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(580, time + 0.18);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  public playSlide() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.22);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  public playPowerup() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const noteTime = time + i * 0.05;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.2, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    });
  }

  public playShieldBreak() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    // High glass shatter
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(900, time);
    osc.frequency.exponentialRampToValueAtTime(250, time + 0.25);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.28);
  }

  public playCrash() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    // Deep heavy impact
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.4);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.45);
  }

  public playBoostStart() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(600, time + 0.35);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.4);
  }

  public playNearMiss() {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.linearRampToValueAtTime(1200, time + 0.08);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.1);
  }
}

export const soundEngine = new SoundEngine();
