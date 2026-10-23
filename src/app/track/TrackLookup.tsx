"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, MapPinned, RotateCcw, Search } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import { trackInputErrors } from '@/lib/track-input';
import type { TrackView } from '@/lib/track';
import TrackResult from './TrackResult';
import type { TrackHelp } from './TrackHelpCard';

/**
 * The reference + email form (TRACK_PAGE_PLAN.md D1) and, once it finds one,
 * the registration in its place.
 *
 * The pair is POSTed to `/api/track`, never put in the URL, and the email is
 * not kept anywhere once the answer is back: the result carries its own
 * short-lived token for *Resend*. A field that cannot be a reference or an
 * email is named on that field, checked here by the route's own rules
 * (lib/track-input.ts); any other miss is the one "not found" sentence in a
 * panel under the form, because it cannot say which half was wrong.
 *
 * A match for a race on another site (a client's race asked on the main site,
 * or the reverse) is not drawn here under this site's branding: the route
 * answers where it lives, and the panel links there (`trackHome`, lib/track.ts).
 */

type Elsewhere = { url: string; siteName: string; eventTitle: string };

type Field = 'ref' | 'email';
const FIELD_ID: Record<Field, string> = { ref: 'track-ref', email: 'track-email' };

export default function TrackLookup({ help }: { help: TrackHelp }) {
  const { alert } = useAlert();
  const [ref, setRef] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [miss, setMiss] = useState<string | null>(null);
  const [elsewhere, setElsewhere] = useState<Elsewhere | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<TrackView | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const missRef = useRef<HTMLDivElement>(null);

  // A result replaces the form, so focus and the viewport follow it there
  // rather than leaving a phone looking at where the button was.
  useEffect(() => {
    if (!view) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [view]);

  const showErrors = (found: Partial<Record<Field, string>>) => {
    setErrors(found);
    const first = (['ref', 'email'] as Field[]).find(field => found[field]);
    if (first) document.getElementById(FIELD_ID[first])?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMiss(null);
    setElsewhere(null);
    const found = trackInputErrors(ref, email);
    if (found) return showErrors(found);

    setErrors({});
    setBusy(true);
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim(), email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.view) {
        setView(data.view as TrackView);
        return;
      }
      if (data?.elsewhere) {
        setElsewhere(data.elsewhere as Elsewhere);
        window.setTimeout(() => missRef.current?.focus(), 0);
        return;
      }
      if (data?.errors) return showErrors(data.errors);
      setMiss(data?.error || 'Something went wrong. Please try again in a moment.');
      window.setTimeout(() => missRef.current?.focus(), 0);
    } catch {
      alert({ variant: 'danger', title: 'We could not look that up', message: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const lookUpAnother = () => {
    setView(null);
    setEmail('');
    setRef('');
    window.setTimeout(() => document.getElementById(FIELD_ID.ref)?.focus(), 0);
  };

  if (view) {
    return (
      <div className="flex w-full flex-col items-center gap-5">
        <TrackResult view={view} help={help} headingRef={headingRef} />
        <button type="button" onClick={lookUpAnother} className="btn-secondary w-full sm:w-auto">
          <RotateCcw size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
          Look Up Another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="glass-panel relative w-full overflow-clip rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-8"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-orange/10 blur-[90px]" />
      <div className="relative z-10 flex flex-col gap-5">
        <div className="input-group">
          <label htmlFor={FIELD_ID.ref}>Registration reference</label>
          <input
            id={FIELD_ID.ref}
            type="text"
            value={ref}
            maxLength={30}
            placeholder="RM-D918005C"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase"
            aria-invalid={errors.ref ? true : undefined}
            aria-describedby={`${errors.ref ? `${FIELD_ID.ref}-error ` : ''}${FIELD_ID.ref}-hint`}
            onChange={e => {
              setRef(e.target.value);
              if (errors.ref) setErrors(prev => ({ ...prev, ref: undefined }));
            }}
          />
          <FieldError id={`${FIELD_ID.ref}-error`} message={errors.ref} />
          <p id={`${FIELD_ID.ref}-hint`} className="m-0 text-xs text-secondary">
            In your registration email. A runner in a group can use their own, like RM-D918005C-2.
          </p>
        </div>

        <div className="input-group">
          <label htmlFor={FIELD_ID.email}>Email you registered with</label>
          <input
            id={FIELD_ID.email}
            type="email"
            value={email}
            maxLength={254}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={`${errors.email ? `${FIELD_ID.email}-error ` : ''}${FIELD_ID.email}-hint`}
            onChange={e => {
              setEmail(e.target.value);
              if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
            }}
          />
          <FieldError id={`${FIELD_ID.email}-error`} message={errors.email} />
          <p id={`${FIELD_ID.email}-hint`} className="m-0 text-xs text-secondary">
            The contact email on the order, or the runner’s own email.
          </p>
        </div>

        {elsewhere && (
          <div
            ref={missRef}
            role="status"
            tabIndex={-1}
            className="flex flex-col gap-3 rounded-[12px] border border-accent-blue/25 bg-accent-blue/[0.08] px-4 py-3 text-sm text-white outline-none"
          >
            <p className="m-0 flex items-start gap-2.5">
              <MapPinned size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-blue" />
              <span>
                This registration is for <strong>{elsewhere.eventTitle}</strong>, on {elsewhere.siteName}&rsquo;s
                site. Open it there to see its status and details.
              </span>
            </p>
            <a href={elsewhere.url} className="btn-secondary group w-full">
              <span>Open on {elsewhere.siteName}</span>
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        )}

        {miss && (
          <div
            ref={missRef}
            role="alert"
            tabIndex={-1}
            className="flex items-start gap-2.5 rounded-[12px] border border-red-400/25 bg-red-400/[0.08] px-4 py-3 text-sm text-red-200 outline-none"
          >
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-red-400" />
            <span>{miss}</span>
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-gradient w-full shadow-xl shadow-accent-orange/20">
          {busy ? (
            <BusyLabel>Looking up</BusyLabel>
          ) : (
            <>
              <Search size={18} aria-hidden="true" className="shrink-0" />
              <span>Track</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
