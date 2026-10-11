"use client";

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus } from 'lucide-react';
import ResultFormModal from './ResultFormModal';

/**
 * *Add runner*, beside *Upload results* (RESULTS_ROW_ACTIONS_PLAN.md Batch 4):
 * one finisher the timer's sheet left out, typed in by hand rather than
 * fixed in the sheet and re-uploaded. Shown only with `results:manage`, the
 * verb its route asks.
 *
 * The form opens on `document.body`, not where the button sits: inside the
 * table's toolbar it would inherit the toolbar's phone rules, which stretch
 * every `.btn-light` to a row of its own and pushed *Add runner* under Cancel.
 */
export default function AddRunnerButton({
  event,
}: {
  event: { id: string; slug: string; categories: { id: string; name: string }[] };
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="btn-filter min-h-11">
        <UserPlus size={16} />
        Add runner
      </button>
      {isOpen && createPortal(
        <ResultFormModal
          eventId={event.id}
          eventSlug={event.slug}
          categories={event.categories}
          onClose={() => setIsOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}
