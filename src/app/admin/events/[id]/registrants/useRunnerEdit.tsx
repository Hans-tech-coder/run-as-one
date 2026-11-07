"use client";

/**
 * Edit Registrant's state and its modal, for the registrants table.
 *
 * Split out of `RegistrantsTable.tsx` (PAYMENT_CORRECTION_PLAN.md Batch 2),
 * which was on the split-candidates list. Behaviour is unchanged: the row is
 * looked up by id, opened with its shirt size under the name the route takes,
 * and the saved runner is merged back onto its row.
 */

import React, { useState } from 'react';
import RunnerEditModal, { mergeSavedRunner } from './RunnerEditModal';
import type { RegistrantRow } from './RegistrantsTable';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

export function useRunnerEdit({
  runners,
  raceDay,
  setRunners,
}: {
  runners: RegistrantRow[];
  raceDay: string;
  setRunners: React.Dispatch<React.SetStateAction<RegistrantRow[]>>;
}) {
  const [editingRunner, setEditingRunner] = useState<RegistrantRow | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const open = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (runner) {
      // The row carries the shirt size as `size`; the route takes it as
      // `singletSize`, so without this the field opened blank.
      setEditingRunner({ ...runner, singletSize: runner.size ?? '' });
      setIsOpen(true);
    }
  };

  const close = () => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setEditingRunner(null);
    }, CLOSE_MS);
  };

  const element = (
    <RunnerEditModal
      runner={editingRunner}
      setRunner={setEditingRunner}
      isOpen={isOpen}
      isClosing={isClosing}
      raceDay={raceDay}
      onClose={close}
      onSaved={saved =>
        setRunners(current =>
          current.map(r => (r.id === saved.id ? mergeSavedRunner(r, saved, raceDay) : r)),
        )
      }
    />
  );

  return { open, element };
}
