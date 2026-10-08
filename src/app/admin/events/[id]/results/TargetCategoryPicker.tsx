'use client';

import AdminSelect from '../../../AdminSelect';

export type UploadCategory = { id: string; name: string; distance: string };

/* Which of the event's categories one sheet imports into, or none. Its own piece
   because a results-only event will also offer to create the category from the
   sheet's name here (RESULTS_ONLY_EVENT_PLAN.md Batch 6). */
export default function TargetCategoryPicker({
  sheetName,
  categories,
  value,
  onChange,
}: {
  sheetName: string;
  categories: UploadCategory[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  return (
    <AdminSelect
      label="Target Category"
      listboxLabel={`Category the ${sheetName} sheet imports into`}
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: 'Do not import this sheet' },
        // A fun-run package has no distance to append.
        ...categories.map(cat => ({
          value: cat.id,
          label: `${cat.name}${cat.distance ? ` (${cat.distance})` : ''}`,
        })),
      ]}
    />
  );
}
