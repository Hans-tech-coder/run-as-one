import React from 'react';
import type { RegistrationTrend as Trend, TrendBar } from '@/lib/client-race-report';
import { formatEventDayShort } from '@/lib/event-schedule';
import './registration-trend.css';

/**
 * Registrations over time (CLIENT_RACE_PAGE_PLAN.md, Batch 2): a bar per day
 * since the first order — per week once that would be slivers — over two plain
 * figures an organizer actually asks about: the last seven days, and the
 * busiest day.
 *
 * **Bars only, one axis.** The plan left a cumulative line optional; it would
 * need a second scale on the same plot, and the Registered tile above already
 * is the running total.
 *
 * HTML and CSS, no chart library and no client state: a bar's column is its
 * hover target, taller than the bar, and shows the day and count. The numbers
 * are also listed under *Show the numbers*, so nothing is hover-only, and the
 * plot is one image to a screen reader with a sentence for its alt text. That
 * list is a grid of day chips, not a one-row-per-day table: it fills the
 * panel's width, so two months of days stay a few lines tall. On paper it is
 * always open: a printed bar has no hover, so the chips are its numbers.
 */
export default function RegistrationTrend({ trend, printed }: { trend: Trend; printed: boolean }) {
  const { bars, daysPerBar, lastSevenDays, busiest } = trend;
  if (!busiest) {
    return <p className="race-empty">No registrations yet. Each day&apos;s count appears here as runners register.</p>;
  }

  const peak = Math.max(...bars.map(bar => bar.count));
  const top = axisTop(peak);
  const weekly = daysPerBar === 7;
  const label = (bar: TrendBar) => (weekly ? `Week of ${shortDay(bar.day)}` : shortDay(bar.day));
  const runners = (count: number) => `${count.toLocaleString('en-US')} ${count === 1 ? 'runner' : 'runners'}`;
  const days = (
    <dl className="race-trend-days">
      {bars
        .filter(bar => bar.count > 0)
        .map(bar => (
          <div key={bar.day} className="race-trend-day">
            <dt>{label(bar)}</dt>
            <dd>{bar.count.toLocaleString('en-US')}</dd>
          </div>
        ))}
    </dl>
  );

  return (
    <div className="race-trend">
      <dl className="race-trend-stats">
        <div>
          <dt>Last 7 days</dt>
          <dd>{runners(lastSevenDays)}</dd>
        </div>
        <div>
          <dt>Busiest day</dt>
          <dd>
            {shortDay(busiest.day)} · {runners(busiest.count)}
          </dd>
        </div>
      </dl>

      <div
        className="race-trend-plot"
        role="img"
        aria-label={`Registrations ${weekly ? 'per week' : 'per day'} from ${shortDay(bars[0].day)} to ${shortDay(
          bars[bars.length - 1].day,
        )}. Busiest day ${shortDay(busiest.day)} with ${runners(busiest.count)}.`}
      >
        <div className="race-trend-y" aria-hidden="true">
          <span>{top.toLocaleString('en-US')}</span>
          <span>{(top / 2).toLocaleString('en-US')}</span>
          <span>0</span>
        </div>
        <ol className="race-trend-bars" aria-hidden="true">
          {bars.map((bar, index) => (
            <li
              key={bar.day}
              className={`race-trend-bar${index >= bars.length / 2 ? ' is-late' : ''}`}
              style={{ '--bar': `${(bar.count / top) * 100}%` } as React.CSSProperties}
            >
              <span className="race-trend-fill" />
              <span className="race-trend-tip">
                {label(bar)} · {runners(bar.count)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="race-trend-x" aria-hidden="true">
        <span>{label(bars[0])}</span>
        {bars.length > 1 && <span>{label(bars[bars.length - 1])}</span>}
      </p>
      {weekly && <p className="race-trend-note">Each bar is one week.</p>}

      {printed ? (
        <div className="race-trend-table">
          <p className="race-trend-days-title">Runners {weekly ? 'per week' : 'per day'}</p>
          {days}
        </div>
      ) : (
        <details className="race-trend-table">
          <summary>Show the numbers</summary>
          {days}
        </details>
      )}
    </div>
  );
}

/** "Sep 3": the chart spans weeks, not years, so the year is noise here. */
function shortDay(day: string): string {
  return formatEventDayShort(day).replace(/,\s*\d{4}$/, '');
}

/**
 * The axis top: twice a round step at or above half the peak, so the middle
 * gridline is a whole number too and the tallest bar fills most of the plot.
 */
function axisTop(peak: number): number {
  const half = Math.max(peak / 2, 1);
  const magnitude = 10 ** Math.floor(Math.log10(half));
  const step = [1, 2, 3, 4, 5, 6, 8, 10].find(n => n * magnitude >= half)! * magnitude;
  return step * 2;
}
