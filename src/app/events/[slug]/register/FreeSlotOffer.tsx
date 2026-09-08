"use client";

import React from "react";
import { Gift, Plus } from "lucide-react";

/**
 * The nudge that turns "register 5, get 1 free" into something a group can
 * actually claim.
 *
 * The promotion pays nothing at five runners: the sixth is the free one, and
 * a group of five has met the condition in every sense they can see. Without
 * this, the discount simply is not there, and a promotion that does nothing is
 * indistinguishable from a broken one.
 *
 * It offers rather than adds. A sixth runner card appearing on its own would
 * be a required form nobody asked for, and a group that really is five would
 * have to work out that they must delete it before they can move on — so the
 * card only exists once somebody has said yes to it.
 */
export default function FreeSlotOffer({
  needed,
  free,
  onAdd,
}: {
  /** How many more runners are wanted to complete the group. */
  needed: number;
  /** How many of them will be free. */
  free: number;
  onAdd: () => void;
}) {
  const runnerWord = (n: number) => (n === 1 ? "runner" : "runners");

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-[16px] border border-emerald-400/30 bg-emerald-400/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Gift
          size={22}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-emerald-400"
        />
        <div>
          <p className="m-0 font-bold text-white">
            {needed === free
              ? `Your next ${runnerWord(needed)} ${needed === 1 ? "is" : "are"} free`
              : `Add ${needed} more ${runnerWord(needed)} and ${free} ${free === 1 ? "is" : "are"} free`}
          </p>
          <p className="m-0 mt-1 text-sm leading-relaxed text-secondary">
            This event&apos;s group promotion is already on your order — nothing to
            type. The cheapest {free === 1 ? "entry" : `${free} entries`} will be
            taken off your total.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-emerald-400/40 bg-emerald-400/10 px-5 py-3 font-bold text-emerald-300 transition-colors hover:bg-emerald-400/20"
      >
        <Plus size={18} aria-hidden="true" />
        Add {needed === 1 ? "runner" : `${needed} runners`}
      </button>
    </div>
  );
}
