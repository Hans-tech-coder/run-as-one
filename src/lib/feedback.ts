/**
 * What a piece of feedback is, and what the app will accept as one.
 *
 * Four surfaces have to agree about this: the public form a runner fills in,
 * the API route that stores it, the superadmin inbox that reads it back, and
 * the filter chips above that inbox. Putting the vocabulary and the limits here
 * means a kind added later shows up in all four rather than in whichever one
 * somebody remembered.
 *
 * The `kind` a sender picks is the one thing the form asks for that is not free
 * text, and it earns its place: "it is broken" and "it would be nice if" need
 * different urgency from whoever reads the inbox, and asking is cheaper and far
 * more accurate than guessing from the prose.
 */

/** The three things a person opens this form to say. */
export const FEEDBACK_KINDS = ['ISSUE', 'SUGGESTION', 'FEATURE'] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * How each kind is put to the person choosing it.
 *
 * Written in the sender's own voice rather than ours — "Something's Broken",
 * not "Defect Report" — because the form is shown to a runner who has just
 * finished a checkout, not to somebody filing a ticket.
 */
export const FEEDBACK_KIND_COPY: Record<
  FeedbackKind,
  { label: string; blurb: string; placeholder: string }
> = {
  ISSUE: {
    label: "Something's Broken",
    blurb: 'A page, a button or a payment that did not work',
    placeholder:
      'What were you doing, and what happened instead? The page you were on and the device you used help us find it faster.',
  },
  SUGGESTION: {
    label: 'A Suggestion',
    blurb: 'Something that works, but could work better',
    placeholder:
      'What felt slow, confusing or harder than it needed to be? Tell us where you ran into it.',
  },
  FEATURE: {
    label: 'A Feature Request',
    blurb: 'Something you wish this app could do',
    placeholder:
      'What would you like to be able to do here, and what would you use it for?',
  },
};

/** The sender's kind, or null when it is not one we offer. */
export function asFeedbackKind(value: unknown): FeedbackKind | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (FEEDBACK_KINDS as readonly string[]).includes(upper)
    ? (upper as FeedbackKind)
    : null;
}

/** What the inbox calls a kind. Falls back to the stored text rather than to
 *  nothing, so a row written before a kind was renamed still reads as itself. */
export function feedbackKindLabel(kind: string): string {
  const known = asFeedbackKind(kind);
  return known ? FEEDBACK_KIND_COPY[known].label : kind;
}

/** Two states, which is a queue rather than a workflow — see the schema note. */
export const FEEDBACK_STATUSES = ['NEW', 'REVIEWED'] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function asFeedbackStatus(value: unknown): FeedbackStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (FEEDBACK_STATUSES as readonly string[]).includes(upper)
    ? (upper as FeedbackStatus)
    : null;
}

/**
 * The limits, named once.
 *
 * The message floor is twenty characters rather than one: a form that accepts
 * "bad" fills the inbox with rows nobody can act on, and the counter under the
 * box tells the sender where they stand before they press anything. The ceiling
 * is generous — somebody describing a checkout that failed should not be cut
 * off mid-sentence — and it is what keeps a row's storage bounded.
 */
export const MIN_FEEDBACK_MESSAGE = 20;
export const MAX_FEEDBACK_MESSAGE = 2_000;
export const MAX_FEEDBACK_NAME = 80;
export const MAX_FEEDBACK_EMAIL = 120;

/** Only as much of the browser string as is worth keeping. Real user agents
 *  run to ~140 characters; anything past this is padding or an attempt. */
export const MAX_FEEDBACK_USER_AGENT = 300;

/** A same-site path, or null. The `from` that names the page a sender came
 *  from arrives in a query string, so it is untrusted text: a protocol-relative
 *  `//evil.example` is a URL a browser would follow, and only a single leading
 *  slash makes this one of our own pages. */
export function asSitePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

/**
 * Whether an address is worth writing down.
 *
 * Deliberately shallow. The email is optional and is only ever used by a person
 * clicking Reply, so the cost of accepting a typo is one bounced message, while
 * the cost of a clever regex rejecting a valid address is a report we never
 * receive. It checks the shape and nothing else.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** What the reader sees where a sender left their name blank. */
export const ANONYMOUS_SENDER = 'Anonymous';
