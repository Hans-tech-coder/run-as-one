"use client";

import React from "react";
import { Check, UserRoundCheck } from "lucide-react";
import FieldError from "@/components/ui/FieldError";
import {
  GUARDIAN_CONSENT_MAX_AGE,
  GUARDIAN_NAME_PLACEHOLDER,
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIP_PLACEHOLDER,
  GUARDIAN_RELATIONSHIPS,
  guardianConsentSentence,
} from "@/lib/minor-consent";
import { upperCaseAsTyped } from "@/lib/text-case";
import SelectField, { type SelectOption } from "./SelectField";
import { runnerFieldId } from "./validation";

const RELATIONSHIP_OPTIONS: readonly SelectOption[] = GUARDIAN_RELATIONSHIPS.map(
  (value) => ({ value, label: GUARDIAN_RELATIONSHIP_LABELS[value] }),
);

/**
 * Parent/Guardian Consent, inside one runner's card, right under Birthdate.
 *
 * The wizard renders it only while that runner is 12 or under on race day
 * (lib/minor-consent.ts) and clears its three answers the moment they are not,
 * so nothing stale is submitted. It works like the order's own waiver
 * (ConsentWaiver.tsx) — a typed name and a tick — rather than a printable form
 * to download, sign, scan and upload, which is the step a parent on a phone
 * gives up at. See GUARDIAN_CONSENT_PLAN.md.
 *
 * Ids come from `runnerFieldId`, so a failed Next sends the caret to whichever
 * of the three is missing, the same as every other field in the card.
 */
export default function GuardianConsent({
  runnerIndex,
  childName,
  age,
  name,
  relationship,
  consent,
  onNameChange,
  onRelationshipChange,
  onConsentChange,
  errorFor,
}: {
  runnerIndex: number;
  /** The runner's name as typed so far, for the sentence the guardian ticks. */
  childName: string;
  /** Their age on race day. */
  age: number;
  name: string;
  relationship: string;
  consent: boolean;
  onNameChange: (value: string) => void;
  onRelationshipChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  /** The wizard's own error lookup, so the red state waits for a failed Next. */
  errorFor: (
    field: "guardianName" | "guardianRelationship" | "guardianConsent",
  ) => string | undefined;
}) {
  const nameId = runnerFieldId(runnerIndex, "guardianName");
  const consentId = runnerFieldId(runnerIndex, "guardianConsent");
  const nameError = errorFor("guardianName");
  const consentError = errorFor("guardianConsent");

  return (
    <section
      aria-labelledby={`${nameId}-heading`}
      className="guardian-reveal col-span-full rounded-[16px] border border-accent-orange/30 bg-accent-orange/5 p-5"
    >
      <div className="flex items-center gap-2 mb-1">
        <UserRoundCheck
          size={18}
          className="text-accent-orange shrink-0"
          aria-hidden="true"
        />
        <h5 id={`${nameId}-heading`} className="text-white font-bold m-0">
          Parent/Guardian Consent
        </h5>
      </div>
      <p className="text-secondary text-sm leading-relaxed m-0 mb-5">
        {`This runner will be ${age} on race day. Runners ${GUARDIAN_CONSENT_MAX_AGE} and under need a parent or legal guardian's consent to join.`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="input-group min-w-0">
          <label htmlFor={nameId}>Parent/Guardian Full Name</label>
          {/* Uppercased as typed, like every other registrant name
              (lib/text-case.ts). */}
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => onNameChange(upperCaseAsTyped(e.target.value))}
            placeholder={GUARDIAN_NAME_PLACEHOLDER}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
          />
          <FieldError id={`${nameId}-error`} message={nameError} />
        </div>
        <div className="min-w-0">
          <SelectField
            label="Relationship"
            listboxLabel="Relationship to the runner"
            id={runnerFieldId(runnerIndex, "guardianRelationship")}
            error={errorFor("guardianRelationship")}
            value={relationship}
            options={RELATIONSHIP_OPTIONS}
            placeholder={GUARDIAN_RELATIONSHIP_PLACEHOLDER}
            onChange={onRelationshipChange}
          />
        </div>
      </div>

      {/* The same custom box as ConsentWaiver: a real checkbox kept for the
          keyboard and screen readers, drawn in the app's accent. */}
      <label className="group relative mt-5 flex items-start gap-3 cursor-pointer">
        <input
          id={consentId}
          type="checkbox"
          className="sr-only peer"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? `${consentId}-error` : undefined}
        />
        <span
          aria-hidden="true"
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black ${
            consent
              ? "border-accent-orange bg-accent-orange"
              : consentError
                ? "border-red-500/70"
                : "border-white/30 group-hover:border-white/50"
          }`}
        >
          {consent && <Check size={14} strokeWidth={3} className="text-black" />}
        </span>
        <span className="text-sm text-white leading-relaxed">
          {guardianConsentSentence(childName)}{" "}
          <span className="text-accent-orange font-bold">*</span>
        </span>
      </label>
      <div className="mt-2">
        <FieldError id={`${consentId}-error`} message={consentError} />
      </div>
    </section>
  );
}
