"use client";

import React from 'react';
import { CheckCircle, Image as ImageIcon, Mail } from 'lucide-react';

/** One message as the inbox holds it — the shape /api/admin/feedback returns. */
export interface FeedbackRow {
  id: string;
  kind: string;
  message: string;
  name: string | null;
  email: string | null;
  pagePath: string | null;
  userAgent: string | null;
  /** Whether a screenshot is attached; the picture itself opens through
   *  /api/admin/feedback/[id]/screenshot. */
  hasScreenshot: boolean;
  status: string;
  createdAt: string;
}

/**
 * The opened message: every word of it, where the sender was and on what, and
 * the two things worth doing next. One component for the table's second row
 * and the card's accordion, so what an open message shows cannot differ by
 * screen width.
 */
export default function MessageDetail({
  row,
  saving,
  onReview,
  showReview = true,
}: {
  row: FeedbackRow;
  saving: boolean;
  onReview: () => void;
  /** The card already has Mark Reviewed in its footer, beside the actions
   *  menu, so it opts out of a second one here. */
  showReview?: boolean;
}) {
  return (
    <>
      <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-primary [overflow-wrap:anywhere]">
        {row.message}
      </p>

      {/* The sender's screenshot, as a thumbnail that opens full size in a new
          tab. Both go through the signing route, which redirects to a
          short-lived link, so the image is only fetched once the message is
          opened. */}
      {row.hasScreenshot && (
        <a
          href={`/api/admin/feedback/${row.id}/screenshot`}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-4 inline-flex max-w-full flex-col gap-2 no-underline"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
              expiring blob URL behind a redirect; next/image would cache it */}
          <img
            src={`/api/admin/feedback/${row.id}/screenshot`}
            alt="Screenshot the sender attached"
            loading="lazy"
            className="max-h-64 w-auto max-w-full rounded-[12px] border border-[var(--dash-hairline)] object-contain transition-opacity group-hover:opacity-90"
          />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-blue-ink">
            <ImageIcon size={14} aria-hidden="true" /> Open screenshot full size
          </span>
        </a>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--dash-hairline)] pt-4 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="mb-1 font-bold uppercase tracking-wider text-secondary">
            Page they were on
          </dt>
          <dd className="m-0 break-all font-mono text-[var(--ink-85)]">
            {row.pagePath || 'Not recorded'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="mb-1 font-bold uppercase tracking-wider text-secondary">
            Browser
          </dt>
          <dd className="m-0 break-all text-[var(--ink-85)]">
            {row.userAgent || 'Not recorded'}
          </dd>
        </div>
      </dl>

      {/* The note (when there is no address) reads on the left; the actions sit
          together on the right, vertically centred against it. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {!row.email && (
          <span className="text-xs text-secondary">
            No address left, so there is nobody to reply to.
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {row.email && (
            <a
              href={`mailto:${row.email}?subject=${encodeURIComponent(
                'Re: your feedback on Run As One',
              )}`}
              className="btn-filter no-underline max-lg:min-h-11"
            >
              <Mail size={16} /> Reply by email
            </a>
          )}
          {showReview && row.status === 'NEW' && (
            <button
              onClick={onReview}
              disabled={saving}
              className="btn-filter max-lg:min-h-11"
            >
              <CheckCircle size={16} /> Mark reviewed
            </button>
          )}
        </div>
      </div>
    </>
  );
}
