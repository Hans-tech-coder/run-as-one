"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Mail, Phone, X } from 'lucide-react';
import {
  expectedParticipantsLabel,
  hasApplicationDetails,
  organizerExperienceLabel,
  organizerServiceLabel,
  organizerTypeLabel,
} from '@/lib/organizer-application';
import { countryFor, parseE164 } from '@/lib/phone';
import { formatEventDay } from '@/lib/event-schedule';
import { MEMBER_STATE_LABELS, MEMBER_STATE_TONES, memberState } from '@/lib/team';

/**
 * Everything a client submission said, read in one place before Run As One
 * staff send an invite (ADMIN_MERGE_PLAN.md, Batch 3).
 *
 * It was the organizer application panel, read before an approval. Nobody
 * approves or rejects a submission any more, so *The decision* section went
 * with the flow it described; what took its place is **Sign-ins** — who has
 * been invited to sign in for this client and where each invitation stands
 * (`memberState`, the team screen's own badge), because "did they ever set up
 * their sign-in?" is the question staff open this panel to answer after an
 * invite.
 *
 * It is grouped the way the form asked — the organization, the person, what
 * they are planning — so staff read it in the order the applicant
 * wrote it. Every label comes from `lib/organizer-application.ts`, never the
 * stored code: a person reads "Running Club or Community", not `RUNNING_CLUB`,
 * and a value written before an option was renamed still reads as itself.
 *
 * The contact details are links, because the reason to open a submission is
 * usually to get hold of the human behind it: the phone dials, the address
 * opens a mail, the website opens in a new tab.
 *
 * A panel over the list rather than a route of its own: the invite needs the
 * list behind it, and a second page is a second thing to keep responsive.
 * Below `sm` it is a full-height sheet (`.admin-modal-sheet`), the registrant
 * detail modal's frame, because it is a thing a person reads rather than
 * answers. Escape and the backdrop close it, Tab stays inside it (yielding to
 * a dialog raised above it), and focus goes back to whatever opened it.
 */

/** One person invited to sign in for a client — a VIEWER membership. */
export interface ClientViewerRow {
  id: string;
  invitedAt: string;
  acceptedAt: string | null;
  suspendedAt: string | null;
  inviteExpiresAt: string | null;
  staff: { name: string; email: string; status: string };
}

export interface ClientApplicationRow {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  /** When the latest invitation went out; null until Send invite is pressed. */
  invitedAt: string | null;
  orgType: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactRole: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  website: string | null;
  experience: string | null;
  services: string[];
  firstEventName: string | null;
  firstEventDate: string | null;
  firstEventLocation: string | null;
  expectedRunners: string | null;
  applicationNote: string | null;
  viewers: ClientViewerRow[];
}

/** The close animation's length — the t-modal exit the other admin modals use. */
const CLOSE_MS = 150;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Manila, like every other date on this site, so a late-night application
 *  does not land on the wrong day. */
export function appliedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Sep 16, 2026, 3:04 PM", in Manila — an invitation is worth the time of
 *  day, because a resend the same afternoon is otherwise indistinguishable. */
function invitedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "+63 9171234567" — the dial code split off so the number reads at a glance.
 *  A number stored before E.164 comes back as its own digits. */
function displayPhone(value: string): string {
  const { iso2, national } = parseE164(value);
  if (!iso2) return value;
  return `+${countryFor(iso2).dial} ${national}`;
}

/** Only a web link is ever an href here — the column is written with a scheme
 *  by `normalizeLink`, and this keeps it that way for any older row. */
function safeWebsite(value: string): string | null {
  return /^https?:\/\//i.test(value) ? value : null;
}

export default function ApplicationPanel({
  client,
  statusBadge,
  actions,
  onClose,
}: {
  /** The submission being read. The panel is mounted only while there is one. */
  client: ClientApplicationRow;
  statusBadge: React.ReactNode;
  /** Send invite and archive, so the panel and the row cannot offer different ones. */
  actions: React.ReactNode;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // One frame after mount, so the scale-in has a state to travel from. Focus
  // goes to the close button, and back to the opener when the panel goes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setOpen(true));
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const requestClose = () => {
    if (closing) return;
    setOpen(false);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  // Escape closes; Tab and Shift+Tab wrap inside the panel rather than walking
  // out into the list behind it, which a screen reader user cannot see.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A confirm raised from the footer (AlertProvider) sits above this panel
      // and owns the keyboard while it is up: its Escape cancels it, not both.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const hasDetails = hasApplicationDetails(client);
  const contactName = [client.contactFirstName, client.contactLastName]
    .filter(Boolean)
    .join(' ');
  const basedIn = [client.city, client.province].filter(Boolean).join(', ');
  const website = client.website ? safeWebsite(client.website) : null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        open && !closing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-application-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${
          open ? 'is-open' : ''
        } ${closing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:p-4 border-b border-white/10 flex justify-between items-start gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue shrink-0">
              <FileText size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3
                id="client-application-title"
                className="text-xl font-semibold text-white m-0 [overflow-wrap:anywhere]"
              >
                {client.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                {statusBadge}
                <span>Applied {appliedOn(client.createdAt)}</span>
                {client.invitedAt && (
                  <span>Invited {appliedOn(client.invitedAt)}</span>
                )}
              </div>
            </div>
          </div>
          {/* 44px to press; the negative margin leaves the 20px icon where it
              sat, as .admin-back-link does. */}
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex flex-col gap-6">
          {/* Only once somebody has been invited: before that the footer's
              Send invite says everything an empty section would. */}
          {client.viewers.length > 0 && (
            <Section title="Sign-ins" list>
              {client.viewers.map(viewer => {
                const state = memberState({
                  acceptedAt: viewer.acceptedAt,
                  suspendedAt: viewer.suspendedAt,
                  inviteExpiresAt: viewer.inviteExpiresAt,
                  accountStatus: viewer.staff.status,
                });
                return (
                  <li
                    key={viewer.id}
                    className="min-w-0 sm:col-span-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white/90 [overflow-wrap:anywhere]">{viewer.staff.name}</div>
                      <div className="text-xs text-secondary [overflow-wrap:anywhere]">
                        {viewer.staff.email} · Invited {invitedOn(viewer.invitedAt)}
                      </div>
                    </div>
                    <span className={`status-badge ${MEMBER_STATE_TONES[state]} shrink-0`}>
                      {MEMBER_STATE_LABELS[state]}
                    </span>
                  </li>
                );
              })}
            </Section>
          )}

          {!hasDetails && (
            // One honest sentence instead of fifteen blanks: these accounts
            // were never asked any of it.
            <p className="text-sm text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 m-0">
              This submission came from an account created before the application form existed,
              so there are no application details to show. The address below is all it was asked
              for.
            </p>
          )}

          {hasDetails && (
            <Section title="The organization">
              <Detail label="Organizer type" value={organizerTypeLabel(client.orgType)} />
              <Detail label="Based in" value={basedIn} />
              <Detail
                label="Website or page"
                value={
                  website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1.5 text-accent-blue hover:underline break-all"
                    >
                      {website.replace(/^https?:\/\//i, '')}
                      <ExternalLink size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    client.website
                  )
                }
              />
              <Detail
                label="Events organized before"
                value={organizerExperienceLabel(client.experience)}
              />
            </Section>
          )}

          <Section title={hasDetails ? 'The person' : 'The contact'}>
            {hasDetails && <Detail label="Name" value={contactName} />}
            {hasDetails && <Detail label="Role" value={client.contactRole} />}
            <Detail
              label="Email"
              // The whole width when it is the only answer, so a long address
              // is not folded into half a card.
              full={!hasDetails}
              value={
                <a
                  href={`mailto:${client.email}`}
                  className="inline-flex items-start gap-1.5 text-accent-blue hover:underline [overflow-wrap:anywhere] min-w-0"
                >
                  <Mail size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  {client.email}
                </a>
              }
            />
            {hasDetails && (
              <Detail
                label="Mobile number"
                value={
                  client.phone && (
                    <a
                      href={`tel:${client.phone}`}
                      className="inline-flex items-start gap-1.5 text-accent-blue hover:underline"
                    >
                      <Phone size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                      {displayPhone(client.phone)}
                    </a>
                  )
                }
              />
            )}
          </Section>

          {hasDetails && (
            <Section title="What they are planning">
              <Detail
                label="Needs Run As One for"
                full
                value={
                  client.services.length > 0 && (
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                      {client.services.map(service => (
                        <li
                          key={service}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90"
                        >
                          {organizerServiceLabel(service)}
                        </li>
                      ))}
                    </ul>
                  )
                }
              />
              <Detail label="First event" value={client.firstEventName} />
              <Detail
                label="Date"
                value={client.firstEventDate && formatEventDay(client.firstEventDate)}
              />
              <Detail label="Location" value={client.firstEventLocation} />
              <Detail
                label="Expected runners"
                value={expectedParticipantsLabel(client.expectedRunners)}
              />
              <Detail
                label="Anything else they told us"
                full
                value={
                  client.applicationNote && (
                    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {client.applicationNote}
                    </span>
                  )
                }
              />
            </Section>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-white/10 flex flex-wrap justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Close
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}

/** One group of answers. `list` draws a `<ul>` rather than a `<dl>`, for the
 *  Sign-ins, which are people rather than question-and-answer pairs. */
function Section({
  title,
  list = false,
  children,
}: {
  title: string;
  list?: boolean;
  children: React.ReactNode;
}) {
  const frame = 'm-0 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 rounded-[12px] border border-white/10 bg-black/30 p-4';
  return (
    <section className="min-w-0">
      <h4 className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-secondary">
        {title}
      </h4>
      {list ? (
        <ul className={`${frame} list-none`}>{children}</ul>
      ) : (
        <dl className={frame}>{children}</dl>
      )}
    </section>
  );
}

/** One answer. An optional question left blank says so, rather than showing
 *  an empty line that reads like a rendering fault. */
function Detail({
  label,
  value,
  full = false,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  const blank = value === null || value === undefined || value === '' || value === false;
  return (
    <div className={`min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="mb-1 text-xs text-secondary">{label}</dt>
      <dd className={`m-0 text-sm ${blank ? 'text-secondary italic' : 'text-white/90'} [overflow-wrap:anywhere]`}>
        {blank ? 'Not given' : value}
      </dd>
    </div>
  );
}
