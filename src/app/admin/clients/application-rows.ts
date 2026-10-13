import { countryFor, parseE164 } from '@/lib/phone';

/**
 * What one client submission carries to `/admin/clients`, and how its dates,
 * phone and website read back on the list and in ApplicationPanel. Split out
 * of the panel so the list, the panel and its sections share one shape
 * without importing each other.
 */

/** One person invited to sign in for a client — a VIEWER membership. */
export interface ClientViewerRow {
  id: string;
  invitedAt: string;
  acceptedAt: string | null;
  suspendedAt: string | null;
  inviteExpiresAt: string | null;
  staff: { name: string; email: string; status: string };
  /** Two-step sign-in is on — the marker, and the reset beside it. */
  twoFactorOn: boolean;
}

export interface ClientApplicationRow {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  /** When the latest invitation went out; null until Send invite is pressed. */
  invitedAt: string | null;
  orgType: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactRole: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  website: string | null;
  experience: string | null;
  services: string[];
  firstEventName: string | null;
  firstEventDate: string | null;
  firstEventLocation: string | null;
  expectedRunners: string | null;
  applicationNote: string | null;
  viewers: ClientViewerRow[];
}

/** A row of the list: the application and how many races are linked to it. */
export interface ClientRow extends ClientApplicationRow {
  _count: { events: number };
}

/** Manila, like every other date on this site, so a late-night application
 *  does not land on the wrong day. */
export function appliedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Sep 16, 2026, 3:04 PM", in Manila — an invitation is worth the time of
 *  day, because a resend the same afternoon is otherwise indistinguishable. */
export function invitedOn(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "+63 9171234567" — the dial code split off so the number reads at a glance.
 *  A number stored before E.164 comes back as its own digits. */
export function displayPhone(value: string): string {
  const { iso2, national } = parseE164(value);
  if (!iso2) return value;
  return `+${countryFor(iso2).dial} ${national}`;
}

/** Only a web link is ever an href here — the column is written with a scheme
 *  by `normalizeLink`, and this keeps it that way for any older row. */
export function safeWebsite(value: string): string | null {
  return /^https?:\/\//i.test(value) ? value : null;
}
