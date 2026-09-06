/**
 * The typed signature under the consent waiver, and what counts as a match.
 *
 * The tick box on its own records that *something* was clicked. It does not
 * record who clicked it, and a waiver that cannot name the person who agreed
 * to it is worth less than one that can. So the runner also types their full
 * name, the way they would sign a paper form, and that name is stored beside
 * the tick (`Registration.consentSignature`).
 *
 * **It must match one of the runners on the order, not the first one.** Groups
 * register together constantly — one person fills in five colleagues and pays
 * for all of them — and demanding runner 1's name would stop whoever is
 * actually doing the paperwork from signing their own name. Any runner on the
 * order is a person who is on the order, which is the whole claim the
 * signature makes.
 *
 * Matching is deliberately forgiving about the things that are not the name:
 * case (registrant text is stored uppercase anyway), runs of whitespace, and
 * the full stops and commas people put after a suffix — "DELA CRUZ, JR." and
 * "Dela Cruz Jr" are the same signature. It is not forgiving about the name
 * itself: a partial name, a nickname, or somebody else's name is a mismatch,
 * and the message says so by name rather than failing generically.
 *
 * Both wizards and both checkout routes import from here, because a signature
 * accepted on screen and rejected by the server — or the reverse — is the one
 * outcome that would make this feature worse than the checkbox alone.
 */

/** A runner as far as this rule is concerned. */
export type SignableRunner = {
  firstName?: unknown;
  lastName?: unknown;
};

/**
 * A name reduced to what is actually being compared.
 *
 * Uppercase, punctuation that only ever decorates a suffix dropped, and every
 * run of whitespace collapsed to one space. Everything else survives — a
 * hyphenated surname stays hyphenated, because that hyphen is part of the
 * name rather than typing noise.
 */
export function normalizeSignature(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The two orders a person might sign their own name in. */
function acceptedForms(runner: SignableRunner): string[] {
  const first = normalizeSignature(runner.firstName);
  const last = normalizeSignature(runner.lastName);
  if (!first && !last) return [];
  if (!first) return [last];
  if (!last) return [first];
  // "JUAN DELA CRUZ" and "DELA CRUZ JUAN" are the same person signing. Filipino
  // forms ask for the surname first about as often as they ask for it last, so
  // refusing one of the two orders would reject a correct name on a technicality.
  return [`${first} ${last}`, `${last} ${first}`];
}

/** Whether this signature is one of the runners on the order. */
export function signatureMatchesRunner(
  signature: unknown,
  runners: readonly SignableRunner[]
): boolean {
  const typed = normalizeSignature(signature);
  if (!typed) return false;
  return runners.some(runner => acceptedForms(runner).includes(typed));
}

/** The name of the first runner, as an example to show the runner. */
export function signatureExample(
  runners: readonly SignableRunner[]
): string | null {
  for (const runner of runners) {
    const [full] = acceptedForms(runner);
    if (full) return full;
  }
  return null;
}

/** The label above the box. */
export const SIGNATURE_LABEL = 'Type your full name as your digital signature';

/**
 * The placeholder. A sample rather than an instruction, so it is uppercase —
 * the value is stored uppercase and the hint has to match what will appear in
 * the box (see lib/text-case.ts).
 */
export const SIGNATURE_PLACEHOLDER = 'JUAN DELA CRUZ';

/** Why the box is there, under the box. */
export const SIGNATURE_HINT =
  'Use the name of any runner on this registration, exactly as entered in Step 1.';

/**
 * What is wrong with this signature, or nothing.
 *
 * Two distinct failures with two distinct messages, per the project's rule
 * that validation names what is actually wrong: an empty box is asking for the
 * name, while a filled box that matches nobody has to quote what was typed and
 * say what it is measured against — otherwise the runner retypes the same
 * wrong thing.
 */
export function consentSignatureError(
  signature: unknown,
  runners: readonly SignableRunner[]
): string | undefined {
  const typed = normalizeSignature(signature);
  if (!typed) return 'Type your full name to sign the waiver';

  if (signatureMatchesRunner(typed, runners)) return undefined;

  const example = signatureExample(runners);
  return example
    ? `"${typed}" is not one of the runners on this registration. Sign with a runner's full name — for example, ${example}.`
    : `"${typed}" is not one of the runners on this registration. Sign with the full name of a runner entered in Step 1.`;
}
