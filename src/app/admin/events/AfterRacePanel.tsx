'use client';

import React from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import AdminSwitch from '../AdminSwitch';
import { RESULTS_PROMISE_DAYS, isTimed, isVirtual, type EventFormat } from '@/lib/event-format';
import { sellsPackages, type EventType } from '@/lib/event-type';
import { MAX_PHOTO_ALBUMS, MAX_PHOTO_ALBUM_LABEL, MAX_PHOTO_ALBUM_URL, type PhotoAlbum } from '@/lib/photo-albums';

/**
 * The edit form's "After the Race" panel (PAST_EVENTS_PLAN.md D7): what a
 * finished race shows its runners once registration is behind it — its photo
 * albums, and whether its page promises official times.
 *
 * Albums are a list (lib/photo-albums.ts): a race often has a page per
 * photographer, or a Facebook set beside a Drive folder. Each is a card like
 * a bank account's, Album 1, Album 2…, so a refusal from the route — which
 * names the album by that number — sits under the card it is about. They are
 * offered on every event, virtual and results-only included, and shown
 * publicly only once the race is over.
 *
 * The timing switch is not offered everywhere: a virtual run is never timed
 * and a results-only race always is (`isTimed`), so for those there is
 * nothing to choose. It starts where the event's kind puts it — on for a
 * race, off for a fun run — because `timedResults` is null until staff press
 * it, and pressing it stores a choice that no longer follows the kind.
 */
export default function AfterRacePanel({
  draft,
  eventType,
  resultsOnly,
  onChange,
  albumError,
}: {
  draft: { format: EventFormat; photoAlbums: PhotoAlbum[]; timedResults: boolean | null };
  eventType: EventType;
  resultsOnly: boolean;
  onChange: (patch: { photoAlbums?: PhotoAlbum[]; timedResults?: boolean | null }) => void;
  /** The route's refusal and the album it is about, by its place in the list. */
  albumError?: { index: number; message: string } | null;
}) {
  const timed = isTimed({ ...draft, eventType, resultsOnly });
  const askTiming = !resultsOnly && !isVirtual(draft);
  const kind = sellsPackages({ eventType }) ? 'fun run' : 'race';
  const albums = draft.photoAlbums;

  const update = (index: number, patch: Partial<PhotoAlbum>) =>
    onChange({ photoAlbums: albums.map((album, i) => (i === index ? { ...album, ...patch } : album)) });
  const remove = (index: number) => onChange({ photoAlbums: albums.filter((_, i) => i !== index) });
  // The new card's link box takes focus, so adding one is one click, not two.
  const add = () => {
    onChange({ photoAlbums: [...albums, { url: '', label: '' }] });
    requestAnimationFrame(() => document.getElementById(`photoAlbum-${albums.length}-url`)?.focus());
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">After the Race</h2>
      </div>
      <div className="admin-panel-content">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col">
            <p className="form-label m-0">
              Race Photo Albums <span className="text-xs opacity-70">- optional, up to {MAX_PHOTO_ALBUMS}</span>
            </p>
            <p className="text-xs opacity-70 mt-1 mb-4">
              One link per album — a photographer&apos;s Facebook page, a Google Drive folder, Google
              Photos or any other site, each starting with https://. Once the race is over, runners
              see a button for each on its event page and its results page.
            </p>

            {albums.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--ink-15)] bg-[var(--ink-02)] p-6 text-center">
                <Camera size={28} className="mx-auto mb-3 opacity-50" aria-hidden="true" />
                <p className="text-sm m-0">No photo albums added yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {albums.map((album, idx) => {
                  const error = albumError?.index === idx ? albumError.message : undefined;
                  const id = `photoAlbum-${idx}`;
                  return (
                    <div key={idx} className="rounded-xl border border-[var(--dash-border)] bg-[var(--ink-02)] p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-secondary uppercase tracking-wider">
                          Album {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="btn-remove"
                          title="Remove Album"
                          aria-label={`Remove album ${idx + 1}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="form-grid">
                        <div className="form-group form-group-full">
                          <label className="form-label" htmlFor={`${id}-url`}>Link</label>
                          <input
                            id={`${id}-url`}
                            // Text, not type="url": the browser would refuse a
                            // link without https:// in its own bubble, before
                            // the route's message under this card could say
                            // what is wrong.
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            value={album.url}
                            onChange={e => update(idx, { url: e.target.value })}
                            className="form-input"
                            maxLength={MAX_PHOTO_ALBUM_URL}
                            placeholder="https://www.facebook.com/media/set/…"
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${id}-error` : undefined}
                          />
                        </div>
                        <div className="form-group form-group-full">
                          <label className="form-label" htmlFor={`${id}-label`}>
                            Name <span className="text-xs opacity-70">- optional</span>
                          </label>
                          <input
                            id={`${id}-label`}
                            type="text"
                            value={album.label}
                            onChange={e => update(idx, { label: e.target.value })}
                            className="form-input"
                            maxLength={MAX_PHOTO_ALBUM_LABEL}
                            placeholder="e.g. Finish Line, JM Photography"
                          />
                          <p className="text-xs opacity-70 mt-1">
                            Names this album&apos;s button when there is more than one (a single album is
                            just View Race Photos). Left blank, it is named after the site, like Facebook
                            or Google Drive.
                          </p>
                        </div>
                      </div>
                      <FieldError id={`${id}-error`} message={error} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* A refusal about the list as a whole (too many) has no card of its own. */}
            {albumError && albumError.index >= albums.length && (
              <div className="mt-3">
                <FieldError id="photoAlbums-error" message={albumError.message} />
              </div>
            )}

            {albums.length < MAX_PHOTO_ALBUMS && (
              <div className="pt-4">
                <button type="button" onClick={add} className="btn-add">
                  <Plus size={16} /> Add Album
                </button>
              </div>
            )}
          </div>

          {askTiming && (
            <AdminSwitch
              on={timed}
              onToggle={() => onChange({ timedResults: !timed })}
              label="This race has timed results"
              hint={
                draft.timedResults === null
                  ? `${timed ? 'On' : 'Off'} because this is a ${kind}. Switch it if this one is ${timed ? 'not timed' : 'timed'}: while it is on, the finished race's page tells runners official times are coming, for ${RESULTS_PROMISE_DAYS} days after race day.`
                  : `While it is on, the finished race's page tells runners official times are coming, for ${RESULTS_PROMISE_DAYS} days after race day. While it is off, the page only says when the race was held.`
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
