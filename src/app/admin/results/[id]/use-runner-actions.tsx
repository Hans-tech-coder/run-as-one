"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, FlagOff, Pencil } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RowAction } from '../../RowActionsMenu';
import PacerTagModal from './PacerTagModal';
import type { RunnerRow } from './runner-row';

/**
 * What a runner's row on the results table offers, and the requests behind it
 * (RESULTS_ROW_ACTIONS_PLAN.md Batch 2). The table and the cards ask
 * `actionsFor` per row and render `modal` once.
 *
 *  - a runner on a results-only race: **Mark as pacer**
 *  - a pacer tagged here: **Edit pace group** (results-only only, as the
 *    route allows) and **Remove pacer tag**
 *  - a pacer from a code: nothing — the badge says *from Events*, where they
 *    are changed (O5)
 */
export function useRunnerActions(eventId: string, resultsOnly: boolean) {
  const router = useRouter();
  const { alert, confirm, progress } = useAlert();
  const [open, setOpen] = useState<{ runner: RunnerRow; mode: 'mark' | 'edit' } | null>(null);

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

  const actionsFor = (runner: RunnerRow): RowAction[] => {
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

  const modal = open ? (
    <PacerTagModal eventId={eventId} runner={open.runner} mode={open.mode} onClose={() => setOpen(null)} />
  ) : null;

  return { actionsFor, modal };
}
