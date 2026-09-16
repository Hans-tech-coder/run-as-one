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

/**
 * Everything an applicant wrote, read in one place before an account is
 * approved.
 *
 * Approving an organizer hands a stranger a public race page, runners' money
 * and every registrant's inbox, and until this panel existed that decision was
 * made from a name, an address and a date. The fifteen answers the form at
 * `/admin/register` collects were in the row and nowhere on screen.
 *
 * It is grouped the way the form asked — the organization, the person, what
 * they are planning — so the super admin reads it in the order the applicant
 * wrote it. Every label comes from `lib/organizer-application.ts`, never the
 * stored code: a person reads "Running Club or Community", not `RUNNING_CLUB`,
 * and a value written before an option was renamed still reads as itself.
 *
 * The contact details are links, because the reason to open an application is
 * usually to get hold of the human behind it: the phone dials, the address
 * opens a mail, the website opens in a new tab.
 *
 * A panel over the list rather than a route of its own: the decision needs the
 * list behind it, and a second page is a second thing to keep responsive.
 * Below `sm` it is a full-height sheet (`.admin-modal-sheet`), the registrant
 * detail modal's frame, because it is a thing a person reads rather than
 * answers. Escape and the backdrop close it, Tab stays inside it, and focus
 * goes back to whatever opened it.
 */

export interface OrganizerApplicationRow {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
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
  organizer,
  statusBadge,
  actions,
  onClose,
}: {
  /** The account being read. The panel is mounted only while there is one. */
  organizer: OrganizerApplicationRow;
  statusBadge: React.ReactNode;
  /** The decision controls, so the panel and the row cannot offer different ones. */
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

  const hasDetails = hasApplicationDetails(organizer);
  const contactName = [organizer.contactFirstName, organizer.contactLastName]
    .filter(Boolean)
    .join(' ');
  const basedIn = [organizer.city, organizer.province].filter(Boolean).join(', ');
  const website = organizer.website ? safeWebsite(organizer.website) : null;

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
        aria-labelledby="organizer-application-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${
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
                id="organizer-application-title"
                className="text-xl font-semibold text-white m-0 [overflow-wrap:anywhere]"
              >
                {organizer.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                {statusBadge}
                <span>Applied {appliedOn(organizer.createdAt)}</span>
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
          {!hasDetails && (
            // One honest sentence instead of fifteen blanks: these accounts
            // were never asked any of it.
            <p className="text-sm text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 m-0">
              This account was created before the application form existed, so there are no
              application details to show. The sign-in address below is all it was asked for.
            </p>
          )}

          {hasDetails && (
            <Section title="The organization">
              <Detail label="Organizer type" value={organizerTypeLabel(organizer.orgType)} />
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
                    organizer.website
                  )
                }
              />
              <Detail
                label="Events organized before"
                value={organizerExperienceLabel(organizer.experience)}
              />
            </Section>
          )}

          <Section title={hasDetails ? 'The person' : 'The account'}>
            {hasDetails && <Detail label="Name" value={contactName} />}
            {hasDetails && <Detail label="Role" value={organizer.contactRole} />}
            <Detail
              label="Email"
              // The whole width when it is the only answer, so a long address
              // is not folded into half a card.
              full={!hasDetails}
              value={
                <a
                  href={`mailto:${organizer.email}`}
                  className="inline-flex items-start gap-1.5 text-accent-blue hover:underline [overflow-wrap:anywhere] min-w-0"
                >
                  <Mail size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  {organizer.email}
                </a>
              }
            />
            {hasDetails && (
              <Detail
                label="Mobile number"
                value={
                  organizer.phone && (
                    <a
                      href={`tel:${organizer.phone}`}
                      className="inline-flex items-start gap-1.5 text-accent-blue hover:underline"
                    >
                      <Phone size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                      {displayPhone(organizer.phone)}
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
                  organizer.services.length > 0 && (
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                      {organizer.services.map(service => (
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
              <Detail label="First event" value={organizer.firstEventName} />
              <Detail
                label="Date"
                value={organizer.firstEventDate && formatEventDay(organizer.firstEventDate)}
              />
              <Detail label="Location" value={organizer.firstEventLocation} />
              <Detail
                label="Expected runners"
                value={expectedParticipantsLabel(organizer.expectedRunners)}
              />
              <Detail
                label="Anything else they told us"
                full
                value={
                  organizer.applicationNote && (
                    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {organizer.applicationNote}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-secondary">
        {title}
      </h4>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 rounded-[12px] border border-white/10 bg-black/30 p-4">
        {children}
      </dl>
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
