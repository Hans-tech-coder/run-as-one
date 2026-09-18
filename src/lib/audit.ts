/**
 * The trail: what somebody did in an organizer's admin, and who.
 *
 * When something goes wrong on a race day the question is "sino ang gumawa
 * nito", and before this the only answer was "the organizer", because every
 * member of a team signed in as the organizer. This module writes the answer
 * down — see STAFF_ACCESS_PLAN.md §4.
 *
 * **Written in the same transaction as the change.** `recordAudit` takes the
 * Prisma transaction client, so the log row and the change commit or fail
 * together: an action that succeeded without its entry is impossible by
 * construction rather than by discipline. The two reads it records (a proof
 * opened, a registrant list exported) and sign-in attempts have no write to
 * ride along with, so they pass the plain client.
 *
 * **Append-only.** Nothing in this app updates or deletes an `AuditLog` row —
 * not the owner, not an admin. A log its subject can rewrite is not
 * evidence. Retention is time-based and belongs to the cron (Batch 5).
 *
 * **The actor is snapshotted.** `actorName` and `actorEmail` are copied at write
 * time, for the same reason `Registration.remarksBy` is a name: a line in a log
 * has to keep reading correctly after the account behind it is gone.
 * `actorId` is kept too, because "everything this person did" needs a key.
 *
 * **What never goes in a row:** the contents of a proof, passwords or hashes,
 * TOTP secrets or recovery codes, and the sensitive runner columns. `changes`
 * names a field and, where it is not sensitive and not long, its old and new
 * value; for a sensitive or long field it records only that it changed. The
 * log must never become a second, less-guarded copy of the registrants table.
 */

import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';

/**
 * Every action the trail knows. A dotted verb, never free text — the activity
 * screen filters on it, and a typo here would be a row nobody can find.
 */
export const AUDIT_ACTIONS = [
  'auth.signed_in',
  'auth.sign_in_failed',
  // Retired with the organizer switcher (ADMIN_MERGE_PLAN.md, Batch 2); kept so
  // rows written before it still carry a label.
  'auth.organizer.switched',
  'staff.invited',
  'staff.invitation.resent',
  'staff.invitation.accepted',
  'staff.access.changed',
  'staff.suspended',
  'staff.reinstated',
  'staff.removed',
  'profile.updated',
  'profile.password.changed',
  // "Sign out other devices" on /admin/settings (SETTINGS_PLAN.md Batch 3).
  'profile.sessions.ended',
  // Retired with the approve / reject screens (ADMIN_MERGE_PLAN.md, Batch 5);
  // kept so decisions recorded before then still carry a label.
  'organizer.approved',
  'organizer.rejected',
  'organizer.suspended',
  'organizer.reinstated',
  // A client submission (ADMIN_MERGE_PLAN.md, Batch 3): invited to sign in as
  // a viewer, the invitation accepted, archived out of the queue, brought back.
  'client.invited',
  'client.invitation.resent',
  'client.invitation.accepted',
  'client.archived',
  'client.restored',
  'event.created',
  'event.updated',
  'event.registration.paused',
  'event.registration.resumed',
  'event.registration.scheduled',
  'event.deleted',
  'results.uploaded',
  'registration.status.changed',
  'registration.remarks.changed',
  'registration.email.sent_by_hand',
  'runner.updated',
  'runner.deleted',
  'proof.viewed',
  'registrants.exported',
  'promo.created',
  'promo.updated',
  'promo.paused',
  'promo.resumed',
  'promo.deleted',
  // Money paid to a race's organizer, or handed back (ADMIN_MERGE_PLAN.md,
  // Batch 6). A remittance is never edited, so voiding is the only correction.
  'remittance.recorded',
  'remittance.voided',
  'remittance.proof.viewed',
  // A site-wide setting staff edit at /admin/settings (lib/site-settings.ts).
  'settings.contact_email.changed',
  'settings.social_links.changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType =
  | 'Event'
  | 'Registration'
  | 'Runner'
  | 'PromoCode'
  | 'RaceResult'
  | 'Organizer'
  | 'Client'
  | 'StaffAccount'
  | 'StaffMembership'
  | 'Remittance'
  | 'SiteSettings';

/** Who did it. An `Actor` from lib/actor.ts is one; SYSTEM is the cron or a webhook. */
export type AuditActor = {
  // Rows written before ADMIN_MERGE_PLAN.md Batch 5 may also say SUPER_ADMIN,
  // the retired account; nothing writes it now (see ACTOR_KIND_LABELS).
  kind: 'OWNER' | 'STAFF' | 'SYSTEM';
  /** Null only for SYSTEM. */
  id: string | null;
  orgId: string;
  name: string;
  email: string | null;
};

/** Written in place of a value that must not, or need not, be kept. */
export const CHANGED = 'changed' as const;

type AuditScalar = string | number | boolean | null;

/** `{ status: ['PENDING', 'PAID'] }`, or `{ birthdate: 'changed' }`. */
export type AuditChanges = Record<string, [AuditScalar, AuditScalar] | typeof CHANGED | AuditScalar>;

export type AuditEntry = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  /** The race it belongs to. Null for what belongs to no single race (profile, promotions). */
  eventId?: string | null;
  /**
   * The tenant the change belongs to, when that is not the actor's own. With
   * one tenant (ADMIN_MERGE_PLAN.md) it always is; the field stays so a write
   * names its trail explicitly where the caller already knows it.
   */
  organizerId?: string;
  /** One sentence, rendered now so the activity screen never reconstructs it. */
  summary: string;
  changes?: AuditChanges | null;
};

/**
 * Runner columns whose values never enter the trail — Data Privacy Act
 * territory. An edit to one records that it changed, never what to.
 */
export const SENSITIVE_RUNNER_FIELDS = [
  'birthdate',
  'emergencyContactName',
  'emergencyContactPhone',
  'medicalConditions',
] as const;

/** A value longer than this is recorded as "changed" rather than copied. */
const MAX_LOGGED_VALUE = 120;
const MAX_SUMMARY = 500;
const MAX_USER_AGENT = 300;
const MAX_IP = 64;

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export async function recordAudit(
  client: AuditClient,
  actor: AuditActor,
  entries: AuditEntry | AuditEntry[],
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;

  const { ip, userAgent } = await requestOrigin();

  await client.auditLog.createMany({
    data: list.map(entry => ({
      organizerId: entry.organizerId ?? actor.orgId,
      eventId: entry.eventId ?? null,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name.trim() || actor.email || 'Unknown',
      actorEmail: actor.email || null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, MAX_SUMMARY),
      ...(entry.changes && Object.keys(entry.changes).length > 0
        ? { changes: entry.changes as Prisma.InputJsonObject }
        : {}),
      ip,
      userAgent,
    })),
  });
}

/**
 * Where the request came from. Outside a request — a script, a test — there
 * are no headers to read, and a trail row without an address is still a row.
 */
async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const incoming = await headers();
    // First hop of x-forwarded-for, as lib/rate-limit.ts reads it: Vercel's
    // proxy is the socket, the caller is the first address it forwarded.
    const forwarded = incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || incoming.get('x-real-ip')?.trim() || null;
    return {
      ip: ip ? ip.slice(0, MAX_IP) : null,
      userAgent: incoming.get('user-agent')?.slice(0, MAX_USER_AGENT) || null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function asScalar(value: unknown): AuditScalar | undefined {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  // Arrays and objects (a waiver's paragraphs, a list of inclusions) are
  // compared but never copied.
  return undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = asScalar(a);
  const right = asScalar(b);
  if (left !== undefined && right !== undefined) return left === right;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Only the fields that changed, between the row as it was and as it is now.
 * A field in `redact`, a value that is not a scalar, and a string too long to
 * be worth copying all record `'changed'` instead of their values.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
  redact: readonly string[] = [],
): AuditChanges {
  const changes: AuditChanges = {};
  for (const field of fields) {
    if (sameValue(before[field], after[field])) continue;
    const was = asScalar(before[field]);
    const now = asScalar(after[field]);
    const copyable =
      !redact.includes(field) &&
      was !== undefined &&
      now !== undefined &&
      !(typeof was === 'string' && was.length > MAX_LOGGED_VALUE) &&
      !(typeof now === 'string' && now.length > MAX_LOGGED_VALUE);
    changes[field] = copyable ? [was, now] : CHANGED;
  }
  return changes;
}

/** "date, location and categories" — the tail of a summary sentence. */
export function listFields(fields: string[]): string {
  if (fields.length <= 1) return fields.join('');
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
}
