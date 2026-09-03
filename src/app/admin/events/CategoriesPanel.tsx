"use client";

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PosterField from './PosterField';
import InclusionsField from './InclusionsField';
import { blankCategory, type CategoryDraft } from './category-draft';

/**
 * The distance-categories editor for race events.
 *
 * Each category is a card rather than a table row because it carries an
 * optional inclusions poster, and a full-width image has nowhere to sit in a
 * row of three inputs. The poster is the same field fun-run packages get: what
 * a 10K entry includes is as worth showing as what a Full Package includes.
 */
export default function CategoriesPanel({
  categories,
  onChange,
  onError,
  onBusyChange,
}: {
  categories: CategoryDraft[];
  onChange: (next: CategoryDraft[]) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const update = (index: number, field: keyof CategoryDraft, value: string | number) => {
    const next = [...categories];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const remove = (index: number) => {
    // An event with no categories has nothing to sell, so the last row stays.
    if (categories.length <= 1) return;
    const next = [...categories];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Distance Categories</h2>
      </div>
      <div className="admin-panel-content">
        <div className="flex flex-col gap-6">
          {categories.map((cat, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-secondary uppercase tracking-wider">
                  Category {idx + 1}
                </span>
                {categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="btn-remove"
                    title="Remove Category"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category Name</label>
                  <input
                    type="text"
                    value={cat.name}
                    onChange={e => update(idx, 'name', e.target.value)}
                    className="form-input"
                    placeholder="e.g. Full Marathon"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Distance</label>
                  <input
                    type="text"
                    value={cat.distance}
                    onChange={e => update(idx, 'distance', e.target.value)}
                    className="form-input"
                    placeholder="e.g. 42K"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (₱)</label>
                  <input
                    type="number"
                    value={cat.price}
                    onChange={e => update(idx, 'price', Number(e.target.value))}
                    className="form-input"
                    required
                    min={0}
                  />
                </div>

                <InclusionsField
                  value={cat.inclusions || ''}
                  onChange={text => update(idx, 'inclusions', text)}
                  placeholder={'Race Singlet\nFinisher Medal\nRace Bib with Timing Chip\nSponsor Lootbag'}
                />

                <PosterField
                  value={cat.imageUrl || ''}
                  onChange={url => update(idx, 'imageUrl', url)}
                  onError={onError}
                  onBusyChange={onBusyChange}
                  alt={`${cat.name || 'Category'} Preview`}
                />
              </div>
            </div>
          ))}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onChange([...categories, blankCategory()])}
              className="btn-add"
            >
              <Plus size={16} /> Add Another Category
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
