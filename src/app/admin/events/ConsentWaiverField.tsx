"use client";

import React, { useId } from 'react';
import {
  defaultConsentWaiverParagraphs,
  formatWaiverParagraphs,
  parseWaiverParagraphs,
} from '@/lib/consent-waiver';

/**
 * The waiver runners agree to before submitting, edited as paragraphs.
 *
 * Left blank, the event uses the standard wording — which is what almost every
 * organizer wants, and why this is not a required field. The "Load the standard
 * wording" button exists for the other case: an organizer who needs to add a
 * clause or reword one should start from the real text rather than retype six
 * paragraphs to change a sentence.
 *
 * A blank line separates paragraphs, matching how the text reads when pasted
 * out of a document. parseWaiverParagraphs also accepts one paragraph per line
 * for anyone who types straight into the box.
 */
export default function ConsentWaiverField({
  value,
  eventTitle,
  onChange,
}: {
  value: string;
  /** Used only to fill in the event name when loading the standard wording. */
  eventTitle: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  const paragraphs = parseWaiverParagraphs(value);
  const isUsingDefault = paragraphs.length === 0;

  const loadStandard = () => {
    onChange(formatWaiverParagraphs(defaultConsentWaiverParagraphs(eventTitle)));
  };

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        Disclaimer, Consent &amp; Data Privacy Waiver{' '}
        <span className="text-xs opacity-70">
          - optional, one blank line between paragraphs
        </span>
      </label>
      <textarea
        id={id}
        className="form-input"
        rows={10}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Leave blank to use the standard waiver, or load it below and edit from there."
      />
      <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
        <p className="text-xs opacity-70 m-0">
          {isUsingDefault
            ? 'Blank — runners will see the standard waiver for this event.'
            : `${paragraphs.length} paragraph${paragraphs.length === 1 ? '' : 's'} — this replaces the standard waiver.`}
        </p>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-filter" onClick={loadStandard}>
            Load the standard wording
          </button>
          {!isUsingDefault && (
            <button
              type="button"
              className="text-xs opacity-70 hover:opacity-100 underline"
              onClick={() => onChange('')}
            >
              Reset to standard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
