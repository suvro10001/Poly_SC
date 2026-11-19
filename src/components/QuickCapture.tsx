import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Pin,
  Link,
  Code2,
  CheckSquare,
  FileText,
  Sparkles,
  Tag,
  RotateCcw,
  Check,
  Hash
} from 'lucide-react';
import { ItemType, QuickSaveItem } from '../types';
import { detectContentType, extractTags, extractTitle, STORAGE_KEY_DRAFT } from '../utils';

interface QuickCaptureProps {
  onSave: (item: Omit<QuickSaveItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const QuickCapture: React.FC<QuickCaptureProps> = ({ onSave }) => {
  const [content, setContent] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_DRAFT) || '';
  });
  const [customTitle, setCustomTitle] = useState<string>('');
  const [showTitleInput, setShowTitleInput] = useState<boolean>(false);
  const [manualType, setManualType] = useState<ItemType | null>(null);
  const [pinned, setPinned] = useState<boolean>(false);
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save draft to localStorage whenever content changes
  useEffect(() => {
    if (content) {
      localStorage.setItem(STORAGE_KEY_DRAFT, content);
    } else {
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    }
  }, [content]);

  // Detected type
  const detectedType = detectContentType(content);
  const activeType = manualType || detectedType;

  // Extracted tags
  const inlineTags = extractTags(content);
  const allTags = Array.from(new Set([...inlineTags, ...manualTags]));

  // Handle Save
  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed && !customTitle.trim()) return;

    let finalTitle = customTitle.trim();
    if (!finalTitle) {
      const extracted = extractTitle(trimmed);
      finalTitle = extracted.title;
    }

    onSave({
      title: finalTitle,
      content: trimmed,
      type: activeType,
      tags: allTags,
      pinned,
      completed: activeType === 'todo' ? false : undefined,
    });

    // Reset state & clear draft
    setContent('');
    setCustomTitle('');
    setShowTitleInput(false);
    setManualType(null);
    setPinned(false);
    setManualTags([]);
    setTagInput('');
    setShowTagInput(false);
    localStorage.removeItem(STORAGE_KEY_DRAFT);

    // Show feedback animation
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);

    // Focus back on textarea
    textareaRef.current?.focus();
  };

  // Keyboard shortcut listener
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape' && content) {
      if (confirm('Discard current quick note draft?')) {
        setContent('');
        localStorage.removeItem(STORAGE_KEY_DRAFT);
      }
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const cleaned = tagInput.trim().replace(/^#/, '').toLowerCase();
      if (cleaned && !manualTags.includes(cleaned)) {
        setManualTags([...manualTags, cleaned]);
      }
      setTagInput('');
    }
  };

  const removeManualTag = (tag: string) => {
    setManualTags(manualTags.filter(t => t !== tag));
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 transition-all focus-within:border-stone-400 focus-within:shadow-md">
      {/* Title area (Optional / Expandable) */}
      {showTitleInput && (
        <div className="mb-3 animate-in fade-in duration-150">
          <input
            id="custom-title-input"
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Custom title (optional)..."
            className="w-full px-3 py-1.5 text-sm font-semibold text-stone-900 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:bg-white focus:border-stone-400 placeholder-stone-400"
          />
        </div>
      )}

      {/* Main input */}
      <div className="relative">
        <textarea
          id="quick-capture-textarea"
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={Math.min(10, Math.max(3, content.split('\n').length))}
          placeholder="Type or paste anything to save quickly... (URLs, code, task lists, scratchpad thoughts)"
          className="w-full resize-none text-stone-800 placeholder-stone-400 text-sm sm:text-base leading-relaxed focus:outline-none font-sans"
        />
      </div>

      {/* Detected tags & quick badge preview */}
      {(allTags.length > 0 || showTagInput) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 border-t border-stone-100 mt-2">
          {allTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/80"
            >
              #{tag}
              {manualTags.includes(tag) && (
                <button
                  onClick={() => removeManualTag(tag)}
                  className="text-amber-600 hover:text-amber-900 ml-0.5 text-[10px]"
                >
                  ✕
                </button>
              )}
            </span>
          ))}

          {showTagInput && (
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="tag + Enter"
                className="w-24 px-2 py-0.5 text-xs bg-stone-50 border border-stone-200 rounded focus:outline-none focus:border-stone-400"
              />
            </div>
          )}
        </div>
      )}

      {/* Bottom control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-stone-100">
        {/* Type selector & formatting triggers */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Detected / selected Type Badge */}
          <div className="inline-flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs">
            <button
              id="type-toggle-auto"
              onClick={() => setManualType(null)}
              className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                manualType === null
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
              title="Auto-detect content type"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Auto ({detectedType})</span>
            </button>

            <button
              id="type-toggle-note"
              onClick={() => setManualType('text')}
              className={`p-1 rounded-md transition-colors ${
                manualType === 'text'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="Force Text/Note"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
            <button
              id="type-toggle-link"
              onClick={() => setManualType('link')}
              className={`p-1 rounded-md transition-colors ${
                manualType === 'link'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="Force Link"
            >
              <Link className="w-3.5 h-3.5" />
            </button>
            <button
              id="type-toggle-code"
              onClick={() => setManualType('code')}
              className={`p-1 rounded-md transition-colors ${
                manualType === 'code'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="Force Code Snippet"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="type-toggle-todo"
              onClick={() => setManualType('todo')}
              className={`p-1 rounded-md transition-colors ${
                manualType === 'todo'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="Force Checklist/Todo"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pin toggle */}
          <button
            id="pin-toggle-button"
            onClick={() => setPinned(!pinned)}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors ${
              pinned
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
            }`}
            title="Pin this note to the top"
          >
            <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-amber-700 text-amber-700' : ''}`} />
            <span>{pinned ? 'Pinned' : 'Pin'}</span>
          </button>

          {/* Add Tag trigger */}
          <button
            id="tag-toggle-button"
            onClick={() => setShowTagInput(!showTagInput)}
            className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors"
            title="Add tags"
          >
            <Tag className="w-3.5 h-3.5 text-stone-400" />
            <span>Tag</span>
          </button>

          {/* Title toggle */}
          {!showTitleInput && (
            <button
              id="title-toggle-button"
              onClick={() => setShowTitleInput(true)}
              className="px-2 py-1 rounded-lg text-xs font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
            >
              + Title
            </button>
          )}
        </div>

        {/* Counter & Submit Button */}
        <div className="flex items-center gap-3">
          {content.length > 0 && (
            <div className="text-[11px] text-stone-400 hidden sm:flex items-center gap-2 font-mono">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>{charCount} chars</span>
              <span>•</span>
              <span className="text-emerald-600 font-sans font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Autosaved
              </span>
            </div>
          )}

          {content && (
            <button
              id="clear-draft-button"
              onClick={() => {
                setContent('');
                localStorage.removeItem(STORAGE_KEY_DRAFT);
              }}
              className="text-stone-400 hover:text-stone-600 p-1 rounded-md"
              title="Clear scratchpad (Esc)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            id="save-quick-button"
            onClick={handleSave}
            disabled={!content.trim() && !customTitle.trim()}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              savedFeedback
                ? 'bg-emerald-600 text-white'
                : content.trim()
                ? 'bg-stone-900 hover:bg-stone-800 text-white cursor-pointer active:scale-95'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
          >
            {savedFeedback ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Save Note</span>
                <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-stone-700 text-stone-300 rounded font-mono">
                  ⌘↵
                </kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
