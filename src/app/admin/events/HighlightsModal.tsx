"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Images, Trash2, UploadCloud, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { acceptAttribute } from '@/lib/uploads';
import {
  HIGHLIGHT_CAPTION_EXAMPLES,
  MAX_EVENT_HIGHLIGHTS,
  MAX_HIGHLIGHT_CAPTION,
  type EventHighlight,
} from '@/lib/event-highlights';

/**
 * Where the event's highlight posters are actually managed: upload several at
 * once, caption each, put them in order, remove one.
 *
 * Edits apply to the form's draft as they happen — there is no Cancel — and
 * reach the database with the page's own Save, like every other field. The
 * modal stays mounted while closed so an upload started here keeps running,
 * and lands, if the organizer closes it mid-upload.
 *
 * `onChange` takes an updater rather than a list so an upload finishing after
 * a caption edit cannot overwrite that edit with a stale copy. Uploads run
 * together but land in the order they were picked.
 *
 * Portalled to <body>: the event form sits in panels whose backdrop-filter
 * would otherwise become the containing block for this fixed overlay.
 */
export default function HighlightsModal({
  isOpen,
  isClosing,
  value,
  onChange,
  onError,
  onBusyChange,
  onClose,
}: {
  isOpen: boolean;
  isClosing: boolean;
  value: EventHighlight[];
  onChange: (update: (prev: EventHighlight[]) => EventHighlight[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [mounted, setMounted] = useState(false);
  const room = MAX_EVENT_HIGHLIGHTS - value.length;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    const files = picked.slice(0, Math.max(room, 0));
    if (files.length < picked.length) {
      onError(`Only ${MAX_EVENT_HIGHLIGHTS} highlight images are allowed per event. The extra ${picked.length - files.length === 1 ? 'file was' : 'files were'} skipped.`);
    }
    if (files.length === 0) return;

    setUploading(n => n + files.length);
    onBusyChange(true);
    try {
      const results = await Promise.allSettled(
        files.map(async file => {
          const body = new FormData();
          body.append('file', file);
          const res = await fetch('/api/upload', { method: 'POST', body });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');
          return data.url as string;
        })
      );
      const added = results.flatMap(r => (r.status === 'fulfilled' ? [{ url: r.value, caption: '' }] : []));
      const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      if (added.length) {
        onChange(prev => [...prev, ...added].slice(0, MAX_EVENT_HIGHLIGHTS));
      }
      if (failed.length) {
        onError(`${failed.length} of ${files.length} images failed to upload: ${failed[0].reason?.message || 'Upload failed'}`);
      }
    } finally {
      setUploading(n => n - files.length);
      onBusyChange(false);
    }
  };

  const setCaption = (idx: number, caption: string) =>
    onChange(prev => prev.map((h, i) => (i === idx ? { ...h, caption } : h)));

  const move = (idx: number, by: -1 | 1) =>
    onChange(prev => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(idx + by, 0, item);
      return next;
    });

  const remove = (idx: number) => onChange(prev => prev.filter((_, i) => i !== idx));

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden={!isOpen}
    >
      <div
        className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-highlights-title"
      >
        <div className="p-6 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue-ink shrink-0">
              <Images size={20} />
            </span>
            <div className="min-w-0">
              <h3 id="event-highlights-title" className="text-xl font-semibold text-primary m-0">
                Event Highlights
              </h3>
              <p className="text-sm text-secondary m-0 mt-1">
                Up to {MAX_EVENT_HIGHLIGHTS} images, shown on the event page in this order.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-secondary hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 overflow-y-auto flex flex-col gap-4">
          {value.length > 0 && (
            <ol className="highlight-list">
              {value.map((h, idx) => (
                <li key={`${h.url}-${idx}`} className="highlight-row">
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="highlight-thumb">
                    <img src={h.url} alt={h.caption || `Highlight ${idx + 1}`} />
                  </a>
                  <div className="highlight-body">
                    <input
                      type="text"
                      value={h.caption}
                      onChange={e => setCaption(idx, e.target.value)}
                      maxLength={MAX_HIGHLIGHT_CAPTION}
                      placeholder={HIGHLIGHT_CAPTION_EXAMPLES}
                      aria-label={`Caption for highlight ${idx + 1}`}
                      className="form-input"
                    />
                    <div className="highlight-actions">
                      <button
                        type="button"
                        className="highlight-action"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move highlight ${idx + 1} up`}
                      >
                        <ArrowUp size={14} /> Up
                      </button>
                      <button
                        type="button"
                        className="highlight-action"
                        onClick={() => move(idx, 1)}
                        disabled={idx === value.length - 1}
                        aria-label={`Move highlight ${idx + 1} down`}
                      >
                        <ArrowDown size={14} /> Down
                      </button>
                      <button
                        type="button"
                        className="highlight-action highlight-action--danger"
                        onClick={() => remove(idx)}
                        aria-label={`Remove highlight ${idx + 1}`}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {room > 0 && (
            <div
              className={`file-upload-wrapper${value.length ? ' file-upload-wrapper--compact' : ''}`}
              style={{ opacity: uploading ? 0.6 : 1 }}
            >
              <input
                type="file"
                accept={acceptAttribute('image')}
                multiple
                onChange={handleUpload}
                className="file-upload-input"
                disabled={uploading > 0}
                tabIndex={isOpen ? 0 : -1}
              />
              <div className="file-upload-content">
                <div className="file-upload-icon">
                  <UploadCloud size={value.length ? 24 : 32} />
                </div>
                <div className="file-upload-title">
                  {uploading > 0 ? (
                    <BusyLabel>{`Uploading ${uploading} ${uploading === 1 ? 'image' : 'images'}`}</BusyLabel>
                  ) : value.length ? (
                    'Add more images'
                  ) : (
                    'Click to upload images'
                  )}
                </div>
                <div className="file-upload-desc">
                  Race kit, trophies, venue, after party — pick several at once
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="admin-modal-footer p-6 border-t border-[var(--dash-border)] flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="btn-light">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
