"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { upperCaseAsTyped } from "@/lib/text-case";
import {
  PH_PROVINCES,
  findProvince,
  loadCities,
  placeKey,
  samePlace,
  type PhCity,
} from "@/lib/ph-address";
import Combobox, { type ComboboxRow } from "./Combobox";
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
 * Province, city and barangay are picked from the PSGC lists, in that order,
 * so the courier gets a place that exists. The rules — which parts are
 * required, how they join into the stored string — live in
 * delivery-address.ts; this is only the form.
 */

/** A long list is cut here; typing narrows it. Manila alone has 897 barangays. */
const MAX_ROWS = 60;

function PlacePicker({
  part,
  value,
  options,
  placeholder,
  hint,
  error,
  onChange,
}: {
  part: DeliveryAddressPart;
  value: string;
  /** Uppercase, as the field stores them. Empty while there is nothing to pick. */
  options: string[];
  placeholder: string;
  hint?: React.ReactNode;
  error?: string;
  onChange: (next: string) => void;
}) {
  const typed = placeKey(value);

  const rows = useMemo<ComboboxRow[]>(() => {
    // Prefix matches first: "SAN" wants San Isidro above Pasay's Santa Clara.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of options) {
      const key = placeKey(name);
      if (!typed || key.startsWith(typed)) starts.push(name);
      else if (key.includes(typed)) contains.push(name);
    }
    return [...starts, ...contains].slice(0, MAX_ROWS).map((name) => {
      const isSelected = placeKey(name) === typed;
      return {
        key: name,
        value: name,
        selected: isSelected,
        label: (
          <>
            {isSelected ? (
              <Check size={16} className="shrink-0 text-accent-orange" />
            ) : (
              <MapPin size={16} className="shrink-0 text-white/30" />
            )}
            <span className="truncate">{name}</span>
          </>
        ),
      };
    });
  }, [options, typed]);

  return (
    <Combobox
      id={addressPartFieldId(part)}
      label={ADDRESS_PART_LABELS[part]}
      listboxLabel={ADDRESS_PART_LABELS[part]}
      value={value}
      rows={rows}
      maxLength={80}
      placeholder={placeholder}
      onChange={(next) => onChange(upperCaseAsTyped(next))}
      // Snap to the list's spelling when what was typed is on it, so
      // "tarlac city" is stored exactly as the list writes it.
      onNormalize={(text) =>
        options.find((name) => placeKey(name) === placeKey(text)) ??
        upperCaseAsTyped(text.trim())
      }
      hint={hint}
      error={error}
      fullWidth={false}
    />
  );
}

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
}: {
  value: DeliveryAddressParts;
  onChange: (next: DeliveryAddressParts) => void;
  showErrors: boolean;
  /** For the receiver's number, like the runners' own. */
  defaultCountry: string;
  zoneNote?: DeliveryZoneNote;
}) {
  const problems = showErrors ? addressProblems(value) : {};
  const province = findProvince(value.province);

  // Which province's list is in hand. Compared against the current province
  // rather than cleared on change, so a switch never shows the old list.
  const [loaded, setLoaded] = useState<{ code: string; cities: PhCity[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!province) return;
    let live = true;
    loadCities(province).then(
      (cities) => live && setLoaded({ code: province.code, cities }),
      () => live && setFailed(province.code),
    );
    return () => {
      live = false;
    };
  }, [province]);

  const cities = province && loaded?.code === province.code ? loaded.cities : null;
  const city = cities?.find((c) => samePlace(c.name, value.city));
  const cityOptions = useMemo(
    () => (cities ?? []).map((c) => c.name.toUpperCase()),
    [cities],
  );
  const barangayOptions = useMemo(
    () => (city?.barangays ?? []).map((b) => b.toUpperCase()),
    [city],
  );
  const listFailed = province && failed === province.code && !cities;

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

  const provinceOptions = useMemo(
    () => PH_PROVINCES.map((p) => p.name.toUpperCase()),
    [],
  );

  return (
    <div className="input-group full-width">
      <label>Delivery Address</label>
      <p className="text-xs text-secondary mb-2">
        Pick your province first, then your city and barangay, so the courier
        can find your door on the first try.
      </p>

      <div className="form-grid">
        <PlacePicker
          part="province"
          value={value.province}
          options={provinceOptions}
          placeholder="TARLAC"
          hint={!problems.province && !zoneNote?.error ? zoneNote?.text : undefined}
          error={problems.province ?? zoneNote?.error}
          onChange={(next) =>
            set(
              samePlace(next, value.province)
                ? { province: next }
                : { province: next, city: "", barangay: "" },
            )
          }
        />
        <PlacePicker
          part="city"
          value={value.city}
          options={cityOptions}
          placeholder="TARLAC CITY"
          hint={
            !province
              ? "Choose a province first."
              : listFailed
                ? "The list did not load. Type your city or municipality."
                : !cities
                  ? "Loading cities and municipalities…"
                  : undefined
          }
          error={problems.city}
          onChange={(next) =>
            set(
              samePlace(next, value.city)
                ? { city: next }
                : { city: next, barangay: "" },
            )
          }
        />
        <PlacePicker
          part="barangay"
          value={value.barangay}
          options={barangayOptions}
          placeholder="SAN ISIDRO"
          hint={
            !city && !listFailed ? "Choose a city or municipality first." : undefined
          }
          error={problems.barangay}
          onChange={(next) => set({ barangay: next })}
        />
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
