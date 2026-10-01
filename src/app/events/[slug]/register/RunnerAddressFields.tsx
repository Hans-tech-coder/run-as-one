"use client";

import { Home } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { upperCaseAsTyped } from "@/lib/text-case";
import {
  EMPTY_RUNNER_ADDRESS,
  addressSources,
  formatRunnerAddress,
  type RunnerAddress,
  type RunnerAddressField,
} from "@/lib/runner-address";
import AddressPlaceFields, { type PlacePart } from "./AddressPlaceFields";
import SelectField from "./SelectField";
import { runnerFieldId, type RunnerErrors } from "./validation";

/**
 * Each runner's Home Address on Step 1, plus the helpers both wizards use to
 * keep the "same address as" choices straight. The rule itself — four parts,
 * required of everyone, stored resolved on every row — is lib/runner-address.ts.
 *
 * Runner 2 onward starts on "Same address as Runner 1", so a household
 * registering together types one address. The picker lists only earlier
 * runners, which is what keeps a chain from ever looping.
 */

/** A runner as the wizards hold one, as far as the address goes. */
export type AddressedRunner = RunnerAddress & {
  /** The earlier runner (0-based) whose address this one shares; null = typed its own. */
  addressSameAs: number | null;
  firstName: string;
  lastName: string;
};

const NEW_ADDRESS = "new";

/** What a runner added at `index` starts with: runner 1 types, the rest share. */
export function startingAddress(index: number): RunnerAddress & { addressSameAs: number | null } {
  return { ...EMPTY_RUNNER_ADDRESS, addressSameAs: index === 0 ? null : 0 };
}

/**
 * The list once runner `removed` is gone. Anyone who shared that runner's
 * address moves back to Runner 1; runners after it shift down one place, so
 * their choices shift with them. When it is Runner 1 that goes, the new
 * Runner 1 keeps the address it was sharing as its own typed copy, so nobody
 * loses an address they never had to type.
 */
export function withoutRunner<T extends AddressedRunner>(runners: readonly T[], removed: number): T[] {
  const sources = addressSources(runners.map((r) => r.addressSameAs));
  return runners
    .map((runner, index) => ({ runner, index }))
    .filter(({ index }) => index !== removed)
    .map(({ runner, index }, newIndex) => {
      if (newIndex === 0) {
        const source = runners[sources[index]];
        return { ...runner, ...pickAddress(source), addressSameAs: null };
      }
      const chosen = runner.addressSameAs;
      if (chosen === null) return runner;
      const shifted = chosen === removed ? 0 : chosen > removed ? chosen - 1 : chosen;
      return { ...runner, addressSameAs: shifted };
    });
}

function pickAddress(runner: RunnerAddress): RunnerAddress {
  return {
    addressProvince: runner.addressProvince,
    addressCity: runner.addressCity,
    addressBarangay: runner.addressBarangay,
    addressStreet: runner.addressStreet,
  };
}

/** What the checkout routes receive: every runner carries its resolved address. */
export function withResolvedAddresses<T extends AddressedRunner>(runners: readonly T[]): T[] {
  const sources = addressSources(runners.map((r) => r.addressSameAs));
  return runners.map((runner, index) => ({
    ...runner,
    ...pickAddress(runners[sources[index]]),
  }));
}

/**
 * Back from a cancelled checkout the rows hold resolved copies only, so the
 * "same as" choices are rebuilt: a runner whose address matches an earlier
 * runner who typed it shares that runner's again; anyone else has their own.
 */
export function restoredSameAs(runners: readonly RunnerAddress[]): (number | null)[] {
  const keys = runners.map((r) => formatRunnerAddress(r));
  return keys.map((key, index) => {
    if (index === 0 || !key) return null;
    const match = keys.findIndex((k, j) => j < index && k === key);
    return match === -1 ? null : match;
  });
}

function runnerName(runner: AddressedRunner, index: number): string {
  const name = `${runner.firstName} ${runner.lastName}`.trim();
  return name ? `Runner ${index + 1} (${name})` : `Runner ${index + 1}`;
}

const PLACE_FIELD: Record<PlacePart, RunnerAddressField> = {
  province: "addressProvince",
  city: "addressCity",
  barangay: "addressBarangay",
};

export default function RunnerAddressFields({
  index,
  runners,
  errors,
  onChange,
}: {
  index: number;
  /** Every runner on the order, for the picker's names and the shared address. */
  runners: readonly AddressedRunner[];
  /** This runner's errors, already gated on whether to show them. */
  errors: RunnerErrors;
  onChange: (patch: Partial<RunnerAddress & { addressSameAs: number | null }>) => void;
}) {
  const runner = runners[index];
  const sharing = index > 0 && runner.addressSameAs !== null;
  const source = sharing
    ? addressSources(runners.map((r) => r.addressSameAs))[index]
    : index;
  const shared = sharing ? formatRunnerAddress(runners[source]) : "";

  const aria = (field: RunnerAddressField) => {
    const id = runnerFieldId(index, field);
    return {
      id,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${id}-error` : undefined,
    } as const;
  };

  return (
    <>
      <h4 className="mt-6 mb-1 text-secondary">Home Address</h4>
      <p className="text-xs text-secondary mb-3">
        So the organizer can reach you if plans change, such as race kits
        being delivered instead of picked up.
      </p>
      <div className="form-grid">
        {index > 0 && (
          <div className="input-group full-width">
            <SelectField
              label="Same address as"
              listboxLabel="Whose address this runner shares"
              value={runner.addressSameAs === null ? NEW_ADDRESS : String(runner.addressSameAs)}
              options={[
                ...runners.slice(0, index).map((r, j) => ({
                  value: String(j),
                  label: runnerName(r, j),
                })),
                { value: NEW_ADDRESS, label: "New address" },
              ]}
              onChange={(next) =>
                onChange({ addressSameAs: next === NEW_ADDRESS ? null : Number(next) })
              }
            />
          </div>
        )}

        {sharing ? (
          <div className="input-group full-width">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <Home size={16} className="mt-0.5 shrink-0 text-accent-orange" aria-hidden="true" />
              <p className="m-0 text-sm leading-relaxed text-white break-words min-w-0">
                {shared || (
                  <span className="text-secondary">
                    Runner {source + 1}&apos;s address will appear here once it is filled in.
                  </span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <>
            <AddressPlaceFields
              value={{
                province: runner.addressProvince,
                city: runner.addressCity,
                barangay: runner.addressBarangay,
              }}
              onChange={(patch) =>
                onChange(
                  Object.fromEntries(
                    Object.entries(patch).map(([part, v]) => [PLACE_FIELD[part as PlacePart], v]),
                  ),
                )
              }
              idFor={(part) => runnerFieldId(index, PLACE_FIELD[part])}
              errors={{
                province: errors.addressProvince,
                city: errors.addressCity,
                barangay: errors.addressBarangay,
              }}
            />
            <div className="input-group">
              <label htmlFor={runnerFieldId(index, "addressStreet")}>
                House/Unit No. &amp; Street
              </label>
              <input
                {...aria("addressStreet")}
                type="text"
                autoComplete="street-address"
                value={runner.addressStreet}
                onChange={(e) => onChange({ addressStreet: upperCaseAsTyped(e.target.value) })}
                placeholder="BLK 5 LOT 12, RIZAL ST."
                maxLength={150}
              />
              <FieldError
                id={`${runnerFieldId(index, "addressStreet")}-error`}
                message={errors.addressStreet}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
