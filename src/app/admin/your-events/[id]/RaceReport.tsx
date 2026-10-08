import React from 'react';
import { BadgeCheck, CalendarDays, ClipboardList, Wallet, Hourglass, MapPin, Package, ShoppingCart, Shirt, TrendingUp, Truck, Users } from 'lucide-react';
import type { ClientPayout } from '@/lib/client-payout';
import type { ClientRunnerRow } from '@/lib/client-runners';
import type { KitSplit, SizeRow, ViewerRaceReport } from '@/lib/client-race-report';
import type { ViewerCategorySummary } from '@/lib/client-summary';
import { formatEventDayShort, formatEventInstant } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import { REGISTRATION_STATES } from '../../events/registration-state-badge';
import { PrintHead, SavePdfButton, SavePdfPanel } from '../../PrintableCopy';
import { Tile } from '../../ViewerDashboard';
import PayoutSummary from './PayoutSummary';
import RegistrationTrend from './RegistrationTrend';
import RunnerList from './RunnerList';

/** A category this full or fuller is flagged, so the organizer can ask for more slots in time. */
const ALMOST_FULL = 0.9;

/**
 * The race page's sections, once for the screen and once for the printer
 * (`PrintableCopy`). `printedOn` marks the print render: it adds a title
 * block naming the race, so a PDF sent to a shirt supplier explains itself,
 * and leaves out what only works on screen — Save as PDF itself among them. `idPrefix` keeps the two
 * renders' ids apart.
 *
 * `payout` is passed to the screen copy only, and only when the viewer may see
 * it (`client-payout.ts`): the paper copy is for a shirt supplier, so the
 * money never prints, whatever is passed. `runners` is the same: screen only,
 * when the viewer may see it (`client-runners.ts`), since a supplier has no
 * business with runners' names, phones or addresses.
 */
export default function RaceReport({
  report,
  idPrefix,
  printedOn,
  payout,
  runners,
}: {
  report: ViewerRaceReport;
  idPrefix: string;
  printedOn?: string;
  payout?: ClientPayout | null;
  runners?: ClientRunnerRow[] | null;
}) {
  const { event, sizes, sizedByCategory, kits, trend } = report;
  const state = REGISTRATION_STATES[event.state];
  const printed = printedOn !== undefined;
  const panel = { idPrefix };

  return (
    <div className="race-page">
      {printed && (
        <PrintHead id={`${idPrefix}race-title`} title={event.title} line={`Race report · ${SITE_NAME} · ${printedOn}`} />
      )}

      {/* The page's one action, never in the dashboard header: from a tablet
          up at the end of the race's own line, secondary to the numbers; on a
          phone, where it would push the tiles down, it closes the page
          instead, as on the certificate guide (`.race-save-end`). */}
      <div className="race-toolbar">
        <p className="race-meta">
          <span className={`status-badge ${state.tone} whitespace-nowrap`}>{state.label}</span>
          {event.state === 'SCHEDULED' && event.registrationOpensAt && (
            <span>Opens {formatEventInstant(event.registrationOpensAt)}</span>
          )}
          <span className="race-meta-item">
            <CalendarDays size={14} aria-hidden="true" />
            {formatEventDayShort(event.date)}
          </span>
          {event.location && (
            <span className="race-meta-item">
              <MapPin size={14} aria-hidden="true" />
              {event.location}
            </span>
          )}
        </p>
        {!printed && <SavePdfButton />}
      </div>

      <div className="metrics-grid">
        <Tile title="Registered Runners" value={event.counts.total} icon={<Users size={20} />} />
        <Tile title="Paid" value={event.counts.paid} icon={<BadgeCheck size={20} />} />
        <Tile title="Awaiting Verification" value={event.counts.awaiting} icon={<Hourglass size={20} />} />
        <Tile title="Unpaid Checkouts" value={event.counts.unpaid} icon={<ShoppingCart size={20} />} />
      </div>

      <Panel {...panel} title="Slots per Category" hint="Registered runners against each category's limit. Unpaid checkouts hold a slot until they expire.">
        {event.categories.length === 0 ? (
          <p className="race-empty">This race has no categories yet.</p>
        ) : (
          <ul className="race-slot-list">
            {event.categories.map(category => (
              <SlotRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        {...panel}
        title="Registrations over Time"
        icon={<TrendingUp size={18} />}
        hint="Paid and awaiting-verification runners, by the day they signed up."
      >
        <RegistrationTrend trend={trend} printed={printed} />
      </Panel>

      <Panel
        {...panel}
        title="Shirt Sizes"
        icon={<Shirt size={18} />}
        hint="Paid and awaiting-verification runners only, so the numbers are shirts you will need. Packages with nothing to wear are not counted."
      >
        <SizeSection sizes={sizes} categories={event.categories} sizedByCategory={sizedByCategory} />
      </Panel>

      <Panel {...panel} title="Race Kits" icon={<Package size={18} />} hint="One kit per registered runner, by how they chose to get it.">
        <KitSection kits={kits} />
      </Panel>

      {!printed && payout && (
        <Panel
          {...panel}
          title="Payout Summary"
          icon={<Wallet size={18} />}
          hint="Confirmed payments only: a bank transfer counts once it is verified. Not included in Save as PDF."
        >
          <PayoutSummary payout={payout} />
        </Panel>
      )}

      {!printed && runners && (
        <Panel
          {...panel}
          title="Runners"
          icon={<ClipboardList size={18} />}
          hint="Paid and awaiting-verification runners, with what you need to release and ship their kits. Mark runners to export only those. Not included in Save as PDF."
        >
          <RunnerList rows={runners} eventId={event.id} raceTitle={event.title} />
        </Panel>
      )}

      {!printed && (
        <div className="race-save-end">
          <SavePdfPanel id={`${idPrefix}race-save-title`} title="Sending this to your supplier or team?" />
        </div>
      )}
    </div>
  );
}

function Panel({
  idPrefix,
  title,
  hint,
  icon,
  children,
}: {
  idPrefix: string;
  title: string;
  hint: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `${idPrefix}race-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section className="admin-panel race-panel" aria-labelledby={id}>
      <div className="race-panel-head">
        <h2 id={id} className="admin-panel-title race-panel-title">
          {icon && <span aria-hidden="true">{icon}</span>}
          {title}
        </h2>
        <p className="race-panel-hint">{hint}</p>
      </div>
      <div className="race-panel-body">{children}</div>
    </section>
  );
}

function SlotRow({ category }: { category: ViewerCategorySummary }) {
  // Taken slots include unpaid checkouts, which hold theirs until the sweep
  // expires them — the same count that closes a category on the public page.
  const taken = category.total + category.unpaid;
  const limit = category.slotLimit;
  const fill = limit ? Math.min(taken / limit, 1) : 0;
  const left = limit ? Math.max(limit - taken, 0) : null;
  const flag = limit === null ? null : left === 0 ? 'full' : fill >= ALMOST_FULL ? 'almost' : null;

  return (
    <li className="race-slot">
      <div className="race-slot-top">
        <span className="race-slot-name">
          {category.name}
          {category.distance ? ` (${category.distance})` : ''}
        </span>
        {flag === 'full' && <span className="status-badge danger whitespace-nowrap">Full</span>}
        {flag === 'almost' && <span className="status-badge pending whitespace-nowrap">Almost full</span>}
      </div>
      {limit !== null && (
        <div className={`race-slot-bar ${flag ? `is-${flag}` : ''}`} aria-hidden="true">
          <span style={{ width: `${fill * 100}%` }} />
        </div>
      )}
      <p className="race-slot-numbers">
        <span className="race-slot-count">{category.total.toLocaleString('en-US')} registered</span>
        <span>
          {limit === null
            ? 'No slot limit'
            : `${left!.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} slots left`}
        </span>
        <span className="race-slot-split">
          {category.paid.toLocaleString('en-US')} paid · {category.awaiting.toLocaleString('en-US')} awaiting
          {category.unpaid > 0 && ` · ${category.unpaid.toLocaleString('en-US')} unpaid`}
        </span>
      </p>
    </li>
  );
}

function SizeSection({
  sizes,
  categories,
  sizedByCategory,
}: {
  sizes: SizeRow[];
  categories: ViewerCategorySummary[];
  sizedByCategory: Record<string, number>;
}) {
  if (sizes.length === 0) {
    return <p className="race-empty">No shirt sizes yet. They appear here as runners register.</p>;
  }
  const total = sizes.reduce((sum, row) => sum + row.total, 0);
  const sized = categories.filter(category => (sizedByCategory[category.id] ?? 0) > 0);

  return (
    <>
      <h3 className="race-sub">All categories · {total.toLocaleString('en-US')} shirts</h3>
      <SizeChips counts={sizes.map(row => [row.size, row.total])} />

      {/* Per category only when there is more than one to tell apart. */}
      {sized.length > 1 &&
        sized.map(category => (
          <div key={category.id} className="race-size-group">
            <h3 className="race-sub">
              {category.name}
              {category.distance ? ` (${category.distance})` : ''} ·{' '}
              {(sizedByCategory[category.id] ?? 0).toLocaleString('en-US')} shirts
            </h3>
            <SizeChips
              counts={sizes
                .filter(row => row.byCategory[category.id])
                .map(row => [row.size, row.byCategory[category.id]])}
            />
          </div>
        ))}
    </>
  );
}

/** Sizes as a wrapping row of tiles, so a phone gets every size without a sideways scroll. */
function SizeChips({ counts }: { counts: [string, number][] }) {
  return (
    <ul className="race-size-chips">
      {counts.map(([size, count]) => (
        <li key={size} className="race-size-chip">
          <span className="race-size-label">{size}</span>
          <span className="race-size-count">{count.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  );
}

function KitSection({ kits }: { kits: KitSplit }) {
  const delivered = kits.delivery.reduce((sum, row) => sum + row.count, 0);
  if (kits.pickup + delivered === 0) {
    return <p className="race-empty">No race kits yet. They appear here as runners register.</p>;
  }
  return (
    <ul className="race-kit-list">
      <li className="race-kit">
        <span className="race-kit-icon" aria-hidden="true">
          <Package size={20} />
        </span>
        <span className="race-kit-main">
          <span className="race-kit-label">Pickup</span>
          <span className="race-kit-meta">{kits.pickupWhere}</span>
        </span>
        <span className="race-kit-count">{kits.pickup.toLocaleString('en-US')}</span>
      </li>
      {kits.delivery.map(row => (
        <li key={row.label} className="race-kit">
          <span className="race-kit-icon" aria-hidden="true">
            <Truck size={20} />
          </span>
          <span className="race-kit-main">
            <span className="race-kit-label">{row.label}</span>
            <span className="race-kit-meta">Shipped to the runner&apos;s address</span>
          </span>
          <span className="race-kit-count">{row.count.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  );
}
