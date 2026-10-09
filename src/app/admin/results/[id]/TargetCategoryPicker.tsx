'use client';

import { useId } from 'react';
import AdminSelect from '../../AdminSelect';
import FieldError from '@/components/ui/FieldError';
import { upperCaseForStorage } from '@/lib/text-case';
import { NEW_CATEGORY } from './results-sheet';

export type UploadCategory = { id: string; name: string; distance: string };

/* Which of the event's categories one sheet imports into, or none — or, on a
   results-only event, a new category named after the sheet. That event's
   categories exist only to group results, so the timing company's own split
   (one sheet per distance) can found them, and creating the event is title,
   date and poster with nothing to pre-fill (RESULTS_ONLY_EVENT_PLAN.md Batch 6).
   The upload route creates the category, in the same transaction as the
   results, so a failed upload never leaves an empty one behind. */
export default function TargetCategoryPicker({
  sheetName,
  categories,
  value,
  onChange,
  canCreate,
  newDistance,
  onNewDistanceChange,
  categoryError,
  distanceError,
}: {
  sheetName: string;
  categories: UploadCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  /** The event is results-only, so a category may come from the sheet. */
  canCreate: boolean;
  newDistance: string;
  onNewDistanceChange: (distance: string) => void;
  categoryError?: string;
  distanceError?: string;
}) {
  // Not built from the sheet name: a sheet name may hold spaces, an id may not.
  const distanceId = useId();
  const distanceErrorId = `${distanceId}-error`;

  return (
    <div className="flex flex-col gap-3">
      <AdminSelect
        label="Target Category"
        listboxLabel={`Category the ${sheetName} sheet imports into`}
        value={value}
        onChange={onChange}
        error={categoryError}
        options={[
          { value: '', label: 'Do not import this sheet' },
          ...(canCreate
            ? [{
                value: NEW_CATEGORY,
                label: 'Create category from sheet name',
                // The name as it will be stored: category names are uppercase.
                hint: `Adds ${upperCaseForStorage(sheetName)} to this event`,
              }]
            : []),
          // A fun-run package has no distance to append.
          ...categories.map(cat => ({
            value: cat.id,
            label: `${cat.name}${cat.distance ? ` (${cat.distance})` : ''}`,
          })),
        ]}
      />

      {value === NEW_CATEGORY && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor={distanceId}>
            Distance <span style={{ color: 'var(--status-danger)' }}>*</span>
          </label>
          <input
            id={distanceId}
            type="text"
            value={newDistance}
            onChange={e => onNewDistanceChange(e.target.value)}
            className="form-input"
            placeholder="e.g. 21K"
            aria-invalid={distanceError ? true : undefined}
            aria-describedby={distanceError ? distanceErrorId : undefined}
          />
          <FieldError id={distanceErrorId} message={distanceError} />
        </div>
      )}
    </div>
  );
}
