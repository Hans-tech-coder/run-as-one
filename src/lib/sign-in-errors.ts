/**
 * Every sentence a refused sign-in can show, keyed by a short code.
 *
 * **A Google sign-in comes back to the sign-in page as `?error=<code>`, never
 * as text.** A sentence in the URL is a sentence anyone can write into a link
 * and have Run As One's sign-in page say; a code that is not in this table
 * shows nothing. The password route answers with the same sentences, looked
 * up here, so the two doors never word one refusal two ways.
 *
 * Kept free of server imports: the sign-in page reads it in the browser.
 */

export const SIGN_IN_ERRORS = {
  not_approved: 'This account is not active. Please contact support.',
  suspended: 'Your account is suspended. Please contact the organizer you work with.',
  no_active_organizer:
    'Your account is not part of an active organizer. Please contact the organizer you work with.',
  // A client's own sign-in whose client was archived: it has no organizer to ask.
  client_inactive: "Your organization's sign-in is not active right now. Please contact Run As One.",
  throttled: 'Too many sign-in attempts. Wait a minute, then try again.',
  google_no_account:
    'No Run As One account uses this Google address. Ask Run As One for an invite.',
  google_other_account:
    'Your Run As One account is linked to a different Google account. Use that one, or sign in with your password.',
  google_invite_pending:
    'Your invitation has not been accepted yet. Open the invitation email and choose a password first.',
  google_unverified:
    'Google has not verified this email address. Sign in with your password instead.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in did not finish. Please try again.',
  google_unavailable: 'Google sign-in is not available right now. Sign in with your password.',
} as const;

export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

/** The sentence for a code from the URL, or null for anything not in the table. */
export function signInErrorMessage(code: unknown): string | null {
  return typeof code === 'string' && Object.hasOwn(SIGN_IN_ERRORS, code)
    ? SIGN_IN_ERRORS[code as SignInErrorCode]
    : null;
}
