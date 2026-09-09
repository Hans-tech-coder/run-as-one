"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";

/**
 * Why step 1 stops accepting runners once a group promotion is fully claimed.
 *
 * A promotion that reads "register 5, get 1 free" covers six runners on one
 * registration and no more — see `promoGroupSize` in `lib/discount.ts`. A
 * group of seven is therefore six on this order and one on another, and the
 * moment that stops being obvious is the moment the *Add Another Runner*
 * button goes quiet: a disabled control with no reason beside it reads as a
 * broken form, and the runner's next move is to reload the page.
 *
 * So the button is disabled *and* this says what happened, names the
 * promotion that did it, gives the number, and says what to do about the
 * seventh runner — the same standard the field errors in this wizard are held
 * to. It is the closing half of `FreeSlotOffer`: that one gets the group to
 * six, this one tells them six is the whole of it.
 */
export default function GroupLimitNotice({
  id,
  runners,
  limit,
  free,
  label,
}: {
  /** So the disabled button can point at this with `aria-describedby`. */
  id: string;
  /**
   * Runners on the order right now.
   *
   * Normally the same as `limit` — that is the only way to reach the ceiling
   * from step 1 — but a group can also fill in eight cards and only then type
   * a group code in step 3, and coming back to a card list of eight under the
   * words "that's the whole group" would read as a miscount.
   */
  runners: number;
  /** Runners this promotion covers on one registration: buy + get. */
  limit: number;
  /** How many of them are free. */
  free: number;
  /** The promotion in its own words: "Register 5, get 1 free". */
  label: string;
}) {
  return (
    <div
      id={id}
      role="status"
      className="mt-4 flex items-start gap-3 rounded-[16px] border border-emerald-400/30 bg-emerald-400/[0.07] p-5"
    >
      <CheckCircle2
        size={22}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-emerald-400"
      />
      <div>
        <p className="m-0 font-bold text-white">
          {runners > limit
            ? `This promotion covers ${limit} runners`
            : `That's the whole group — ${limit} runners`}
        </p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
          <span className="font-semibold text-white">{label}</span> covers{" "}
          {limit} runners on one registration, and{" "}
          {free === 1 ? "one of them is" : `${free} of them are`} free. Anyone
          else in your group registers separately — finish this order first,
          then start another one for them.
        </p>
      </div>
    </div>
  );
}
