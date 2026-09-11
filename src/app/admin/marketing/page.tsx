import React from 'react';
import prisma from '@/lib/db';
import { HandCoins, Tag, Ticket } from 'lucide-react';
import PromoCodesClient from './PromoCodesClient';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { promoStatus } from '@/lib/discount';
import { soonestFirst } from '@/lib/event-schedule';
import { formatPesos } from '@/lib/money';
import { NO_SPEND, spendByCode } from '@/lib/promo-redemptions';
import { CATEGORY_ORDER } from '@/lib/category-order';

export default async function MarketingPage() {
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }

  const [promoCodes, events, spend] = await Promise.all([
    prisma.promoCode.findMany({
      where: { organizerId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true } },
        // What a CATEGORY_PRICE promotion puts each option on. The table
        // counts them in its Discount column and the edit form fills its price
        // boxes from them, so leaving them out would show an organizer a
        // promotion with an empty price list and invite them to retype it.
        categoryPrices: {
          select: { categoryId: true, price: true, usageLimit: true, usageCount: true },
        },
      },
    }),
    // The organizer's own events, for the "which event is this code for?"
    // picker. Soonest first, because a code is almost always being written for
    // the race that is about to open.
    prisma.event.findMany({
      where: { organizerId: auth.id },
      orderBy: soonestFirst,
      select: {
        id: true,
        title: true,
        date: true,
        // The options each race sells, so picking an event in the form reveals
        // its price list without a round trip. An organizer's whole catalogue
        // is a handful of rows per race — cheaper than a fetch per selection,
        // and it keeps the modal instant.
        categories: {
          select: { id: true, name: true, distance: true, price: true },
          orderBy: CATEGORY_ORDER,
        },
      },
    }),
    // What each promotion has actually given away, in one grouped query for
    // the whole screen rather than one per row. Attribution is by the code
    // text this organizer's registrations were stamped with — see
    // lib/promo-redemptions.ts for why there is no id to match on.
    spendByCode(auth.id),
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
  // Summed across the promotions that still exist, so this card is the Given
  // column below it added up. A discount stamped by a promotion since deleted
  // is still in `spend` — the registration keeps its snapshot — but putting it
  // here would leave a headline number the table underneath cannot account
  // for, which reads as an arithmetic error rather than as history.
  const givenAway = promoCodes.reduce(
    (sum, promo) => sum + (spend.get(promo.code) ?? NO_SPEND).given,
    0,
  );

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
          {/* The number that answers "was this promotion worth running?".
              Redemptions say how many; only this says how much. Counted on
              paid orders alone, because a checkout nobody finished has spent a
              redemption and moved no money. */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Given Away</span>
              <div className="metric-icon"><HandCoins size={20} /></div>
            </div>
            <div className="metric-value">&#8369;{formatPesos(givenAway)}</div>
          </div>
        </div>

        <PromoCodesClient
          initialPromos={promoCodes.map(promo => ({
            ...promo,
            // Per code, so the client can add them up per promotion the same
            // way it already adds up redemptions across a voucher batch.
            given: (spend.get(promo.code) ?? NO_SPEND).given,
            paidOrders: (spend.get(promo.code) ?? NO_SPEND).paid,
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
