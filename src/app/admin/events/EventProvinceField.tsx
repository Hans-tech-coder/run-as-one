"use client";

import AdminSelect, { type AdminSelectOption } from "../AdminSelect";
import { PH_PROVINCES, inferProvince } from "@/lib/ph-address";

/**
 * The province an event is held in (`Event.province`), on the new-event and
 * edit-event forms alike. It is what the two delivery tiers are measured from:
 * set, the registration wizard prices delivery from the runner's own address;
 * left unset, the province the location names is used instead (and saved as
 * this field by the events API), and only when neither says does the runner
 * pick Inside or Outside themselves.
 */

const PROVINCE_OPTIONS: AdminSelectOption[] = PH_PROVINCES.map((p) => ({
  value: p.name,
  label: p.name,
}));

export default function EventProvinceField({
  value,
  location,
  onChange,
}: {
  value: string;
  /** The event's location, so an unpicked province can show what it reads as. */
  location: string;
  onChange: (next: string) => void;
}) {
  const detected = inferProvince(location)?.name;
  // The empty choice names what it will actually mean, so the closed field
  // never reads "Not set" while the hint says Tarlac is being used.
  const options: AdminSelectOption[] = [
    detected
      ? { value: "", label: `${detected} (from location)`, hint: "Read from the location, and saved as the province when you save" }
      : { value: "", label: "Not set", hint: "Runners choose Inside or Outside themselves" },
    ...PROVINCE_OPTIONS,
  ];
  return (
    <div className="form-group-full">
      <AdminSelect
        label="Event Province"
        listboxLabel="Provinces"
        value={value}
        options={options}
        placeholder="Not set"
        onChange={onChange}
        hint={
          value
            ? `Runners with an address in ${value} pay the inside fee; everywhere else pays the outside fee. They are no longer asked to choose.`
            : detected
              ? `Not picked yet, so ${detected} is read from the location and saved with the event. Pick another if that is wrong.`
              : "The location does not name a province. Pick one so the delivery fee follows the runner's address instead of their own pick."
        }
      />
    </div>
  );
}
