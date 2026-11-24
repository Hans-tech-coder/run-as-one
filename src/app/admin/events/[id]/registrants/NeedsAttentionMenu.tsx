"use client";

import React, { useEffect, useRef, useState } from 'react';
import { BellDot, Check, X } from 'lucide-react';

/**
 * The registrants toolbar's work queues, folded into one chip: *Needs
 * Attention*. It replaced the Needs Validation and Unsent Email chips (the
 * owner, 2026-11-25), so the line above the table stays short however many
 * queues the screen learns — a new one is a row in `queues`, not a new chip.
 *
 * **Closed, it still says there is work.** The chip carries the total waiting,
 * in the tone of the most urgent queue: red when an email never went out (a
 * failure), amber when only payments wait (a waiting state, like the PENDING
 * badge it collects). Nothing waiting, it stays put and says so, so the
 * toolbar never shifts.
 *
 * **One queue at a time.** Picking one shows only those rows and names it on
 * the chip, with its own ✕ beside it, so a filtered list always says why it
 * is short. A queue with nothing in it is listed but cannot be picked.
 *
 * Its options are a `.toolbar-popover`, like Sort and View: under the chip on
 * a tablet or desktop, a bottom sheet on a phone. Escape or a click outside
 * closes it.
 */

export type AttentionTone = 'pending' | 'danger';

export type AttentionQueue = {
  id: string;
  label: string;
  /** One line under the label: what the queue collects. */
  hint: string;
  count: number;
  tone: AttentionTone;
  icon: React.ReactNode;
};

const TONE_CLASS: Record<AttentionTone, string> = {
  pending: 'is-pending',
  danger: 'is-danger is-active',
};

export default function NeedsAttentionMenu({
  queues,
  active,
  onChange,
}: {
  queues: AttentionQueue[];
  /** The queue being shown, or null for every registrant. */
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const total = queues.reduce((sum, queue) => sum + queue.count, 0);
  const current = queues.find(queue => queue.id === active) ?? null;
  // The chip wears the most urgent waiting queue's colour, or the shown one's.
  const tone: AttentionTone | null = current
    ? current.tone
    : queues.some(q => q.count > 0 && q.tone === 'danger')
      ? 'danger'
      : total > 0
        ? 'pending'
        : null;

  const pick = (id: string | null) => {
    onChange(id);
    setIsOpen(false);
  };

  return (
    // Last on a phone: the chips do not fit one ~287px row, so Filters and
    // Sort share one and this, the one with a count, takes the next.
    <div ref={wrapperRef} className="relative flex items-center gap-1 max-sm:order-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={
          current
            ? `Showing ${current.label}, ${current.count}. Change the queue`
            : total > 0
              ? `Needs attention: ${total} waiting`
              : 'Needs attention: nothing waiting'
        }
        className={`btn-filter whitespace-nowrap ${tone ? TONE_CLASS[tone] : ''}`}
      >
        {current ? current.icon : <BellDot size={16} aria-hidden="true" />}
        {current ? current.label : 'Needs Attention'}
        {(current ? current.count : total) > 0 && (
          <span className="ml-1 px-1.5 min-w-5 text-center tabular-nums bg-[var(--ink-10)] rounded-chip text-xs">
            {current ? current.count : total}
          </span>
        )}
      </button>
      {current && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Stop showing only ${current.label}`}
          className="btn-filter !px-0 w-10 max-sm:w-11 justify-center"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}

      {isOpen && (
        <div
          role="group"
          aria-label="Registrants that need attention"
          className="toolbar-popover absolute left-0 top-full mt-2 w-80 bg-[var(--dash-popover)] border border-[var(--dash-border)] rounded-control p-2 z-50 shadow-2xl"
        >
          <p className="m-0 px-2 pt-1 pb-2 text-xs font-semibold text-secondary">Needs Attention</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
            {queues.map(queue => {
              const on = queue.id === active;
              const empty = queue.count === 0 && !on;
              return (
                <li key={queue.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={empty}
                    onClick={() => pick(on ? null : queue.id)}
                    className={`w-full flex items-start gap-3 px-2 py-2 rounded-control text-left bg-transparent border-0 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                      on ? 'bg-[var(--ink-10)]' : 'hover:bg-[var(--dash-hover)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        queue.count > 0 ? (queue.tone === 'danger' ? 'text-[var(--status-danger)]' : 'text-[var(--status-warning)]') : 'text-secondary'
                      }`}
                    >
                      {queue.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm text-primary font-medium">
                        {queue.label}
                        <span className="tabular-nums text-xs text-secondary">{queue.count}</span>
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">{queue.hint}</span>
                    </span>
                    {on && <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {total === 0 && !current && (
            <p className="m-0 px-2 pt-2 pb-1 text-xs text-secondary border-t border-[var(--dash-hairline)] mt-1">
              Nothing waiting. Every payment here is checked and every email went out.
            </p>
          )}
          {current && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-1 w-full flex items-center px-2 py-1.5 rounded-control text-sm text-secondary bg-transparent border-0 border-t border-[var(--dash-hairline)] hover:bg-[var(--dash-hover)] hover:text-primary transition-colors cursor-pointer"
            >
              Show All Registrants
            </button>
          )}
        </div>
      )}
    </div>
  );
}
