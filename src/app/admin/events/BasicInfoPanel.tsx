'use client';

import React from 'react';
import { Trash, UploadCloud } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import AdminDatePicker from '../AdminDatePicker';
import DescriptionEditor from './DescriptionEditor';
import EventClientField from './EventClientField';
import EventProvinceField from './EventProvinceField';
import HighlightsField from './HighlightsField';
import type { EventFormDraft } from './event-form-draft';

type ImageField = 'imageUrl' | 'sizeChartImageUrl';

/**
 * The "Basic Information" panel, shared by the create and edit forms: the
 * client, title, description, date, place and times, and the event's own
 * images (cover, highlights, size chart).
 *
 * It writes straight into the page's draft through `setDraft`, always as a
 * functional update: the highlights field reports after an upload finishes,
 * by which time a draft captured at render would be stale.
 *
 * The cover and size-chart uploads run through the page's
 * `useEventImageUpload`, so their in-flight state is the same `uploadingField`
 * that holds the page's Save button.
 *
 * For a results-only event (`resultsOnly`) it keeps what a results card and
 * certificate need — client, title, date, place, province and an optional
 * cover — and hides what only a runner deciding to sign up reads: the
 * description, the times, the highlights and the size chart. The hidden
 * values stay in the draft, so switching back does not lose them. Province
 * lives in LogisticsPanel otherwise, which a results-only form does not show.
 */
export default function BasicInfoPanel<D extends EventFormDraft>({
  draft,
  setDraft,
  uploadingField,
  onImageFile,
  clientId,
  onClientChange,
  onClientAvailable,
  clientError,
  onError,
  onBusyChange,
  resultsOnly = false,
  title = 'Basic Information',
}: {
  draft: D;
  setDraft: React.Dispatch<React.SetStateAction<D>>;
  uploadingField: string | null;
  onImageFile: (e: React.ChangeEvent<HTMLInputElement>, field: ImageField) => void;
  clientId: string;
  onClientChange: (next: string) => void;
  onClientAvailable: (available: boolean) => void;
  clientError?: string;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  resultsOnly?: boolean;
  /** /admin/results/new numbers it as the first of its three steps. */
  title?: string;
}) {
  const patch = (fields: Partial<EventFormDraft>) => setDraft(prev => ({ ...prev, ...fields }));

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">{title}</h2>
      </div>
      <div className="admin-panel-content">
        <div className="form-grid">
          <EventClientField
            value={clientId}
            onChange={onClientChange}
            onAvailable={onClientAvailable}
            error={clientError}
          />
          <div className="form-group form-group-full">
            <label className="form-label">Event Title</label>
            <input
              type="text"
              value={draft.title}
              onChange={e => patch({ title: e.target.value })}
              className="form-input"
              placeholder="e.g. Manila Midnight Marathon 2025"
              required
            />
          </div>
          {!resultsOnly && (
            <div className="form-group form-group-full">
              <label className="form-label">
                About This Event <span className="text-xs opacity-70">- optional</span>
              </label>
              <DescriptionEditor
                value={draft.description}
                onChange={description => patch({ description })}
                placeholder="Route, assembly time, cut-off, what runners should bring — anything they'd ask about before signing up."
              />
            </div>
          )}
          <AdminDatePicker
            id="event-date"
            label="Date"
            value={draft.date}
            dialogLabel="Choose the race date"
            onChange={date => patch({ date })}
          />
          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              type="text"
              value={draft.location}
              onChange={e => patch({ location: e.target.value })}
              className="form-input"
              placeholder="e.g. BGC, Taguig"
              required
            />
          </div>
          {resultsOnly ? (
            <EventProvinceField
              value={draft.province}
              location={draft.location}
              onChange={province => patch({ province })}
              hint="Optional. Left unset, the province the location names is saved."
            />
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={e => patch({ startTime: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={e => patch({ endTime: e.target.value })}
                  className="form-input"
                />
              </div>
            </>
          )}
          <ImageUploadTile
            className="form-group form-group-full"
            tileClassName=""
            label={resultsOnly ? 'Cover Image (Optional)' : 'Cover Image'}
            value={draft.imageUrl}
            uploading={uploadingField === 'imageUrl'}
            anyUploading={uploadingField !== null}
            onFile={e => onImageFile(e, 'imageUrl')}
            onRemove={() => patch({ imageUrl: '' })}
            prompt="Click to upload cover image"
            hint={
              resultsOnly
                ? 'Optional • PNG, JPG. Leave empty and the Results card shows the default image.'
                : 'SVG, PNG, JPG or GIF (max. 800x400px)'
            }
            alt="Cover Preview"
            removeLabel="Remove Image"
          />

          {!resultsOnly && (
            <>
              <HighlightsField
                value={draft.highlights}
                onChange={update => setDraft(prev => ({ ...prev, highlights: update(prev.highlights) }))}
                onError={onError}
                onBusyChange={onBusyChange}
              />

              {/* Optional: an organizer whose shirts run to their own measurements
                  uploads their chart; without one the register page shows the
                  default chart from lib/shirt-size.ts. */}
              <ImageUploadTile
                className="form-group"
                tileClassName="media-tile"
                label="Size Chart (Optional)"
                value={draft.sizeChartImageUrl}
                uploading={uploadingField === 'sizeChartImageUrl'}
                anyUploading={uploadingField !== null}
                onFile={e => onImageFile(e, 'sizeChartImageUrl')}
                onRemove={() => patch({ sizeChartImageUrl: '' })}
                prompt="Click to upload size chart"
                hint="Optional • PNG, JPG. Leave empty to use the default size chart."
                alt="Size Chart Preview"
                removeLabel="Remove Size Chart"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One image box: the drop tile while empty, the preview with a Remove button
 * once filled. Every tile dims and locks while any of the form's images is
 * uploading, since they share the one `uploadingField`.
 */
function ImageUploadTile({
  className,
  tileClassName,
  label,
  value,
  uploading,
  anyUploading,
  onFile,
  onRemove,
  prompt,
  hint,
  alt,
  removeLabel,
}: {
  className: string;
  tileClassName: string;
  label: string;
  value: string;
  uploading: boolean;
  anyUploading: boolean;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  prompt: string;
  hint: string;
  alt: string;
  removeLabel: string;
}) {
  const extra = tileClassName ? ` ${tileClassName}` : '';
  return (
    <div className={className}>
      <label className="form-label">{label}</label>
      {!value ? (
        <div className={`file-upload-wrapper${extra}`} style={{ opacity: anyUploading ? 0.6 : 1 }}>
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="file-upload-input"
            disabled={anyUploading}
          />
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <UploadCloud size={32} />
            </div>
            <div className="file-upload-title">
              {uploading ? <BusyLabel>Uploading</BusyLabel> : prompt}
            </div>
            <div className="file-upload-desc">{hint}</div>
          </div>
        </div>
      ) : (
        <div className={`file-preview${extra}`}>
          <img src={value} alt={alt} />
          <div className="file-preview-overlay">
            <button
              type="button"
              onClick={onRemove}
              className="btn-remove-preview"
            >
              <Trash size={16} /> {removeLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
