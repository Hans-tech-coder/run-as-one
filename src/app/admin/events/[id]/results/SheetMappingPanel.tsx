'use client';

import { FileSpreadsheet } from 'lucide-react';
import AdminSelect from '../../../AdminSelect';
import { upperCaseForStorage } from '@/lib/text-case';
import TargetCategoryPicker, { type UploadCategory } from './TargetCategoryPicker';
import {
  dataRows,
  nonEmptyCells,
  REQUIRED_FIELDS,
  type MappingField,
  type SheetMapping,
  type SheetRows,
} from './results-sheet';

/* The columns an import cannot do without; the gun time, optional, follows them.
   The listbox label says what the column holds, for a screen reader that hears
   the picker without the panel around it. */
const REQUIRED_PICKERS: { field: MappingField; listboxLabel: string }[] = [
  { field: 'bibCol', listboxLabel: 'Column holding the bib number' },
  { field: 'nameCol', listboxLabel: "Column holding the runner's name" },
  { field: 'genderCol', listboxLabel: 'Column holding the gender' },
  { field: 'chipCol', listboxLabel: 'Column holding the chip time' },
];

const required = (text: string) => (
  <>{text} <span style={{ color: 'var(--status-danger)' }}>*</span></>
);

/** One sheet of the upload: where it imports, which row holds its labels, and
 *  which column is which field. */
export default function SheetMappingPanel({
  sheetName,
  rows,
  mapping,
  missing,
  categories,
  canCreateCategory,
  onFieldChange,
  onHeaderRowChange,
}: {
  sheetName: string;
  rows: SheetRows;
  mapping: SheetMapping;
  /** Required fields the last attempt found unmapped on this sheet. */
  missing: string[];
  categories: UploadCategory[];
  /** The event is results-only, so this sheet may found its own category. */
  canCreateCategory: boolean;
  onFieldChange: (field: MappingField, value: string) => void;
  onHeaderRowChange: (headerRow: number) => void;
}) {
  const columns = mapping.columns || [];
  const rowCount = dataRows(rows, mapping.headerRow).length;

  // Only the top of the sheet can plausibly hold labels, and a row
  // has to say something to be worth offering.
  const headerRowOptions = rows
    .slice(0, 30)
    .map((row, index) => ({ index, preview: nonEmptyCells(row).slice(0, 5).join(', ') }))
    .filter(opt => opt.preview !== '' || opt.index === mapping.headerRow);

  // A column's real sheet index is its value, so a repeated label
  // ("TIME" twice) still points the import at one cell.
  const columnOptions = columns.map(col => ({ value: String(col.index), label: col.label }));

  const columnError = (field: string) =>
    missing.includes(field)
      ? `Choose the column that holds the ${REQUIRED_FIELDS[field].toLowerCase()}.`
      : undefined;

  // The one way the picker itself can be wrong: a new category named after a
  // sheet the event already has a category for, which it should go into instead.
  const categoryError = missing.includes('categoryId')
    ? `This event already has a ${upperCaseForStorage(sheetName)} category. Choose it here instead.`
    : undefined;
  const distanceError = missing.includes('newDistance')
    ? 'Type the distance the new category is for.'
    : undefined;

  return (
    // Visible overflow, not the panel's usual hidden: the column
    // pickers open their lists downward, and the last row of them
    // would otherwise be cut off at the panel's edge.
    <div
      className="admin-panel mb-8 border border-[var(--dash-border)] hover:border-accent-blue/30 transition-colors"
      style={{ overflow: 'visible' }}
    >
      <div className="admin-panel-header border-b border-[var(--dash-border)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--ink-02)] p-5 rounded-t-[var(--radius-xl)]">
        <div className="flex flex-col min-w-0 max-md:self-stretch">
          <h4 className="font-bold text-lg text-primary flex items-center gap-2 min-w-0 [overflow-wrap:anywhere]">
            <FileSpreadsheet size={18} className="text-accent-blue-ink shrink-0" /> {sheetName}
          </h4>
          <p className="text-xs text-secondary mt-1">
            Found {rowCount} {rowCount === 1 ? 'row' : 'rows'} below the header on row {mapping.headerRow + 1}
          </p>
        </div>

        <div className="w-full md:w-72 md:shrink-0 max-md:self-stretch">
          <TargetCategoryPicker
            sheetName={sheetName}
            categories={categories}
            value={mapping.categoryId}
            onChange={value => onFieldChange('categoryId', value)}
            canCreate={canCreateCategory}
            newDistance={mapping.newDistance}
            onNewDistanceChange={value => onFieldChange('newDistance', value)}
            categoryError={categoryError}
            distanceError={distanceError}
          />
        </div>
      </div>

      {mapping.categoryId ? (
        <div className="admin-panel-content">
          <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <p className="text-sm text-secondary">Match your Excel columns to the required database fields below:</p>
            {/* The row's preview is each option's small print, and
                the chosen row's labels are spelled out under the
                field, where they wrap instead of stretching a
                native select past the edge of a phone. */}
            <div className="min-w-0 md:flex-[0_1_320px]">
              <AdminSelect
                label="Header Row"
                listboxLabel={`Row of ${sheetName} that holds the column labels`}
                value={String(mapping.headerRow)}
                onChange={value => onHeaderRowChange(Number(value))}
                options={headerRowOptions.map(opt => ({
                  value: String(opt.index),
                  label: `Row ${opt.index + 1}`,
                  hint: opt.preview || undefined,
                }))}
                hint={
                  columns.length > 0
                    ? `Columns on this row: ${columns.map(col => col.label).join(', ')}`
                    : undefined
                }
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {REQUIRED_PICKERS.map(({ field, listboxLabel }) => (
              <div key={field} style={{ flex: '1 1 160px', minWidth: 0 }}>
                <AdminSelect
                  label={required(REQUIRED_FIELDS[field])}
                  listboxLabel={listboxLabel}
                  placeholder="Select column"
                  value={mapping[field]}
                  onChange={value => onFieldChange(field, value)}
                  options={columnOptions}
                  error={columnError(field)}
                />
              </div>
            ))}
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <AdminSelect
                label={<>Gun Time <span className="text-secondary">(Optional)</span></>}
                listboxLabel="Column holding the gun time"
                value={mapping.gunCol}
                onChange={value => onFieldChange('gunCol', value)}
                options={[{ value: '', label: 'None / Not Available' }, ...columnOptions]}
              />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', borderTop: '1px solid var(--glass-border)' }}>
          Select a Target Category above to configure column mapping for this sheet.
        </div>
      )}
    </div>
  );
}
