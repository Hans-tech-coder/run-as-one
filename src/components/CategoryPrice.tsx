import React from 'react';
import { CategorySalePrice } from '@/lib/discount';
import { formatPesos } from '@/lib/money';

/**
 * What one category costs, with the old price struck through when a promotion
 * has repriced it.
 *
 * Three surfaces show a price per option — the event page's category list, the
 * "What's Included" headings above it, and the picker a runner chooses from in
 * the wizard — and all three have to slash it the same way. They used to print
 * `₱{formatPesos(cat.price)}` inline, three times, which was fine while there
 * was one price to print; the moment there are two the pair has an order, a
 * spacing and a screen-reader reading that cannot be allowed to differ between
 * the page that advertises the race and the form that sells it.
 *
 * No hooks and no `use client`, so the server-rendered event page and the
 * client-side picker can both use it.
 *
 * **The struck price is the category's own, read live** — never a number
 * stored on the promotion — so an organizer who raises the 10K cannot leave a
 * page crossing out a figure it no longer charges. See PromoCategoryPrice in
 * schema.prisma.
 */
export default function CategoryPrice({
  price,
  sale,
  className = '',
  dimmed = false,
}: {
  /** `Category.price`, in centavos. */
  price: number;
  /** What a promotion has put it on, or undefined when nothing has. */
  sale?: CategorySalePrice;
  /** The caller's own size and colour for the price being charged. */
  className?: string;
  /** True on a sold-out option, which mutes the whole pair. */
  dimmed?: boolean;
}) {
  // Defensive rather than decorative: a promotion whose price has been
  // overtaken by a change to the category's own would otherwise draw a line
  // through the smaller of the two numbers.
  const onSale = sale !== undefined && sale.salePrice < price;

  if (!onSale) {
    return <span className={className}>&#8369;{formatPesos(price)}</span>;
  }

  // Only when the promotion actually set a cap, and only once it is close
  // enough to matter. "48 left" on a promotion nobody is near the end of is a
  // number that means nothing; the last few are the whole reason an early bird
  // exists, and are what a runner deciding today needs to know.
  const scarce =
    sale.remaining !== null && sale.remaining > 0 && sale.remaining <= LAST_CALL;

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-baseline gap-2">
        {/* Announced as a sentence rather than left to the strikethrough, which
            screen readers are not obliged to convey — "1,200 900" read out flat
            is a worse price than either of them. The visual pair is hidden from
            the reading and replaced by one that says which is which. */}
        <span className="sr-only">
          {`Was ₱${formatPesos(price)}, now ₱${formatPesos(sale.salePrice)}`}
          {scarce ? `, ${sale.remaining} left at this price` : ''}
        </span>
        <s
          aria-hidden="true"
          className={`text-sm font-semibold tabular-nums ${
            dimmed ? 'text-white/25' : 'text-secondary'
          }`}
        >
          &#8369;{formatPesos(price)}
        </s>
        <span aria-hidden="true" className={className}>
          &#8369;{formatPesos(sale.salePrice)}
        </span>
      </span>

      {/* The same chip shape the category rows already use for their own last
          slots, so a race running low and a price running out read as two
          facts of one kind rather than as two different widgets. */}
      {scarce && (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300"
        >
          {sale.remaining} left at this price
        </span>
      )}
    </span>
  );
}

/**
 * How few seats have to be left before the price says so.
 *
 * Deliberately the same number as `LAST_CALL_SLOTS` in `registration-gate.ts`,
 * which counts down a category's own slots, and chosen for the same reason it
 * gives: below this a group of four needs to know that three remain before
 * they fill in four forms, and above it a running count on a 500-seat
 * promotion is noise that makes every option look about to close. A race
 * running low and a price running out should reach that point together.
 *
 * Copied rather than imported: that module pulls in Prisma, and this component
 * renders inside the wizard's picker, which is a client component. The same
 * trade `discount.ts` makes to stay out of the browser bundle.
 */
const LAST_CALL = 20;
