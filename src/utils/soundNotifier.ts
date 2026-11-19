// Web Audio API "Tong" Bell / Notification Sound Synthesizer
// Works cleanly inside iframes & browsers with zero external audio files.

const SOUND_MUTE_STORAGE_KEY = 'polycables_comm_sound_muted';

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  if (!audioUnlocked) {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioUnlocked = true;
    } catch {
      // Ignore unlock errors before user gesture
    }
  }
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(SOUND_MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {}
}

function triggerPartial(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Plays a crisp resonant "TONG" bell chime using Web Audio API harmonics.
 * - 'notification': Deep warm two-part bell chime ("T-O-N-G")
 * - 'message': Clean single crystal bell chime
 * - 'call': Repeating urgent attention chime
 */
export function playTongSound(kind: 'notification' | 'message' | 'call' = 'notification', force = false): void {
  if (!force && isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime + 0.01;

    if (kind === 'message') {
      // Crisp bright crystal "Tong"
      triggerPartial(ctx, 783.99, now, 0.55, 0.24, 'sine'); // G5 fundamental
      triggerPartial(ctx, 1567.98, now, 0.35, 0.1, 'triangle'); // octave shimmer
      triggerPartial(ctx, 1174.66, now + 0.07, 0.55, 0.14, 'sine'); // D6 fifth
      return;
    }

    if (kind === 'call') {
      // Attention ring chime ("Tong-Tong")
      triggerPartial(ctx, 659.25, now, 0.45, 0.26, 'sine');
      triggerPartial(ctx, 1318.5, now, 0.3, 0.1, 'triangle');
      triggerPartial(ctx, 987.77, now + 0.18, 0.55, 0.24, 'sine');
      triggerPartial(ctx, 1975.5, now + 0.18, 0.35, 0.09, 'triangle');
      return;
    }

    // Default 'notification': Warm resonant temple/desk bell "TONG"
    triggerPartial(ctx, 587.33, now, 0.85, 0.28, 'sine'); // D5 body
    triggerPartial(ctx, 880.0, now, 0.72, 0.2, 'sine'); // A5 resonant bell
    triggerPartial(ctx, 1760.0, now, 0.38, 0.08, 'triangle'); // upper shimmer
    triggerPartial(ctx, 1174.66, now + 0.08, 0.75, 0.16, 'sine'); // D6 bloom
  } catch {
    // Ignore playback errors cleanly
  }
}
