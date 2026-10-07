"use client";

/**
 * The registrants screen's toolbar: search, the Filters sheet, the two
 * work-queue chips, the column picker, Sort below `lg`, Delete Selected and
 * the export.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2). The
 * column filters live on the table instance and are read and written here;
 * the four narrowing filters that are not columns (the two queues, Minors and
 * Pacers) are `useRegistrantQueues`, which the table calls itself because the
 * rows it feeds the table come out of it.
 */

import React, { useState, useMemo } from 'react';
import { Search, Download, X, Trash2, MailWarning, Hourglass } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import MobileSortMenu from '../../../MobileSortMenu';
import ColumnsViewMenu from './ColumnsViewMenu';
import FiltersMenu, { type FilterGroup } from '../../../FiltersMenu';
import { GUARDIAN_CONSENT_MAX_AGE } from '@/lib/minor-consent';
import { compareCategoryNames } from '@/lib/category-distance';
import { needsValidation } from './registrant-display';
import { NO_PROVINCE } from './registrant-columns';
import type { RegistrantRow } from './RegistrantsTable';

/**
 * The filters that narrow the data rather than a column, and the rows left
 * once they have.
 *
 * Applied to the data rather than as column filters: the marks they filter
 * on are not columns, and every other filter here already narrows the same
 * list the export and the pagination read.
 */
export function useRegistrantQueues(runners: RegistrantRow[]) {
  // The backlog view: on a day the daily send quota runs out, the whole list
  // of runners nobody has emailed has to be reachable in one click rather than
  // hunted for row by row.
  const [showOnlyUnsentEmail, setShowOnlyUnsentEmail] = useState(false);

  // The payment queue, the same idea in the same shape: the rows a validator
  // still owes a decision on, in one click.
  //
  // It is a filter and not a sort on purpose. Sorting the unpaid orders to the
  // top would mean a row jumps out from under the cursor the moment it is
  // validated, which costs the admin their place in the list and the sight of
  // the green badge appearing where they clicked. The registration order below
  // stays exactly as it is; this only narrows what is shown.
  const [showOnlyNeedsValidation, setShowOnlyNeedsValidation] = useState(false);

  // The *Minors* option in the Filters sheet. Like the two queues it narrows
  // the data rather than a column, because being a minor is not a column: it
  // is the birthdate read against the race day (lib/minor-consent.ts).
  const [showOnlyMinors, setShowOnlyMinors] = useState(false);

  // The *Pacers* option, for the same reason (PACER_DISCOUNT_PLAN.md Batch 3).
  // It narrows the data rather than a column: what a pacer entry is lives in
  // the order's discount snapshot, and the organizer reaches for this on race
  // morning — "who are my pacers and have they all claimed a kit" is one
  // question, not a scroll through everyone.
  const [showOnlyPacers, setShowOnlyPacers] = useState(false);

  const visibleRunners = useMemo(
    () =>
      runners.filter(
        r =>
          (!showOnlyUnsentEmail || r.emailPending) &&
          (!showOnlyNeedsValidation || needsValidation(r)) &&
          (!showOnlyMinors || r.isMinor) &&
          (!showOnlyPacers || r.isPacer)
      ),
    [runners, showOnlyUnsentEmail, showOnlyNeedsValidation, showOnlyMinors, showOnlyPacers]
  );

  return {
    visibleRunners,
    showOnlyUnsentEmail, setShowOnlyUnsentEmail,
    showOnlyNeedsValidation, setShowOnlyNeedsValidation,
    showOnlyMinors, setShowOnlyMinors,
    showOnlyPacers, setShowOnlyPacers,
  };
}

export type RegistrantQueues = ReturnType<typeof useRegistrantQueues>;

export default function RegistrantsToolbar({
  table,
  runners,
  queues,
  globalFilter,
  setGlobalFilter,
  canRemove,
  selectedCount,
  onBulkDelete,
  onExport,
}: {
  table: Table<RegistrantRow>;
  runners: RegistrantRow[];
  queues: RegistrantQueues;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  canRemove: boolean;
  selectedCount: number;
  onBulkDelete: () => void;
  onExport: () => void;
}) {
  const {
    showOnlyUnsentEmail, setShowOnlyUnsentEmail,
    showOnlyNeedsValidation, setShowOnlyNeedsValidation,
    showOnlyMinors, setShowOnlyMinors,
    showOnlyPacers, setShowOnlyPacers,
  } = queues;

  const unsentEmailCount = useMemo(() => runners.filter(r => r.emailPending).length, [runners]);

  const needsValidationCount = useMemo(
    () => runners.filter(needsValidation).length,
    [runners]
  );

  const hasMinors = useMemo(() => runners.some(r => r.isMinor), [runners]);

  const hasPacers = useMemo(() => runners.some(r => r.isPacer), [runners]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set(runners.map(r => r.category).filter(Boolean));
    return Array.from(cats).sort(compareCategoryNames);
  }, [runners]);

  // "Not on file" last, after the provinces, for the rows from before
  // addresses were collected — offered only when there are some.
  const uniqueProvinces = useMemo(() => {
    const provinces = Array.from(new Set(runners.map(r => r.addressProvince).filter(Boolean))).sort();
    if (provinces.length === 0) return [];
    return runners.some(r => !r.addressProvince) ? [...provinces, NO_PROVINCE] : provinces;
  }, [runners]);

  const uniqueLogistics = useMemo(() => {
    const logs = new Set(runners.map(r => r.logisticsMethod).filter(Boolean));
    return Array.from(logs).sort();
  }, [runners]);

  const uniquePayment = useMemo(() => {
    const pays = new Set(runners.map(r => r.paymentMethod).filter(Boolean));
    return Array.from(pays).sort();
  }, [runners]);

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];
  const selectedLogistics = (table.getColumn('logisticsMethod')?.getFilterValue() as string[]) || [];
  const selectedProvinces = (table.getColumn('province')?.getFilterValue() as string[]) || [];
  const selectedPayment = (table.getColumn('paymentMethod')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat)
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleLogistics = (log: string) => {
    const newSelected = selectedLogistics.includes(log)
      ? selectedLogistics.filter(l => l !== log)
      : [...selectedLogistics, log];
    table.getColumn('logisticsMethod')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleProvince = (province: string) => {
    const newSelected = selectedProvinces.includes(province)
      ? selectedProvinces.filter(p => p !== province)
      : [...selectedProvinces, province];
    table.getColumn('province')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const togglePayment = (pay: string) => {
    const newSelected = selectedPayment.includes(pay)
      ? selectedPayment.filter(p => p !== pay)
      : [...selectedPayment, pay];
    table.getColumn('paymentMethod')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  // The Filters chip's sheet: the three lists, each reading and writing its
  // own column filter.
  const filterGroups: FilterGroup[] = [
    { label: 'Category', options: uniqueCategories, selected: selectedCategories, onToggle: toggleCategory, capitalize: false },
    { label: 'Logistics', options: uniqueLogistics, selected: selectedLogistics, onToggle: toggleLogistics, capitalize: true },
    { label: 'Payment', options: uniquePayment, selected: selectedPayment, onToggle: togglePayment, capitalize: true },
    { label: 'Province', options: uniqueProvinces, selected: selectedProvinces, onToggle: toggleProvince, capitalize: false },
    // Offered only on a race that has a minor, so the sheet never lists an
    // option that could only ever empty the table.
    {
      label: 'Age',
      options: hasMinors
        ? [{ value: 'MINOR', label: `Minors (${GUARDIAN_CONSENT_MAX_AGE} and under)` }]
        : [],
      selected: showOnlyMinors ? ['MINOR'] : [],
      onToggle: () => setShowOnlyMinors(on => !on),
      capitalize: false,
    },
    // Offered only on a race that has one, on the same rule as Age above.
    // *Type*, not *Pacer*, because this is the group that will hold whatever
    // other kind of entry the app learns to give away.
    {
      label: 'Type',
      options: hasPacers ? [{ value: 'PACER', label: 'Pacers' }] : [],
      selected: showOnlyPacers ? ['PACER'] : [],
      onToggle: () => setShowOnlyPacers(on => !on),
      capitalize: false,
    },
  ];
  const clearFilters = () => {
    setShowOnlyMinors(false);
    setShowOnlyPacers(false);
    for (const id of ['category', 'province', 'logisticsMethod', 'paymentMethod']) {
      table.getColumn(id)?.setFilterValue(undefined);
    }
  };

  return (
    <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
      <div className="toolbar-actions" style={{ flex: 1 }}>
        <div className="search-wrapper">
          <Search className="search-icon" size={16} />
          <input
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            className="search-input"
            placeholder="Search runners..."
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label="Clear search"
              className="absolute right-1 max-sm:right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 max-sm:w-11 max-sm:h-11 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/*
          The Filters chip, at every width — the events list's filter. Its
          sheet holds Category, Logistics and Payment; the two work-queue
          chips beside it stay chips, because each is one question a
          validator asks all day and wears the colour of what it collects.
        */}
        <FiltersMenu
          groups={filterGroups}
          onClear={clearFilters}
          empty="Nothing to filter yet. The categories, logistics and payment methods appear here as runners register."
        />

        {/*
          The payment queue, in one click.

          Validating deposit slips is the job this screen is opened for most
          days, and before this the only way to gather them was to search
          "PENDING" and hope nothing else on the row said the same word. It
          sits first among the chips because it is the first thing asked for,
          and it wears the amber of the PENDING badge it collects so the
          colour means the same thing in both places.
        */}
        <button
          onClick={() => setShowOnlyNeedsValidation(!showOnlyNeedsValidation)}
          disabled={needsValidationCount === 0 && !showOnlyNeedsValidation}
          aria-pressed={showOnlyNeedsValidation}
          className={`btn-filter ${showOnlyNeedsValidation ? 'is-pending' : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
          title={needsValidationCount === 0
            ? 'No bank transfer here is waiting on a payment check'
            : 'Show only the bank transfers waiting for their payment to be checked'}
        >
          <Hourglass size={16} /> Needs Validation
          {needsValidationCount > 0 && <span className="ml-1 px-1 bg-[var(--ink-10)] rounded">{needsValidationCount}</span>}
        </button>

        {/*
          The email backlog, in one click.

          On a day the daily send quota runs out this is the difference
          between a staff member working a list and hunting a table for the
          rows nobody was emailed. It is a toggle rather than a dropdown
          because there is exactly one thing to ask for.
        */}
        <button
          onClick={() => setShowOnlyUnsentEmail(!showOnlyUnsentEmail)}
          disabled={unsentEmailCount === 0 && !showOnlyUnsentEmail}
          aria-pressed={showOnlyUnsentEmail}
          className={`btn-filter ${showOnlyUnsentEmail ? 'is-danger is-active' : ''} disabled:opacity-50 disabled:cursor-not-allowed`}
          title={unsentEmailCount === 0
            ? 'Every registrant here has had their email'
            : 'Show only the registrants whose email never went out'}
        >
          <MailWarning size={16} /> Unsent Email
          {unsentEmailCount > 0 && <span className="ml-1 px-1 bg-[var(--ink-10)] rounded">{unsentEmailCount}</span>}
        </button>

        {/* Which columns the table shows. Cards have no columns to hide, so
            below `lg` the chip goes and Sort (which the headers did) comes. */}
        <ColumnsViewMenu table={table} />

        <MobileSortMenu table={table} />
      </div>

      <div className="toolbar-actions flex items-center gap-2">
        {/* From `lg` up. Below it the bulk bar at the foot of the screen
            offers Delete beside Export and Clear. */}
        {canRemove && selectedCount > 0 && (
          <button
            onClick={onBulkDelete}
            className="btn-filter is-danger is-active dash-desktop-only"
          >
            <Trash2 size={16} /> Delete Selected ({selectedCount})
          </button>
        )}
        <button onClick={onExport} className="btn-light">
          <Download size={16} /> Export to CSV
        </button>
      </div>
    </div>
  );
}
