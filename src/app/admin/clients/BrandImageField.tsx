"use client";

import React, { useId, useState } from 'react';
import { Trash, UploadCloud } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { acceptAttribute, listUploadTypes } from '@/lib/uploads';

/**
 * One image of a client's site — the logo, the site icon or the hero — in
 * SiteBrandingSection. `square` refuses a picture whose sides differ before it
 * is uploaded: the site icon is drawn into a square tab icon, and anything else
 * would be stretched.
 *
 * It uploads to the public blob store under `clients/` (`/api/upload`, which
 * asks for `platform:manage` for that folder) and hands the URL up; nothing is
 * saved until the section's Save. Like PosterField it reports its in-flight
 * state, so Save waits for the upload. The preview keeps Remove visible rather
 * than behind a hover, since this panel is used on phones too.
 */
export default function BrandImageField({
  label,
  hint,
  value,
  alt,
  onChange,
  onError,
  onBusyChange,
  disabled = false,
  square = false,
}: {
  label: string;
  hint: string;
  value: string;
  alt: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  square?: boolean;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (square && !(await isSquareImage(file))) {
      e.target.value = '';
      onError(`The ${label.toLowerCase()} must be square, the same width and height, like 512 × 512.`);
      return;
    }

    setUploading(true);
    onBusyChange(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', 'clients');

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      onChange(data.url);
    } catch (err) {
      onError((err instanceof Error && err.message) || 'Upload failed');
    } finally {
      // Cleared either way, so the same file can be picked again.
      e.target.value = '';
      setUploading(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="form-group min-w-0">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {value ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-[12px] border border-[var(--dash-border)] bg-[var(--dash-sunken)] p-3 flex items-center justify-center">
            <img src={value} alt={alt} className="max-h-32 max-w-full object-contain" />
          </div>
          <button
            type="button"
            className="btn-filter is-danger self-start"
            onClick={() => onChange('')}
            disabled={disabled}
          >
            <Trash size={16} aria-hidden="true" />
            Remove {label}
          </button>
        </div>
      ) : (
        <div className="file-upload-wrapper" style={{ opacity: uploading ? 0.6 : 1 }}>
          <input
            id={id}
            type="file"
            accept={acceptAttribute('image')}
            onChange={handleUpload}
            className="file-upload-input"
            disabled={uploading || disabled}
          />
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <UploadCloud size={28} aria-hidden="true" />
            </div>
            <div className="file-upload-title">
              {uploading ? <BusyLabel>Uploading</BusyLabel> : `Upload ${label.toLowerCase()}`}
            </div>
            <div className="file-upload-desc">
              {listUploadTypes('image')} • {hint}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether an image file is exactly as wide as it is tall. Unreadable is not. */
async function isSquareImage(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 && img.naturalWidth === img.naturalHeight;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}
