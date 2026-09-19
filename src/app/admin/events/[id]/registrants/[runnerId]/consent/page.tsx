import React from 'react';
import Link from 'next/link';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import prisma from '@/lib/db';
import { can, requireTeamActor } from '@/lib/actor';
import AdminNotFound from '../../../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../../../event-not-found';
import { runnerRef } from '@/lib/order-ref';
import { resolveConsentWaiver } from '@/lib/consent-waiver';
import { formatEventDay, formatEventInstant } from '@/lib/event-schedule';
import {
  GUARDIAN_CONSENT_MAX_AGE,
  GUARDIAN_RELATIONSHIP_LABELS,
  ageOn,
  asGuardianRelationship,
  guardianConsentSentence,
  needsGuardianConsent,
} from '@/lib/minor-consent';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import PrintableSheet, { PrintButton } from './PrintableSheet';

/**
 * One runner's parent/guardian consent, as a sheet to print for kit claiming
 * (GUARDIAN_CONSENT_PLAN.md Batch 4).
 *
 * Consent is given online, inside the wizard — this page is not a second way
 * to give it. It exists for the organizer who wants ink: the parent is at kit
 * claiming anyway, so the sheet goes there with the event, the runner, the
 * guardian and when they agreed, the waiver they agreed to, and a blank line
 * to sign. A minor with **no** consent on file (a row from before it was
 * asked, or a birthdate staff corrected later) gets the same sheet with the
 * guardian's name and relationship left as blanks to be filled in by hand,
 * which is exactly the case where paper is needed.
 *
 * The browser's print dialog does the printing; there is no PDF library.
 *
 * Scoped like the registrants screen it is reached from: the event must be
 * this organizer's and this person must be allowed `registration:view` on it,
 * and a runner id that is not on this event reads as not found rather than
 * as someone else's.
 */
export default async function GuardianConsentSheetPage({
  params,
}: {
  params: Promise<{ id: string; runnerId: string }>;
}) {
  const { id, runnerId } = await params;
  const actor = await requireTeamActor();

  const event = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    select: { id: true, title: true, date: true, location: true, consentWaiver: true },
  });
  if (!event || !can(actor, 'registration:view', { organizerId: actor.orgId, eventId: id })) {
    return <AdminNotFound {...EVENT_NOT_FOUND} />;
  }

  const registrantsHref = `/admin/events/${id}/registrants`;

  const runner = await prisma.runner.findFirst({
    where: { id: runnerId, deletedAt: null, registration: { eventId: id } },
    include: {
      category: { select: { name: true } },
      registration: {
        select: {
          orderRef: true,
          _count: { select: { runners: { where: { deletedAt: null } } } },
        },
      },
    },
  });
  if (!runner) {
    return (
      <AdminNotFound
        title="Runner Not Found"
        heading="Runner not found."
        body="The runner may have been removed from this order, or the link may be an old one. The rest of the registrants are where you left them."
        homeHref={registrantsHref}
        homeLabel="Back to Registrants"
      />
    );
  }

  const childName = `${runner.firstName} ${runner.lastName}`;
  const reference = runnerRef(
    runner.registration.orderRef,
    runner.runnerNo,
    runner.registration._count.runners,
  );
  const age = ageOn(runner.birthdate, event.date);
  const isMinor = needsGuardianConsent(runner.birthdate, event.date);
  const relationship = asGuardianRelationship(runner.guardianRelationship);
  const waiver = resolveConsentWaiver(event);

  const sheet = (
    <article className="consent-sheet" aria-labelledby="consent-sheet-title">
      <header>
        {/* The Run As One lockup, as the default. The owner wants the
            client's or the event's own logo here once the dashboard has a
            setting for one; until then Run As One, who runs the races and
            whose name the footer already carries, heads every sheet. When
            that setting lands, choose it here and keep this as the fallback. */}
        <RunAsOneLogo className="consent-sheet-logo" />
        <h1 id="consent-sheet-title">Parent/Guardian Consent</h1>
        <p style={{ margin: '4px 0 0', color: '#444' }}>
          {event.title} &middot; {formatEventDay(event.date)} &middot; {event.location}
        </p>
      </header>

      <section>
        <h2>Runner</h2>
        <div className="consent-sheet-grid">
          <div>
            <span className="consent-sheet-label">Name</span>
            <span className="consent-sheet-value">{childName}</span>
          </div>
          <div>
            <span className="consent-sheet-label">Reference</span>
            <span className="consent-sheet-value">{reference}</span>
          </div>
          <div>
            <span className="consent-sheet-label">Category</span>
            <span className="consent-sheet-value">{runner.category.name}</span>
          </div>
          <div>
            <span className="consent-sheet-label">Birthdate</span>
            <span className="consent-sheet-value">
              {runner.birthdate ? formatEventDay(runner.birthdate) : '—'}
              {age !== null ? ` (${age} on race day)` : ''}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Parent or Legal Guardian</h2>
        <div className="consent-sheet-grid">
          <div>
            <span className="consent-sheet-label">Full name</span>
            {runner.guardianName ? (
              <span className="consent-sheet-value">{runner.guardianName}</span>
            ) : (
              <span className="consent-sheet-blank" />
            )}
          </div>
          <div>
            <span className="consent-sheet-label">Relationship</span>
            {relationship ? (
              <span className="consent-sheet-value">{GUARDIAN_RELATIONSHIP_LABELS[relationship]}</span>
            ) : (
              <span className="consent-sheet-value" style={{ fontWeight: 400 }}>
                &#9744; Parent &nbsp;&nbsp; &#9744; Legal Guardian
              </span>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="consent-sheet-label">Consent given online</span>
            <span className="consent-sheet-value">
              {runner.guardianConsentAt
                ? formatEventInstant(runner.guardianConsentAt)
                : 'Not given online. To be signed below.'}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Consent</h2>
        <p className="consent-sheet-statement">{guardianConsentSentence(childName)}</p>
      </section>

      <section className="consent-sheet-waiver">
        <h2>Disclaimer, Consent &amp; Data Privacy Waiver</h2>
        {waiver.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <section className="consent-sheet-signatures">
        <div className="consent-sheet-signature">
          Signature of parent or guardian over printed name
        </div>
        <div className="consent-sheet-signature">Date</div>
        <div className="consent-sheet-signature">Received by (staff) at kit claiming</div>
        <div className="consent-sheet-signature">Date</div>
      </section>

      <p className="consent-sheet-footer">
        Order {runner.registration.orderRef} &middot; Printed from the Run As One dashboard.
      </p>
    </article>
  );

  return (
    <>
      <header className="admin-header">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={registrantsHref}
            className="admin-back-link text-secondary hover:text-primary transition-colors"
            aria-label="Back to Registrants"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title truncate">Guardian Consent: {childName}</h1>
        </div>
        <PrintButton />
      </header>

      <div className="admin-content">
        {/* A sheet for a runner who does not need one is still printable —
            staff may want it for a runner whose age is disputed — but the
            screen says so first, so nobody chases a signature for a
            14-year-old by mistake. */}
        {!isMinor && (
          <p className="consent-sheet-screen-note flex items-start gap-2 text-sm text-[var(--status-warning)]">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {age !== null
                ? `This runner is ${age} on race day, so no guardian consent is needed (it is for ${GUARDIAN_CONSENT_MAX_AGE} and under).`
                : 'This runner has no readable birthdate, so their age on race day is unknown.'}
            </span>
          </p>
        )}
        <PrintableSheet>{sheet}</PrintableSheet>
      </div>
    </>
  );
}
