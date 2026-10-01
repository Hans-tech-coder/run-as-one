"use client";

import { CheckCircle2, Home, Package, Pencil } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { formatPesos } from "@/lib/money";
import { formatRunnerAddress } from "@/lib/runner-address";
import { deliveryTiers, needsDeliveryZoneChoice } from "./delivery";
import { addressPartFieldId } from "./delivery-address";
import { notDeliveredNote, runnersLabel, shipmentZoneLabel } from "./delivery-split";
import DeliveryAddressFields from "./DeliveryAddressFields";
import DeliveryAreaPanel from "./DeliveryAreaPanel";
import type { AddressedRunner } from "./RunnerAddressFields";
import type { DeliveryPlan } from "./useDeliveryPlan";

/**
 * Step 2 once delivery is chosen, for both wizards (useDeliveryPlan.ts holds
 * the state). Never asks for the address again: it shows Runner 1's home
 * address with Change, and — only when the runners live at different
 * addresses — offers to ship each kit to its runner's own (delivery-split.ts).
 */

type StepEvent = Parameters<typeof deliveryTiers>[0] & { location: string };

function runnerName(runner: AddressedRunner): string {
  return `${runner.firstName} ${runner.lastName}`.trim();
}

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
      {v.splitOffered && (
        <ShipChoice
          split={v.split}
          onChange={v.setSplit}
          oneFee={v.oneFee}
          splitFee={v.splitFee}
          shipmentCount={v.shipments.length}
        />
      )}

      {v.split ? (
        <ShipmentList event={event} plan={plan} runners={runners} />
      ) : (
        <>
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
        </>
      )}
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

/** One parcel or one per household. Styled like the Delivery Area choice. */
function ShipChoice({
  split,
  onChange,
  oneFee,
  splitFee,
  shipmentCount,
}: {
  split: boolean;
  onChange: (split: boolean) => void;
  /** Null when that option cannot ship as it stands. */
  oneFee: number | null;
  splitFee: number | null;
  shipmentCount: number;
}) {
  const options = [
    {
      value: false,
      title: "Ship all kits to one address",
      detail: "One parcel, one delivery fee",
      fee: oneFee,
    },
    {
      value: true,
      title: "Ship each kit to the runner's own address",
      detail: `${shipmentCount} parcels, one fee per address`,
      fee: splitFee,
    },
  ];

  return (
    <div className="input-group full-width">
      <label id="ship-choice-label">Where the kits go</label>
      <p className="text-xs text-secondary mb-2">
        Your runners live at different addresses.
      </p>
      <div
        role="group"
        aria-labelledby="ship-choice-label"
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2"
      >
        {options.map((option) => {
          const active = split === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`border rounded-[16px] p-5 transition-all flex justify-between items-start gap-4 text-left cursor-pointer ${
                active
                  ? "border-accent-blue bg-accent-blue/10"
                  : "border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5"
              }`}
            >
              <span className="flex items-start gap-3 min-w-0">
                {active && (
                  <CheckCircle2 size={20} className="text-accent-blue shrink-0 mt-0.5" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium text-white">{option.title}</span>
                  <span className="block text-xs text-secondary mt-1">{option.detail}</span>
                </span>
              </span>
              {option.fee !== null && (
                <span className="font-bold text-accent-blue whitespace-nowrap">
                  +₱{formatPesos(option.fee)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Who ships where, and what each parcel costs. Addresses are edited on Step 1. */
function ShipmentList({
  event,
  plan,
  runners,
}: {
  event: StepEvent;
  plan: DeliveryPlan;
  runners: readonly AddressedRunner[];
}) {
  const { shipments } = plan.view;

  return (
    <section
      aria-labelledby="shipments-title"
      className="full-width rounded-[16px] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
    >
      <p id="shipments-title" className="text-sm font-semibold text-white m-0">
        {shipments.length} shipments
      </p>
      <p className="text-xs text-secondary mt-1 mb-0">
        Each parcel goes to the first runner named, at their own mobile number.
        To change an address, go back to the runner details.
      </p>

      <ol className="mt-3 mb-0 p-0 list-none divide-y divide-white/5">
        {shipments.map((shipment, i) => {
          const zoneLabel = shipmentZoneLabel(event, shipment.zone);
          const names = shipment.runners
            .map((r) => runnerName(runners[r]))
            .filter(Boolean)
            .join(", ");
          return (
            <li key={i} className="py-3 flex items-start gap-3">
              <span
                aria-hidden="true"
                className="shrink-0 w-9 h-9 rounded-full bg-accent-blue/10 text-accent-blue flex items-center justify-center"
              >
                <Package size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="m-0 min-w-0 text-sm font-semibold text-white">
                    {runnersLabel(shipment.runners)}
                    {names && (
                      <span className="font-normal text-secondary"> · {names}</span>
                    )}
                  </p>
                  {shipment.offered && (
                    <p className="m-0 shrink-0 text-sm font-semibold tabular-nums text-white whitespace-nowrap">
                      ₱{formatPesos(shipment.fee)}
                    </p>
                  )}
                </div>
                <p className="m-0 mt-1 text-sm text-white/80 break-words">
                  {formatRunnerAddress(shipment.address)}
                </p>
                {shipment.offered ? (
                  zoneLabel && <p className="m-0 mt-1 text-xs text-secondary">{zoneLabel}</p>
                ) : (
                  <p className="m-0 mt-1 text-xs text-red-400">
                    {notDeliveredNote(event, shipment.zone)}.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-between items-center mt-2 pt-3 border-t border-white/10 text-sm">
        <span className="text-secondary">Delivery fee, all shipments</span>
        <span className="font-bold tabular-nums text-white">₱{formatPesos(plan.fee)}</span>
      </div>
    </section>
  );
}
