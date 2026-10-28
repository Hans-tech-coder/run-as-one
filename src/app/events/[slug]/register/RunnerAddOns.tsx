"use client";

import React, { useId, useState } from "react";
import { Check, Maximize2, Minus, Plus } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { formatPesos } from "@/lib/money";
import { SHIRT_SIZES } from "@/lib/shirt-size";
import {
  addOnChoices,
  addOnPickable,
  addOnSalesClosed,
  asOptionKind,
  type AddOnPick,
  type PublicAddOn,
} from "@/lib/add-ons";
import PosterLightbox from "./PosterLightbox";
import SelectField from "./SelectField";
import { runnerFieldId } from "./validation";

/**
 * **Add-ons (optional)** on one runner's card (ADD_ONS_PLAN.md Batch 2): one
 * card per item this runner's category is offered, each with its poster, name,
 * price and an Add button; once added, its option and quantity.
 *
 * Bought per runner (D3), so the picks live on the runner and the card owns
 * none of them. One price whatever the size (D7), so the size select never
 * moves the price, and nothing here is ever discounted (D5).
 *
 * A sold-out or closed item stays on the card, marked, with its Add button
 * disabled (D9): a runner who came for the shirt should learn it is gone here,
 * not wonder whether it was ever sold. A pick already made on one that has
 * since sold out can still be removed.
 *
 * A shirt-size item starts on the runner's race shirt size, the size they just
 * chose a few fields up, and can still be changed: a commemorative shirt is
 * often bought a size up, or for someone else.
 */
export default function RunnerAddOns({
  index,
  addOns,
  picks,
  raceShirtSize,
  error,
  notice,
  onChange,
}: {
  index: number;
  /** The items shown to this runner's category (`addOnsShownFor`). */
  addOns: PublicAddOn[];
  picks: AddOnPick[];
  /** The race shirt size, to start a shirt-size item on. */
  raceShirtSize: string;
  /** What the picks still want, already gated on whether to show it. */
  error?: string;
  /** Which picks a category change took off, until the next edit. */
  notice?: string;
  onChange: (picks: AddOnPick[]) => void;
}) {
  const [posterFor, setPosterFor] = useState<PublicAddOn | null>(null);
  if (addOns.length === 0) return null;

  const pickOf = (id: string) => picks.find((pick) => pick.addOnId === id);
  const update = (id: string, patch: Partial<AddOnPick>) =>
    onChange(picks.map((pick) => (pick.addOnId === id ? { ...pick, ...patch } : pick)));
  const add = (addOn: PublicAddOn) => {
    if (pickOf(addOn.id)) return;
    const startSize =
      asOptionKind(addOn.optionKind) === "SHIRT_SIZES" && SHIRT_SIZES.includes(raceShirtSize)
        ? raceShirtSize
        : "";
    onChange([...picks, { addOnId: addOn.id, option: startSize, quantity: 1 }]);
  };
  const remove = (id: string) => onChange(picks.filter((pick) => pick.addOnId !== id));

  const sectionId = runnerFieldId(index, "addOns");

  return (
    <div id={sectionId} tabIndex={-1} className="mt-6 focus:outline-none">
      <h4 className="mb-1 text-secondary">Add-ons (optional)</h4>
      <p className="m-0 mb-3 text-sm text-secondary/80">
        Packed with this runner&apos;s race kit.
      </p>

      {notice && (
        <p role="status" className="m-0 mb-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm text-amber-100">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {addOns.map((addOn) => {
          const pick = pickOf(addOn.id);
          const pickable = addOnPickable(addOn);
          const closed = addOnSalesClosed(addOn);
          const choices = addOnChoices(addOn);
          const sizes = asOptionKind(addOn.optionKind) === "SHIRT_SIZES";
          // A pick may not ask for more than is left, though another order can
          // still take the last ones first; the checkout counts under its lock.
          const most = Math.max(1, Math.min(addOn.maxPerRunner, addOn.left ?? Infinity));
          const poster = addOn.imageUrls[0];
          const status = addOn.soldOut ? "Sold out" : closed ? "Sales closed" : null;

          return (
            <div
              key={addOn.id}
              className={`rounded-[14px] border p-3 sm:p-4 transition-colors ${
                pick ? "border-accent-orange bg-accent-orange/[0.06]" : "border-white/10 bg-black/40"
              } ${!pickable && !pick ? "opacity-70" : ""}`}
            >
              {/* On a phone the Add button takes a row of its own under the
                  name: beside it, a 360px card left the name a column a few
                  letters wide, broken mid-word. From sm up it sits right. */}
              <div className="flex flex-wrap sm:flex-nowrap items-start gap-3">
                {poster && (
                  <button
                    type="button"
                    onClick={() => setPosterFor(addOn)}
                    aria-label={`View ${addOn.name}`}
                    className="w-16 h-16 sm:w-20 sm:h-20 relative shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/40 group/thumb"
                  >
                    <img src={poster} alt="" loading="lazy" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 w-6 h-6 rounded-lg bg-black/75 ring-1 ring-white/15 flex items-center justify-center text-white group-hover/thumb:bg-accent-orange transition-colors">
                      <Maximize2 size={12} aria-hidden="true" />
                    </span>
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-bold text-white uppercase sm:tracking-wide leading-tight break-words">
                    {addOn.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-bold tabular-nums ${pickable ? "text-accent-orange" : "text-white/50"}`}>
                      ₱{formatPesos(addOn.price)}
                    </span>
                    {status && (
                      <span className="text-xs font-bold text-white/70 bg-white/10 border border-white/10 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                        {status}
                      </span>
                    )}
                    {!status && addOn.left !== null && addOn.left <= 10 && (
                      <span className="text-xs font-bold text-accent-orange bg-accent-orange/15 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                        {addOn.left} left
                      </span>
                    )}
                  </div>
                  {addOn.description && (
                    <p className="m-0 mt-1 text-xs text-secondary line-clamp-2">{addOn.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  aria-pressed={Boolean(pick)}
                  aria-label={pick ? `Remove ${addOn.name}` : `Add ${addOn.name}`}
                  disabled={!pick && !pickable}
                  onClick={() => (pick ? remove(addOn.id) : add(addOn))}
                  className={`basis-full sm:basis-auto shrink-0 min-h-11 min-w-[5.5rem] px-3 rounded-xl text-sm font-bold uppercase tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors ${
                    pick
                      ? "bg-accent-orange/15 text-accent-orange border border-accent-orange hover:bg-accent-orange/25"
                      : pickable
                        ? "bg-accent-orange text-black hover:bg-accent-orange/90"
                        : "bg-white/5 text-white/50 border border-white/10 cursor-not-allowed"
                  }`}
                >
                  {pick ? (
                    <>
                      <Check size={16} aria-hidden="true" /> Added
                    </>
                  ) : (
                    <>
                      <Plus size={16} aria-hidden="true" /> Add
                    </>
                  )}
                </button>
              </div>

              {pick && (choices.length > 0 || most > 1) && (
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  {choices.length > 0 && (
                    <SelectField
                      label={sizes ? "Size" : "Option"}
                      value={pick.option}
                      placeholder={sizes ? "Select a size" : "Select an option"}
                      options={choices.map((choice) => ({ value: choice, label: choice }))}
                      listboxLabel={`${addOn.name} ${sizes ? "sizes" : "options"}`}
                      onChange={(option) => update(addOn.id, { option })}
                    />
                  )}
                  {most > 1 && (
                    <QuantityStepper
                      name={addOn.name}
                      value={pick.quantity}
                      max={most}
                      onChange={(quantity) => update(addOn.id, { quantity })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <FieldError id={`${sectionId}-error`} message={error} />

      {posterFor && (
        <PosterLightbox
          category={{ ...posterFor, imageUrl: posterFor.imageUrls[0] ?? null }}
          subtitle="Add-on"
          isSelected={Boolean(pickOf(posterFor.id))}
          isFull={!addOnPickable(posterFor)}
          labels={{
            choose: `Add ${posterFor.name}`,
            selected: "Added",
            full: posterFor.soldOut ? `${posterFor.name} Is Sold Out` : "Sales Closed",
          }}
          // Adds only: pressing "Added" in the poster leaves the pick alone,
          // as "Selected" does on an option's poster.
          onSelect={() => add(posterFor)}
          onClose={() => setPosterFor(null)}
        />
      )}
    </div>
  );
}

/** − n + for how many of one item, each button a 44px target. */
function QuantityStepper({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const labelId = useId();
  const step = "w-11 h-11 rounded-xl border border-white/15 text-white flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="input-group">
      <span className="block mb-2 text-sm text-secondary" id={labelId}>
        Quantity <span className="text-secondary/70">(up to {max})</span>
      </span>
      <div role="group" aria-labelledby={labelId} className="flex items-center gap-2">
        <button type="button" className={step} aria-label={`One fewer ${name}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="min-w-8 text-center font-bold text-white tabular-nums">
          {value}
        </span>
        <button type="button" className={step} aria-label={`One more ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
