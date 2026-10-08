"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { openingInstantISO, type OpeningDraft } from './registration-opening';
import type { EventRow } from './event-row';

/**
 * What the events table's row menu does: pause, close, schedule and delete.
 * Each one is a request to /api/admin/events/[id] followed by the row it
 * changed, rebuilt from the server's answer — kept out of the table so the
 * table is only the list, and the requests read in one place.
 */
export function useEventRowActions(setTableEvents: React.Dispatch<React.SetStateAction<EventRow[]>>) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert, confirm, toast, progress } = useAlert();

  // Which event's pause or close toggle is mid-flight, so its menu items can
  // say so and refuse a second press. One id rather than a boolean: the menu
  // is per row. Shared by both toggles, since either one changes the same
  // answer and a second request racing the first would only confuse it.
  const [pausingId, setPausingId] = useState<string | null>(null);

  // Which event's opening is being set, and the modal's own open/closing
  // animation flags — the same three-piece shape the delete modal below uses,
  // so both fade in and out the same way.
  const [schedulingEvent, setSchedulingEvent] = useState<EventRow | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduleClosing, setIsScheduleClosing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  // Delete Modal State
  const [deletingEvent, setDeletingEvent] = useState<EventRow | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteClosing, setIsDeleteClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const openSchedule = (event: EventRow) => {
    setSchedulingEvent(event);
    requestAnimationFrame(() => setIsScheduleOpen(true));
  };

  const closeScheduleModal = () => {
    setIsScheduleOpen(false);
    setIsScheduleClosing(true);
    setTimeout(() => {
      setIsScheduleClosing(false);
      setSchedulingEvent(null);
    }, 150);
  };

  /**
   * Saves when this event starts taking sign-ups.
   *
   * A PATCH carrying only the opening, for the same reason the pause toggle
   * sends only the hold: this table never rendered the rest of the event, and
   * posting fields it does not hold is how they get silently overwritten.
   *
   * The route also lifts a manual hold when it is sent an opening on its own,
   * so the row has to drop its PAUSED badge here too — a table still saying
   * "Paused" about an event whose sign-ups just opened is worse than no badge.
   */
  const handleScheduleSave = async (draft: OpeningDraft) => {
    if (!schedulingEvent) return;
    const registrationOpensAt = openingInstantISO(draft);
    const scheduled = registrationOpensAt !== null;
    setIsScheduling(true);
    try {
      const res = await fetch(`/api/admin/events/${schedulingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationOpensAt }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      const saved = await res.json();

      setTableEvents(prev =>
        prev.map((row): EventRow =>
          row.id === schedulingEvent.id
            ? {
                ...row,
                registrationOpensAt: saved.registrationOpensAt ?? null,
                registrationPaused: false,
                // An opening still ahead is what the row now says. Clearing one
                // hands the row back to whatever was true underneath, and the
                // only thing this table can rule out is the two states it just
                // replaced — a row that was FULL stays FULL.
                registrationState: scheduled
                  ? 'SCHEDULED'
                  : row.registrationState === 'SCHEDULED' || row.registrationState === 'PAUSED'
                    ? 'OPEN'
                    : row.registrationState,
              }
            : row,
        ),
      );

      closeScheduleModal();
      toast(
        scheduled
          ? `Sign-ups on ${schedulingEvent.title} scheduled.`
          : `Sign-ups on ${schedulingEvent.title} are open.`,
      );
      // The public pages read this on the server, so the change only reaches
      // them on the next request — which is what this refresh causes.
      router.refresh();
    } catch (error) {
      await alert({
        title: 'Registration opening not saved',
        message: `${schedulingEvent.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const openDelete = (event: EventRow) => {
    setDeletingEvent(event);
    requestAnimationFrame(() => setIsDeleteOpen(true));
  };

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setIsDeleteClosing(true);
    setTimeout(() => {
      setIsDeleteClosing(false);
      setDeletingEvent(null);
    }, 150);
  };

  /**
   * Flips the organizer's manual hold on sign-ups.
   *
   * A PATCH rather than a re-save of the whole event: this table does not hold
   * the other fields, and posting a form it never rendered would be the way to
   * silently overwrite them. The row updates from the server's answer rather
   * than optimistically — a hold that looks on but is not would be the worst of
   * the three possible outcomes.
   */
  const handleTogglePause = async (event: EventRow) => {
    const nextPaused = event.registrationState !== 'PAUSED';
    setPausingId(event.id);
    // The menu closes on the press, so this is the only sign the request is
    // running until the badge changes.
    const working = progress(
      `${nextPaused ? 'Pausing' : 'Resuming'} sign-ups on ${event.title}`,
    );
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationPaused: nextPaused }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      setTableEvents(prev =>
        prev.map((row): EventRow =>
          row.id === event.id
            ? {
                ...row,
                registrationPaused: nextPaused,
                // Resuming hands the row back to whatever the counts say, and a
                // resumed event whose options are all full is FULL, not open.
                registrationState: nextPaused
                  ? 'PAUSED'
                  : row.registrationState === 'PAUSED'
                    ? 'OPEN'
                    : row.registrationState,
              }
            : row,
        ),
      );

      working.done(`Sign-ups on ${event.title} ${nextPaused ? 'paused' : 'resumed'}.`);
      // The public pages read this on the server, so the change only reaches
      // them on the next request — which is what this refresh causes.
      router.refresh();
    } catch (error) {
      working.clear();
      await alert({
        title: nextPaused ? 'Registration not paused' : 'Registration not resumed',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setPausingId(null);
    }
  };

  /**
   * Closes sign-ups for good, or reopens a closed event.
   *
   * Closing asks first, because unlike a pause it tells runners the race is
   * not coming back. Reopening does not: it only undoes that. The row is then
   * rebuilt from what it already knows — the hold, the opening, the counts —
   * in the same order registrationState uses.
   */
  const handleToggleClose = async (event: EventRow) => {
    const nextClosed = event.registrationState !== 'CLOSED';
    if (
      nextClosed &&
      !(await confirm({
        variant: 'danger',
        title: 'Close sign-ups?',
        message: `Runners will see that registration for ${event.title} is closed. Orders already placed are not affected. You can reopen it later from this menu.`,
        confirmLabel: 'Close Sign-Ups',
      }))
    ) {
      return;
    }

    setPausingId(event.id);
    const working = progress(
      `${nextClosed ? 'Closing' : 'Reopening'} sign-ups on ${event.title}`,
    );
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationClosed: nextClosed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      const saved = await res.json();
      const opensLater =
        (row: EventRow) => row.registrationOpensAt != null && new Date(row.registrationOpensAt).getTime() > Date.now();

      setTableEvents(prev =>
        prev.map((row): EventRow =>
          row.id === event.id
            ? {
                ...row,
                registrationClosedAt: saved.registrationClosedAt ?? null,
                registrationState: nextClosed
                  ? 'CLOSED'
                  : row.registrationPaused
                    ? 'PAUSED'
                    : opensLater(row)
                      ? 'SCHEDULED'
                      : row.soldOut
                        ? 'FULL'
                        : 'OPEN',
              }
            : row,
        ),
      );

      working.done(`Sign-ups on ${event.title} ${nextClosed ? 'closed' : 'reopened'}.`);
      router.refresh();
    } catch (error) {
      working.clear();
      await alert({
        title: nextClosed ? 'Registration not closed' : 'Registration not reopened',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setPausingId(null);
    }
  };

  const handleEventDeleteConfirm = async () => {
    if (!deletingEvent) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${deletingEvent.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // The route answers with a reason; show that rather than a blank
        // failure, so the organizer knows whether to retry or to fix something.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      setTableEvents(prev => prev.filter(e => e.id !== deletingEvent.id));
      closeDeleteModal();
    } catch (error) {
      console.error(error);
      // The confirmation modal stays open underneath: the event is still
      // there, and the organizer can read the reason and try again.
      await alert({
        title: 'Event not deleted',
        message: `${deletingEvent.title} is still here. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    pausingId,
    togglePause: handleTogglePause,
    toggleClose: handleToggleClose,
    openSchedule,
    schedule: {
      event: schedulingEvent,
      isOpen: isScheduleOpen,
      isClosing: isScheduleClosing,
      isSaving: isScheduling,
      close: closeScheduleModal,
      save: handleScheduleSave,
    },
    openDelete,
    remove: {
      event: deletingEvent,
      isOpen: isDeleteOpen,
      isClosing: isDeleteClosing,
      isDeleting,
      close: closeDeleteModal,
      confirm: handleEventDeleteConfirm,
    },
  };
}
