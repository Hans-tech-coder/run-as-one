import { DEFAULT_REGISTRATION_FORM, type RegistrationForm } from '@/lib/registration-form';
import { type EventHighlight } from '@/lib/event-highlights';
import { DEFAULT_EVENT_FORMAT, isVirtual, runWindowError, type EventFormat } from '@/lib/event-format';
import { DOWNGRADE_REFUND_POLICIES, type DowngradeRefundPolicy } from '@/lib/category-change';
import { eventInstant, eventInstantParts } from '@/lib/event-schedule';

/**
 * The fields the create and edit forms both hold in `formData`, in the shape
 * the forms work in: every money field is PESOS, and the API converts to
 * centavos on the way in. The edit form extends it with what only a saved
 * event has (the registration hold).
 *
 * One type rather than two copies so a field added to the event form is added
 * once, and the shared panels (BasicInfoPanel, RegistrationFeesPanel,
 * LogisticsPanel) can be typed against it.
 */
export type EventFormDraft = {
  title: string;
  // On-site or virtual (lib/event-format.ts). For a virtual run `date` is the
  // first day of its window and `virtualEndDate` the last; on-site ignores it.
  format: EventFormat;
  date: string;
  virtualEndDate: string;
  startTime: string;
  endTime: string;
  location: string;
  imageUrl: string;
  highlights: EventHighlight[];
  sizeChartImageUrl: string;
  description: string;
  logisticsPickup: boolean;
  // Where and when a race kit is collected. Only meaningful while
  // pickup is offered, and both are optional — see lib/pickup.ts.
  pickupLocation: string;
  pickupSchedule: string;
  province: string;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
  adminFee: number;
  shirtSizeUpcharge: number;
  consentWaiver: string;
  registrationForm: RegistrationForm;
  // Category changes after payment (CATEGORY_CHANGE_PLAN.md). The fee is
  // pesos like every money field here; the deadline is the picker's
  // `YYYY-MM-DDTHH:mm` in Manila, "" for the day before race day, and is
  // posted as an instant by changeUntilISO (CategoryChangeSettings).
  categoryChangeFee: number;
  downgradeRefundPolicy: DowngradeRefundPolicy;
  categoryChangeUntil: string;
};

/** An empty event, with the platform fee the form should start at. */
export function blankEventDraft(adminFee: number): EventFormDraft {
  return {
    title: '',
    format: DEFAULT_EVENT_FORMAT,
    date: '',
    virtualEndDate: '',
    startTime: '',
    endTime: '',
    location: '',
    imageUrl: '',
    highlights: [],
    sizeChartImageUrl: '',
    description: '',
    logisticsPickup: true,
    pickupLocation: '',
    pickupSchedule: '',
    province: '',
    logisticsDeliveryFeeInside: 0,
    logisticsDeliveryFeeOutside: 0,
    adminFee,
    shirtSizeUpcharge: 100,
    consentWaiver: '',
    registrationForm: DEFAULT_REGISTRATION_FORM,
    categoryChangeFee: 0,
    downgradeRefundPolicy: DOWNGRADE_REFUND_POLICIES.NO_REFUND,
    categoryChangeUntil: '',
  };
}

/** A stored category-change deadline as the picker holds it, `YYYY-MM-DDTHH:mm` in Manila, or "". */
export function changeUntilDraft(value: Date | string | null | undefined): string {
  if (!value) return '';
  const { day, time } = eventInstantParts(value);
  return day ? `${day}T${time}` : '';
}

/**
 * What the forms post for it: an ISO instant, so the zone travels with it (as
 * `openingInstantISO` does), or null for "the day before race day".
 */
export function changeUntilISO(draft: string): string | null {
  if (!draft) return null;
  const [day, time = ''] = draft.split('T');
  return eventInstant(day, time)?.toISOString() ?? null;
}

/**
 * What is missing from Basic Information before a save, said specifically:
 * the message for the form's error modal, and for a virtual run the reason
 * under whichever window day is wrong. Null when it can be saved. Shared by
 * the create and edit forms so both refuse the same drafts the API would.
 */
export type BasicInfoFault = { message: string; dateError?: string; windowError?: string };

export function basicInfoProblem(draft: EventFormDraft): BasicInfoFault | null {
  if (!isVirtual(draft)) {
    if (!draft.title || !draft.date || !draft.location) {
      return { message: 'Title, date, and location are required.' };
    }
    return null;
  }
  const dateError = draft.date ? undefined : 'Choose the first day of the run window.';
  const windowError = (draft.date && runWindowError(draft.date, draft.virtualEndDate)) || undefined;
  if (!draft.title) return { message: 'Event title is required.', dateError, windowError };
  if (dateError || windowError) {
    return { message: dateError ?? windowError ?? '', dateError, windowError };
  }
  return null;
}
