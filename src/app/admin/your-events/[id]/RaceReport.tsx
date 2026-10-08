import React from 'react';
import { BadgeCheck, CalendarDays, ClipboardList, EyeOff, Wallet, Hourglass, MapPin, Package, ShoppingCart, Shirt, TrendingUp, Truck, Users } from 'lucide-react';
import type { ClientPayout } from '@/lib/client-payout';
import type { ClientRunnerRow } from '@/lib/client-runners';
import type { GarmentRow, KitSplit, ViewerRaceReport } from '@/lib/client-race-report';
import type { GarmentType } from '@/lib/shirt-size';
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

/** Names the report, not the page: the page also shows payouts and runners, which never print. */
const SAVE_LABEL = 'Save report as PDF';

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
 *
 * **The page says which part is the PDF.** An organizer looking at six panels
 * and one Save button reads it as "save all this", so the action is named for
 * the report ("Save report as PDF"), the phone's copy of it sits where the
 * printed sections end rather than at the foot under the runners, and the
 * two screen-only panels sit under their own "Not in the PDF" heading.
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
  const { event, garments, kits, trend } = report;
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
          phone, where it would push the tiles down, it closes the printed
          sections instead (`.race-save-end`). */}
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
        {!printed && <SavePdfButton label={SAVE_LABEL} />}
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
        hint="Pieces to order: one of every singlet or shirt a runner's category includes, for paid and awaiting-verification runners. Each runner gives one size for all of them. Packages with nothing to wear are not counted."
      >
        <SizeSection garments={garments} categories={event.categories} />
      </Panel>

      <Panel {...panel} title="Race Kits" icon={<Package size={18} />} hint="One kit per registered runner, by how they chose to get it.">
        <KitSection kits={kits} />
      </Panel>

      {/* On a phone the action comes right after the last printed section, so
          what it saves is what the organizer has just scrolled past. */}
      {!printed && (
        <div className="race-save-end">
          <SavePdfPanel
            id={`${idPrefix}race-save-title`}
            title="Sending this to your supplier or team?"
            note="The PDF has the race report above: the runner counts, slots per category, registrations over time, shirt sizes and race kits."
            label={SAVE_LABEL}
          />
        </div>
      )}

      {!printed && (payout || runners) && (
        <section className="race-screen-only" aria-labelledby={`${idPrefix}race-screen-only`}>
          <div className="race-screen-only-head">
            <h2 id={`${idPrefix}race-screen-only`} className="race-screen-only-title">
              <EyeOff size={16} aria-hidden="true" />
              Not in the PDF
            </h2>
            <p className="race-screen-only-hint">
              {payout && runners
                ? 'Your payouts and runner list stay on this screen. To share runners, use Export to CSV in the Runners panel.'
                : payout
                  ? 'Your payouts stay on this screen.'
                  : 'Your runner list stays on this screen. To share it, use Export to CSV in the Runners panel.'}
            </p>
          </div>

          {payout && (
            <Panel
              {...panel}
              title="Payout Summary"
              icon={<Wallet size={18} />}
              hint="Confirmed payments only: a bank transfer counts once it is verified."
            >
              <PayoutSummary payout={payout} />
            </Panel>
          )}

          {runners && (
            <Panel
              {...panel}
              title="Runners"
              icon={<ClipboardList size={18} />}
              hint="Paid and awaiting-verification runners, with what you need to release and ship their kits. Mark runners to export only those."
            >
              <RunnerList rows={runners} eventId={event.id} raceTitle={event.title} />
            </Panel>
          )}
        </section>
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

/** What a garment type is called on the tag, and counted as in the totals line. */
const GARMENT_WORDS: Record<GarmentType | 'NONE', { tag: string; one: string; many: string }> = {
  SINGLET: { tag: 'Singlet', one: 'singlet', many: 'singlets' },
  TSHIRT: { tag: 'T-shirt', one: 'T-shirt', many: 'T-shirts' },
  NONE: { tag: 'Type not listed', one: 'not listed', many: 'not listed' },
};

function count(n: number, one: string, many: string) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function categoryLabel(category: ViewerCategorySummary) {
  return `${category.name}${category.distance ? ` (${category.distance})` : ''}`;
}

/**
 * Pieces to order, one block per garment: the supplier's order and nothing
 * else. There is no runners-per-size-per-category view (owner, 2026-10-08):
 * its runner counts sat under piece counts that add up differently, and the
 * people packing kits work from the Runners list, which names each runner.
 */
function SizeSection({
  garments,
  categories,
}: {
  garments: GarmentRow[];
  categories: ViewerCategorySummary[];
}) {
  if (garments.length === 0) {
    return <p className="race-empty">No shirt sizes yet. They appear here as runners register.</p>;
  }
  const byId = new Map(categories.map(category => [category.id, category]));

  // The totals line, by type, leaving out a type nobody is getting.
  const perType = new Map<GarmentType | 'NONE', number>();
  for (const garment of garments) {
    const type = garment.type ?? 'NONE';
    perType.set(type, (perType.get(type) ?? 0) + garment.total);
  }
  const pieces = garments.reduce((sum, garment) => sum + garment.total, 0);
  const totals = [...perType].map(([type, n]) => count(n, GARMENT_WORDS[type].one, GARMENT_WORDS[type].many));
  if (perType.size > 1) totals.push(count(pieces, 'piece', 'pieces'));

  return (
    <>
      <p className="race-garment-totals">{totals.join(' · ')}</p>

      <ul className="race-garment-list">
        {garments.map(garment => (
          <li key={`${garment.type}-${garment.name}`} className="race-garment">
            <div className="race-garment-head">
              <h3 className="race-sub race-garment-name">{garment.name}</h3>
              <span className="race-garment-tag">{GARMENT_WORDS[garment.type ?? 'NONE'].tag}</span>
              <span className="race-garment-count">{count(garment.total, 'piece', 'pieces')}</span>
            </div>
            <p className="race-garment-with">
              With{' '}
              {garment.categoryIds
                .map(id => byId.get(id))
                .filter(category => category !== undefined)
                .map(categoryLabel)
                .join(', ')}
            </p>
            <SizeChips counts={garment.sizes.map(row => [row.size, row.total])} />
          </li>
        ))}
      </ul>
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
