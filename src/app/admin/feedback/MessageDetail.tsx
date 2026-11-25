"use client";

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { FeedbackStatus } from '@/lib/feedback';

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
  /** Already read through feedbackStatusOf, so a legacy "REVIEWED" is SEEN. */
  status: FeedbackStatus;
  createdAt: string;
}

/** Manila, spelled out — the same zone every other date on this site is read
 *  in, so a message that arrived at 11pm does not show up on the wrong day. */
export function receivedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The opened message's body: every word of it, the screenshot, and where the
 * sender was and on what. MessageModal frames it and carries the actions.
 */
export default function MessageDetail({ row }: { row: FeedbackRow }) {
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
            className="max-h-64 w-auto max-w-full rounded-panel border border-[var(--dash-hairline)] object-contain transition-opacity group-hover:opacity-90"
          />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-blue-ink">
            <ImageIcon size={14} aria-hidden="true" /> Open Screenshot Full Size
          </span>
        </a>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--dash-hairline)] pt-4 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="mb-1 font-bold text-secondary">Page They Were On</dt>
          <dd className="m-0 break-all font-mono text-[var(--ink-85)]">
            {row.pagePath || 'Not recorded'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="mb-1 font-bold text-secondary">Browser</dt>
          <dd className="m-0 break-all text-[var(--ink-85)]">
            {row.userAgent || 'Not recorded'}
          </dd>
        </div>
      </dl>
    </>
  );
}
