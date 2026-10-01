"use client";

import React, { useEffect, useMemo, useState } from 'react';
import AdminSelect from '../../../AdminSelect';
import FieldError from '@/components/ui/FieldError';
import { upperCaseAsTyped } from '@/lib/text-case';
import {
  PH_PROVINCES,
  findProvince,
  loadCities,
  samePlace,
  type PhCity,
} from '@/lib/ph-address';
import {
  RUNNER_ADDRESS_LABELS,
  type RunnerAddress,
  type RunnerAddressField,
} from '@/lib/runner-address';

/**
 * A runner's home address in the edit modal (RUNNER_ADDRESS_PLAN.md Batch 3):
 * the same four parts the wizard's Step 1 collects, drawn in the admin's own
 * controls rather than the wizard's dark comboboxes, which would sit in a
 * light-themed modal as a black box.
 *
 * Province, city and barangay are AdminSelects fed from the PSGC lists
 * (lib/ph-address.ts); its typeahead is what makes an 897-barangay list
 * usable. Where a list cannot be offered — the cities failed to load, or the
 * stored city is not on the list, which a barangay newer than the data can
 * also be — the field falls back to plain text, so staff can always type
 * what the runner told them. A value already on file that is missing from a
 * list is added to it, so opening the modal never shows a stored answer as
 * blank.
 *
 * Changing the province clears the city and barangay, and changing the city
 * clears the barangay, the same rule as the wizard's AddressPlaceFields.
 */
export default function RunnerAddressEditor({
  value,
  onChange,
  errors = {},
}: {
  value: RunnerAddress;
  onChange: (patch: Partial<RunnerAddress>) => void;
  errors?: Partial<Record<RunnerAddressField, string>>;
}) {
  const province = findProvince(value.addressProvince);

  const [loaded, setLoaded] = useState<{ code: string; cities: PhCity[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!province) return;
    let live = true;
    loadCities(province).then(
      cities => live && setLoaded({ code: province.code, cities }),
      () => live && setFailed(province.code),
    );
    return () => {
      live = false;
    };
  }, [province]);

  const cities = province && loaded?.code === province.code ? loaded.cities : null;
  const city = cities?.find(c => samePlace(c.name, value.addressCity));

  const provinceOptions = useMemo(
    () => withCurrent(PH_PROVINCES.map(p => p.name.toUpperCase()), value.addressProvince),
    [value.addressProvince],
  );
  const cityOptions = useMemo(
    () => (cities ? withCurrent(cities.map(c => c.name.toUpperCase()), value.addressCity) : []),
    [cities, value.addressCity],
  );
  const barangayOptions = useMemo(
    () => (city ? withCurrent(city.barangays.map(b => b.toUpperCase()), value.addressBarangay) : []),
    [city, value.addressBarangay],
  );

  const cityFailed = Boolean(province && failed === province.code && !cities);
  // Typed rather than picked when there is no list to pick from: no
  // province chosen yet is the one case that waits instead.
  const typeCity = cityFailed;
  const typeBarangay = cityFailed || Boolean(cities && value.addressCity && !city);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <AdminSelect
        id="edit-runner-address-province"
        label={RUNNER_ADDRESS_LABELS.addressProvince}
        value={value.addressProvince}
        options={provinceOptions}
        placeholder="Select the province"
        listboxLabel={RUNNER_ADDRESS_LABELS.addressProvince}
        error={errors.addressProvince}
        onChange={next =>
          onChange(
            samePlace(next, value.addressProvince)
              ? { addressProvince: next }
              : { addressProvince: next, addressCity: '', addressBarangay: '' },
          )
        }
      />

      {typeCity ? (
        <TextField
          id="edit-runner-address-city"
          label={RUNNER_ADDRESS_LABELS.addressCity}
          value={value.addressCity}
          placeholder="TARLAC CITY"
          hint="The list did not load. Type the city or municipality."
          error={errors.addressCity}
          onChange={next => onChange({ addressCity: next, addressBarangay: '' })}
        />
      ) : (
        <AdminSelect
          id="edit-runner-address-city"
          label={RUNNER_ADDRESS_LABELS.addressCity}
          value={value.addressCity}
          options={cityOptions}
          placeholder={
            !province ? 'Choose a province first' : !cities ? 'Loading…' : 'Select the city'
          }
          listboxLabel={RUNNER_ADDRESS_LABELS.addressCity}
          error={errors.addressCity}
          onChange={next =>
            onChange(
              samePlace(next, value.addressCity)
                ? { addressCity: next }
                : { addressCity: next, addressBarangay: '' },
            )
          }
        />
      )}

      {typeBarangay ? (
        <TextField
          id="edit-runner-address-barangay"
          label={RUNNER_ADDRESS_LABELS.addressBarangay}
          value={value.addressBarangay}
          placeholder="SAN ISIDRO"
          error={errors.addressBarangay}
          onChange={next => onChange({ addressBarangay: next })}
        />
      ) : (
        <AdminSelect
          id="edit-runner-address-barangay"
          label={RUNNER_ADDRESS_LABELS.addressBarangay}
          value={value.addressBarangay}
          options={barangayOptions}
          placeholder={!city ? 'Choose a city first' : 'Select the barangay'}
          listboxLabel={RUNNER_ADDRESS_LABELS.addressBarangay}
          error={errors.addressBarangay}
          onChange={next => onChange({ addressBarangay: next })}
        />
      )}

      <TextField
        id="edit-runner-address-street"
        label={RUNNER_ADDRESS_LABELS.addressStreet}
        value={value.addressStreet}
        placeholder="BLK 5 LOT 12 RIZAL ST."
        error={errors.addressStreet}
        onChange={next => onChange({ addressStreet: next })}
      />
    </div>
  );
}

/** The list as options, with the stored answer kept even when the list lacks it. */
function withCurrent(names: string[], current: string) {
  const list = current && !names.some(name => samePlace(name, current)) ? [current, ...names] : names;
  return list.map(name => ({ value: name, label: name }));
}

function TextField({
  id,
  label,
  value,
  placeholder,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        maxLength={120}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(upperCaseAsTyped(e.target.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="form-input"
      />
      {hint && !error && <p className="text-xs text-[var(--text-muted)] mt-1">{hint}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
