"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import { ageOn, needsGuardianConsent } from "@/lib/minor-consent";
import { shouldAskShirtSize } from "@/lib/shirt-size";
import CategoryPicker from "./CategoryPicker";
import CommunityPicker from "./CommunityPicker";
import PhoneField from "./PhoneField";
import GenderField from "./GenderField";
import BirthdatePicker from "./BirthdatePicker";
import GuardianConsent from "./GuardianConsent";
import ShirtSizeField from "./ShirtSizeField";
import RunnerAddressFields from "./RunnerAddressFields";
import { runnerFieldId, type RunnerErrors, type RunnerField } from "./validation";

/**
 * One runner's card on step 1 of the online wizard: the category or package
 * picker, personal details, shirt size, running club, home address and the
 * health and emergency block.
 *
 * Moved out of RegistrationWizardClient (ADD_ONS_PLAN.md Batch 0) so that
 * everything a runner picks for themselves has one home of normal size. The
 * card owns no state: the wizard keeps the runners, the errors and whether to
 * show them, and every change goes back through the callbacks by index.
 */

export interface Participant {
  id: number;
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  birthdate: string;
  singletSize: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalConditions: string;
  runningCommunity: string;
  /**
   * Asked only while this runner is 12 or under on race day, and cleared the
   * moment they are not (lib/minor-consent.ts, GuardianConsent.tsx).
   */
  guardianName: string;
  guardianRelationship: string;
  guardianConsent: boolean;
  /** Home address, required of every runner — lib/runner-address.ts. */
  addressProvince: string;
  addressCity: string;
  addressBarangay: string;
  addressStreet: string;
  /** The earlier runner (0-based) whose address this one shares, or null. */
  addressSameAs: number | null;
}

type GuardianPatch = Partial<
  Pick<Participant, "guardianName" | "guardianRelationship" | "guardianConsent">
>;

type AddressPatch = Partial<
  Pick<
    Participant,
    | "addressProvince"
    | "addressCity"
    | "addressBarangay"
    | "addressStreet"
    | "addressSameAs"
  >
>;

export default function RunnerCard({
  event,
  index,
  runner,
  runners,
  isFree,
  salePrices,
  shirtSizeUpcharge,
  defaultCountry,
  communityOptions,
  addressErrors,
  errorFor,
  fieldAria,
  onRemove,
  onCategoryChange,
  onChange,
  onGuardianChange,
  onAddressChange,
  onAddCommunity,
  onOpenSizeGuide,
}: {
  event: React.ComponentProps<typeof CategoryPicker>["event"] & {
    /** Race day, which decides whether a runner owes guardian consent. */
    date: string;
    sizeChartImageUrl?: string | null;
  };
  index: number;
  runner: Participant;
  /** Every runner on the order, for the "same address as" choice. */
  runners: Participant[];
  /** Whether this runner rides free under the group deal, for the badge. */
  isFree: boolean;
  salePrices: React.ComponentProps<typeof CategoryPicker>["salePrices"];
  shirtSizeUpcharge: number;
  defaultCountry: string;
  communityOptions: string[];
  /** This runner's address errors, already gated on whether to show them. */
  addressErrors: RunnerErrors;
  errorFor: (index: number, field: RunnerField) => string | undefined;
  fieldAria: (
    index: number,
    field: RunnerField,
  ) => {
    readonly id: string;
    readonly "aria-invalid": true | undefined;
    readonly "aria-describedby": string | undefined;
  };
  onRemove: (index: number) => void;
  onCategoryChange: (index: number, categoryId: string) => void;
  onChange: (index: number, field: keyof Participant, value: string) => void;
  onGuardianChange: (index: number, patch: GuardianPatch) => void;
  onAddressChange: (index: number, patch: AddressPatch) => void;
  onAddCommunity: (name: string) => void;
  onOpenSizeGuide: () => void;
}) {
  return (
    <div
      className="participant-form-block mb-10 p-6 rounded-[16px] bg-black/20 border border-white/5 relative"
    >
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
          <span className="bg-white/10 w-8 h-8 rounded-full flex items-center justify-center text-sm">
            {index + 1}
          </span>
          Runner Details
          {/* The badge follows the cheapest entry, so it moves
              when a runner changes category. That is the rule
              being shown, not a decoration. */}
          {isFree && (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
              Free
            </span>
          )}
        </h3>
        {index > 0 && (
          <button
            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors text-sm font-bold"
            onClick={() => onRemove(index)}
          >
            <Trash2 size={16} /> Remove
          </button>
        )}
      </div>

      <CategoryPicker
        id={runnerFieldId(index, "categoryId")}
        error={errorFor(index, "categoryId")}
        event={event}
        selectedId={runner.categoryId}
        salePrices={salePrices}
        onSelect={categoryId =>
          onCategoryChange(index, categoryId)
        }
      />

      <h4 className="mb-3 text-secondary">
        Personal Information
      </h4>
      <div className="form-grid">
        <div className="input-group">
          <label htmlFor={runnerFieldId(index, "firstName")}>
            First Name
          </label>
          <input
            {...fieldAria(index, "firstName")}
            type="text"
            value={runner.firstName}
            onChange={(e) =>
              onChange(
                index,
                "firstName",
                e.target.value,
              )
            }
            placeholder="JUAN"
          />
          <FieldError
            id={`${runnerFieldId(index, "firstName")}-error`}
            message={errorFor(index, "firstName")}
          />
        </div>
        <div className="input-group">
          <label htmlFor={runnerFieldId(index, "lastName")}>
            Last Name
          </label>
          <input
            {...fieldAria(index, "lastName")}
            type="text"
            value={runner.lastName}
            onChange={(e) =>
              onChange(
                index,
                "lastName",
                e.target.value,
              )
            }
            placeholder="DELA CRUZ"
          />
          <FieldError
            id={`${runnerFieldId(index, "lastName")}-error`}
            message={errorFor(index, "lastName")}
          />
        </div>
        <div className="input-group">
          <label htmlFor={runnerFieldId(index, "email")}>
            Email Address
          </label>
          <input
            {...fieldAria(index, "email")}
            type="email"
            value={runner.email}
            onChange={(e) =>
              onChange(
                index,
                "email",
                e.target.value,
              )
            }
            placeholder="juan@example.com"
          />
          <FieldError
            id={`${runnerFieldId(index, "email")}-error`}
            message={errorFor(index, "email")}
          />
        </div>
        <PhoneField
          label="Mobile Number"
          id={runnerFieldId(index, "phone")}
          error={errorFor(index, "phone")}
          value={runner.phone}
          defaultCountry={defaultCountry}
          onChange={(e164) =>
            onChange(index, "phone", e164)
          }
        />
        <GenderField
          id={runnerFieldId(index, "gender")}
          error={errorFor(index, "gender")}
          value={runner.gender}
          onChange={(gender) =>
            onChange(index, "gender", gender)
          }
        />
        <BirthdatePicker
          id={runnerFieldId(index, "birthdate")}
          error={errorFor(index, "birthdate")}
          value={runner.birthdate}
          onChange={(birthdate) =>
            onChange(index, "birthdate", birthdate)
          }
        />
        {needsGuardianConsent(runner.birthdate, event.date) && (
          <GuardianConsent
            runnerIndex={index}
            childName={`${runner.firstName} ${runner.lastName}`}
            age={ageOn(runner.birthdate, event.date) ?? 0}
            name={runner.guardianName}
            relationship={runner.guardianRelationship}
            consent={runner.guardianConsent}
            onNameChange={(guardianName) =>
              onGuardianChange(index, { guardianName })
            }
            onRelationshipChange={(guardianRelationship) =>
              onGuardianChange(index, { guardianRelationship })
            }
            onConsentChange={(guardianConsent) =>
              onGuardianChange(index, { guardianConsent })
            }
            errorFor={(field) => errorFor(index, field)}
          />
        )}
        {shouldAskShirtSize(
          event.categories,
          runner.categoryId,
        ) && (
          <ShirtSizeField
            id={runnerFieldId(index, "singletSize")}
            error={errorFor(index, "singletSize")}
            value={runner.singletSize}
            upcharge={shirtSizeUpcharge}
            onChange={(size) =>
              onChange(index, "singletSize", size)
            }
            onOpenSizeGuide={onOpenSizeGuide}
            showMeasurements={!event.sizeChartImageUrl}
          />
        )}

        <CommunityPicker
          value={runner.runningCommunity}
          options={communityOptions}
          onChange={(name) =>
            onChange(
              index,
              "runningCommunity",
              name,
            )
          }
          onAdd={onAddCommunity}
        />
      </div>

      <RunnerAddressFields
        index={index}
        runners={runners}
        errors={addressErrors}
        onChange={(patch) => onAddressChange(index, patch)}
      />

      <h4 className="mt-6 mb-3 text-secondary">
        Health & Emergency Info
      </h4>
      <div className="form-grid">
        <div className="input-group">
          <label
            htmlFor={runnerFieldId(index, "emergencyContactName")}
          >
            Emergency Contact Name
          </label>
          <input
            {...fieldAria(index, "emergencyContactName")}
            type="text"
            value={runner.emergencyContactName}
            onChange={(e) =>
              onChange(
                index,
                "emergencyContactName",
                e.target.value,
              )
            }
            placeholder="MARIA DELA CRUZ"
          />
          <FieldError
            id={`${runnerFieldId(index, "emergencyContactName")}-error`}
            message={errorFor(index, "emergencyContactName")}
          />
        </div>
        <PhoneField
          label="Emergency Contact No."
          id={runnerFieldId(index, "emergencyContactPhone")}
          error={errorFor(index, "emergencyContactPhone")}
          value={runner.emergencyContactPhone}
          defaultCountry={defaultCountry}
          onChange={(e164) =>
            onChange(
              index,
              "emergencyContactPhone",
              e164,
            )
          }
        />
        <div className="input-group full-width">
          <label>Medical Conditions (Optional)</label>
          <textarea
            value={runner.medicalConditions}
            onChange={(e) =>
              onChange(
                index,
                "medicalConditions",
                e.target.value,
              )
            }
            placeholder="e.g. ASTHMA, ALLERGIES (Leave blank if none)"
          ></textarea>
        </div>
      </div>
    </div>
  );
}
