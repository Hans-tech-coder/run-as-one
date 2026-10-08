'use client';

import React, { useState } from 'react';

/**
 * Uploads one of the event form's own images (cover, size chart, certificate
 * template) to blob storage and writes the returned URL into the draft under
 * `field`. Shared by the create and edit forms.
 *
 * This used to inline the file as a base64 data URL, which meant every event
 * row carried megabytes of text that each listing query then had to pull down.
 *
 * `uploadingField` is the field in flight, or null. The page keeps Save
 * disabled while it is set: saving mid-upload would store the event without
 * its image URL.
 */
export function useEventImageUpload<D>(
  setDraft: React.Dispatch<React.SetStateAction<D>>,
  onError: (message: string) => void,
) {
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const upload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof D & string,
    kind: 'image' | 'template' = 'image',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    onError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setDraft(prev => ({ ...prev, [field]: data.url }));
    } catch (err) {
      onError((err instanceof Error && err.message) || 'Upload failed');
      e.target.value = '';
    } finally {
      setUploadingField(null);
    }
  };

  return { uploadingField, upload };
}
