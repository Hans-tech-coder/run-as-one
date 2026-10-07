import React from 'react';
import type { Metadata } from 'next';
import { BadgeCheck, CalendarDays, Hourglass, MapPin, Package, ShoppingCart, Shirt, Truck, Users } from 'lucide-react';
import { requireActor } from '@/lib/actor';
import { viewerRaceReport, type KitSplit, type SizeRow } from '@/lib/client-race-report';
import type { ViewerCategorySummary } from '@/lib/client-summary';
import { formatEventDayShort, formatEventInstant } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import AdminNotFound from '../../AdminNotFound';
import DashboardHeader from '../../DashboardHeader';
import { REGISTRATION_STATES } from '../../events/registration-state-badge';
import { Tile } from '../../ViewerDashboard';
import './your-events.css';

export const metadata: Metadata = {
  title: `Race Details | ${SITE_NAME} Admin`,
};

/** Another client's race, a removed one and a made-up id all read alike (§7). */
const RACE_NOT_FOUND = {
  title: 'Race Not Found',
  heading: 'Race not found.',
  body: 'The link may be an old one, or the race is no longer linked to your organization.',
  homeHref: '/admin',
  homeLabel: 'Back to Your Events',
};

/** A category this full or fuller is flagged, so the organizer can ask for more slots in time. */
const ALMOST_FULL = 0.9;

/**
 * One of a client viewer's races (CLIENT_RACE_PAGE_PLAN.md, Batch 1): what an
 * organizer needs to run it — how full each category is, the shirt sizes to
 * order, and how the race kits go out.
 *
 * **Meant for viewers, so it gates on `requireActor()`** and lets
 * `viewerRaceReport` decide: it reads through `reachableEvents` and `can()`
 * with the race's own `clientId`, and answers null for anything this person
 * may not see, which is drawn as the same not-found for every id. Every number
 * is a count (`client-race-report.ts`); there is no money or runner on it.
 *
 * Left out on purpose, after the owner's look at a competitor's portal:
 * withdrawals, a per-order money ledger, promo-code tools, inventory
 * allocation and courier stages. A client cannot act on them here, and a
 * non-technical one would only be asked to make sense of them.
 *
 * Server-rendered, no client state.
 */
export default async function YourRacePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const report = await viewerRaceReport(actor, id);
  if (!report) return <AdminNotFound {...RACE_NOT_FOUND} />;

  const { event, sizes, sizedByCategory, kits } = report;
  const state = REGISTRATION_STATES[event.state];

  return (
    <>
      <DashboardHeader title={event.title} crumbs={[{ label: 'Your Events', href: '/admin' }]} />

      <div className="admin-content race-page">
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

        <div className="metrics-grid">
          <Tile title="Registered Runners" value={event.counts.total} icon={<Users size={20} />} />
          <Tile title="Paid" value={event.counts.paid} icon={<BadgeCheck size={20} />} />
          <Tile title="Awaiting Verification" value={event.counts.awaiting} icon={<Hourglass size={20} />} />
          <Tile title="Unpaid Checkouts" value={event.counts.unpaid} icon={<ShoppingCart size={20} />} />
        </div>

        <Panel title="Slots per Category" hint="Registered runners against each category's limit. Unpaid checkouts hold a slot until they expire.">
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
          title="Shirt Sizes"
          icon={<Shirt size={18} />}
          hint="Paid and awaiting-verification runners only, so the numbers are shirts you will need. Packages with nothing to wear are not counted."
        >
          <SizeSection sizes={sizes} categories={event.categories} sizedByCategory={sizedByCategory} />
        </Panel>

        <Panel title="Race Kits" icon={<Package size={18} />} hint="One kit per registered runner, by how they chose to get it.">
          <KitSection kits={kits} />
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `race-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
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
