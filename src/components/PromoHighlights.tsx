import React from 'react';
import { Gift } from 'lucide-react';
import {
  DISCOUNT_TYPES,
  PromoTerms,
  asDiscountType,
  categoryPricesOf,
  describePromo,
  promoConditions,
  promoStatus,
} from '@/lib/discount';
import { formatPesos } from '@/lib/money';

/**
 * The promotions running on an event, on the event page, before the runner has
 * started anything.
 *
 * A discount that only appears at the end of a wizard is a nice surprise and a
 * wasted one: the point of an early bird is that it brings a decision forward,
 * which it cannot do if nobody registering is told it exists. So the same
 * promotions the wizard will price are named here, in the same words — both
 * sides read `describePromo` and `promoConditions`, so what this page promises
 * and what the order summary applies cannot be phrased differently.
 *
 * Only automatic promotions appear. A code is the organizer's to publish where
 * and to whom they choose, and printing every code on a public page would hand
 * the whole list to everyone — including the single-use vouchers meant for
 * named invitees.
 */
export default function PromoHighlights({
  promos,
  categories,
}: {
  promos: PromoTerms[];
  /**
   * The race's own options, so a repricing promotion can name what it reprices
   * and at what. The list in the sidebar already strikes those prices through;
   * this block is where a runner reading top to bottom meets them first, and
   * "special price on 2 categories" without saying which two would send them
   * hunting for the difference.
   */
  categories: { id: string; name: string; price: number }[];
}) {
  // Expired, not yet started, fully claimed, or switched off by the
  // organizer. Filtered through `promoStatus` rather than re-expressed here,
  // because half of that rule copied into a `where` clause is how a badge
  // starts advertising a discount the checkout will refuse.
  const live = promos.filter(promo => promoStatus(promo) === 'ACTIVE');
  if (live.length === 0) return null;

  return (
    <div className="info-block glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-400/20 t-stagger-line t-stagger-line--3">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
        <Gift size={22} aria-hidden="true" className="text-emerald-400" />
        Offers On This Race
      </h2>

      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {live.map(promo => {
          const conditions = promoConditions(promo);
          const repriced = repricedBy(promo, categories);
          return (
            <li key={promo.code} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <strong className="font-bold text-emerald-300">
                  {describePromo(promo)}
                </strong>
                <span className="text-sm text-secondary">{promo.code}</span>
              </span>
              {/* The prices themselves, once per option. The arrow rather than
                  a strikethrough here: this is a sentence about a change, and
                  the struck-through pair belongs beside the option a runner is
                  choosing, which is where the list below puts it. */}
              {repriced.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {repriced.map(entry => (
                    <li key={entry.id} className="text-sm text-secondary">
                      <span className="font-semibold text-white">{entry.name}</span>
                      {' — '}
                      <s>&#8369;{formatPesos(entry.listPrice)}</s>
                      {' '}
                      <span className="font-bold text-emerald-300">
                        &#8369;{formatPesos(entry.salePrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {conditions.length > 0 && (
                <span className="text-sm text-secondary">
                  {conditions.join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* The whole point of an automatic promotion, said plainly. A runner who
          thinks they are missing a code they were never given is a runner who
          hesitates at the one moment this page exists to make easy. */}
      <p className="m-0 mt-5 text-sm leading-relaxed text-secondary">
        Nothing to type — {live.length === 1 ? 'this is' : 'these are'} applied
        automatically at checkout if your registration qualifies.
      </p>
    </div>
  );
}

/**
 * The options this promotion reprices, named and priced — empty for every kind
 * but CATEGORY_PRICE.
 *
 * A price at or above the category's own is dropped rather than shown, exactly
 * as `categorySalePrices` drops it, since drawing a line through ₱1,200 to
 * show ₱1,200 is worse than showing nothing. The two are separate functions
 * because they answer different questions — this one is "what does this
 * promotion say", that one is "what does this option cost" — but they must not
 * disagree about which prices count.
 */
function repricedBy(
  promo: PromoTerms,
  categories: { id: string; name: string; price: number }[],
): { id: string; name: string; listPrice: number; salePrice: number }[] {
  if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.CATEGORY_PRICE) return [];

  const prices = new Map(categoryPricesOf(promo).map(entry => [entry.categoryId, entry.price]));

  return categories.flatMap(category => {
    const salePrice = prices.get(category.id);
    if (salePrice === undefined || salePrice >= category.price) return [];
    return [{ id: category.id, name: category.name, listPrice: category.price, salePrice }];
  });
}
