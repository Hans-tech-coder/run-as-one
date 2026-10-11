"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, FlagOff, Pencil, Trash2, UserPen } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RowAction } from '../../RowActionsMenu';
import PacerTagModal from './PacerTagModal';
import ResultFormModal from './ResultFormModal';
import type { RunnerRow } from './runner-row';

/**
 * What a runner's row on the results table offers, and the requests behind it
 * (RESULTS_ROW_ACTIONS_PLAN.md Batches 2 and 3). The table and the cards ask
 * `actionsFor` per row and render `modal` once.
 *
 *  - every runner, on any race: **Edit details** (Batch 3, O4), first
 *  - a runner on a results-only race: **Mark as pacer**
 *  - a pacer tagged here: **Edit pace group** (results-only only, as the
 *    route allows) and **Remove pacer tag**
 *  - a pacer from a code: nothing — the badge says *from Events*, where they
 *    are changed (O5)
 *  - every runner: **Delete result**, last and red (Batch 5)
 *
 * `deleteResults` is also the table's *Delete Selected*, so one runner and a
 * selection are asked and deleted the same way.
 */
export function useRunnerActions(event: {
  id: string;
  slug: string;
  resultsOnly: boolean;
  categories: { id: string; name: string }[];
}) {
  const { id: eventId, resultsOnly } = event;
  const router = useRouter();
  const { alert, confirm, progress } = useAlert();
  const [open, setOpen] = useState<{ runner: RunnerRow; mode: 'mark' | 'edit' | 'details' } | null>(null);

  const removeTag = async (runner: RunnerRow) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Remove this pacer tag?',
      message: (
        <>
          <strong>{runner.name}</strong> (bib {runner.bibNumber}) will be ranked again, so the
          runners behind them in {runner.category.name} move back down a place.
        </>
      ),
      confirmLabel: 'Remove pacer tag',
    });
    if (!ok) return;

    const status = progress(`Removing ${runner.name}'s pacer tag`);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/result-pacers/${runner.pacerTagId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        status.clear();
        await alert({
          variant: 'danger',
          message: payload.error ?? 'That pacer tag could not be removed. Please try again.',
        });
        return;
      }
      status.done(`${runner.name} is ranked again.`);
      router.refresh();
    } catch {
      status.clear();
      await alert({ variant: 'danger', message: 'Could not reach the server. Please try again.' });
    }
  };

  /**
   * Asks first, then deletes. Resolves true when the rows are gone, for the
   * table to clear its selection.
   */
  const deleteResults = async (runners: RunnerRow[]): Promise<boolean> => {
    if (runners.length === 0) return false;
    const one = runners.length === 1 ? runners[0] : null;
    const ok = await confirm({
      variant: 'danger',
      title: one ? 'Delete this result?' : `Delete ${runners.length} results?`,
      message: (
        <>
          {one
            ? <><strong>{one.name}</strong> (bib {one.bibNumber || 'none'}) is removed from the results</>
            : <>These {runners.length} runners are removed from the results</>}
          , and the ranks of the whole race are worked out again. This cannot be undone.
          Uploading the sheet again brings back anyone still in it.
        </>
      ),
      confirmLabel: one ? 'Delete result' : `Delete ${runners.length} results`,
    });
    if (!ok) return false;

    const status = progress(one ? `Deleting ${one.name}'s result` : `Deleting ${runners.length} results`);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/results`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultIds: runners.map(r => r.id) }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        status.clear();
        await alert({
          variant: 'danger',
          message: payload.error ?? 'Those results could not be deleted. Please try again.',
        });
        return false;
      }
      status.done(one ? `${one.name}'s result was deleted.` : `${runners.length} results were deleted.`);
      router.refresh();
      return true;
    } catch {
      status.clear();
      await alert({ variant: 'danger', message: 'Could not reach the server. Please try again.' });
      return false;
    }
  };

  const actionsFor = (runner: RunnerRow): RowAction[] => [
    {
      key: 'edit-details',
      label: 'Edit details',
      icon: <UserPen size={16} />,
      onSelect: () => setOpen({ runner, mode: 'details' }),
    },
    ...pacerActionsFor(runner),
    {
      key: 'delete-result',
      label: 'Delete result',
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => { void deleteResults([runner]); },
    },
  ];

  const pacerActionsFor = (runner: RunnerRow): RowAction[] => {
    if (runner.pacerSource === 'RESULTS' && runner.pacerTagId) {
      return [
        ...(resultsOnly
          ? [{
              key: 'pace-group',
              label: 'Edit pace group',
              icon: <Pencil size={16} />,
              onSelect: () => setOpen({ runner, mode: 'edit' }),
            }]
          : []),
        {
          key: 'remove-tag',
          label: 'Remove pacer tag',
          icon: <FlagOff size={16} />,
          danger: true,
          onSelect: () => removeTag(runner),
        },
      ];
    }
    if (!runner.isPacer && resultsOnly) {
      return [{
        key: 'mark-pacer',
        label: 'Mark as pacer',
        icon: <Flag size={16} />,
        onSelect: () => setOpen({ runner, mode: 'mark' }),
      }];
    }
    return [];
  };

  const close = () => setOpen(null);
  const modal = !open ? null : open.mode === 'details' ? (
    <ResultFormModal
      eventId={eventId}
      eventSlug={event.slug}
      categories={event.categories}
      runner={open.runner}
      onClose={close}
    />
  ) : (
    <PacerTagModal eventId={eventId} runner={open.runner} mode={open.mode} onClose={close} />
  );

  return { actionsFor, deleteResults, modal };
}
