import Link from 'next/link';
import { ArrowRight, CalendarClock, Lock, PauseCircle, Users } from 'lucide-react';
import CategoryPrice from '@/components/CategoryPrice';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { sellsPackages } from '@/lib/event-type';
import { formatEventInstant } from '@/lib/event-schedule';
import { registerPath, resultsPath } from '@/lib/event-slug';
import {
  EVENT_FULL_MESSAGE,
  closedMessage,
  closesSoon,
  openingNote,
  pauseNote,
  type registrationState,
} from '@/lib/registration-gate';
import type { CategorySalePrice } from '@/lib/discount';
import { RaceIsOver, RegistrationOnHold } from './ClosedSidebarPanels';
import ClosingCountdown from './ClosingCountdown';

type SidebarEvent = Parameters<typeof registerPath>[0] &
  Parameters<typeof resultsPath>[0] &
  Parameters<typeof RaceIsOver>[0]['event'] &
  Parameters<typeof closedMessage>[0] &
  Parameters<typeof pauseNote>[0] &
  Parameters<typeof openingNote>[0] &
  Parameters<typeof closesSoon>[0] &
  Parameters<typeof sellsPackages>[0] & { registrationClosesAt: Date | null };

type SidebarCategory = {
  id: string;
  name: string;
  slug?: string | null;
  distance: string | null;
  price: number;
  isFull: boolean;
  isLastCall: boolean;
  slotsLeft: number | null;
};

/**
 * The event page's decision column: every option with its price, and the one
 * thing to do about them — Register, or why that is not possible today.
 * Split out of EventDetails.tsx, where it was half the file (AGENTS.md: split
 * before you edit), when the page moved to the Paper look.
 *
 * Beside the poster on a wide screen and straight under it on a phone, so the
 * price and the button are on the first screen either way. It sticks under
 * the navbar while the details scroll past it.
 */
export function EventSidebar({
  event,
  categories,
  state,
  finished,
  resultsCount,
  salePrices,
}: {
  event: SidebarEvent;
  categories: SidebarCategory[];
  state: ReturnType<typeof registrationState>;
  finished: boolean;
  resultsCount: number;
  salePrices: Map<string, CategorySalePrice>;
}) {
  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-offset)+1.5rem)]">
      <div className="rounded-[14px] border border-site-line bg-site-card p-5 sm:p-6">
        <h2 className="site-h3 mb-4">{sellsPackages(event) ? 'Packages' : 'Distances and Fees'}</h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {categories.map((cat) => {
            // A row is a way in whenever Register would be: the race is open
            // and this option still has room. A full row, or any row while the
            // race is paused, full or over, stays plain text — a link the
            // wizard would only turn away is a dead end dressed up as a button.
            const bookable = state === 'OPEN' && !cat.isFull;
            const body = (
              <>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className={`break-words text-base font-semibold leading-snug ${cat.isFull ? 'text-site-muted' : 'text-site-ink'}`}>
                    {cat.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {/* Packages have no distance; an empty chip is worse than none. */}
                    {cat.distance && <span className="site-chip">{cat.distance}</span>}
                    {/* A full 10K says nothing about the 5K beside it, so it is
                        this row that carries the news. */}
                    {cat.isFull && <span className="site-chip">Full</span>}
                    {cat.isLastCall && (
                      <span className="site-chip text-site-accent">
                        {cat.slotsLeft} Slot{cat.slotsLeft === 1 ? '' : 's'} Left
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <CategoryPrice
                    price={cat.price}
                    sale={salePrices.get(cat.id)}
                    dimmed={cat.isFull}
                    stacked
                    className={`shrink-0 text-lg font-semibold tabular-nums ${cat.isFull ? 'text-site-muted' : 'text-site-ink'}`}
                  />
                  {/* It turns into the runner while the wizard loads, like
                      every other call to action here. */}
                  {bookable && (
                    <LinkPendingIcon className="text-site-muted transition-colors group-hover:text-site-accent">
                      <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                    </LinkPendingIcon>
                  )}
                </span>
              </>
            );

            return (
              <li key={cat.id}>
                {bookable ? (
                  // Opens the wizard with this option already chosen for the
                  // first runner — see registerPath.
                  <Link href={registerPath(event, cat)} className={CATEGORY_ROW(false, true)}>
                    <span className="sr-only">Register for </span>
                    {body}
                  </Link>
                ) : (
                  <div className={CATEGORY_ROW(cat.isFull, false)}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {finished ? (
        <RaceIsOver event={event} />
      ) : state === 'CLOSED' ? (
        <RegistrationOnHold icon={<Lock size={20} />} heading="Registration Closed" message={closedMessage(event)} />
      ) : state === 'PAUSED' ? (
        <RegistrationOnHold icon={<PauseCircle size={20} />} heading="Registration Paused" message={pauseNote(event)} />
      ) : state === 'SCHEDULED' ? (
        /* The race is real and listed; it just has not opened yet. The panel
           carries the date instead of a button, because the date is the whole
           of what this visitor came to find out — see openingNote. */
        <RegistrationOnHold icon={<CalendarClock size={20} />} heading="Registration Opens Soon" message={openingNote(event)} />
      ) : state === 'FULL' ? (
        <RegistrationOnHold icon={<Users size={20} />} heading="Every Option Is Full" message={EVENT_FULL_MESSAGE} />
      ) : (
        <>
          {/* A deadline days away is the reason to finish today, so it stands
              with the button it is a reason to press. */}
          {event.registrationClosesAt && closesSoon(event) && (
            <ClosingCountdown
              closesAt={event.registrationClosesAt.toISOString()}
              when={formatEventInstant(event.registrationClosesAt)}
            />
          )}
          <Link href={registerPath(event)} className="site-btn site-btn--action group w-full min-h-[52px] text-[1.0625rem]">
            Register Now
            <LinkPendingIcon>
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </LinkPendingIcon>
          </Link>
          {resultsCount > 0 && (
            <Link href={resultsPath(event)} className="site-btn site-btn--quiet w-full">
              See Results
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One row of the options list, dimmed once that option has sold out. Only a
 * `bookable` row — a link into the wizard — answers the pointer; a row that
 * cannot be pressed must not look as though it can.
 */
function CATEGORY_ROW(isFull: boolean, bookable: boolean) {
  const base =
    'group flex items-center justify-between gap-3 rounded-[10px] border border-site-line bg-site-bg px-4 py-3.5 transition-colors';
  if (isFull) return `${base} opacity-70`;
  if (!bookable) return base;
  return `${base} no-underline hover:border-site-ink`;
}
