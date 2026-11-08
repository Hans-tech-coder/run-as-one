'use client';

import { useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import { isVirtual } from '@/lib/event-format';
import { REOPEN_PAST_CLOSING_ERROR, closingHasPassed } from '@/lib/registration-window';
import {
  NO_CLOSING_DATE,
  closingDraft,
  closingDraftProblem,
  closingInstantISO,
  sameMinute,
  type OpeningDraft,
} from '../../registration-opening';
import type { EventEditDraft } from './event-edit-draft';

/**
 * The edit form's closing date and its Close switch: the state, the checks
 * before Save, and the confirm a Close asks for. Kept out of the edit page,
 * which is on the split-candidates list, so the page grows by a hook call.
 *
 * The Close switch itself is `formData.registrationClosed` (it rides the PUT
 * like Pause does); what this owns is what the page cannot know from the
 * draft alone — how the event was loaded, so that an untouched past closing
 * date is not refused and a Close that was already on does not ask again.
 */
export function useSignUpWindow() {
  const { confirm } = useAlert();
  const [closing, setClosing] = useState<OpeningDraft>(NO_CLOSING_DATE);
  const [closingError, setClosingError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ closesAt: string | null; closed: boolean }>({
    closesAt: null,
    closed: false,
  });

  /** Seeds the state from the GET response. */
  const load = (raw: { registrationClosesAt?: string | null; registrationClosedAt?: string | null }) => {
    setClosing(closingDraft(raw.registrationClosesAt));
    setSaved({ closesAt: raw.registrationClosesAt ?? null, closed: Boolean(raw.registrationClosedAt) });
  };

  const onClosingChange = (next: OpeningDraft) => {
    setClosing(next);
    if (closingError) setClosingError(null);
  };

  /**
   * Whether this save may go ahead: the closing date passes the routes' rule,
   * a Reopen does not leave a passed date standing, and a new Close has been
   * confirmed. False leaves the message under the closing field (or the
   * organizer having cancelled the confirm).
   */
  const ready = async (formData: EventEditDraft, opening: OpeningDraft): Promise<boolean> => {
    const fault =
      closingDraftProblem(closing, {
        opening,
        date: formData.date,
        virtualEndDate: isVirtual(formData) ? formData.virtualEndDate : null,
        savedClosesAt: saved.closesAt,
      }) ??
      (saved.closed &&
      !formData.registrationClosed &&
      closingHasPassed({ registrationClosesAt: closingInstantISO(closing) })
        ? REOPEN_PAST_CLOSING_ERROR
        : null);
    setClosingError(fault);
    if (fault) {
      document.getElementById('editEvent-closing-day')?.focus();
      return false;
    }

    // Closing is final in a way Pause is not — runners are told this race is
    // not coming back — so it asks first, as the events table's Close does.
    if (formData.registrationClosed && !saved.closed) {
      return confirm({
        variant: 'danger',
        title: 'Close sign-ups?',
        message: `Runners will see that registration for ${formData.title || 'this event'} is closed. Orders already placed are not affected. You can reopen it later.`,
        confirmLabel: 'Close Sign-Ups',
      });
    }
    return true;
  };

  /**
   * The PUT fields this owns. An untouched date is sent back exactly as it was
   * loaded, so a stored value with seconds is not "changed" by the round trip.
   */
  const body = () => {
    const closesAt = closingInstantISO(closing);
    return { registrationClosesAt: sameMinute(closesAt, saved.closesAt) ? saved.closesAt : closesAt };
  };

  /** After a successful save, the saved values are the loaded ones. */
  const saved_ = (formData: EventEditDraft) =>
    setSaved({ closesAt: body().registrationClosesAt, closed: formData.registrationClosed });

  return {
    closing,
    onClosingChange,
    closingError,
    setClosingError,
    /** Closed by its date rather than by Close — the note under the switch. */
    closedOnSchedule: (formData: EventEditDraft) =>
      !formData.registrationClosed && closingHasPassed({ registrationClosesAt: closingInstantISO(closing) }),
    load,
    ready,
    body,
    markSaved: saved_,
  };
}
