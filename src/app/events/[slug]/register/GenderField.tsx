"use client";

import React from "react";
import { Mars, Venus } from "lucide-react";
import SelectField, { type SelectOption } from "./SelectField";

/**
 * The gender a runner is scored under.
 *
 * Asked as a closed pair rather than as free text because this answer is not
 * really about the runner's identity: it decides which division their time is
 * ranked in and which podium they are called to, and a results table can only
 * award the ones it has categories for. The note under the field says so
 * plainly, so nobody has to guess what the question is for.
 *
 * Shared by both wizards, so a fun run and a race ask it the same way.
 */

/**
 * Uppercase, like every other registrant answer (lib/text-case.ts). The value
 * and the label are the same string on purpose: what the runner reads in the
 * list is exactly what the registrants table, the CSV export and the emails
 * will show.
 *
 * The placeholder below stays sentence case, because it is an instruction
 * rather than a sample of the answer — nobody's gender is "Select Gender".
 */
const GENDER_OPTIONS: readonly SelectOption[] = [
  {
    value: "MALE",
    label: "MALE",
    icon: <Mars size={16} aria-hidden="true" />,
  },
  {
    value: "FEMALE",
    label: "FEMALE",
    icon: <Venus size={16} aria-hidden="true" />,
  },
];

export default function GenderField({
  value,
  onChange,
  id,
  error,
}: {
  value: string;
  onChange: (gender: string) => void;
  /** Overrides the generated id so validation can send the caret here. */
  id?: string;
  /** Set when the runner has not answered yet. */
  error?: string;
}) {
  return (
    <SelectField
      label="Gender"
      listboxLabel="Gender"
      id={id}
      error={error}
      value={value}
      options={GENDER_OPTIONS}
      placeholder="Select Gender"
      onChange={onChange}
      hint="Biological gender, for race categories."
    />
  );
}
