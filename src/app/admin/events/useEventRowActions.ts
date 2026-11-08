"use client";

import React, { useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { EventRow } from './event-row';

/**
 * What the events table's row menu does to a row: delete. (Its sign-up
 * controls — opening, closing date, pause, close — moved to
 * useManageSignUps with the Manage Sign-Ups modal.) A request to
 * /api/admin/events/[id] followed by the row it changed — kept out of the table so the
 * table is only the list, and the requests read in one place.
 */
export function useEventRowActions(setTableEvents: React.Dispatch<React.SetStateAction<EventRow[]>>) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();

  // Delete Modal State
  const [deletingEvent, setDeletingEvent] = useState<EventRow | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteClosing, setIsDeleteClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
