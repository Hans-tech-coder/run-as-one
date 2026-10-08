'use client';

import AdminSwitch from '../AdminSwitch';

/**
 * The "Results only" switch at the top of the create and edit forms
 * (RESULTS_ONLY_EVENT_PLAN.md Batch 3). On, the client takes registration
 * elsewhere and Run As One only publishes the race's results, so the forms
 * hide everything about selling an entry: prices, fees, logistics, the waiver,
 * the bank accounts and the opening schedule.
 *
 * It sits first because it decides which of the panels below exist at all.
 *
 * On edit it is locked once anyone has registered. The PUT route refuses the
 * change on its own (the guard in `api/admin/events/[id]`); this only tells
 * the organizer why before they try.
 */
export default function ResultsOnlyPanel({
  on,
  onChange,
  registrationCount = 0,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  /** The edit form passes the event's registrations; the create form has none. */
  registrationCount?: number;
}) {
  const locked = registrationCount > 0;
  const hint = locked
    ? `Locked because ${registrationCount} registration${registrationCount === 1 ? ' has' : 's have'} already been taken here. Results only is for a race nobody registered for on Run As One.`
    : on
      ? 'Runners cannot register or pay here. The race appears on Results once its results are uploaded.'
      : 'Turn on when the client runs registration elsewhere and we only post the results.';

  return (
    <div className="admin-panel">
      <div className="admin-panel-content">
        <AdminSwitch
          on={on}
          label="Results only"
          hint={hint}
          disabled={locked}
          onToggle={() => onChange(!on)}
        />
      </div>
    </div>
  );
}
