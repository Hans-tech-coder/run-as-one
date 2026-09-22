import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { can, requireTeamActor } from '@/lib/actor';
import prisma from '@/lib/db';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { codeSentReminder } from '@/lib/pacer';
import { pacerOrdersByCode, pacersForEvent } from '@/lib/pacer-store';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import PacersClient, { type PacerRow } from './PacersClient';

/**
 * One race's pacers: the people the organizer has given a free entry to, the
 * code each of them was given, and which of them have not been told yet.
 *
 * **It lives under the event, not under `/admin/marketing`.** A pacer code is
 * not a promotion — it is a free entry handed to a named person — and a pacer
 * is meaningless without an event and a category, so the screen belongs beside
 * Registrants and Results, and the URL says the same
 * (`url-follows-what-the-page-shows`). See `src/lib/pacer.ts` and
 * `PACER_DISCOUNT_PLAN.md`.
 *
 * Scoped to the signed-in organizer's own event, like every other admin screen:
 * an id in the URL is not proof the race belongs to the browser's owner, and
 * this screen both lists free entries and creates them.
 */
export default async function PacersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireTeamActor();

  const found = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    select: {
      id: true,
      title: true,
      categories: {
        orderBy: CATEGORY_ORDER,
        select: { id: true, name: true, distance: true },
      },
    },
  });

  // `promo:manage`, the same verb the routes behind this screen ask, so nobody
  // is shown a page whose every button would be refused. A no-match and a
  // no-permission read identically, as they do on Registrants and Results, so
  // the screen cannot be used to confirm that some id exists.
  const event =
    found && can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: id }) ? found : null;

  if (!event) {
    return <AdminNotFound {...EVENT_NOT_FOUND} />;
  }

  const pacers = await pacersForEvent(actor.orgId, id);

  // Which pacers have actually registered, and on which order. By the code text
  // snapshotted onto the registration, for the reason `promo-redemptions.ts`
  // gives: the column is not a relation, so a deleted code cannot rewrite a
  // receipt. One query for the whole screen.
  const orders = await pacerOrdersByCode(
    id,
    pacers.map(pacer => pacer.code),
  );

  const rows: PacerRow[] = pacers.map(pacer => {
    // Exactly one category, by construction (the POST route writes one row).
    // Read defensively anyway: a row whose category was deleted out from under
    // it should render as a pacer with no category rather than crash the screen.
    const link = pacer.categories[0];
    return {
      id: pacer.id,
      code: pacer.code,
      assigneeName: pacer.assigneeName,
      waiveAdminFee: pacer.waiveAdminFee,
      codeSentAt: pacer.codeSentAt ? pacer.codeSentAt.toISOString() : null,
      paused: pacer.paused,
      usageCount: pacer.usageCount,
      categoryId: link?.categoryId ?? null,
      order: orders.get(pacer.code) ?? null,
    };
  });

  return (
    <>
      <header className="admin-header flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/admin/events"
            className="admin-back-link text-secondary hover:text-primary transition-colors"
            aria-label="Back to Events"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Pacers for {event.title}</h1>
        </div>
      </header>

      <div className="admin-content">
        <PacersClient
          eventId={event.id}
          categories={event.categories}
          pacers={rows}
          // The amber line, worked out from the one `needsCodeSent` rule the
          // chips and the event menu's count also read, so the three cannot
          // disagree about who is still waiting.
          reminder={codeSentReminder(rows)}
          // Whether this person may waive Run As One's admin fee. Decided here
          // with the same `can()` the routes ask, so the toggle is disabled with
          // its reason rather than offered and then refused.
          canWaiveAdminFee={can(actor, 'promo:waive-fee', {
            organizerId: actor.orgId,
            eventId: id,
          })}
        />
      </div>
    </>
  );
}
