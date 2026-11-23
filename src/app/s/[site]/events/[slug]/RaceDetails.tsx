import type { ReactNode } from 'react';
import {
  CalendarX2,
  Clock,
  ExternalLink,
  Flag,
  MapPin,
  Package,
  Truck,
} from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { isVirtual } from '@/lib/event-format';
import { formatEventInstant, formatEventTime } from '@/lib/event-schedule';
import { closesLater } from '@/lib/registration-gate';
import { pickupDetails, pickupLabel, PICKUP_FALLBACK } from '@/lib/pickup';
import { venueMapUrl } from '@/lib/venue-map';
import { SITE_NAME } from '@/lib/site-contact';
import SizeChartButton from './SizeChartButton';

/**
 * **What a runner asks the organizer before paying**, answered on the event
 * page: when sign-ups close, when the gun goes, where the venue is, how the
 * race kit is collected, and who is running it. Every one of these used to be a Messenger question, and an
 * unanswered question is a registration that waits — or does not happen.
 *
 * The rule: **only what the event holds.** Each row is a column the organizer
 * filled in; a field the event lacks drops its row — never a placeholder. The one sentence that
 * is not the organizer's is `PICKUP_FALLBACK`, because pickup.ts owns that a
 * pick-up option is never shown with nothing under it.
 *
 * Category and pickup/delivery switches are deliberately **not** listed here:
 * staff make them only as special cases (owner, 2026-11-21), so the public
 * page must not read as an offer of them.
 *
 * Server-only and clock-read at render, like `registrationState`: the page is
 * cached for a minute, which no deadline here is finer than.
 */

export type RaceDetailsEvent = {
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  province: string | null;
  format: string;
  registrationClosesAt: Date | null;
  logisticsPickup: boolean;
  pickupLocation: string | null;
  pickupSchedule: string | null;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
  sizeChartImageUrl: string | null;
  client: { name: string } | null;
};

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="mt-0.5 shrink-0 text-site-accent" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <dt className="text-sm text-site-muted">{label}</dt>
        <dd className="m-0 mt-0.5 font-medium leading-relaxed text-site-ink break-words">{children}</dd>
      </div>
    </div>
  );
}

const ICON = 18;

export function RaceDetails({
  event,
  finished,
  closed,
  now = new Date(),
}: {
  event: RaceDetailsEvent;
  /** The race has been run: what was on offer is history, not a choice. */
  finished: boolean;
  /** Sign-ups are closed (the organizer's Close or a passed closing date). */
  closed: boolean;
  now?: Date;
}) {
  const virtual = isVirtual(event);
  const facts: ReactNode[] = [];

  // A closed race already says so where Register Now stands; repeating the
  // date here would be a second, quieter answer to the same question.
  if (!finished && !closed && event.registrationClosesAt && closesLater(event, now)) {
    facts.push(
      <Fact key="closes" icon={<CalendarX2 size={ICON} />} label="Registration Closes">
        {formatEventInstant(event.registrationClosesAt)}
      </Fact>,
    );
  }

  // A virtual run has no gun: its window is in the hero.
  if (!virtual && (event.startTime || event.endTime)) {
    facts.push(
      <Fact key="start" icon={<Clock size={ICON} />} label={event.startTime ? 'Race Start' : 'Race Ends'}>
        {formatEventTime(event.startTime || event.endTime!)}
        {event.startTime && event.endTime && (
          <span className="block text-sm font-normal text-site-muted">Ends {formatEventTime(event.endTime)}</span>
        )}
      </Fact>,
    );
  }

  const map = venueMapUrl(event);
  if (map) {
    facts.push(
      <Fact key="venue" icon={<MapPin size={ICON} />} label="Venue">
        {event.location.trim()}
        <span className="block">
        <a
          href={map}
          target="_blank"
          rel="noopener noreferrer"
          className="site-link site-link--arrow text-[0.9375rem]"
        >
          <span>Open in Google Maps</span> <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        </span>
      </Fact>,
    );
  }

  // Kept on a closed race, whose runners still collect kits; dropped once it
  // has been run, when a pick-up window is only a date that has gone.
  if (!finished && event.logisticsPickup) {
    const { location, schedule } = pickupDetails(event);
    facts.push(
      <Fact key="pickup" icon={<Package size={ICON} />} label={pickupLabel(event)}>
        {location ?? schedule ?? PICKUP_FALLBACK}
        {location && schedule && (
          <span className="block text-sm font-normal text-site-muted">{schedule}</span>
        )}
      </Fact>,
    );
  }

  // The same two tiers the wizard offers; a tier priced ₱0 is not offered.
  const area = event.province?.trim();
  const tiers = [
    event.logisticsDeliveryFeeInside > 0 &&
      `${area ? `Within ${area}` : 'Inside the province'} +₱${formatPesos(event.logisticsDeliveryFeeInside)}`,
    event.logisticsDeliveryFeeOutside > 0 &&
      `${area ? `Outside ${area}` : 'Outside the province'} +₱${formatPesos(event.logisticsDeliveryFeeOutside)}`,
  ].filter((tier): tier is string => Boolean(tier));
  if (!finished && tiers.length > 0) {
    facts.push(
      <Fact key="delivery" icon={<Truck size={ICON} />} label="Kit Delivery">
        {tiers.map((tier) => (
          <span key={tier} className="block">{tier}</span>
        ))}
      </Fact>,
    );
  }

  // A client hires Run As One to run its race (never "partners"), so the
  // client is the organizer and Run As One is who takes the payment.
  facts.push(
    <Fact key="organizer" icon={<Flag size={ICON} />} label="Organizer">
      {event.client?.name ?? SITE_NAME}
      {event.client && (
        <span className="block text-sm font-normal text-site-muted">Registration and payment by {SITE_NAME}</span>
      )}
    </Fact>,
  );

  return (
    <section className="event-block" aria-labelledby="race-details">
      <h2 id="race-details" className="event-block__title">
        {virtual ? 'Run Details' : 'Race Details'}
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 m-0">{facts}</dl>
      {event.sizeChartImageUrl?.trim() && (
        <div className="mt-4">
          <SizeChartButton imageUrl={event.sizeChartImageUrl.trim()} />
        </div>
      )}
    </section>
  );
}
