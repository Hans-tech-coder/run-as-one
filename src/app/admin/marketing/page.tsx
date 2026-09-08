import React from 'react';
import prisma from '@/lib/db';
import { Tag, Ticket } from 'lucide-react';
import PromoCodesClient from './PromoCodesClient';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { promoStatus } from '@/lib/discount';
import { soonestFirst } from '@/lib/event-schedule';

export default async function MarketingPage() {
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }

  const [promoCodes, events] = await Promise.all([
    prisma.promoCode.findMany({
      where: { organizerId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { id: true, title: true } } },
    }),
    // The organizer's own events, for the "which event is this code for?"
    // picker. Soonest first, because a code is almost always being written for
    // the race that is about to open.
    prisma.event.findMany({
      where: { organizerId: auth.id },
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true },
    }),
  ]);

  // A batch of single-use vouchers is one promotion, not two hundred of them.
  // Counting redemptions here rather than in the client keeps the metric and
  // the table reading from the same rows.
  // Actually running, not merely un-exhausted: an expired code, one waiting
  // for its start date and one the organizer has paused are all things a
  // runner cannot use today, and counting them here would make this number a
  // reassurance rather than a fact.
  const live = promoCodes.filter(promo => promoStatus(promo) === 'ACTIVE');
  const redeemed = promoCodes.reduce((sum, promo) => sum + promo.usageCount, 0);

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Marketing Tools</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid mb-8">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Running Now</span>
              <div className="metric-icon"><Tag size={20} /></div>
            </div>
            <div className="metric-value">{live.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Times Redeemed</span>
              <div className="metric-icon"><Ticket size={20} /></div>
            </div>
            <div className="metric-value">{redeemed}</div>
          </div>
        </div>

        <PromoCodesClient
          initialPromos={promoCodes.map(promo => ({
            ...promo,
            validFrom: promo.validFrom ? promo.validFrom.toISOString() : null,
            validUntil: promo.validUntil ? promo.validUntil.toISOString() : null,
            createdAt: promo.createdAt.toISOString(),
          }))}
          events={events}
        />
      </div>
    </>
  );
}
