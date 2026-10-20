"use client";

import { Home, Pencil } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { deliveryTiers, needsDeliveryZoneChoice } from "./delivery";
import { addressPartFieldId } from "./delivery-address";
import DeliveryAddressFields from "./DeliveryAddressFields";
import DeliveryAreaPanel from "./DeliveryAreaPanel";
import type { AddressedRunner } from "./RunnerAddressFields";
import type { DeliveryPlan } from "./useDeliveryPlan";

/**
 * Step 2 once delivery is chosen, for both wizards (useDeliveryPlan.ts holds
 * the state). Never asks for the address again: it shows Runner 1's home
 * address with Change. A group's kits all ship to that one address, as one
 * parcel: there is no per-runner shipping any more (the owner, 2026-10-20).
 */

type StepEvent = Parameters<typeof deliveryTiers>[0] & { location: string };

export default function DeliveryStep({
  plan,
  event,
  runners,
  showErrors,
  defaultCountry,
}: {
  plan: DeliveryPlan;
  event: StepEvent;
  runners: readonly AddressedRunner[];
  showErrors: boolean;
  defaultCountry: string;
}) {
  const v = plan.view;
  const homeLabel = runners.length === 1 ? "Your home address" : "Runner 1's home address";

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Only when the two fees differ: with one tier, or two at the
          same fee, there is nothing to tell apart. */}
      {needsDeliveryZoneChoice(event) && (
        <DeliveryAreaPanel
          tiers={deliveryTiers(event)}
          zone={v.zone}
          province={v.province}
          location={event.location}
          onChoose={v.setChosenZone}
        />
      )}

      <DeliveryAddressFields
        value={v.parts}
        onChange={v.setParts}
        showErrors={showErrors && (v.autoZone || v.zone !== null)}
        defaultCountry={defaultCountry}
        zoneNote={v.zoneNote}
        headerAction={
          v.ownAddress && v.homeText ? (
            <button
              type="button"
              onClick={v.useHomeAddress}
              className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold text-accent-orange hover:text-white transition-colors"
            >
              <Home size={14} aria-hidden="true" />
              Use {runners.length === 1 ? "my" : "Runner 1's"} home address
            </button>
          ) : undefined
        }
        place={
          v.ownAddress ? undefined : (
            <HomeAddressCard
              label={homeLabel}
              address={v.homeText}
              hint={v.zoneNote?.error ? undefined : v.zoneNote?.text}
              error={v.zoneNote?.error}
              onChange={v.typeOwnAddress}
            />
          )
        }
      />
    </div>
  );
}

/** Runner 1's address as the delivery address, with the way to change it. */
function HomeAddressCard({
  label,
  address,
  hint,
  error,
  onChange,
}: {
  label: string;
  address: string;
  hint?: string;
  error?: string;
  onChange: () => void;
}) {
  // The id the step's "not available" focus and the field errors expect.
  const id = addressPartFieldId("province");
  return (
    <div className="input-group full-width">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <Home size={16} className="shrink-0 text-accent-orange" aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="m-0 text-xs text-secondary">Deliver to {label}</p>
          <p className="m-0 text-sm leading-relaxed text-white break-words">{address}</p>
        </div>
        <button
          id={id}
          type="button"
          onClick={onChange}
          aria-describedby={error ? `${id}-error` : undefined}
          className="shrink-0 inline-flex items-center gap-2 rounded-[8px] border border-white/15 bg-white/5 px-4 min-h-[44px] font-bold text-sm text-white transition-colors hover:bg-white/10"
        >
          <Pencil size={14} aria-hidden="true" />
          Change
        </button>
      </div>
      {error ? (
        <FieldError id={`${id}-error`} message={error} />
      ) : (
        hint && <p className="text-xs text-secondary mt-2 mb-0">{hint}</p>
      )}
    </div>
  );
}
