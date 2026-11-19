import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Heart } from 'lucide-react';
import { soundManager } from '../utils/audio';

type BreathPhase = 'Inhale' | 'Hold (Full)' | 'Exhale' | 'Hold (Empty)';

export const BreathingWidget: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const totalSeconds = 64; // 4 cycles of 16 seconds each = ~1 minute

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          if (prev >= totalSeconds - 1) {
            setIsActive(false);
            soundManager.playChime();
            return totalSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const cycleSeconds = elapsedSeconds % 16;
  const currentCycle = Math.min(4, Math.floor(elapsedSeconds / 16) + 1);

  let phase: BreathPhase = 'Inhale';
  let phaseProgress = 0; // 0 to 1

  if (cycleSeconds < 4) {
    phase = 'Inhale';
    phaseProgress = cycleSeconds / 4;
  } else if (cycleSeconds < 8) {
    phase = 'Hold (Full)';
    phaseProgress = 1;
  } else if (cycleSeconds < 12) {
    phase = 'Exhale';
    phaseProgress = 1 - (cycleSeconds - 8) / 4;
  } else {
    phase = 'Hold (Empty)';
    phaseProgress = 0;
  }

  // Toggle active
  const toggle = () => {
    soundManager.playClick();
    if (elapsedSeconds >= totalSeconds) {
      setElapsedSeconds(0);
    }
    setIsActive(!isActive);
  };

  const reset = () => {
    soundManager.playClick();
    setIsActive(false);
    setElapsedSeconds(0);
  };

  // Circle scaling: from 0.45 to 0.95
  const scale = 0.45 + phaseProgress * 0.5;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 pb-4 dark:border-neutral-800/60">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            1-Minute Reset
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Square breathwork: 4 seconds inhale, 4 seconds hold, 4 seconds exhale, 4 seconds calm.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Resonant Autonomic Balance</span>
          <span aria-hidden="true">·</span>
          <span>4 Cycles</span>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col items-center justify-center text-center">
        {/* Visual Breathing Orb */}
        <div className="relative flex items-center justify-center w-64 h-64 my-6">
          {/* Subtle Outer Boundary Ring */}
          <div className="absolute inset-0 rounded-full border border-neutral-200/80 dark:border-neutral-800/80" />

          {/* Pulsing Guide Ring */}
          <div
            className="w-56 h-56 rounded-full bg-neutral-900/5 dark:bg-neutral-100/5 transition-transform duration-1000 ease-in-out flex items-center justify-center"
            style={{ transform: `scale(${scale})` }}
          >
            <div className="w-32 h-32 rounded-full bg-neutral-900/10 dark:bg-neutral-100/10 flex items-center justify-center">
              <span className="font-mono text-2xl font-semibold tabular-nums text-neutral-900 dark:text-white">
                {isActive ? 4 - (cycleSeconds % 4) : '1m'}
              </span>
            </div>
          </div>
        </div>

        {/* Phase Name & Guidance */}
        <div className="space-y-1 mb-6">
          <div className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white transition-all">
            {isActive ? phase : elapsedSeconds >= totalSeconds ? 'Completed' : 'Ready'}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isActive
              ? `Cycle ${currentCycle} of 4 · ${(totalSeconds - elapsedSeconds)}s remaining`
              : 'Press Start to begin a 60-second nervous system reset'}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              isActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200'
            }`}
          >
            {isActive ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{elapsedSeconds > 0 && elapsedSeconds < totalSeconds ? 'Resume' : 'Start 1-Min Reset'}</span>
              </>
            )}
          </button>

          <button
            onClick={reset}
            className="p-2.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Reset"
            aria-label="Reset breathwork"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800/80 w-full max-w-md flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 text-rose-500" /> Lowers cortisol & stabilizes heart rate
          </span>
          <span className="tabular-nums">60 BPM target</span>
        </div>
      </div>
    </div>
  );
};
