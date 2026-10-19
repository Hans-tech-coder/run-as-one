import React from 'react';
import { can, requireTeamActor } from '@/lib/actor';
import { readEventReceipts } from '@/lib/logistics-receipts';
import AdminNotFound from '../../../AdminNotFound';
import { EVENT_NOT_FOUND } from '../../event-not-found';
import DashboardHeader from '@/app/admin/DashboardHeader';
import PickupDeliveryClient from './PickupDeliveryClient';

/**
 * One race's kits: which receipts are claimed at pickup and which ship, where
 * each parcel goes, and the switches between the two
 * (LOGISTICS_CHANGE_PLAN.md Revision 1, R1). One card per receipt, because a
 * switch moves a whole receipt and is charged per parcel; the registrants
 * table is one row per runner and only reads the result (R6).
 *
 * Scoped to the signed-in organizer's own event, like Registrants: an id in
 * the URL is not proof the race belongs to the browser's owner, and this
 * screen lists every runner's email and home address. Seeing it takes
 * `registration:view`, as Registrants does; switching and cancelling take
 * `registration:edit`, the payment link and emails `registration:email`,
 * recording a payment `registration:validate` and its proof `proof:view` —
 * the gates the routes behind its buttons ask (Session 3). A
 * no-match and a no-permission read identically, so the screen cannot be used
 * to confirm that some id exists.
 */
export default async function PickupDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireTeamActor();
  const reach = { organizerId: actor.orgId, eventId: id };

  const data = can(actor, 'registration:view', reach) ? await readEventReceipts(id, actor.orgId) : null;
  if (!data) return <AdminNotFound {...EVENT_NOT_FOUND} />;

  return (
    <>
      <DashboardHeader
        title="Pickup & Delivery"
        crumbs={[{ label: 'Events', href: '/admin/events' }, { label: data.event.title }]}
      />

      <div className="admin-content">
        <PickupDeliveryClient
          data={data}
          permissions={{
            edit: can(actor, 'registration:edit', reach),
            email: can(actor, 'registration:email', reach),
            validate: can(actor, 'registration:validate', reach),
            proof: can(actor, 'proof:view', reach),
          }}
        />
      </div>
    </>
  );
}
