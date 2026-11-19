import React, { useState } from 'react';
import { Task } from '../types';
import { soundManager } from '../utils/audio';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Star,
  ArrowUp,
  ArrowDown,
  Edit2,
  Check,
} from 'lucide-react';

interface TaskQueueProps {
  tasks: Task[];
  onAddTask: (title: string) => void;
  onToggleComplete: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (id: string, direction: 'up' | 'down') => void;
  onUpdateTitle: (id: string, title: string) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({
  tasks,
  onAddTask,
  onToggleComplete,
  onSetPrimary,
  onDeleteTask,
  onMoveTask,
  onUpdateTitle,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    soundManager.playClick();
    onAddTask(newTitle.trim());
    setNewTitle('');
  };

  const handleStartEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onUpdateTitle(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const activeCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-6">
      {/* Header and Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/60 pb-4 dark:border-neutral-800/60">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Daily Priority Queue
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Keep your backlog lean. Only one item earns the primary focus shield.
          </p>
        </div>

        {/* Interactive Segmented Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filter === 'active'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filter === 'completed'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Done ({completedCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filter === 'all'
                ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            All ({tasks.length})
          </button>
        </div>
      </div>

      {/* Add Task Input Form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Queue next high-leverage task..."
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-neutral-100"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      </form>

      {/* Task List Table / Container */}
      <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800/80">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              {filter === 'completed'
                ? 'No completed tasks yet. Finish your #1 focus to see it here.'
                : 'No tasks in this view. Keep a minimal queue so you never feel overwhelmed.'}
            </p>
            {filter !== 'active' && (
              <button
                onClick={() => setFilter('active')}
                className="text-xs text-neutral-900 font-semibold hover:underline dark:text-white"
              >
                Return to Active Tasks
              </button>
            )}
          </div>
        ) : (
          filteredTasks.map((task, index) => {
            const isEditing = editingId === task.id;

            return (
              <div
                key={task.id}
                className={`flex items-center justify-between gap-3 p-3.5 sm:px-4 transition-colors ${
                  task.isPrimary
                    ? 'bg-neutral-50/70 dark:bg-neutral-800/30'
                    : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20'
                }`}
              >
                {/* Left: Checkbox & Title */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => {
                      soundManager.playClick();
                      onToggleComplete(task.id);
                    }}
                    className="text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100 shrink-0"
                    aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(task.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(task.id)}
                        className="p-1 text-emerald-600 hover:text-emerald-700"
                        title="Save edit"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            task.completed
                              ? 'line-through text-neutral-400 dark:text-neutral-500'
                              : 'text-neutral-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.isPrimary && (
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-0.5 shrink-0">
                            #1 Focus
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                        <span className="tabular-nums">{task.focusMinutesSpent}m focus</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(task.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!task.completed && (
                    <button
                      onClick={() => {
                        soundManager.playClick();
                        onSetPrimary(task.id);
                      }}
                      className={`p-1.5 rounded-md transition-colors ${
                        task.isPrimary
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white'
                      }`}
                      title={task.isPrimary ? 'Current #1 focus' : 'Set as #1 focus'}
                      aria-label="Set as #1 focus"
                    >
                      <Star className={`w-4 h-4 ${task.isPrimary ? 'fill-current' : ''}`} />
                    </button>
                  )}

                  <div className="hidden sm:flex items-center">
                    <button
                      onClick={() => onMoveTask(task.id, 'up')}
                      disabled={index === 0}
                      className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 dark:text-neutral-500 dark:hover:text-white"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onMoveTask(task.id, 'down')}
                      disabled={index === filteredTasks.length - 1}
                      className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 dark:text-neutral-500 dark:hover:text-white"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleStartEdit(task)}
                    className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white rounded-md transition-colors"
                    title="Edit task"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      soundManager.playClick();
                      onDeleteTask(task.id);
                    }}
                    className="p-1.5 text-neutral-400 hover:text-rose-600 dark:text-neutral-500 dark:hover:text-rose-400 rounded-md transition-colors"
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
