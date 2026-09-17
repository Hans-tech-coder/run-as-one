import React from 'react';
import { SETTLEMENT_STATE_COPY, type SettlementState } from '@/lib/settlement';

/** One badge for the list's table, its cards and the race's own page, so they cannot drift. */
export default function SettlementBadge({ state }: { state: SettlementState }) {
  const { label, badge, hint } = SETTLEMENT_STATE_COPY[state];
  return (
    <span className={`status-badge ${badge} whitespace-nowrap`} title={hint}>
      {label}
    </span>
  );
}
