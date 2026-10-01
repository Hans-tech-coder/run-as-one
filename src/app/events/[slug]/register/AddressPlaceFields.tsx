"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin } from "lucide-react";
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

/**
 * Province → City/Municipality → Barangay, picked from the PSGC lists in that
 * order, so whoever reads the address gets a place that exists. Shared by the
 * delivery address on Step 2 and every runner's home address on Step 1, which
 * is why it knows nothing about either: the ids, the errors and the hint under
 * the province all come from the caller.
 *
 * Changing the province clears the city and barangay, and changing the city
 * clears the barangay, because a barangay from the old city is never right.
 */

export interface PlaceValue {
  province: string;
  city: string;
  barangay: string;
}

export type PlacePart = keyof PlaceValue;

export const PLACE_LABELS: Record<PlacePart, string> = {
  province: "Province",
  city: "City/Municipality",
  barangay: "Barangay",
};

/** A long list is cut here; typing narrows it. Manila alone has 897 barangays. */
const MAX_ROWS = 60;

function PlacePicker({
  id,
  label,
  value,
  options,
  placeholder,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
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
      id={id}
      label={label}
      listboxLabel={label}
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

export default function AddressPlaceFields({
  value,
  onChange,
  idFor,
  errors = {},
  provinceHint,
}: {
  value: PlaceValue;
  /** Only the parts that changed, with the ones a change invalidates cleared. */
  onChange: (patch: Partial<PlaceValue>) => void;
  idFor: (part: PlacePart) => string;
  errors?: Partial<Record<PlacePart, string>>;
  /** Under the province once one is picked, while it has no error. */
  provinceHint?: React.ReactNode;
}) {
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

  const provinceOptions = useMemo(
    () => PH_PROVINCES.map((p) => p.name.toUpperCase()),
    [],
  );

  return (
    <>
      <PlacePicker
        id={idFor("province")}
        label={PLACE_LABELS.province}
        value={value.province}
        options={provinceOptions}
        placeholder="TARLAC"
        hint={!errors.province ? provinceHint : undefined}
        error={errors.province}
        onChange={(next) =>
          onChange(
            samePlace(next, value.province)
              ? { province: next }
              : { province: next, city: "", barangay: "" },
          )
        }
      />
      <PlacePicker
        id={idFor("city")}
        label={PLACE_LABELS.city}
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
        error={errors.city}
        onChange={(next) =>
          onChange(
            samePlace(next, value.city) ? { city: next } : { city: next, barangay: "" },
          )
        }
      />
      <PlacePicker
        id={idFor("barangay")}
        label={PLACE_LABELS.barangay}
        value={value.barangay}
        options={barangayOptions}
        placeholder="SAN ISIDRO"
        hint={!city && !listFailed ? "Choose a city or municipality first." : undefined}
        error={errors.barangay}
        onChange={(next) => onChange({ barangay: next })}
      />
    </>
  );
}
