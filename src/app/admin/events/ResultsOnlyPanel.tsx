'use client';

import AdminSwitch from '../AdminSwitch';

/**
 * The switch at the top of the edit form that moves a race between Events and
 * Results (RESULTS_NAV_PLAN.md R5). A results-only race lives under Results
 * alone; its client takes registration elsewhere and Run As One only posts
 * the times, so the form hides everything about selling an entry: prices,
 * fees, logistics, the waiver, the bank accounts and the opening schedule.
 *
 * The create form no longer has it: a results-only race is created from
 * /admin/results/new. This is how an existing race changes home.
 *
 * The switch is worded as the move, not as the state, so its label is true in
 * both places a race can be: **Move to Results** on a race under Events,
 * **Move back to Events** on one under Results. On means "move it when I
 * save"; `savedOn` is where the race is now and `on` is where it will be.
 *
 * Locked once anyone has registered. The PUT route refuses the change on its
 * own (the D3 guard in `api/admin/events/[id]`); this only tells the organizer
 * why before they try.
 */
export default function ResultsOnlyPanel({
  savedOn,
  on,
  onChange,
  registrationCount = 0,
}: {
  /** Whether the saved event is results-only, i.e. which screen it lives on. */
  savedOn: boolean;
  /** Whether it will be results-only once saved. */
  on: boolean;
  onChange: (next: boolean) => void;
  registrationCount?: number;
}) {
  const locked = registrationCount > 0;
  const moving = on !== savedOn;
  const hint = locked
    ? `Locked because ${registrationCount} registration${registrationCount === 1 ? ' has' : 's have'} already been taken here. Only a race nobody registered for on Run As One can move to Results.`
    : savedOn
      ? moving
        ? 'On save, this race returns to Events and takes registration here again. Set its prices and fees below before it opens.'
        : 'This race lives under Results: the client took registration elsewhere. Turn on to list it under Events and take registration here.'
      : moving
        ? 'On save, this race leaves Events and is listed under Results. Runners cannot register or pay here.'
        : 'For a race whose client ran registration elsewhere and we only post the results. It leaves Events and is listed under Results.';

  return (
    <div className="admin-panel">
      <div className="admin-panel-content">
        <AdminSwitch
          on={moving}
          label={savedOn ? 'Move back to Events' : 'Move to Results'}
          hint={hint}
          disabled={locked}
          onToggle={() => onChange(!on)}
        />
      </div>
    </div>
  );
}
