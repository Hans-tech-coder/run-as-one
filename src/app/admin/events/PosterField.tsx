"use client";

import React, { useState } from 'react';
import { Trash, UploadCloud } from 'lucide-react';

/**
 * The optional inclusions poster on one category or package row.
 *
 * Races and fun runs both offer it — what a runner gets for their money is
 * worth showing whether the option is "10K" or "Full Package" — so the upload
 * lives here rather than in either panel.
 *
 * It owns its own in-flight state and reports it upward, because the field it
 * writes into belongs to the parent's draft and the Save button that must stay
 * disabled belongs to the page. `onBusyChange` fires true on start and false on
 * finish; a page with several of these should count rather than latch a
 * boolean, since two uploads can overlap.
 */
export default function PosterField({
  value,
  onChange,
  onError,
  onBusyChange,
  alt,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  alt: string;
}) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    onBusyChange(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      onChange(data.url);
    } catch (err: any) {
      onError(err.message || 'Upload failed');
      // Clearing lets the organizer retry the same file; otherwise the input
      // holds it and re-picking it fires no change event.
      e.target.value = '';
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="form-group form-group-full">
      <label className="form-label">
        Inclusions Poster <span className="text-xs opacity-70">- optional, shown to runners</span>
      </label>
      {!value ? (
        <div className="file-upload-wrapper" style={{ opacity: uploading ? 0.6 : 1 }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="file-upload-input"
            disabled={uploading}
          />
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <UploadCloud size={32} />
            </div>
            <div className="file-upload-title">
              {uploading ? 'Uploading…' : 'Click to upload poster'}
            </div>
            <div className="file-upload-desc">
              PNG or JPG • the shirt, medal and race kit this option includes
            </div>
          </div>
        </div>
      ) : (
        <div className="file-preview">
          <img src={value} alt={alt} />
          <div className="file-preview-overlay">
            <button type="button" onClick={() => onChange('')} className="btn-remove-preview">
              <Trash size={16} /> Remove Poster
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
