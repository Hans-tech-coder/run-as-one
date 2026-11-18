"use client";

import React, { useMemo } from 'react';
import { Ruler, Shirt } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { SHIRT_SIZE_CHART, isUpchargeShirtSize } from '@/lib/shirt-size';
import SelectField, { type SelectOption } from './SelectField';

/**
 * The shirt size a runner wants, picked from the chart: 3XS up to 5XL.
 *
 * Called "Shirt Size" rather than "Singlet Size" because a package may include
 * a singlet, a shirt, or both — and when it includes both, the runner takes the
 * same size in each, so there is only one question worth asking.
 *
 * No typing. Every answer is one the supplier's order form has a row for, so
 * the size count the organizer orders from never carries a stray spelling.
 *
 * Only rendered when the chosen category actually includes something to wear —
 * see categoryNeedsShirtSize. A band-only package is never asked.
 */
export default function ShirtSizeField({
  value,
  upcharge,
  onChange,
  onOpenSizeGuide,
  id,
  error,
  showMeasurements = true,
}: {
  value: string;
  /** Centavos added for 4XL and above on this event. 0 means no upcharge. */
  upcharge: number;
  onChange: (size: string) => void;
  onOpenSizeGuide: () => void;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** Set when a category that includes a shirt has no size chosen. */
  error?: string;
  /**
   * False when the event uploaded its own size chart: the default chart's
   * inches would then contradict the organizer's, so the list shows sizes only.
   */
  showMeasurements?: boolean;
}) {
  const options = useMemo<SelectOption[]>(
    () =>
      SHIRT_SIZE_CHART.map(row => {
        const parts = [row.size];
        if (showMeasurements) parts.push(`${row.width}″ W × ${row.length}″ L`);
        if (upcharge > 0 && isUpchargeShirtSize(row.size)) {
          parts.push(`+₱${formatPesos(upcharge)}`);
        }
        return {
          value: row.size,
          label: parts.join(' · '),
          icon: <Shirt size={16} />,
        };
      }),
    [upcharge, showMeasurements]
  );

  return (
    <SelectField
      label="Shirt Size"
      listboxLabel="Shirt sizes"
      id={id}
      error={error}
      value={value}
      options={options}
      placeholder="Select a size"
      onChange={onChange}
      headerRight={
        <button
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            minWidth: 0,
          }}
          className="text-xs text-accent-blue flex items-center hover:text-white transition-colors"
          onClick={onOpenSizeGuide}
        >
          <Ruler size={14} style={{ marginRight: '4px' }} /> Size Guide
        </button>
      }
      hint={
        upcharge > 0 && isUpchargeShirtSize(value)
          ? `4XL and above adds ₱${formatPesos(upcharge)} to this runner.`
          : upcharge > 0
            ? `Sizes 4XL and above add ₱${formatPesos(upcharge)} per runner.`
            : undefined
      }
    />
  );
}
