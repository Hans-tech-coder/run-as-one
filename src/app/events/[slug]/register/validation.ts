import { sellsPackages } from "@/lib/event-type";
import {
  expectedNationalDigits,
  normalizeNational,
  parseE164,
} from "@/lib/phone";
import {
  shouldAskShirtSize,
  type SizableCategory,
} from "@/lib/shirt-size";

/**
 * What step 1 actually requires of a runner, and how to say so.
 *
 * The wizard used to answer a failed "Next" with one fixed sentence — "complete
 * all required fields and select a category for all runners" — which kept
 * asking for a category the runner had already picked and never said which of
 * the ten fields was empty. Both wizards had their own copy of the boolean that
 * produced it.
 *
 * So the check returns the missing fields rather than a yes/no. The same result
 * drives three things that must never disagree: the red state on each control,
 * the summary the dialog reads out, and which field the caret lands in.
 */

export type RunnerField =
  | "categoryId"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "gender"
  | "birthdate"
  | "singletSize"
  | "emergencyContactName"
  | "emergencyContactPhone";

/** Message order = form order, so the summary reads top to bottom. */
const FIELD_ORDER: RunnerField[] = [
  "categoryId",
  "firstName",
  "lastName",
  "email",
  "phone",
  "gender",
  "birthdate",
  "singletSize",
  "emergencyContactName",
  "emergencyContactPhone",
];

/** Short name for the summary list. */
const LABELS: Record<RunnerField, string> = {
  categoryId: "Category",
  firstName: "First name",
  lastName: "Last name",
  email: "Email address",
  phone: "Mobile number",
  gender: "Gender",
  birthdate: "Birthdate",
  singletSize: "Shirt size",
  emergencyContactName: "Emergency contact name",
  emergencyContactPhone: "Emergency contact number",
};

/**
 * What to do about it, next to the field itself. Phrased as the action the
 * runner takes — "Enter an email address" beats "This field is required",
 * which says nothing the asterisk did not already say.
 */
const MESSAGES: Record<RunnerField, string> = {
  categoryId: "Select a category",
  firstName: "Enter a first name",
  lastName: "Enter a last name",
  email: "Enter an email address",
  phone: "Enter a mobile number",
  gender: "Select a gender",
  birthdate: "Enter a birthdate",
  singletSize: "Select a shirt size",
  emergencyContactName: "Enter an emergency contact name",
  emergencyContactPhone: "Enter an emergency contact number",
};

/**
 * The two numbers that have to be dialable, and what to say when one is not.
 *
 * A number that is present but too short passed every check here before, so a
 * runner could finish the form with four digits in it and nobody would find out
 * until race morning. The field itself already caps the length (see
 * lib/phone), so the only failure left is a number cut short — and the message
 * says the rule out loud rather than repeating "enter a number" at someone who
 * plainly has.
 *
 * Countries whose length we do not claim to know are left alone: no rule, no
 * complaint.
 */
const PHONE_FIELDS: readonly RunnerField[] = ["phone", "emergencyContactPhone"];

function phoneLengthMessage(
  field: RunnerField,
  value: unknown,
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const { iso2, national } = parseE164(value);
  const expected = expectedNationalDigits(iso2);
  if (expected === null) return undefined;

  const digits = normalizeNational(iso2!, national);
  if (digits.length === expected) return undefined;

  return `${LABELS[field]} must be ${expected} digits`;
}

export type RunnerErrors = Partial<Record<RunnerField, string>>;

/**
 * Only the parts of an event this check reads. The wizards hold their event as
 * `any` — narrowing here rather than there means the check cannot quietly start
 * depending on a field nobody guaranteed is present.
 */
export type ValidatedEvent = {
  eventType?: unknown;
  categories?: readonly SizableCategory[] | null;
};

/** A runner as the wizards hold one; every validated field is a string. */
export type ValidatedRunner = Partial<Record<RunnerField, unknown>>;

/** Stable DOM id per control, so the summary knows where to send the caret. */
export function runnerFieldId(index: number, field: RunnerField): string {
  return `runner-${index}-${field}`;
}

/**
 * The required questions this runner is actually being asked.
 *
 * Shirt size is one of them exactly when the wizard is showing the field —
 * whenever the chosen category includes something to wear, and, while nothing
 * is chosen yet, whenever every option this event sells does. An event that
 * also sells something with nothing to wear leaves the question undecided until
 * a category is picked, so it is not owed yet either.
 */
export function requiredFieldsFor(
  participant: ValidatedRunner,
  event: ValidatedEvent,
): RunnerField[] {
  const chosenId =
    typeof participant.categoryId === "string" ? participant.categoryId : "";

  return FIELD_ORDER.filter(
    (field) =>
      field !== "singletSize" || shouldAskShirtSize(event.categories, chosenId),
  );
}

export function validateRunner(
  participant: ValidatedRunner,
  event: ValidatedEvent,
): RunnerErrors {
  const packages = sellsPackages(event);
  const errors: RunnerErrors = {};

  for (const field of requiredFieldsFor(participant, event)) {
    const value = participant[field];
    if (typeof value === "string" ? value.trim() !== "" : Boolean(value)) {
      continue;
    }

    errors[field] =
      field === "categoryId" && packages
        ? "Select a package"
        : MESSAGES[field];
  }

  for (const field of PHONE_FIELDS) {
    if (errors[field]) continue;
    const message = phoneLengthMessage(field, participant[field]);
    if (message) errors[field] = message;
  }

  return errors;
}

/**
 * True when not one required answer has been given yet, anywhere in the form.
 *
 * Worth distinguishing because the two situations call for opposite copy. A
 * runner part way through wants to know what is left and that their typing
 * survived; a runner who has typed nothing has nothing to reassure, and telling
 * them their work is kept reads as a bug.
 */
export function nothingAnsweredYet(
  participants: readonly ValidatedRunner[],
  errorsPerRunner: RunnerErrors[],
  event: ValidatedEvent,
): boolean {
  return participants.every((participant, index) =>
    requiredFieldsFor(participant, event).every(
      (field) => errorsPerRunner[index]?.[field],
    ),
  );
}

export function validateRunners(
  participants: readonly ValidatedRunner[],
  event: ValidatedEvent,
): RunnerErrors[] {
  return participants.map((p) => validateRunner(p, event));
}

export function hasErrors(errorsPerRunner: RunnerErrors[]): boolean {
  return errorsPerRunner.some((e) => Object.keys(e).length > 0);
}

export type RunnerSummary = {
  /** 1-based, matching the "Runner 1" heading on the block. */
  runner: number;
  index: number;
  /** Short labels, form order. */
  labels: string[];
  /** Where to put the caret for this runner's first gap. */
  firstFieldId: string;
};

/**
 * One line per runner who is missing something — runners who are complete are
 * left out entirely, which is the whole point: a runner who has already picked
 * a category is never told to pick one.
 */
export function summarizeRunners(
  errorsPerRunner: RunnerErrors[],
  event: ValidatedEvent,
): RunnerSummary[] {
  const packages = sellsPackages(event);

  return errorsPerRunner.flatMap((errors, index) => {
    const fields = FIELD_ORDER.filter((f) => errors[f]);
    if (fields.length === 0) return [];

    return [
      {
        runner: index + 1,
        index,
        labels: fields.map((f) =>
          f === "categoryId" && packages ? "Package" : LABELS[f],
        ),
        firstFieldId: runnerFieldId(index, fields[0]),
      },
    ];
  });
}

/**
 * Puts the caret where the work is. Scrolls first because a focused control
 * halfway up the page is no help if the runner cannot see it — and `center`
 * rather than the default so it does not land under the sticky header.
 */
export function focusField(fieldId: string) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // The scroll is animated; focusing immediately would cancel it in some
  // browsers by jumping straight to the element.
  window.setTimeout(() => el.focus({ preventScroll: true }), 300);
}
