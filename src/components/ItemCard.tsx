import React, { useState } from 'react';
import {
  Pin,
  Copy,
  Check,
  Trash2,
  Edit2,
  ExternalLink,
  Code2,
  CheckSquare,
  Square,
  FileText,
  Tag,
  Share2,
  Clock,
  Sparkles
} from 'lucide-react';
import { QuickSaveItem, ItemType } from '../types';
import { copyToClipboard, formatTimeAgo } from '../utils';

interface ItemCardProps {
  item: QuickSaveItem;
  onUpdate: (id: string, updates: Partial<QuickSaveItem>) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onUpdate,
  onDelete,
  onTagClick,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>(item.title);
  const [editContent, setEditContent] = useState<string>(item.content);
  const [editType, setEditType] = useState<ItemType>(item.type);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(item.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(item.id, { pinned: !item.pinned });
  };

  const handleSaveEdit = () => {
    onUpdate(item.id, {
      title: editTitle.trim() || 'Untitled Note',
      content: editContent.trim(),
      type: editType,
      updatedAt: Date.now(),
    });
    setIsEditing(false);
  };

  const handleToggleTodoItem = (index: number) => {
    const lines = item.content.split('\n');
    let todoCount = 0;
    const newLines = lines.map((line) => {
      const isChecked = line.trim().startsWith('- [x]') || line.trim().startsWith('[x]');
      const isUnchecked = line.trim().startsWith('- [ ]') || line.trim().startsWith('[ ]');

      if (isChecked || isUnchecked) {
        if (todoCount === index) {
          todoCount++;
          if (isChecked) {
            return line.replace(/(\- )?\[x\]/, '$1[ ]');
          } else {
            return line.replace(/(\- )?\[ \]/, '$1[x]');
          }
        }
        todoCount++;
      }
      return line;
    });

    onUpdate(item.id, { content: newLines.join('\n'), updatedAt: Date.now() });
  };

  // Helper icon for types
  const getTypeBadge = () => {
    switch (item.type) {
      case 'link':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
            <ExternalLink className="w-3 h-3" /> Link
          </span>
        );
      case 'code':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            <Code2 className="w-3 h-3" /> Code
          </span>
        );
      case 'todo':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
            <CheckSquare className="w-3 h-3" /> Checklist
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
            <FileText className="w-3 h-3" /> Note
          </span>
        );
    }
  };

  // Render content based on type
  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="space-y-2 mt-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title"
            className="w-full px-2.5 py-1 text-sm font-semibold border border-stone-300 rounded-lg focus:outline-none focus:border-stone-500"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            className="w-full px-2.5 py-1 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-stone-500 font-mono text-xs"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-1">
              {(['text', 'link', 'code', 'todo'] as ItemType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEditType(t)}
                  className={`px-2 py-0.5 text-xs rounded capitalize ${
                    editType === t ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-xs bg-stone-900 text-white rounded font-medium hover:bg-stone-800"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (item.type === 'link') {
      const url = item.content.trim().split('\n')[0].trim();
      const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
      const description = item.content.trim().split('\n').slice(1).join('\n');

      return (
        <div className="mt-2 space-y-1.5">
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline break-all group"
          >
            <span>{url}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 inline flex-shrink-0" />
          </a>
          {description && (
            <p className="text-xs text-stone-600 whitespace-pre-wrap leading-relaxed">
              {description}
            </p>
          )}
        </div>
      );
    }

    if (item.type === 'code') {
      return (
        <div className="mt-2 relative">
          <pre className="bg-stone-900 text-stone-100 text-xs p-3 rounded-lg overflow-x-auto font-mono leading-relaxed max-h-60 border border-stone-800">
            <code>{item.content}</code>
          </pre>
        </div>
      );
    }

    if (item.type === 'todo') {
      const lines = item.content.split('\n');
      let todoIdx = 0;

      return (
        <div className="mt-2 space-y-1.5">
          {lines.map((line, lIdx) => {
            const isChecked = line.trim().startsWith('- [x]') || line.trim().startsWith('[x]');
            const isUnchecked = line.trim().startsWith('- [ ]') || line.trim().startsWith('[ ]');

            if (isChecked || isUnchecked) {
              const currentIdx = todoIdx++;
              const label = line.replace(/^(\s*(\-|\*)\s*)?\[(x|\s)\]\s*/, '');
              return (
                <div
                  key={lIdx}
                  onClick={() => handleToggleTodoItem(currentIdx)}
                  className="flex items-start gap-2 text-xs sm:text-sm text-stone-700 cursor-pointer group hover:text-stone-950"
                >
                  <button className="mt-0.5 text-stone-400 group-hover:text-stone-700 transition-colors">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-purple-600 fill-purple-100" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-400" />
                    )}
                  </button>
                  <span className={isChecked ? 'line-through text-stone-400' : 'text-stone-700'}>
                    {label}
                  </span>
                </div>
              );
            }

            return (
              <p key={lIdx} className="text-xs sm:text-sm text-stone-600 whitespace-pre-wrap">
                {line}
              </p>
            );
          })}
        </div>
      );
    }

    // Default Plain Text Note
    return (
      <div className="mt-2">
        <p className="text-xs sm:text-sm text-stone-700 whitespace-pre-wrap leading-relaxed break-words font-sans">
          {item.content}
        </p>
      </div>
    );
  };

  return (
    <div
      id={`note-card-${item.id}`}
      className={`group relative bg-white rounded-xl border transition-all hover:shadow-md ${
        item.pinned
          ? 'border-amber-300/80 bg-amber-50/20 shadow-xs ring-1 ring-amber-300/40'
          : 'border-stone-200/90 hover:border-stone-300'
      } p-4 flex flex-col justify-between`}
    >
      <div>
        {/* Top bar with metadata, title and actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {getTypeBadge()}
              {item.pinned && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                  <Pin className="w-2.5 h-2.5 fill-amber-700" /> Pinned
                </span>
              )}
            </div>

            {!isEditing && (
              <h3 className="font-semibold text-stone-900 text-sm sm:text-base leading-snug line-clamp-2">
                {item.title}
              </h3>
            )}
          </div>

          {/* Quick Action buttons */}
          <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleTogglePin}
              className={`p-1.5 rounded-lg transition-colors ${
                item.pinned
                  ? 'text-amber-600 hover:bg-amber-100'
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
              }`}
              title={item.pinned ? 'Unpin note' : 'Pin note to top'}
            >
              <Pin className={`w-3.5 h-3.5 ${item.pinned ? 'fill-amber-600' : ''}`} />
            </button>

            <button
              onClick={handleCopy}
              className={`p-1.5 rounded-lg transition-colors ${
                copied
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
              }`}
              title="Copy content to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              title="Edit note"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        {renderContent()}
      </div>

      {/* Footer: Tags & Timestamp */}
      <div className="mt-3 pt-2.5 border-t border-stone-100/90 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
        <div className="flex flex-wrap items-center gap-1">
          {item.tags && item.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 font-mono text-[11px]" title={new Date(item.createdAt).toLocaleString()}>
          <Clock className="w-3 h-3 text-stone-300" />
          <span>{formatTimeAgo(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
};
