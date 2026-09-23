"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import LinkPendingIcon from "@/components/ui/LinkPendingIcon";

/**
 * What the feedback form becomes once a message is sent. Its own file so the
 * form stays about the form; FeedbackForm still owns the stagger reveal and
 * the scroll, which is why the panel's node is handed back through `panelRef`.
 */
export default function FeedbackSent({
  hasEmail,
  onSendAnother,
  panelRef,
}: {
  /** Whether the sender left an address, which decides what we promise. */
  hasEmail: boolean;
  onSendAnother: () => void;
  panelRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={panelRef}
      className="t-stagger scroll-mt-[var(--nav-offset)] glass-panel relative overflow-clip rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-8 text-center sm:p-12"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-blue/20 blur-[80px]"
      />

      <div className="t-stagger-line t-stagger-line--1 relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent-blue/10">
          <CheckCircle2 size={40} className="text-accent-blue" aria-hidden="true" />
        </div>

        {/* role="status" so a screen reader is told the send worked without
            having to go looking for the heading that replaced the form. */}
        <h2
          role="status"
          className="mb-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
        >
          Thank You — We Have It
        </h2>
        <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
          {hasEmail
            ? "A real person reads every one of these. If yours needs an answer, we will reply to the address you left."
            : "A real person reads every one of these. You did not leave an address, so we cannot reply — but the message is on the pile either way."}
        </p>

        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/events"
            className="btn-gradient group w-full shrink-0 whitespace-nowrap no-underline shadow-xl shadow-accent-orange/20 sm:w-auto"
          >
            <span>Browse Events</span>
            <LinkPendingIcon>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-hover:translate-x-1"
              />
            </LinkPendingIcon>
          </Link>
          <button
            type="button"
            onClick={onSendAnother}
            className="btn-secondary w-full shrink-0 whitespace-nowrap sm:w-auto"
          >
            Send Another
          </button>
        </div>
      </div>
    </div>
  );
}
