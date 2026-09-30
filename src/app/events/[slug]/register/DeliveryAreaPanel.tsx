"use client";

import { Check, CheckCircle2, Truck } from "lucide-react";
import { formatPesos } from "@/lib/money";
import { DELIVERY_ZONES } from "@/lib/registration-codes";
import type { DeliveryTier, DeliveryZone } from "./delivery";

/**
 * The two delivery fees, above the address on step 2, for both wizards.
 *
 * When the event's province is known (delivery.ts, deliveryProvinceOf) this is
 * a note, not a choice (DeliveryFeeNote): both fees are listed, and the one
 * the runner's address falls in is marked once they pick a province below.
 * Only when no province can be read off the event does it fall back to
 * asking, as it always did.
 */
export default function DeliveryAreaPanel({
  tiers,
  zone,
  province,
  location,
  onChoose,
}: {
  tiers: DeliveryTier[];
  zone: DeliveryZone | null;
  /** The event's province, or null when it cannot be told. */
  province: string | null;
  location: string;
  onChoose: (zone: DeliveryZone) => void;
}) {
  if (province !== null) {
    return <DeliveryFeeNote tiers={tiers} zone={zone} province={province} />;
  }

  return (
    <div className="input-group full-width">
      <label>Delivery Area</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        {tiers.map((tier) => {
          const active = zone === tier.zone;
          return (
            <button
              key={tier.zone}
              type="button"
              aria-pressed={active}
              className={`border rounded-[16px] p-5 transition-all flex justify-between items-center gap-4 text-left cursor-pointer ${
                active
                  ? "border-accent-blue bg-accent-blue/10"
                  : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
              }`}
              onClick={() => onChoose(tier.zone)}
            >
              <div className="flex items-center gap-3 min-w-0">
                {active && (
                  <CheckCircle2 size={20} className="text-accent-blue shrink-0" />
                )}
                <span className="font-medium text-white">{tier.label}</span>
              </div>
              <span className="font-bold text-accent-blue whitespace-nowrap">
                +₱{formatPesos(tier.fee)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-secondary mt-3">
        Relative to {location}. Choose Outside Province if your address is in a
        different province.
      </p>
    </div>
  );
}

/**
 * The fees as information, not as a choice: one quiet panel with a price list,
 * nothing that looks pressable. The row the runner's address falls in says so
 * in words ("Your fee") as well as by colour, and the line under the list is a
 * polite live region, so a screen reader hears the fee change when the
 * province below is picked.
 */
function DeliveryFeeNote({
  tiers,
  zone,
  province,
}: {
  tiers: DeliveryTier[];
  zone: DeliveryZone | null;
  province: string;
}) {
  const applied = tiers.find((t) => t.zone === zone);

  return (
    <section
      aria-labelledby="delivery-fee-note-title"
      className="full-width rounded-[16px] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
      style={{ gridColumn: "1 / -1" }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full bg-accent-blue/10 text-accent-blue flex items-center justify-center"
        >
          <Truck size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p id="delivery-fee-note-title" className="text-sm font-semibold text-white m-0">
            Delivery fee depends on your province
          </p>
          <p className="text-xs text-secondary mt-1 mb-0">
            This event is in {province}.
          </p>

          <dl className="mt-3 mb-0 divide-y divide-white/5">
            {tiers.map((tier) => {
              const active = tier.zone === zone;
              const dimmed = zone !== null && !active;
              return (
                <div
                  key={tier.zone}
                  className={`flex items-center justify-between gap-3 py-2 transition-opacity duration-200 ${
                    dimmed ? "opacity-50" : ""
                  }`}
                >
                  {/* Wraps rather than truncates: on a phone the tag drops
                      under the place name instead of cutting it to "Outside…". */}
                  <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-sm text-white">
                    <span>
                      {tier.zone === DELIVERY_ZONES.INSIDE ? "Inside" : "Outside"}{" "}
                      {province}
                    </span>
                    {active && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-blue/15 px-2 py-0.5 text-[11px] font-semibold text-accent-blue">
                        <Check size={12} strokeWidth={3} aria-hidden="true" />
                        Your fee
                      </span>
                    )}
                  </dt>
                  <dd className="m-0 text-sm font-semibold tabular-nums text-white whitespace-nowrap">
                    ₱{formatPesos(tier.fee)}
                  </dd>
                </div>
              );
            })}
          </dl>

          <p aria-live="polite" className="text-xs text-secondary mt-2 mb-0">
            {applied
              ? `₱${formatPesos(applied.fee)} applies, from the province in your address below.`
              : "Pick your province below and the matching fee is applied automatically."}
          </p>
        </div>
      </div>
    </section>
  );
}
