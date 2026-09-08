"use client";

import React from 'react';
import Link from 'next/link';
import { ExternalLink, Tag } from 'lucide-react';
import {
  PROMO_STATUS_LABELS,
  PROMO_STATUS_TONES,
  describePromo,
  promoConditions,
  promoEndingSoon,
  promoStatus,
} from '@/lib/discount';
// Type only, so the server-only store (and Prisma with it) never reaches the
// browser bundle — the same line `discount.ts` and `promo-store.ts` are split
// along.
import type { EventPromotion } from '@/lib/promo-store';

/**
 * What promotions are running on this race, on the race's own screen.
 *
 * An organizer editing an event could not see that a 20% code was live on it
 * without leaving for `/admin/marketing` and reading the Applies To column of
 * every row — so a price change here was made without the discount beside it.
 *
 * **Read-only on purpose.** One screen owns promotions; a second place to edit
 * them is a second place for them to drift, and the pause an organizer flipped
 * here would be invisible to the table they flipped it from. Everything on
 * this panel is therefore a fact plus a link to where it can be changed. It
 * says what it gives, what it needs and whether it is running — the same three
 * things `PromoHighlights` tells a runner and the marketing table tells its
 * owner, read from the same functions, so no screen can describe a promotion
 * differently from another.
 */
export default function EventPromotionsPanel({
  promotions,
}: {
  promotions: EventPromotion[];
}) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Promotions</h2>
        <Link href="/admin/marketing" className="btn-filter no-underline">
          Marketing Tools <ExternalLink size={14} />
        </Link>
      </div>
      <div className="admin-panel-content">
        <p className="text-sm opacity-70 mb-6">
          Discounts a runner registering for this race can be given — the ones scoped to it,
          and the ones that cover every event you run. They are created and changed on the
          marketing screen, so there is only ever one place they live.
        </p>

        {promotions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
            <Tag size={28} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm m-0 mb-1">No promotions reach this event.</p>
            <p className="text-xs opacity-70 m-0">
              A code, a batch of single-use vouchers or an automatic early bird can be created
              from Marketing Tools.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {promotions.map(promo => {
              const status = promoStatus(promo.terms);
              const endingSoon = promoEndingSoon(promo.terms);
              const conditions = promoConditions(promo.terms);

              return (
                <div
                  key={promo.key}
                  className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="min-w-0">
                    <span className="block font-bold text-accent-blue">{promo.name}</span>
                    <span className="block text-sm">{describePromo(promo.terms)}</span>
                    {/* How it is claimed and how far it reaches, in the one
                        line where both matter: a code scoped to every event
                        is a different thing to plan around than a batch of
                        vouchers meant for named invitees. */}
                    <span className="block text-xs text-secondary mt-1">
                      {[
                        promo.terms.automatic
                          ? 'Automatic · no code to give out'
                          : promo.codes > 1
                            ? `${promo.codes} single-use vouchers`
                            : 'Code',
                        promo.allEvents ? 'All your events' : 'This event only',
                        ...conditions,
                      ].join(' · ')}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`status-badge ${PROMO_STATUS_TONES[status]}`}>
                      {PROMO_STATUS_LABELS[status]}
                    </span>
                    {endingSoon && <span className="status-note pending">{endingSoon}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
