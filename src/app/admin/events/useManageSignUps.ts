"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { closingHasPassed, isClosed, opensLater } from '@/lib/registration-window';
import type { RegistrationState } from '@/lib/registration-gate';
import { NO_CLOSING_DATE, closingInstantISO, openingInstantISO, sameMinute, type OpeningDraft } from './registration-opening';
import type { EventRow } from './event-row';

/** What the modal's Save sends: the window's two dates and the hold. */
export type SignUpDraft = {
  opening: OpeningDraft;
  closing: OpeningDraft;
  paused: boolean;
  pauseNote: string;
};

/**
 * The state a row reads after a sign-up change, rebuilt from what the row
 * already knows in registrationState's order (lib/registration-gate.ts) —
 * the table has no category counts, so `soldOut` (events/page.tsx) stands in
 * for FULL. Only the states a sign-up change can move are recomputed; a race
 * already run or results only stays as it was.
 */
function signUpState(row: EventRow, now = new Date()): RegistrationState | undefined {
  if (row.registrationState === 'FINISHED' || row.registrationState === 'EXTERNAL') return row.registrationState;
  if (isClosed(row, now)) return 'CLOSED';
  if (row.registrationPaused) return 'PAUSED';
  if (opensLater(row, now)) return 'SCHEDULED';
  return row.soldOut ? 'FULL' : 'OPEN';
}


/**
 * What the modal's settings changed on this row, as PATCH fields. Only what
 * changed is sent, so the route's checks run on the fields the organizer
 * actually touched — and the pause is always sent with a date, so the route
 * never infers one from the other.
 */
function changedSignUps(row: EventRow, draft: SignUpDraft): Record<string, unknown> {
  const opensAt = openingInstantISO(draft.opening);
  const closesAt = closingInstantISO(draft.closing);
  const note = draft.pauseNote.trim();
  const body: Record<string, unknown> = {};
  if (!sameMinute(opensAt, row.registrationOpensAt)) body.registrationOpensAt = opensAt;
  if (!sameMinute(closesAt, row.registrationClosesAt)) body.registrationClosesAt = closesAt;
  if (
    Object.keys(body).length > 0 ||
    draft.paused !== Boolean(row.registrationPaused) ||
    note !== (row.registrationPauseNote ?? '')
  ) {
    body.registrationPaused = draft.paused;
    body.registrationPauseNote = note;
  }
  return body;
}

/**
 * The events table's Manage Sign-Ups modal: which row it is open on, its
 * Save (the opening, the closing date and the hold, under one PATCH), and its
 * separate Close / Reopen. Every request is a PATCH carrying only the sign-up
 * fields (registration-controls.ts), because this table never rendered the
 * rest of the event and posting fields it does not hold is how they get
 * silently overwritten. The row is rebuilt from the server's answer, not
 * optimistically — a hold that looks on but is not is the worst outcome.
 */
export function useManageSignUps(setTableEvents: React.Dispatch<React.SetStateAction<EventRow[]>>) {
  const router = useRouter();
  const { alert, confirm, toast } = useAlert();

  // The same three-piece open/closing shape the delete modal uses, so both
  // fade the same way.
  const [event, setEvent] = useState<EventRow | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const open = (row: EventRow) => {
    setEvent(row);
    requestAnimationFrame(() => setIsOpen(true));
  };

  const close = () => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setEvent(null);
    }, 150);
  };

  /** Sends one PATCH and puts the server's answer on the row. */
  const patch = async (row: EventRow, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/events/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const answer = await res.json().catch(() => null);
      throw new Error(answer?.error || `The server rejected the request (HTTP ${res.status}).`);
    }
    const saved = await res.json();
    setTableEvents(prev =>
      prev.map((current): EventRow => {
        if (current.id !== row.id) return current;
        const next: EventRow = {
          ...current,
          registrationOpensAt: saved.registrationOpensAt ?? null,
          registrationClosesAt: saved.registrationClosesAt ?? null,
          registrationClosedAt: saved.registrationClosedAt ?? null,
          registrationPaused: saved.registrationPaused,
          registrationPauseNote: saved.registrationPauseNote ?? null,
        };
        return { ...next, registrationState: signUpState(next) };
      }),
    );
    // The public pages read this on the server, so the change only reaches
    // them on the next request — which is what this refresh causes.
    router.refresh();
  };

  /** The modal's Save: whatever its settings changed (changedSignUps). */
  const save = async (draft: SignUpDraft) => {
    if (!event) return;
    const body = changedSignUps(event, draft);

    if (Object.keys(body).length === 0) {
      close();
      return;
    }

    setIsSaving(true);
    try {
      await patch(event, body);
      close();
      toast(`Sign-ups on ${event.title} saved.`);
    } catch (error) {
      await alert({
        title: 'Sign-ups not saved',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Close, or Reopen. Closing asks first, because unlike a pause it tells
   * runners the race is not coming back, and sends only the closure. Reopening
   * carries whatever the modal's settings changed, so an edit made before the
   * press is not lost. If the stored closing date has passed and the draft
   * names no date still ahead, the date is dropped, because lifting the
   * closure alone would leave it CLOSED (Q3); the modal says so beside the
   * button.
   */
  const toggleClosed = async (draft: SignUpDraft) => {
    if (!event) return;
    const nextClosed = event.registrationState !== 'CLOSED';
    if (
      nextClosed &&
      !(await confirm({
        variant: 'danger',
        title: 'Close sign-ups?',
        message: `Runners will see that registration for ${event.title} is closed. Orders already placed are not affected. You can reopen it later from Manage Sign-Ups.`,
        confirmLabel: 'Close Sign-Ups',
      }))
    ) {
      return;
    }

    const dropClosing =
      closingHasPassed(event) && closingHasPassed({ registrationClosesAt: closingInstantISO(draft.closing) });
    const body: Record<string, unknown> = {
      ...(nextClosed
        ? {}
        : changedSignUps(event, dropClosing ? { ...draft, closing: NO_CLOSING_DATE } : draft)),
      registrationClosed: nextClosed,
    };

    setIsSaving(true);
    try {
      await patch(event, body);
      close();
      toast(`Sign-ups on ${event.title} ${nextClosed ? 'closed' : 'reopened'}.`);
    } catch (error) {
      await alert({
        title: nextClosed ? 'Registration not closed' : 'Registration not reopened',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return { event, isOpen, isClosing, isSaving, open, close, save, toggleClosed };
}
