"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import LinkPendingIcon from "@/components/ui/LinkPendingIcon";

/**
 * What the feedback form becomes once a message is sent. Its own file so the
 * form stays about the form; useFeedbackForm owns the scroll back to its top,
 * which is why the panel's node is handed back through `panelRef`. On Paper:
 * the same card the form was, a solid check mark, the button pair.
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
      className="site-form-card scroll-mt-[calc(var(--nav-offset)+1rem)]"
    >
      <span className="site-done-mark" aria-hidden="true">
        <Check size={22} strokeWidth={2.5} />
      </span>

      {/* role="status" so a screen reader is told the send worked without
          having to go looking for the heading that replaced the form. */}
      <h2 role="status" className="site-h3">
        Thank you — we have it
      </h2>
      <p className="m-0 mt-3 max-w-[52ch] leading-relaxed text-site-muted">
        {hasEmail
          ? "A real person reads every one of these. If yours needs an answer, we will reply to the address you left."
          : "A real person reads every one of these. You did not leave an address, so we cannot reply — but the message is on the pile either way."}
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link href="/events" className="site-btn site-btn--action site-btn--block-sm">
          <span>Browse events</span>
          <LinkPendingIcon>
            <ArrowRight size={18} aria-hidden="true" className="shrink-0" />
          </LinkPendingIcon>
        </Link>
        <button
          type="button"
          onClick={onSendAnother}
          className="site-btn site-btn--quiet site-btn--block-sm"
        >
          Send another
        </button>
      </div>
    </div>
  );
}
