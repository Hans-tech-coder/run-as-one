"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Copy, Mail, Send } from 'lucide-react';
import { BrandGlyph } from '@/components/BrandIcons';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import type { TrackView } from '@/lib/track';

/**
 * "May problema sa registration mo?" (TRACK_PAGE_PLAN.md §6). A registration
 * concern goes to email or the Facebook page, never to /feedback, which is the
 * software's own inbox — that one is the small line at the bottom.
 *
 * - **Email us** prefills the subject `[RM-…] Registration concern – <event>`
 *   so staff can search the inbox by reference, and a short outline. Nothing
 *   personal goes in the link: no phone, address or birthdate.
 * - **Message us on Facebook** sits beside *Copy reference*, because a
 *   Messenger link cannot prefill text reliably.
 * - Each channel is shown only when it is set (PROJECT_GUIDE §8 rule 1).
 * - **Resend my confirmation email** goes to the address on file only, and is
 *   throttled per order on the server (`/api/track/resend`).
 */
export type TrackHelp = { contactEmail: string; facebookUrl: string | null };

export default function TrackHelpCard({ view, help }: { view: TrackView; help: TrackHelp }) {
  const { alert, toast } = useAlert();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const reference = view.runners.length === 1 ? view.runners[0].ref : view.orderRef;
  const subject = `[${reference}] Registration concern – ${view.event.title}`;
  const body = `Reference: ${reference}\n\nWhat is wrong:\n\n\nWhat it should be:\n\n`;
  const mailto = `mailto:${help.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast(`Copied ${reference}. Paste it in your message.`);
    } catch {
      alert({ variant: 'danger', title: 'Could not copy', message: `Your reference is ${reference}. Type it into your message.` });
    }
  };

  const resend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/track/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: view.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert({ variant: 'danger', title: 'We could not resend it', message: data?.error || 'Please try again in a moment.' });
        return;
      }
      setSent(true);
      toast({ title: 'Email sent', message: `Sent to ${data.sentTo}. Check your spam folder if it is not in your inbox in a few minutes.` });
    } catch {
      alert({ variant: 'danger', title: 'We could not resend it', message: 'Check your connection and try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="track-help-title" className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
      <h2 id="track-help-title" className="m-0 text-lg font-black uppercase tracking-wide text-white">
        May problema sa registration mo?
      </h2>
      <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
        Something wrong above? Tell us what it is and what it should be. Quote
        your reference, <span className="font-mono font-semibold text-white">{reference}</span>, so we can find it.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a href={mailto} className="btn-secondary w-full">
          <Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
          Email Us
        </a>
        {help.facebookUrl && (
          <a href={help.facebookUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full">
            <span className="shrink-0 text-accent-orange"><BrandGlyph channel="facebook" size={18} /></span>
            Message Us
          </a>
        )}
        {help.facebookUrl && (
          <button type="button" onClick={copyReference} className="btn-secondary w-full sm:col-span-2">
            <Copy size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
            Copy Reference
          </button>
        )}
      </div>

      {view.resend && (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <button type="button" onClick={resend} disabled={sending || sent} className="btn-secondary w-full">
            {sending ? (
              <BusyLabel>Sending</BusyLabel>
            ) : (
              <>
                <Send size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
                {sent ? 'Email Sent' : 'Resend My Confirmation Email'}
              </>
            )}
          </button>
          <p className="m-0 mt-2 text-center text-xs leading-relaxed text-secondary">
            Sends it again to {view.resend.to}, the email this registration was made with.
          </p>
        </div>
      )}

      <p className="m-0 mt-5 text-center text-xs text-secondary">
        Problem with the website itself?{' '}
        <Link
          href="/feedback?from=/track"
          className="text-white underline decoration-accent-orange/50 underline-offset-4 transition-colors hover:decoration-accent-orange"
        >
          Send feedback
        </Link>
      </p>
    </section>
  );
}
