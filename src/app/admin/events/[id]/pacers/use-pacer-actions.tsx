"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { nameOf, type PacerRow } from './pacer-row';

/** How long the Copy button says "Copied" before going back to itself. */
const COPIED_MS = 1600;

/**
 * What a pacer row can do — copy its code, mark it sent, pause it, waive its
 * fee, remove it — and which row is busy doing it. Split from `PacersClient`,
 * which lays the rows out; this owns the requests behind their buttons.
 */
export function usePacerActions(eventId: string) {
  const router = useRouter();
  const { alert, confirm, progress } = useAlert();

  /** Which row has a request in flight, so only that row's items go quiet. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = async (pacer: PacerRow) => {
    try {
      await navigator.clipboard.writeText(pacer.code);
      setCopiedId(pacer.id);
      setTimeout(() => setCopiedId(current => (current === pacer.id ? null : current)), COPIED_MS);
    } catch {
      await alert(
        'Your browser would not let us reach the clipboard. Select the code and copy it by hand.',
      );
    }
  };

  /**
   * One PATCH, for every row action that is a single field. `working` is what
   * the progress toast says while it runs — the menu has closed by then, so
   * that toast is the only sign the press landed (§9).
   */
  const patchPacer = async (
    pacer: PacerRow,
    body: Record<string, unknown>,
    working: string,
    done: string,
  ) => {
    setBusyId(pacer.id);
    const status = progress(working);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${pacer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        status.clear();
        await alert({
          variant: 'danger',
          message: payload.error ?? 'That change could not be saved. Please try again.',
        });
        return;
      }
      status.done(done);
      router.refresh();
    } catch {
      status.clear();
      await alert({ variant: 'danger', message: 'Could not reach the server. Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleCodeSent = (pacer: PacerRow) => {
    const sent = pacer.codeSentAt === null;
    return patchPacer(
      pacer,
      { codeSent: sent },
      sent ? `Marking ${nameOf(pacer)} as sent` : `Moving ${nameOf(pacer)} back to not sent`,
      sent
        ? `${nameOf(pacer)} is marked as sent.`
        : `${nameOf(pacer)} is back on the not-sent list.`,
    );
  };

  const handleTogglePause = (pacer: PacerRow) =>
    patchPacer(
      pacer,
      { paused: !pacer.paused },
      `${pacer.paused ? 'Resuming' : 'Pausing'} ${nameOf(pacer)}'s code`,
      pacer.paused ? `${nameOf(pacer)}'s code works again.` : `${nameOf(pacer)}'s code is paused.`,
    );

  const handleToggleWaiver = (pacer: PacerRow) =>
    patchPacer(
      pacer,
      { waiveAdminFee: !pacer.waiveAdminFee },
      pacer.waiveAdminFee
        ? `Restoring ${nameOf(pacer)}'s admin fee`
        : `Waiving ${nameOf(pacer)}'s admin fee`,
      pacer.waiveAdminFee
        ? `${nameOf(pacer)} now pays the admin fee.`
        : `${nameOf(pacer)}'s admin fee is waived.`,
    );

  const handleDelete = async (pacer: PacerRow) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Remove this pacer?',
      message: (
        <>
          <strong>{nameOf(pacer)}</strong>&rsquo;s code <strong>{pacer.code}</strong> will stop
          working and the slot it was holding goes back to the category. If you only want to stop
          the code for now, pause it instead.
        </>
      ),
      confirmLabel: 'Remove pacer',
    });
    if (!ok) return;

    setBusyId(pacer.id);
    const status = progress(`Removing ${nameOf(pacer)}`);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${pacer.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        status.clear();
        await alert({
          variant: 'danger',
          message: payload.error ?? 'That pacer could not be removed. Please try again.',
        });
        return;
      }
      status.done(`${nameOf(pacer)} was removed.`);
      router.refresh();
    } catch {
      status.clear();
      await alert({ variant: 'danger', message: 'Could not reach the server. Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  return { busyId, copiedId, copyCode, handleToggleCodeSent, handleTogglePause, handleToggleWaiver, handleDelete };
}
