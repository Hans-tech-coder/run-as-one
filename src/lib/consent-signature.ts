/**
 * The typed signature under the consent waiver, and what counts as one.
 *
 * The tick box on its own records that *something* was clicked. It does not
 * record who clicked it, and a waiver that cannot name the person who agreed
 * to it is worth less than one that can. So the runner also types their name,
 * the way they would sign a paper form, and that name is stored beside the
 * tick (`Registration.consentSignature`).
 *
 * **Whatever they type is accepted.** The box used to demand a match against
 * one of the runners on the order, and that was the wrong trade: the people
 * filling this in are not all technical, they sign with a middle initial, a
 * married name, a nickname, or a Ñ their keyboard renders differently, and
 * every one of those got them stopped at the last step of a form they had
 * already paid attention to. A signature that blocks the honest majority to
 * inconvenience nobody is not protecting the waiver. The only thing still
 * required is that the box is not blank — an empty box is not a signature,
 * and there would be nothing to store.
 *
 * Both wizards and both checkout routes import from here, because a signature
 * accepted on screen and rejected by the server — or the reverse — is the one
 * outcome that would make this feature worse than the checkbox alone.
 */

/**
 * A signature reduced to what is actually stored.
 *
 * Every run of whitespace collapsed to one space, and the ends trimmed, so a
 * box holding nothing but spaces is recognised as empty. Nothing else is
 * touched: the name is the runner's to write.
 */
export function normalizeSignature(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
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
  'Type your name the way you would sign it. This stands as your signature on the waiver above.';

/**
 * What is wrong with this signature, or nothing.
 *
 * One failure is left, and it names itself: the box is empty. Anything typed
 * is a signature.
 */
export function consentSignatureError(signature: unknown): string | undefined {
  if (!normalizeSignature(signature)) {
    return 'Type your full name to sign the waiver';
  }
  return undefined;
}
