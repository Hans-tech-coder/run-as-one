"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Timer, HeartHandshake, X } from 'lucide-react';

/**
 * Asked before "Create Event" opens a form, because the answer changes which
 * form there is to open.
 *
 * The two event types collect genuinely different things — distances versus
 * inclusion packages — and an organizer who picked wrong would have to retype
 * the whole event. Asking here costs one click; asking later would mean a form
 * that reshapes itself under them mid-entry.
 */

const OPTIONS = [
  {
    href: '/admin/events/new',
    icon: Timer,
    title: 'Race Event',
    description:
      'Timed race with distance categories — 5K, 10K, 21K. Runners pick a distance, and results and certificates are grouped by it.',
  },
  {
    href: '/admin/events/new/fun-run',
    icon: HeartHandshake,
    title: 'Fun Run / Charity Run',
    description:
      'No distances to choose from. Runners pick a registration package instead — Basic, Full — each with its own price and inclusions.',
  },
];

export default function EventTypeModal({
  open,
  closing,
  onClose,
}: {
  open: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        open && !closing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={{ zIndex: 100 }}
      onClick={onClose}
    >
      <div
        className={`t-modal w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${open ? 'is-open' : ''} ${closing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-semibold text-white">What kind of event is this?</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              This decides what runners choose when they register. You can change
              the rest later, but not this.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {OPTIONS.map(option => {
            const Icon = option.icon;
            return (
              <button
                key={option.href}
                type="button"
                onClick={() => router.push(option.href)}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-left transition-colors hover:border-accent-blue hover:bg-accent-blue/10"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/5 p-2 text-gray-400">
                    <Icon size={20} />
                  </span>
                  <span className="font-medium text-white">{option.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-400">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
