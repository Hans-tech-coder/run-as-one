"use client";

import type { ReactNode } from "react";
import FieldError from "@/components/ui/FieldError";
import { upperCaseAsTyped } from "@/lib/text-case";
import { Check } from "lucide-react";
import AddressPlaceFields from "./AddressPlaceFields";
import PhoneField from "./PhoneField";
import {
  ADDRESS_PART_LABELS,
  addressPartFieldId,
  addressProblems,
  type DeliveryAddressPart,
  type DeliveryAddressParts,
} from "./delivery-address";

/**
 * The delivery address, one field per part, for both registration wizards.
 * Province, city and barangay are the shared PSGC pickers
 * (AddressPlaceFields.tsx), so the courier gets a place that exists. The
 * rules — which parts are required, how they join into the stored string —
 * live in delivery-address.ts; this is only the form.
 *
 * With `place`, the province, city, barangay and street are not asked here:
 * the wizard shows that node instead (Runner 1's home address, with Change),
 * and only the ZIP, landmark and receiver remain — RUNNER_ADDRESS_PLAN.md.
 */

export interface DeliveryZoneNote {
  /** Shown under the province once one is picked: which tier applies. */
  text?: string;
  /** Replaces it when the event does not deliver to that tier. */
  error?: string;
}

export default function DeliveryAddressFields({
  value,
  onChange,
  showErrors,
  defaultCountry,
  zoneNote,
  place,
  headerAction,
}: {
  value: DeliveryAddressParts;
  onChange: (next: DeliveryAddressParts) => void;
  showErrors: boolean;
  /** For the receiver's number, like the runners' own. */
  defaultCountry: string;
  zoneNote?: DeliveryZoneNote;
  /** Shown in place of the place pickers and street, when those are settled elsewhere. */
  place?: ReactNode;
  /** Beside the heading, e.g. a way back to the home address. */
  headerAction?: ReactNode;
}) {
  const problems = showErrors ? addressProblems(value) : {};
  const set = (patch: Partial<DeliveryAddressParts>) =>
    onChange({ ...value, ...patch });

  const text = (part: DeliveryAddressPart, raw: string) =>
    set({ [part]: part === "zip" ? raw.replace(/\D/g, "") : upperCaseAsTyped(raw) });

  const aria = (part: DeliveryAddressPart) => {
    const id = addressPartFieldId(part);
    const invalid = Boolean(problems[part]);
    return {
      id,
      "aria-invalid": invalid ? true : undefined,
      "aria-describedby": invalid ? `${id}-error` : undefined,
    } as const;
  };

  return (
    <div className="input-group full-width">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <label>Delivery Address</label>
        {headerAction}
      </div>
      <p className="text-xs text-secondary mb-2">
        {place
          ? "Add a ZIP code or landmark if it helps the courier find the door."
          : "Pick your province first, then your city and barangay, so the courier can find your door on the first try."}
      </p>

      <div className="form-grid">
        {place ?? (
          <AddressPlaceFields
            value={value}
            onChange={set}
            idFor={addressPartFieldId}
            errors={{
              province: problems.province ?? zoneNote?.error,
              city: problems.city,
              barangay: problems.barangay,
            }}
            provinceHint={!zoneNote?.error ? zoneNote?.text : undefined}
          />
        )}
        <div className="input-group">
          <label htmlFor={addressPartFieldId("zip")}>
            {ADDRESS_PART_LABELS.zip} (Optional)
          </label>
          <input
            {...aria("zip")}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            value={value.zip}
            onChange={(e) => text("zip", e.target.value)}
            placeholder="2300"
            maxLength={4}
          />
          <FieldError id={`${addressPartFieldId("zip")}-error`} message={problems.zip} />
        </div>

        {!place && (
          <div className="input-group full-width">
            <label htmlFor={addressPartFieldId("street")}>
              {ADDRESS_PART_LABELS.street}
            </label>
            <input
              {...aria("street")}
              type="text"
              value={value.street}
              onChange={(e) => text("street", e.target.value)}
              placeholder="BLK 5 LOT 12, RIZAL ST., GREENVILLE SUBD."
              maxLength={150}
            />
            <FieldError
              id={`${addressPartFieldId("street")}-error`}
              message={problems.street}
            />
          </div>
        )}

        <div className="input-group full-width">
          <label htmlFor={addressPartFieldId("landmark")}>
            {ADDRESS_PART_LABELS.landmark} (Optional)
          </label>
          <textarea
            id={addressPartFieldId("landmark")}
            value={value.landmark}
            onChange={(e) => text("landmark", e.target.value)}
            placeholder="BLUE GATE ACROSS 7-ELEVEN; CALL UPON ARRIVAL"
            maxLength={200}
            rows={2}
          />
        </div>

        <div className="full-width" style={{ gridColumn: "1 / -1" }}>
          <label className="group flex items-center gap-3 cursor-pointer w-fit">
            {/* A real checkbox, visually hidden — the custom box carries the
                look, as on the consent step. */}
            <input
              type="checkbox"
              className="sr-only peer"
              checked={value.otherReceiver}
              onChange={(e) => set({ otherReceiver: e.target.checked })}
            />
            <span
              aria-hidden="true"
              className={`shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
                value.otherReceiver
                  ? "border-accent-orange bg-accent-orange"
                  : "border-white/30 group-hover:border-white/50"
              }`}
            >
              {value.otherReceiver && (
                <Check size={14} strokeWidth={3} className="text-black" />
              )}
            </span>
            <span className="text-sm text-white leading-relaxed">
              Someone else will receive the kit
            </span>
          </label>
          <p className="text-xs text-secondary mt-2 mb-0">
            {value.otherReceiver
              ? "The courier will ask for this person at the door."
              : "Otherwise the courier will look for Runner 1 at this address."}
          </p>
        </div>

        {value.otherReceiver && (
          <>
            <div className="input-group">
              <label htmlFor={addressPartFieldId("receiverName")}>
                {ADDRESS_PART_LABELS.receiverName}
              </label>
              <input
                {...aria("receiverName")}
                type="text"
                value={value.receiverName}
                onChange={(e) => text("receiverName", e.target.value)}
                placeholder="MARIA SANTOS"
                maxLength={80}
              />
              <FieldError
                id={`${addressPartFieldId("receiverName")}-error`}
                message={problems.receiverName}
              />
            </div>
            <PhoneField
              label={ADDRESS_PART_LABELS.receiverPhone}
              id={addressPartFieldId("receiverPhone")}
              value={value.receiverPhone}
              defaultCountry={defaultCountry}
              onChange={(next) => set({ receiverPhone: next })}
              error={problems.receiverPhone}
            />
          </>
        )}
      </div>
    </div>
  );
}
