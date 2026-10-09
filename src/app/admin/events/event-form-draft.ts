import { DEFAULT_REGISTRATION_FORM, type RegistrationForm } from '@/lib/registration-form';
import { type EventHighlight } from '@/lib/event-highlights';

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
  date: string;
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
};

/** An empty event, with the platform fee the form should start at. */
export function blankEventDraft(adminFee: number): EventFormDraft {
  return {
    title: '',
    date: '',
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
  };
}
