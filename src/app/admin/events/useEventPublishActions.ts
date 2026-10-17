"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { publishValue, type PublishDraft } from './publish-draft';
import type { EventRow } from './event-row';

/**
 * The events table's Publish item: opens the publishing modal for a row and
 * saves its answer to /api/admin/events/[id]/publish (EVENT_PUBLISH_PLAN.md).
 * Apart from useEventRowActions, which is about sign-ups on an event already
 * public, so neither hook grows into the other's job.
 */
export function useEventPublishActions(setTableEvents: React.Dispatch<React.SetStateAction<EventRow[]>>) {
  const router = useRouter();
  const { alert, toast } = useAlert();

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

  const save = async (draft: PublishDraft) => {
    if (!event) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishAt: publishValue(draft) }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `The server rejected the request (HTTP ${res.status}).`);
      }

      const saved = await res.json();
      setTableEvents(prev =>
        prev.map((row): EventRow => (row.id === event.id ? { ...row, publishAt: saved.publishAt ?? null } : row)),
      );

      close();
      toast(
        saved.publishState === 'DRAFT'
          ? `${event.title} is a draft again.`
          : saved.publishState === 'SCHEDULED'
            ? `${event.title} is scheduled to publish.`
            : `${event.title} is published.`,
      );
      // The public pages read this on the server; refresh so the list agrees.
      router.refresh();
    } catch (error) {
      await alert({
        title: 'Publishing not saved',
        message: `${event.title} is unchanged. ${
          error instanceof Error ? error.message : 'The request did not reach the server.'
        }`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return { open, modal: { event, isOpen, isClosing, isSaving, close, save } };
}
