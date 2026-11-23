import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import EventImage from '@/components/EventImage';
import { formatEventRange, formatEventWeekdayShort } from '@/lib/event-schedule';
import { VIRTUAL_RUN_WHERE, isVirtual } from '@/lib/event-format';

export type HeroRace = {
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  format?: string;
  virtualEndDate?: string | null;
  /** Where the race's pages live when not on this host (lib/site-client.ts). */
  siteOrigin?: string;
};

/**
 * The front door (the Paper redesign, docs/conventions.md §9).
 *
 * design-taste-frontend's product stage: one head row — what the site is on
 * the left, what a runner does here and the two ways in on the right — and the
 * next race's poster under it, whole, across the content width. The poster is
 * the thing being sold, organizers' banners are wide and carry their own title,
 * so nothing is printed over it and nothing crops it.
 *
 * Every word is a fact the page read: the headline names the provinces the
 * upcoming races are in (`provinces`, most races first), and the line over the
 * poster is that race's own date and place. With nothing upcoming the head
 * row stands alone and says so plainly in the listing below.
 *
 * It enters once on load (`data-enter`, site.css) and never on scroll.
 */
export default function HeroSection({
  provinces,
  nextRace,
}: {
  provinces: string[];
  nextRace: HeroRace | null;
}) {
  const href = nextRace ? `${nextRace.siteOrigin ?? ''}/events/${nextRace.slug}` : null;
  const when = nextRace
    ? isVirtual(nextRace)
      ? formatEventRange(nextRace.date, nextRace.virtualEndDate ?? null)
      : formatEventWeekdayShort(nextRace.date)
    : '';
  const where = nextRace ? (isVirtual(nextRace) ? VIRTUAL_RUN_WHERE : nextRace.location) : '';

  return (
    <section className="site-wrap pt-8 pb-12 sm:pt-12 md:pt-14 md:pb-16" aria-labelledby="home-title">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-8" data-enter>
        <h1 id="home-title" className="site-h1 lg:col-span-7 max-w-[15ch] lg:max-w-none">
          {headline(provinces)}
        </h1>
        <div className="lg:col-span-5 xl:col-start-9 xl:col-span-4">
          <p className="site-lead mb-6">
            Sign up your whole group in one checkout, pick up your race kit or
            have it delivered, and find your official time here after race day.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/events" className="site-btn site-btn--action site-btn--block-sm">
              See Upcoming Races
            </Link>
            <Link href="/results" className="site-btn site-btn--quiet site-btn--block-sm">
              Look Up Results
            </Link>
          </div>
        </div>
      </div>

      {nextRace && href && nextRace.imageUrl.trim() && (
        <div className="mt-10 md:mt-12" data-enter>
          <p className="m-0 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-site-muted">
            <span className="inline-flex items-center gap-2 font-semibold text-site-ink">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-site-action" />
              Next Race
            </span>
            <span>{nextRace.title}</span>
            <span aria-hidden="true">·</span>
            <span>{when}</span>
            <span aria-hidden="true">·</span>
            <span>{where}</span>
          </p>
          <Link
            href={href}
            className="group block overflow-hidden rounded-[14px] bg-site-surface"
            aria-label={`${nextRace.title}, ${when}, ${where}`}
          >
            <EventImage
              src={nextRace.imageUrl}
              alt={`${nextRace.title} poster`}
              // The home page's largest image, on the first screen.
              loading="eager"
              fetchPriority="high"
              className="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              iconSize={56}
            />
          </Link>
          <Link href={href} className="site-link site-link--arrow mt-2">
            <span>See Race Details</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * "Road Races in Tarlac and Pangasinan": the provinces the upcoming races are
 * in, so the headline is true the day it renders and changes by itself when
 * the calendar moves. Two named at most, then "and More".
 */
function headline(provinces: string[]): string {
  if (provinces.length === 0) return 'Road Races and Fun Runs in the Philippines';
  if (provinces.length === 1) return `Road Races and Fun Runs in ${provinces[0]}`;
  if (provinces.length === 2) return `Road Races in ${provinces[0]} and ${provinces[1]}`;
  return `Road Races in ${provinces[0]}, ${provinces[1]} and More`;
}
