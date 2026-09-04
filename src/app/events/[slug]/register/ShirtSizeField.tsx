"use client";

import React, { useMemo } from 'react';
import { Check, Ruler, Shirt } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import {
  SHIRT_SIZE_CHART,
  MAX_SHIRT_SIZE_LENGTH,
  isUpchargeShirtSize,
  normalizeShirtSize,
} from '@/lib/shirt-size';
import Combobox, { type ComboboxRow } from './Combobox';

/**
 * The shirt size a runner wants, from the chart or typed in.
 *
 * Called "Shirt Size" rather than "Singlet Size" because a package may include
 * a singlet, a shirt, or both — and when it includes both, the runner takes the
 * same size in each, so there is only one question worth asking.
 *
 * Typing is allowed. The chart stops at 4XL, but suppliers run larger and a
 * runner who needs a 5XL should be able to say so rather than pick the closest
 * wrong answer and sort it out over Messenger later.
 *
 * Only rendered when the chosen category actually includes something to wear —
 * see categoryNeedsShirtSize. A band-only package is never asked.
 */
export default function ShirtSizeField({
  value,
  upcharge,
  onChange,
  onOpenSizeGuide,
}: {
  value: string;
  /** Centavos added for 4XL and above on this event. 0 means no upcharge. */
  upcharge: number;
  onChange: (size: string) => void;
  onOpenSizeGuide: () => void;
}) {
  const typed = normalizeShirtSize(value);

  const rows = useMemo<ComboboxRow[]>(() => {
    const matches = SHIRT_SIZE_CHART.filter(
      row => !typed || row.size.startsWith(typed)
    );

    const listed: ComboboxRow[] = matches.map(row => {
      const isSelected = row.size === typed;
      const costsMore = upcharge > 0 && isUpchargeShirtSize(row.size);
      return {
        key: `size-${row.size}`,
        value: row.size,
        selected: isSelected,
        label: (
          <>
            {isSelected ? (
              <Check size={16} className="shrink-0 text-accent-orange" />
            ) : (
              <Shirt size={16} className="shrink-0 text-white/30" />
            )}
            <span className="font-medium w-12 shrink-0">{row.size}</span>
            <span className="text-secondary text-xs">
              {row.width}&quot; W &times; {row.length}&quot; L
            </span>
            {costsMore && (
              <span className="ml-auto text-xs text-accent-orange shrink-0">
                +&#8369;{formatPesos(upcharge)}
              </span>
            )}
          </>
        ),
      };
    });

    // A size the chart does not carry. Offered as its own row so that typing
    // one reads as a supported answer rather than a mistake.
    const isCustom =
      typed.length > 0 && !SHIRT_SIZE_CHART.some(row => row.size === typed);
    if (!isCustom) return listed;

    return [
      {
        key: `custom-${typed}`,
        value: typed,
        emphasis: true,
        label: (
          <>
            <Ruler size={16} className="shrink-0" />
            <span className="truncate">
              Use &ldquo;{typed}&rdquo; &mdash; size not on the chart
            </span>
          </>
        ),
      },
      ...listed,
    ];
  }, [typed, upcharge]);

  return (
    <Combobox
      label="Shirt Size"
      listboxLabel="Shirt sizes"
      value={value}
      rows={rows}
      maxLength={MAX_SHIRT_SIZE_LENGTH}
      placeholder="Select or type a size"
      onChange={onChange}
      onNormalize={normalizeShirtSize}
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
