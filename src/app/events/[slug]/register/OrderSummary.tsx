"use client";

import React from "react";
import { formatPesos } from "@/lib/money";
import { chargedRunnerPrice, type AppliedDiscount } from "@/lib/discount";
import { discountParts } from "@/lib/promo-winner";

/**
 * The order summary both registration wizards show beside the form.
 *
 * One component so the PayMongo and bank-transfer wizards cannot disagree
 * about how a price reads. Each runner is one row — who, which distance, what
 * they pay — with the list price struck underneath only when it differs, so
 * the column of bold numbers on the right is the column that adds up.
 */
export default function OrderSummary({
  categories,
  participants,
  discount,
  sizeUpcharge,
  deliveryFee,
  platformFee,
  waivedPlatformFee,
  transactionFee,
  totalAmount,
  children,
}: {
  categories: { id: string; name: string; price: number }[];
  participants: { id: number | string; categoryId: string }[];
  discount: AppliedDiscount | null | undefined;
  sizeUpcharge: number;
  /** Null when the order is not being delivered. */
  deliveryFee: { amount: number; label: string } | null;
  platformFee: number;
  /** The fee a pacer code waived, or null when nothing was waived. */
  waivedPlatformFee: number | null;
  /** Null when no transaction fee applies (yet). */
  transactionFee: number | null;
  totalAmount: number;
  /** A note under the total, such as how the order is paid. */
  children?: React.ReactNode;
}) {
  const parts = discountParts(discount);
  const freeRunners = new Set(parts.flatMap((part) => part.freeRunners));

  return (
    <div className="order-summary mt-6 bg-black/40 rounded-[16px] p-4 sm:p-6 border border-white/5">
      <h4 className="mb-4 text-white font-bold tracking-wide uppercase text-sm">
        Order Summary
      </h4>

      <div className="flex flex-col gap-3">
        {participants.map((p, idx) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          // A sale is a price, not a deduction (AppliedDiscount.pricedIn in
          // lib/discount.ts): the runner's line already says what they pay.
          const charged = cat ? chargedRunnerPrice(discount, idx, cat.price) : 0;
          return (
            <div key={p.id} className="flex justify-between items-start gap-3 text-sm">
              <div className="min-w-0">
                <div className="text-white flex items-center gap-2">
                  Runner {idx + 1}
                  {/* Which person the group deal made free, on their own row,
                      so the deduction below lands on someone visible. */}
                  {freeRunners.has(idx) && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-0.5">
                      Free
                    </span>
                  )}
                </div>
                <div className="text-xs text-secondary truncate">
                  {cat ? cat.name : "No category yet"}
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-semibold text-white">
                  {cat ? `₱${formatPesos(charged)}` : <span className="text-secondary">—</span>}
                </div>
                {cat && charged < cat.price && (
                  <div className="text-xs text-secondary line-through">
                    ₱{formatPesos(cat.price)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {parts.length > 0 && (
        <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/5">
          {parts.map((part) => (
            <div key={part.code} className="flex justify-between items-start gap-3 text-sm">
              <div className="min-w-0">
                <div className="text-white font-medium break-words">{part.code}</div>
                <div className="text-xs text-secondary">
                  {part.label}
                  <AppliedToNote part={part} categories={categories} participants={participants} />
                </div>
              </div>
              {/* A priced-in promotion is named but not subtracted again: the
                  runner rows above already carry it, and a second −₱ would
                  read as a discount they are getting twice. */}
              <span className="font-semibold text-emerald-400 whitespace-nowrap">
                {promotionAmount(part, categories, participants)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/5 text-sm">
        {sizeUpcharge > 0 && (
          <FeeLine label="Large size surcharge (4XL+)" amount={sizeUpcharge} />
        )}
        {deliveryFee && (
          <FeeLine
            label={`Delivery Fee${deliveryFee.label ? ` (${deliveryFee.label})` : ""}`}
            amount={deliveryFee.amount}
          />
        )}
        <div className="flex justify-between items-center gap-3">
          <span className="text-secondary">Platform Fee</span>
          {/* A waived fee is shown struck through rather than simply absent:
              the pacer was told the fee was covered, so the line that says so
              has to be visible. */}
          {waivedPlatformFee !== null ? (
            <span className="whitespace-nowrap">
              <span className="text-secondary/60 line-through text-xs mr-1.5">
                ₱{formatPesos(waivedPlatformFee)}
              </span>
              <span className="font-semibold text-emerald-400">₱0.00</span>
            </span>
          ) : (
            <span className="text-white">₱{formatPesos(platformFee)}</span>
          )}
        </div>
        {transactionFee !== null && (
          <FeeLine label="Transaction Fee" amount={transactionFee} />
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex justify-between items-center">
          <strong className="text-white uppercase tracking-wider text-sm">
            Total
          </strong>
          <strong className="text-accent-orange text-2xl font-bold">
            ₱{formatPesos(totalAmount)}
          </strong>
        </div>
        {discount && discount.amount > 0 && (
          <div className="text-right text-xs text-emerald-400 mt-0.5">
            You save ₱{formatPesos(discount.amount)}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function FeeLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-secondary">{label}</span>
      <span className="text-white whitespace-nowrap">₱{formatPesos(amount)}</span>
    </div>
  );
}

/**
 * The right-hand figure of a promotion line: the deduction it makes, or
 * "Included" when the runner rows already carry all of it.
 */
function promotionAmount(
  part: AppliedDiscount,
  categories: { id: string; price: number }[],
  participants: { categoryId: string }[],
): string {
  if (!part.pricedIn) return "−₱" + formatPesos(part.amount);
  const inPrices = participants.reduce((sum, p, idx) => {
    const cat = categories.find((c) => c.id === p.categoryId);
    const sale = part.salePriceByRunner[idx];
    return cat && sale !== null ? sum + (cat.price - sale) : sum;
  }, 0);
  return part.amount > inPrices ? "−₱" + formatPesos(part.amount - inPrices) : "Included";
}

/**
 * Who a per-runner percentage or fixed promotion landed on, when that is not
 * simply everyone on the order.
 */
function AppliedToNote({
  part,
  categories,
  participants,
}: {
  part: AppliedDiscount;
  categories: { id: string; name: string }[];
  participants: { categoryId: string }[];
}) {
  if (part.type !== "PERCENTAGE" && part.type !== "FIXED") return null;
  const discounted = part.salePriceByRunner
    .map((price, i) => (price !== null ? i : -1))
    .filter((i) => i !== -1);
  if (discounted.length === 0) return null;
  if (part.usageLimit === 1) {
    const idx = discounted[0];
    const cat = categories.find((c) => c.id === participants[idx]?.categoryId);
    return <> · Runner {idx + 1}{cat ? ` (${cat.name})` : ""}</>;
  }
  if (discounted.length < participants.length) {
    return (
      <span className="block mt-0.5">
        Applied to {discounted.length} of your {participants.length} runners —
        only {discounted.length} discounted places were left.
      </span>
    );
  }
  return null;
}
