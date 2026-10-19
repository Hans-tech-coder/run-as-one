/**
 * **The trail's vocabulary**: what each recorded action is called, which
 * shelf of the Activity filter it sits on, which one reads as a warning, and
 * how a filter value in the URL names a set of actions. Split out of
 * `activity.ts`, which re-exports all of it, so adding a verb no longer costs
 * a read of the whole reading module.
 *
 * Both maps are `Record<AuditAction, …>`, so a verb added to `AUDIT_ACTIONS`
 * without a label and a group here fails the build. Free of Prisma and of
 * `next/headers`, like `activity.ts`: client components import it.
 */

import type { AuditAction } from './audit';

// ── What each action is called ──────────────────────────────────────────────

export const ACTION_LABELS: Record<AuditAction, string> = {
  'auth.signed_in': 'Signed in',
  'auth.sign_in_failed': 'Failed sign-in',
  'auth.organizer.switched': 'Switched organizer',
  'staff.invited': 'Invited a member',
  'staff.invitation.resent': 'Resent an invitation',
  'staff.invitation.accepted': 'Accepted an invitation',
  'staff.access.changed': 'Changed access',
  'staff.suspended': 'Suspended a member',
  'staff.reinstated': 'Reinstated a member',
  'staff.removed': 'Removed a member',
  'profile.updated': 'Updated profile',
  'profile.password.changed': 'Changed password',
  'profile.sessions.ended': 'Signed out other devices',
  'auth.password_reset_requested': 'Asked for a password reset',
  'auth.password_reset': 'Reset password',
  'auth.google_linked': 'Linked Google sign-in',
  'auth.google_unlinked': 'Unlinked Google sign-in',
  'auth.two_factor_enabled': 'Turned on two-step sign-in',
  'auth.two_factor_disabled': 'Turned off two-step sign-in',
  'auth.two_factor_reset': 'Reset two-step sign-in',
  'auth.two_factor_failed': 'Wrong two-step code',
  'auth.recovery_code_used': 'Used a recovery code',
  'auth.recovery_codes_renewed': 'Made new recovery codes',
  'organizer.approved': 'Approved the account',
  'organizer.rejected': 'Rejected the application',
  'organizer.suspended': 'Suspended the account',
  'organizer.reinstated': 'Reinstated the account',
  'client.invited': 'Invited a client',
  'client.invitation.resent': 'Resent a client invitation',
  'client.invitation.accepted': 'Accepted a client invitation',
  'client.archived': 'Archived a client',
  'client.restored': 'Restored a client',
  'client.branding.changed': "Changed a client's site and branding",
  'event.created': 'Created an event',
  'event.updated': 'Edited an event',
  'event.registration.paused': 'Paused sign-ups',
  'event.registration.resumed': 'Resumed sign-ups',
  'event.registration.closed': 'Closed sign-ups',
  'event.registration.reopened': 'Reopened sign-ups',
  'event.registration.scheduled': 'Scheduled sign-ups',
  'event.published': 'Published an event',
  'event.publish.scheduled': 'Scheduled an event to publish',
  'event.unpublished': 'Moved an event back to draft',
  'event.deleted': 'Deleted an event',
  'results.uploaded': 'Uploaded results',
  'results.edited': "Corrected a runner's result",
  'results.added': 'Added a runner to the results',
  'results.deleted': 'Deleted results',
  'registration.status.changed': 'Changed payment status',
  'registration.remarks.changed': 'Changed remarks',
  'registration.email.sent_by_hand': 'Sent an email by hand',
  'registration.followed_up': 'Followed up an unpaid checkout',
  // "copied" in the code, which the trail keeps; the label covers every
  // way a link is made — copied, or an email prepared to send by hand or
  // refused by Resend (Batch 4). An email that went out is a follow-up.
  'registration.payment_link.copied': 'Made a payment link',
  'runner.updated': 'Edited a runner',
  'runner.deleted': 'Removed a runner',
  'category_change.created': 'Opened a category change',
  'category_change.applied': 'Changed a category',
  'category_change.cancelled': 'Cancelled a category change',
  'category_change.refunded': 'Recorded a category change refund',
  'category_change.email.sent_by_hand': 'Sent a category change email by hand',
  'category_change.payment_link.copied': 'Made a category change payment link',
  'category_change.expired': 'A category change expired unpaid',
  'category_change.payment_late': 'Payment for a closed category change',
  'logistics_change.created': 'Opened a delivery switch',
  'logistics_change.applied': 'Switched pickup and delivery',
  'logistics_change.cancelled': 'Cancelled a delivery switch',
  'logistics_change.email.sent_by_hand': 'Sent a delivery switch email by hand',
  'logistics_change.payment_link.copied': 'Made a delivery switch payment link',
  'logistics_change.expired': 'A delivery switch expired unpaid',
  'logistics_change.payment_late': 'Payment for a closed delivery switch',
  'proof.viewed': 'Opened a payment proof',
  'registrants.exported': 'Exported registrants',
  'unpaid_checkouts.exported': 'Exported unpaid checkouts',
  'promo.created': 'Created a promotion',
  'promo.updated': 'Edited a promotion',
  'promo.paused': 'Paused a promotion',
  'promo.resumed': 'Resumed a promotion',
  'promo.deleted': 'Deleted a promotion',
  'pacer.created': 'Added a pacer',
  'pacer.updated': 'Changed a pacer',
  'pacer.fee_waived': "Waived Run As One's admin fee for a pacer",
  'pacer.deleted': 'Removed a pacer',
  'result_pacer.added': 'Marked a finisher as a pacer',
  'result_pacer.updated': "Changed a tagged pacer's pace group",
  'result_pacer.removed': 'Removed a pacer tag',
  'remittance.recorded': 'Recorded a remittance',
  'remittance.voided': 'Voided a remittance',
  'remittance.proof.viewed': 'Opened a remittance receipt',
  'settings.contact_email.changed': 'Changed the admin email',
  'settings.social_links.changed': 'Changed the social links',
  'settings.platform_fee.changed': 'Changed the default platform fee',
};

/** The actions worded as warnings: a refused password, and money that came in too late. */
export function isWarningAction(action: string): boolean {
  // Money that came in for a change or a delivery switch nobody can apply any
  // more: a person has to refund it or reopen the move, so it must not read
  // like routine work.
  return (
    action === 'auth.sign_in_failed' ||
    action === 'category_change.payment_late' ||
    action === 'logistics_change.payment_late'
  );
}

/**
 * The shelves the Activity filter offers before the single verbs. An owner
 * tracing an argument about a payment wants "everything about payments", not
 * to remember that remarks and hand-sent emails are separate verbs.
 *
 * **Personal data** is its own group on purpose: opening a proof and exporting
 * a list are the two ways a runner's data leaves the system without anything
 * changing, which is exactly what a Data Privacy Act review asks for first.
 */
export const ACTIVITY_GROUPS = [
  { key: 'payments', label: 'Payments', hint: 'Status changes, remarks, emails sent by hand, unpaid checkouts followed up and category change refunds' },
  { key: 'runners', label: 'Runners', hint: 'Runner edits, removals and category changes' },
  { key: 'data', label: 'Personal data', hint: 'Payment proofs opened and registrant lists exported' },
  { key: 'events', label: 'Events', hint: 'Events created, edited, paused, scheduled or deleted, and results uploaded or corrected' },
  { key: 'promotions', label: 'Promotions', hint: 'Promotions created, edited, paused or deleted' },
  // Its own shelf rather than a corner of Promotions, because a pacer code is
  // not a promotion — it is a free entry given to a named person — and because
  // the one entry here that is about Run As One's own money (an admin fee
  // waived) must not be lost among a race's campaigns.
  { key: 'pacers', label: 'Pacers', hint: "Pacers added, renamed, marked as sent, paused or removed, and admin fees waived" },
  { key: 'team', label: 'Team', hint: 'Invitations, access changes, suspensions and removals' },
  { key: 'access', label: 'Sign-ins', hint: 'Sign-ins, failed sign-ins, other devices signed out, password resets, Google sign-in linked or unlinked, two-step sign-in turned on, off or reset, and profile or password changes' },
  { key: 'remittances', label: 'Remittances', hint: 'Payouts to organizers and returns recorded or voided, and receipts opened' },
  { key: 'clients', label: 'Clients', hint: 'Submissions invited or archived, and invitations accepted' },
  { key: 'organizers', label: 'Organizer decisions', hint: 'Applications approved or rejected, accounts suspended or reinstated' },
  { key: 'settings', label: 'Site settings', hint: 'The admin email, the social links and the default platform fee' },
] as const;

export type ActivityGroupKey = (typeof ACTIVITY_GROUPS)[number]['key'];

export const ACTION_GROUP: Record<AuditAction, ActivityGroupKey> = {
  'auth.signed_in': 'access',
  'auth.sign_in_failed': 'access',
  'auth.organizer.switched': 'access',
  'profile.updated': 'access',
  'profile.password.changed': 'access',
  'profile.sessions.ended': 'access',
  'auth.password_reset_requested': 'access',
  'auth.password_reset': 'access',
  'auth.google_linked': 'access',
  'auth.google_unlinked': 'access',
  'auth.two_factor_enabled': 'access',
  'auth.two_factor_disabled': 'access',
  'auth.two_factor_reset': 'access',
  'auth.two_factor_failed': 'access',
  'auth.recovery_code_used': 'access',
  'auth.recovery_codes_renewed': 'access',
  'organizer.approved': 'organizers',
  'organizer.rejected': 'organizers',
  'organizer.suspended': 'organizers',
  'organizer.reinstated': 'organizers',
  'client.invited': 'clients',
  'client.invitation.resent': 'clients',
  'client.invitation.accepted': 'clients',
  'client.archived': 'clients',
  'client.restored': 'clients',
  'client.branding.changed': 'clients',
  'staff.invited': 'team',
  'staff.invitation.resent': 'team',
  'staff.invitation.accepted': 'team',
  'staff.access.changed': 'team',
  'staff.suspended': 'team',
  'staff.reinstated': 'team',
  'staff.removed': 'team',
  'event.created': 'events',
  'event.updated': 'events',
  'event.registration.paused': 'events',
  'event.registration.resumed': 'events',
  'event.registration.closed': 'events',
  'event.registration.reopened': 'events',
  'event.registration.scheduled': 'events',
  'event.published': 'events',
  'event.publish.scheduled': 'events',
  'event.unpublished': 'events',
  'event.deleted': 'events',
  'results.uploaded': 'events',
  'results.edited': 'events',
  'results.added': 'events',
  'results.deleted': 'events',
  'registration.status.changed': 'payments',
  'registration.remarks.changed': 'payments',
  'registration.email.sent_by_hand': 'payments',
  'registration.followed_up': 'payments',
  'registration.payment_link.copied': 'payments',
  'runner.updated': 'runners',
  'runner.deleted': 'runners',
  'category_change.created': 'runners',
  'category_change.applied': 'runners',
  'category_change.cancelled': 'runners',
  // Money handed back, so it sits with the other payment work.
  'category_change.refunded': 'payments',
  'category_change.email.sent_by_hand': 'payments',
  'category_change.payment_link.copied': 'payments',
  'category_change.expired': 'runners',
  'category_change.payment_late': 'payments',
  'logistics_change.created': 'runners',
  'logistics_change.applied': 'runners',
  'logistics_change.cancelled': 'runners',
  'logistics_change.email.sent_by_hand': 'payments',
  'logistics_change.payment_link.copied': 'payments',
  'logistics_change.expired': 'runners',
  'logistics_change.payment_late': 'payments',
  'proof.viewed': 'data',
  'registrants.exported': 'data',
  'unpaid_checkouts.exported': 'data',
  'promo.created': 'promotions',
  'promo.updated': 'promotions',
  'promo.paused': 'promotions',
  'promo.resumed': 'promotions',
  'promo.deleted': 'promotions',
  'pacer.created': 'pacers',
  'pacer.updated': 'pacers',
  'pacer.fee_waived': 'pacers',
  'pacer.deleted': 'pacers',
  'result_pacer.added': 'pacers',
  'result_pacer.updated': 'pacers',
  'result_pacer.removed': 'pacers',
  'remittance.recorded': 'remittances',
  'remittance.voided': 'remittances',
  'remittance.proof.viewed': 'remittances',
  'settings.contact_email.changed': 'settings',
  'settings.social_links.changed': 'settings',
  'settings.platform_fee.changed': 'settings',
};

const KNOWN_ACTIONS = Object.keys(ACTION_LABELS) as AuditAction[];

/**
 * Where the trail is read. There used to be two screens — this one and the
 * super admin's `/superadmin/activity` — and a scope telling them apart. With
 * one dashboard (ADMIN_MERGE_PLAN.md, Batch 2) Run As One's staff decide
 * organizer applications inside Run As One's own tenant, so those decisions
 * land in the same trail as everything else and the Activity filter offers
 * every shelf in `ACTIVITY_GROUPS`. A decision is still never written into the
 * applicant's trail: the applicant is a different Organizer row.
 */
export const ACTIVITY_PATH = '/admin/activity';

export function asAuditAction(value: unknown): AuditAction | null {
  return typeof value === 'string' && (KNOWN_ACTIONS as string[]).includes(value)
    ? (value as AuditAction)
    : null;
}

/** A row's label, tolerating a verb written by a newer deploy than this one. */
export function actionLabel(action: string): string {
  return asAuditAction(action) ? ACTION_LABELS[action as AuditAction] : action;
}

export function actionGroupLabel(action: string): string | null {
  const known = asAuditAction(action);
  if (!known) return null;
  return ACTIVITY_GROUPS.find(group => group.key === ACTION_GROUP[known])?.label ?? null;
}

/** Every verb on one shelf. */
export function actionsInGroup(key: ActivityGroupKey): AuditAction[] {
  return KNOWN_ACTIONS.filter(action => ACTION_GROUP[action] === key);
}

const GROUP_PREFIX = 'group:';

export function groupFilterValue(key: ActivityGroupKey): string {
  return `${GROUP_PREFIX}${key}`;
}

/** The verbs an Activity filter value stands for, or null for no filter. */
export function actionsForFilter(value: string): AuditAction[] | null {
  if (!value) return null;
  if (value.startsWith(GROUP_PREFIX)) {
    const key = value.slice(GROUP_PREFIX.length);
    const group = ACTIVITY_GROUPS.find(candidate => candidate.key === key);
    return group ? actionsInGroup(group.key) : null;
  }
  const action = asAuditAction(value);
  return action ? [action] : null;
}
