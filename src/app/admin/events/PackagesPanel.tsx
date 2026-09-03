"use client";

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PosterField from './PosterField';
import { blankCategory, type CategoryDraft } from './category-draft';

/**
 * The packages editor for fun-run events.
 *
 * Stands where CategoriesPanel does on a race form. A package has no distance,
 * so that field is gone; what remains is the name, the price, and the poster of
 * the inclusions, which is what runners actually compare when the only
 * difference between options is what comes in the kit.
 */
export default function PackagesPanel({
  packages,
  onChange,
  onError,
  onBusyChange,
}: {
  packages: CategoryDraft[];
  onChange: (next: CategoryDraft[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const update = (index: number, field: keyof CategoryDraft, value: string | number) => {
    const next = [...packages];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const remove = (index: number) => {
    // An event with no packages has nothing to sell, so the last row stays.
    if (packages.length <= 1) return;
    const next = [...packages];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Registration Packages</h2>
      </div>
      <div className="admin-panel-content">
        <p className="text-sm text-secondary mb-6">
          What runners choose between at sign-up. A fun run usually needs just
          one, but you can offer several tiers — Basic, Full, and so on.
        </p>

        <div className="flex flex-col gap-6">
          {packages.map((pkg, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-secondary uppercase tracking-wider">
                  Package {idx + 1}
                </span>
                {packages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="btn-remove"
                    title="Remove Package"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Package Name</label>
                  <input
                    type="text"
                    value={pkg.name}
                    onChange={e => update(idx, 'name', e.target.value)}
                    className="form-input"
                    placeholder="e.g. Basic Package"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (₱)</label>
                  <input
                    type="number"
                    value={pkg.price}
                    onChange={e => update(idx, 'price', Number(e.target.value))}
                    className="form-input"
                    required
                    min={0}
                  />
                </div>

                <PosterField
                  value={pkg.imageUrl || ''}
                  onChange={url => update(idx, 'imageUrl', url)}
                  onError={onError}
                  onBusyChange={onBusyChange}
                  alt={`${pkg.name || 'Package'} Preview`}
                />
              </div>
            </div>
          ))}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onChange([...packages, blankCategory()])}
              className="btn-add"
            >
              <Plus size={16} /> Add Another Package
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
