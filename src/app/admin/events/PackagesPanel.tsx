"use client";

import React, { useState } from 'react';
import { Plus, Trash2, Trash, UploadCloud } from 'lucide-react';
import { blankCategory, type CategoryDraft } from './category-draft';

/**
 * The packages editor for fun-run events.
 *
 * Stands where CategoriesPanel does on a race form. A package has no distance,
 * so that field is gone; what replaces it is a poster of the inclusions, which
 * is what runners actually compare when the only difference between options is
 * what comes in the kit.
 *
 * The poster upload lives here rather than in the pages because it targets a
 * row, not the event. Busy and error state is reported upward so the page's
 * existing Save button and error modal keep working unchanged.
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
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIndex(index);
    onBusyChange(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      update(index, 'imageUrl', data.url);
    } catch (err: any) {
      onError(err.message || 'Upload failed');
      // Clearing lets the organizer retry the same file; otherwise the input
      // holds it and re-picking it fires no change event.
      e.target.value = '';
    } finally {
      setUploadingIndex(null);
      onBusyChange(false);
    }
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

                <div className="form-group form-group-full">
                  <label className="form-label">
                    Inclusions Poster{' '}
                    <span className="text-xs opacity-70">- optional, shown to runners</span>
                  </label>
                  {!pkg.imageUrl ? (
                    <div
                      className="file-upload-wrapper"
                      style={{ opacity: uploadingIndex !== null ? 0.6 : 1 }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleUpload(e, idx)}
                        className="file-upload-input"
                        disabled={uploadingIndex !== null}
                      />
                      <div className="file-upload-content">
                        <div className="file-upload-icon">
                          <UploadCloud size={32} />
                        </div>
                        <div className="file-upload-title">
                          {uploadingIndex === idx ? 'Uploading…' : 'Click to upload poster'}
                        </div>
                        <div className="file-upload-desc">
                          PNG or JPG • the shirt, medal and race kit in this package
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="file-preview">
                      <img src={pkg.imageUrl} alt={`${pkg.name || 'Package'} Preview`} />
                      <div className="file-preview-overlay">
                        <button
                          type="button"
                          onClick={() => update(idx, 'imageUrl', '')}
                          className="btn-remove-preview"
                        >
                          <Trash size={16} /> Remove Poster
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
