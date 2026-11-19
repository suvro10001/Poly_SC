import React, { useState, useEffect } from 'react';
import { Task, TimerPreset, AmbientSound } from '../types';
import { soundManager } from '../utils/audio';
import { Play, Pause, RotateCcw, Volume2, VolumeX, CheckCircle2, Circle, Edit3, ArrowRight } from 'lucide-react';

interface FocusHeroProps {
  primaryTask: Task | null;
  onToggleComplete: (id: string) => void;
  onUpdateTitle: (id: string, newTitle: string) => void;
  onCreatePrimaryTask: (title: string) => void;
  onOpenQueue: () => void;
  timerSeconds: number;
  setTimerSeconds: React.Dispatch<React.SetStateAction<number>>;
  isTimerRunning: boolean;
  setIsTimerRunning: React.Dispatch<React.SetStateAction<boolean>>;
  activePreset: TimerPreset;
  setActivePreset: (preset: TimerPreset) => void;
  ambientSound: AmbientSound;
  setAmbientSound: (sound: AmbientSound) => void;
  ambientVolume: number;
  setAmbientVolume: (vol: number) => void;
  onTaskCompleted: () => void;
}

export const FocusHero: React.FC<FocusHeroProps> = ({
  primaryTask,
  onToggleComplete,
  onUpdateTitle,
  onCreatePrimaryTask,
  onOpenQueue,
  timerSeconds,
  setTimerSeconds,
  isTimerRunning,
  setIsTimerRunning,
  activePreset,
  setActivePreset,
  ambientSound,
  setAmbientSound,
  ambientVolume,
  setAmbientVolume,
  onTaskCompleted,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (primaryTask) {
      setEditText(primaryTask.title);
    }
  }, [primaryTask]);

  // Audio ambient effect
  useEffect(() => {
    if (isTimerRunning && !isMuted) {
      soundManager.playAmbient(ambientSound, ambientVolume);
    } else {
      soundManager.stopAmbient();
    }
    return () => {
      soundManager.stopAmbient();
    };
  }, [isTimerRunning, ambientSound, ambientVolume, isMuted]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePresetSelect = (preset: TimerPreset) => {
    soundManager.playClick();
    setActivePreset(preset);
    setIsTimerRunning(false);
    setTimerSeconds(preset * 60);
  };

  const toggleTimer = () => {
    soundManager.playClick();
    setIsTimerRunning(!isTimerRunning);
  };

  const resetTimer = () => {
    soundManager.playClick();
    setIsTimerRunning(false);
    setTimerSeconds(activePreset * 60);
  };

  const handleCompletePrimary = () => {
    if (!primaryTask) return;
    soundManager.playChime();
    onToggleComplete(primaryTask.id);
    onTaskCompleted();
  };

  const handleSaveEdit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!primaryTask || !editText.trim()) return;
    onUpdateTitle(primaryTask.id, editText.trim());
    setIsEditing(false);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreatePrimaryTask(newTitle.trim());
    setNewTitle('');
  };

  const progressPercentage = Math.max(
    0,
    Math.min(100, ((activePreset * 60 - timerSeconds) / (activePreset * 60)) * 100)
  );

  return (
    <div className="space-y-8">
      {/* Top Banner / Philosophy Kicker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 pb-4 dark:border-neutral-800/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            The Single Focus
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Do not multitask. Eliminate the non-essential until only the #1 priority remains.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Priority 1 of 1</span>
          <span aria-hidden="true">·</span>
          <span>Single-Task Protocol</span>
        </div>
      </div>

      {/* Primary Task Spotlight Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 transition-all">
        <div className="flex items-center justify-between gap-4 mb-3">
          <span className="text-xs font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500">
            Active #1 Priority
          </span>
          <button
            onClick={onOpenQueue}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white flex items-center gap-1 transition-colors"
          >
            <span>View Queue</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {primaryTask ? (
          <div>
            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-base text-neutral-900 focus:border-neutral-900 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-neutral-100"
                  autoFocus
                />
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <button
                    onClick={handleCompletePrimary}
                    className="mt-0.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100 transition-colors"
                    aria-label="Mark task complete"
                  >
                    {primaryTask.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
                    ) : (
                      <Circle className="w-6 h-6 hover:scale-105 transition-transform" />
                    )}
                  </button>
                  <div className="flex-1">
                    <p
                      className={`text-lg sm:text-xl font-semibold leading-snug tracking-tight ${
                        primaryTask.completed
                          ? 'line-through text-neutral-400 dark:text-neutral-500'
                          : 'text-neutral-900 dark:text-white'
                      }`}
                    >
                      {primaryTask.title}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span>Focused for {primaryTask.focusMinutesSpent}m</span>
                      <span aria-hidden="true">·</span>
                      <span>Added today</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  aria-label="Edit priority title"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateNew} className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No single priority selected yet. Define your primary outcome for right now:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g., Draft executive summary for product review"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-neutral-100"
              />
              <button
                type="submit"
                className="rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors whitespace-nowrap shrink-0"
              >
                Set as #1 Focus
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Focus Timer & Synthesized Ambient Sound Controller */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-6">
        {/* Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            {([
              { val: 25, label: '25m Flow' },
              { val: 50, label: '50m Deep' },
              { val: 15, label: '15m Spark' },
              { val: 5, label: '5m Rest' },
            ] as const).map((preset) => (
              <button
                key={preset.val}
                onClick={() => handlePresetSelect(preset.val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activePreset === preset.val
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            <span>Flow Block</span>
            <span aria-hidden="true">·</span>
            <span>Autosaves progress</span>
          </div>
        </div>

        {/* Big Tabular Timer Display */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="font-mono text-6xl sm:text-7xl font-semibold tracking-tighter tabular-nums text-neutral-900 dark:text-white">
            {formatTime(timerSeconds)}
          </div>

          {/* Progress bar line */}
          <div className="w-full max-w-md h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full mt-4 overflow-hidden">
            <div
              className="h-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Timer Controls */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={toggleTimer}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                isTimerRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200'
              }`}
            >
              {isTimerRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Begin Focus</span>
                </>
              )}
            </button>

            <button
              onClick={resetTimer}
              className="p-2.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title="Reset timer"
              aria-label="Reset timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setTimerSeconds((prev) => prev + 300)}
              className="px-3 py-2.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors tabular-nums"
              title="Add 5 minutes"
            >
              +5 min
            </button>
          </div>
        </div>

        {/* Ambient Soundscape Synthesizer Controls */}
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Focus Soundscape (Offline Web Audio)
            </span>
            <span>{isTimerRunning ? 'Plays during active session' : 'Starts with focus block'}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              {([
                { id: 'none', label: 'Mute' },
                { id: 'brown-noise', label: 'Brown Noise' },
                { id: 'rain', label: 'Rain Wash' },
                { id: 'binaural', label: '432 Hz Theta' },
                { id: 'stream', label: 'Gentle Stream' },
              ] as const).map((sound) => (
                <button
                  key={sound.id}
                  onClick={() => {
                    soundManager.playClick();
                    setAmbientSound(sound.id);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    ambientSound === sound.id
                      ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  {sound.label}
                </button>
              ))}
            </div>

            {ambientSound !== 'none' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
                  className="w-20 sm:w-28 accent-neutral-900 dark:accent-neutral-100 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg cursor-pointer"
                  aria-label="Soundscape volume"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
