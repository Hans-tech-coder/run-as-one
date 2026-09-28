'use client';

/**
 * "About This Event" with a formatting toolbar.
 *
 * Still a textarea underneath: the toolbar only writes the small Markdown
 * subset `src/lib/rich-text.ts` reads, so the stored value stays a plain string
 * and every description written before this still renders. Preview draws it
 * with the same component the public event page uses.
 *
 * Shared by the create and edit forms so the two never format differently.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react';
import RichText from '@/components/RichText';

type LineStyle = 'heading' | 'bullets' | 'numbers';

const PREFIX = /^(\s*)(#{1,3}\s+|[-*•]\s+|\d+[.)]\s+)/;
const LIST_ITEM = /^(\s*)([-*•]|\d+[.)])\s+/;

const IS_STYLE: Record<LineStyle, RegExp> = {
  heading: /^#{1,3}\s+/,
  bullets: /^\s*[-*•]\s+/,
  numbers: /^\s*\d+[.)]\s+/,
};

export default function DescriptionEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  /** Commit a new value and put the caret/selection back where it belongs. */
  function commit(next: string, start: number, end = start) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  /** Bold or italic around the selection — or off again if it is already on. */
  function wrap(marker: string, sample: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const m = marker.length;

    if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
      commit(value.slice(0, s - m) + value.slice(s, e) + value.slice(e + m), s - m, e - m);
      return;
    }
    const text = value.slice(s, e) || sample;
    commit(value.slice(0, s) + marker + text + marker + value.slice(e), s + m, s + m + text.length);
  }

  /** Turn every line the selection touches into a heading or list item, or back. */
  function styleLines(style: LineStyle) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const newline = value.indexOf('\n', e);
    const to = newline === -1 ? value.length : newline;

    const lines = value.slice(from, to).split('\n');
    const filled = lines.filter(line => line.trim());
    const alreadyOn = filled.length > 0 && filled.every(line => IS_STYLE[style].test(line));

    let n = 0;
    const next = lines
      .map(line => {
        const bare = line.replace(PREFIX, '');
        if (alreadyOn || !line.trim()) return bare;
        if (style === 'heading') return `## ${bare}`;
        if (style === 'bullets') return `- ${bare}`;
        return `${++n}. ${bare}`;
      })
      .join('\n');

    commit(value.slice(0, from) + next + value.slice(to), from, from + next.length);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b') { event.preventDefault(); wrap('**', 'bold text'); }
      if (key === 'i') { event.preventDefault(); wrap('*', 'italic text'); }
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;

    // Enter inside a list starts the next item; Enter on an empty item ends
    // the list, the way every editor an organizer has used behaves.
    const el = event.currentTarget;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s !== e) return;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const line = value.slice(from, s);
    const item = LIST_ITEM.exec(line);
    if (!item) return;

    event.preventDefault();
    if (!line.slice(item[0].length).trim()) {
      commit(value.slice(0, from) + value.slice(s), from);
      return;
    }
    const numbered = /^\d+/.exec(item[2]);
    const marker = numbered
      ? `${Number(numbered[0]) + 1}${item[2].slice(-1)} `
      : `${item[2]} `;
    const insert = `\n${item[1]}${marker}`;
    commit(value.slice(0, s) + insert + value.slice(e), s + insert.length);
  }

  const tools = [
    { label: 'Bold (Ctrl+B)', icon: Bold, run: () => wrap('**', 'bold text') },
    { label: 'Italic (Ctrl+I)', icon: Italic, run: () => wrap('*', 'italic text') },
    { label: 'Heading', icon: Heading2, run: () => styleLines('heading') },
    { label: 'Bulleted list', icon: List, run: () => styleLines('bullets') },
    { label: 'Numbered list', icon: ListOrdered, run: () => styleLines('numbers') },
  ];

  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar">
        <div className="rich-editor-tools" role="toolbar" aria-label="Formatting">
          {tools.map(tool => (
            <button
              key={tool.label}
              type="button"
              className="rich-editor-btn"
              title={tool.label}
              aria-label={tool.label}
              disabled={preview}
              // Keep the textarea's selection: a click would otherwise blur it first.
              onMouseDown={event => event.preventDefault()}
              onClick={tool.run}
            >
              <tool.icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="rich-editor-tabs" role="tablist" aria-label="Editor view">
          <button
            type="button"
            role="tab"
            aria-selected={!preview}
            className="rich-editor-tab"
            onClick={() => setPreview(false)}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preview}
            className="rich-editor-tab"
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
        </div>
      </div>

      {preview ? (
        <div className="rich-editor-preview">
          {value.trim() ? (
            <RichText source={value} />
          ) : (
            <p className="rich-editor-empty">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className="rich-editor-input"
          rows={8}
          placeholder={placeholder}
          aria-label="About This Event"
        />
      )}
    </div>
  );
}
