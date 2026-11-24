"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import LinkPendingIcon from "@/components/ui/LinkPendingIcon";

/**
 * What the Contact Us form becomes once a message is sent: the same card, a
 * solid check, what happens next, and the way home. No copy is emailed to the
 * sender (lib/email-contact.ts says why), so the panel says so instead of
 * letting them wait for one.
 */
export default function ContactSent({ panelRef }: { panelRef: (el: HTMLElement | null) => void }) {
  return (
    <div ref={panelRef} className="site-form-card scroll-mt-[calc(var(--nav-offset)+1rem)]">
      {/* The check and the heading on one line (owner, 2026-11-24). */}
      <div className="flex items-center gap-3">
        <span className="site-done-mark shrink-0" aria-hidden="true">
          <Check size={22} strokeWidth={2.5} />
        </span>
        {/* Inline: .site-h3's margin sits outside Tailwind's layers, so m-0 loses. */}
        <h2 role="status" className="site-h3" style={{ margin: 0 }}>
          Message Sent
        </h2>
      </div>
      <p className="m-0 mt-3 max-w-[52ch] leading-relaxed text-site-muted">
        It is in our inbox. A person on our team will read it and reply to the
        email you gave. We do not send an automatic copy, so there is nothing to
        wait for in your inbox until then.
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link href="/" className="site-btn site-btn--action site-btn--block-sm">
          <span>Back to Home</span>
          <LinkPendingIcon>
            <ArrowRight size={18} aria-hidden="true" className="shrink-0" />
          </LinkPendingIcon>
        </Link>
        <Link href="/events" className="site-btn site-btn--quiet site-btn--block-sm">
          Browse Events
        </Link>
      </div>
    </div>
  );
}
