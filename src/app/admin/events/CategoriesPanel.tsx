"use client";

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { blankCategory, type CategoryDraft } from './category-draft';

/**
 * The distance-categories editor for race events.
 *
 * Lifted out of the create and edit pages unchanged so the two cannot drift,
 * and so PackagesPanel can sit beside it as an obvious alternative rather than
 * a third copy of the same markup.
 */
export default function CategoriesPanel({
  categories,
  onChange,
}: {
  categories: CategoryDraft[];
  onChange: (next: CategoryDraft[]) => void;
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
        <div className="flex flex-col gap-4">
          {categories.map((cat, idx) => (
            <div key={idx} className="category-item-row">
              <div className="form-group category-col">
                {idx === 0 && <label className="form-label">Category Name</label>}
                <input
                  type="text"
                  value={cat.name}
                  onChange={e => update(idx, 'name', e.target.value)}
                  className="form-input"
                  placeholder="e.g. Full Marathon"
                  required
                />
              </div>
              <div className="form-group category-col">
                {idx === 0 && <label className="form-label">Distance</label>}
                <input
                  type="text"
                  value={cat.distance}
                  onChange={e => update(idx, 'distance', e.target.value)}
                  className="form-input"
                  placeholder="e.g. 42K"
                  required
                />
              </div>
              <div className="form-group category-col-price">
                {idx === 0 && <label className="form-label">Price (₱)</label>}
                <input
                  type="number"
                  value={cat.price}
                  onChange={e => update(idx, 'price', Number(e.target.value))}
                  className="form-input"
                  required
                  min={0}
                />
              </div>
              {categories.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="btn-remove mb-1"
                  title="Remove Category"
                  style={{ height: '42px' }}
                >
                  <Trash2 size={18} />
                </button>
              )}
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
