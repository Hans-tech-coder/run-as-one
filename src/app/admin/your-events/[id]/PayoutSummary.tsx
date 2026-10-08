import React from 'react';
import { ArrowDownLeft, Banknote } from 'lucide-react';
import type { ClientPayout } from '@/lib/client-payout';
import { formatEventDayShort } from '@/lib/event-schedule';
import { formatSignedPesos } from '@/lib/settlement';
import './payout-summary.css';

/**
 * The race page's payout section (CLIENT_RACE_PAGE_PLAN.md, Batch 3): four
 * figures that add up — collected, less Run As One's fees, less paid out,
 * leaves still owed — then the payouts themselves. Screen only: the printed
 * copy goes to a shirt supplier, who has no business with the money
 * (`RaceReport`).
 */
export default function PayoutSummary({ payout }: { payout: ClientPayout }) {
  const overpaid = payout.stillOwed < 0;

  return (
    <>
      <dl className="race-money-grid">
        <Figure label="Collected" value={payout.collected} note="What runners paid" />
        <Figure label="Run As One fees" value={payout.fees} note="Platform and payment fees" />
        <Figure label="Paid out to you" value={payout.paidOut} note="Payouts sent so far" />
        <Figure
          label={overpaid ? 'Overpaid' : 'Still owed'}
          value={overpaid ? -payout.stillOwed : payout.stillOwed}
          note={overpaid ? 'Paid out over what is owed' : 'Still to be paid out'}
          strong
        />
      </dl>

      <p className="race-money-state">{stateLine(payout)}</p>

      <h3 className="race-sub race-money-sub">Payouts</h3>
      {payout.payouts.length === 0 ? (
        <p className="race-empty">No payouts yet. Each one appears here once Run As One sends it.</p>
      ) : (
        <ul className="race-payout-list">
          {payout.payouts.map((row, index) => (
            <li key={index} className="race-payout">
              <span className="race-kit-icon" aria-hidden="true">
                {row.isReturn ? <ArrowDownLeft size={20} /> : <Banknote size={20} />}
              </span>
              <span className="race-kit-main">
                <span className="race-kit-label">{formatEventDayShort(row.paidOn)}</span>
                <span className="race-kit-meta">
                  {row.isReturn ? `Returned to Run As One · ${row.method}` : row.method}
                </span>
              </span>
              <span className="race-payout-amount">{formatSignedPesos(row.isReturn ? -row.amount : row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Figure({ label, value, note, strong }: { label: string; value: number; note: string; strong?: boolean }) {
  return (
    <div className={`race-money ${strong ? 'is-strong' : ''}`}>
      <dt className="race-money-label">{label}</dt>
      <dd className="race-money-value">{formatSignedPesos(value)}</dd>
      <dd className="race-money-note">{note}</dd>
    </div>
  );
}

/** One plain sentence on where the race stands, in the client's terms rather than the settlement screen's. */
function stateLine(payout: ClientPayout): string {
  switch (payout.state) {
    case 'NOTHING':
      return 'No confirmed payments yet. The figures fill in as runners pay.';
    case 'DUE':
      return `Run As One still owes you ${formatSignedPesos(payout.stillOwed)} for this race.`;
    case 'SETTLED':
      return 'Everything owed to you for this race has been paid out.';
    case 'OVERPAID':
      return `You have been paid ${formatSignedPesos(-payout.stillOwed)} more than is owed, usually because an order was refunded after a payout. Run As One will settle it with you.`;
  }
}
