"use client";

/**
 * The bulk bar, below `lg`, while rows are selected. From `lg` up the red chip
 * in the toolbar does this. Export here is the toolbar's own export (selected
 * rows, audit call first); Clear empties the selection. See `.bulk-bar` in
 * Admin.css for why it is fixed rather than sticky.
 *
 * Split out of `RegistrantsTable.tsx`, which was past the size the repository
 * splits files at, before LOGISTICS_CHANGE_PLAN.md Session 2 added to it.
 */

import React, { useState } from 'react';
import { Download, X, Trash2 } from 'lucide-react';

export default function RegistrantsBulkBar({
  selectedCount,
  canRemove,
  onExport,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  canRemove: boolean;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  // What the bar last counted, so a bar on its way out still reads
  // "3 selected" while it fades rather than dropping to 0. Adjusted during
  // render, which is React's own pattern for state that follows a value.
  const [bulkBarCount, setBulkBarCount] = useState(0);
  if (selectedCount > 0 && selectedCount !== bulkBarCount) {
    setBulkBarCount(selectedCount);
  }

  return (
    <>
      <div className="bulk-bar-spacer dash-mobile-only" hidden={selectedCount === 0} aria-hidden="true" />
      <div className="dash-mobile-only">
        <div
          role="region"
          aria-label="Selected registrants"
          className={`bulk-bar t-toast ${selectedCount > 0 ? 'is-open' : ''}`}
        >
          <span className="bulk-bar-count" aria-live="polite">{bulkBarCount} selected</span>
          <button type="button" onClick={onExport} className="btn-filter bulk-bar-export">
            <Download size={16} aria-hidden="true" /> Export
          </button>
          {canRemove && (
            <button type="button" onClick={onDelete} className="btn-filter is-danger bulk-bar-delete">
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" onClick={onClear} className="btn-filter bulk-bar-clear">
            <X size={16} aria-hidden="true" /> Clear
          </button>
        </div>
      </div>
    </>
  );
}
