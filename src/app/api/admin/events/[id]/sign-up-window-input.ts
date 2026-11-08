import {
  CLOSING_INSTANT_ERROR,
  REOPEN_PAST_CLOSING_ERROR,
  asClosingInstant,
  closingHasPassed,
  closingProblem,
} from '@/lib/registration-window';

/**
 * The edit form's closing date and Close switch, read off a PUT body — kept
 * out of update-event.ts, which is on the split-candidates list, so that file
 * grows by a call rather than by the rules.
 *
 * Only what is sent is written, like the certificate fields: a body without
 * `registrationClosesAt` keeps the stored date, and one without
 * `registrationClosed` keeps the stored closure. The closing date is checked
 * on every save, against the opening and race day *as this save leaves them*,
 * because moving race day earlier can strand a closing date that was fine.
 */
export function readSignUpWindow(
  data: Record<string, unknown>,
  current: { registrationClosesAt: Date | null; registrationClosedAt: Date | null },
  next: { registrationOpens: Date | null; date: string; virtualEndDate: string | null },
):
  | { ok: true; values: { registrationClosesAt?: Date | null; registrationClosedAt?: Date | null } }
  | { ok: false; field: string; error: string } {
  const sentClosing = Object.prototype.hasOwnProperty.call(data, 'registrationClosesAt');
  const parsed = sentClosing ? asClosingInstant(data.registrationClosesAt) : current.registrationClosesAt;
  if (parsed === undefined) {
    return { ok: false, field: 'registrationClosesAt', error: CLOSING_INSTANT_ERROR };
  }

  const changed =
    sentClosing && (parsed?.getTime() ?? null) !== (current.registrationClosesAt?.getTime() ?? null);
  const problem = closingProblem(parsed, {
    opensAt: next.registrationOpens,
    date: next.date,
    virtualEndDate: next.virtualEndDate,
    changed,
  });
  if (problem) return { ok: false, field: 'registrationClosesAt', error: problem };

  const sentClose = Object.prototype.hasOwnProperty.call(data, 'registrationClosed');
  if (sentClose && typeof data.registrationClosed !== 'boolean') {
    return { ok: false, field: 'registrationClosed', error: 'registrationClosed must be true or false.' };
  }
  // A Reopen from the form that leaves a passed closing date standing would
  // lift the closure and still read CLOSED — the same refusal as the PATCH.
  if (
    sentClose &&
    data.registrationClosed === false &&
    current.registrationClosedAt &&
    closingHasPassed({ registrationClosesAt: parsed })
  ) {
    return { ok: false, field: 'registrationClosesAt', error: REOPEN_PAST_CLOSING_ERROR };
  }

  return {
    ok: true,
    values: {
      ...(sentClosing ? { registrationClosesAt: parsed } : {}),
      // Closing an already-closed event keeps its instant, so a save cannot
      // move the date on the trail.
      ...(sentClose
        ? { registrationClosedAt: data.registrationClosed ? current.registrationClosedAt ?? new Date() : null }
        : {}),
    },
  };
}
