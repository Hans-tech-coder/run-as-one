import { toPesos } from '@/lib/money';
import { formatInclusions } from '@/lib/inclusions';
import { asRegistrationForm } from '@/lib/registration-form';
import { asEventType, type EventType } from '@/lib/event-type';
import { formatWaiverParagraphs } from '@/lib/consent-waiver';
import { cleanHighlights } from '@/lib/event-highlights';
import { defaultCertificateSettingsJson, parseCertificateSettings } from '@/lib/certificate-settings';
import type { EventPromotion } from '@/lib/promo-store';
import { blankEventDraft, type EventFormDraft } from '../../event-form-draft';
import { openingDraft, type OpeningDraft } from '../../registration-opening';
import { deliveryOffered } from '../../LogisticsPanel';
import type { CategoryDraft } from '../../category-draft';
import type { BankAccountDraft } from '../../bank-account-draft';

/**
 * Turns `GET /api/admin/events/[id]` into the edit form's state.
 *
 * The API speaks centavos and stored shapes; the form speaks pesos and editor
 * text. Every conversion lives here, in one function, so the page reads as
 * "fetch, then set", and the reverse trip stays the PUT route's job
 * (toCentavos, asInclusions…).
 */

/** What only a saved event carries, on top of the create form's draft. */
export type EventEditDraft = EventFormDraft & {
  // The organizer's manual hold on sign-ups, and what runners are told while
  // it is on. Blank note means the standard sentence — see
  // src/lib/registration-gate.ts.
  registrationPaused: boolean;
  registrationPauseNote: string;
  certificateTemplate: string;
  certificateCoordinates: string;
};

/** The draft shown for the instant before the event has loaded. */
export function blankEditDraft(): EventEditDraft {
  return {
    // Pesos on this form; the PUT route converts to centavos.
    ...blankEventDraft(60),
    registrationPaused: false,
    registrationPauseNote: '',
    certificateTemplate: '',
    certificateCoordinates: defaultCertificateSettingsJson(),
  };
}

// The premade templates that used to sit under /public/certificates are gone —
// the only way to get a certificate background now is to upload one. An event
// saved back when the picker existed still points at a deleted file, so drop
// that path instead of previewing a 404.
const uploadedTemplate = (value: unknown) =>
  typeof value === 'string' && !value.startsWith('/certificates/template_') ? value : '';

/**
 * The parts of the GET response this form reads, as they arrive over JSON
 * (dates are strings, money is centavos). Loose on purpose: an older row may
 * carry nulls the schema has since tightened.
 */
type Maybe<T> = T | null | undefined;
type EventResponse = {
  [field: string]: unknown;
  title?: Maybe<string>;
  date?: Maybe<string>;
  startTime?: Maybe<string>;
  endTime?: Maybe<string>;
  location?: Maybe<string>;
  imageUrl?: Maybe<string>;
  sizeChartImageUrl?: Maybe<string>;
  description?: Maybe<string>;
  logisticsPickup?: Maybe<boolean>;
  pickupLocation?: Maybe<string>;
  pickupSchedule?: Maybe<string>;
  province?: Maybe<string>;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
  adminFee?: Maybe<number>;
  shirtSizeUpcharge?: Maybe<number>;
  consentWaiver?: Maybe<string[]>;
  registrationPauseNote?: Maybe<string>;
  certificateCoordinates?: Maybe<string>;
  registrationOpensAt?: Maybe<string>;
  clientId?: Maybe<string>;
  _count?: { registrations?: number };
  promotions?: EventPromotion[];
  bankAccounts?: {
    id: string;
    bankName?: Maybe<string>;
    accountName?: Maybe<string>;
    accountNumber?: Maybe<string>;
    qrImageUrl?: Maybe<string>;
  }[];
  categories?: {
    id: string;
    name: string;
    distance: string;
    price: number;
    imageUrl?: Maybe<string>;
    inclusions?: Maybe<string[]>;
    slotLimit?: Maybe<number>;
    slotsTaken?: number;
  }[];
};

export function editStateFromEvent(data: EventResponse): {
  formData: EventEditDraft;
  opening: OpeningDraft;
  deliveryOn: boolean;
  bankAccounts: BankAccountDraft[];
  eventType: EventType;
  clientId: string;
  registrationCount: number;
  promotions: EventPromotion[];
  /** Null when the event has none, so the page keeps its one blank row. */
  categories: CategoryDraft[] | null;
} {
  return {
    formData: {
      title: data.title || '',
      date: data.date || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      location: data.location || '',
      imageUrl: data.imageUrl || '',
      highlights: cleanHighlights(data.highlights),
      sizeChartImageUrl: data.sizeChartImageUrl || '',
      description: data.description || '',
      logisticsPickup: data.logisticsPickup ?? true,
      pickupLocation: data.pickupLocation || '',
      pickupSchedule: data.pickupSchedule || '',
      // The API returns centavos; every money input on this form is pesos.
      // The PUT route converts back with toCentavos().
      province: data.province || '',
      logisticsDeliveryFeeInside: toPesos(data.logisticsDeliveryFeeInside),
      logisticsDeliveryFeeOutside: toPesos(data.logisticsDeliveryFeeOutside),
      adminFee: toPesos(data.adminFee),
      shirtSizeUpcharge: toPesos(data.shirtSizeUpcharge ?? 0),
      consentWaiver: formatWaiverParagraphs(data.consentWaiver),
      registrationForm: asRegistrationForm(data.registrationForm),
      registrationPaused: Boolean(data.registrationPaused),
      registrationPauseNote: data.registrationPauseNote || '',
      certificateTemplate: uploadedTemplate(data.certificateTemplate),
      // An event with a template keeps the layout its runners have been
      // getting — legacy until an admin switches (an empty column reads as
      // legacy; see certificate-settings.ts). One with no template has no
      // runner relying on a layout, so its first template starts designed.
      certificateCoordinates: uploadedTemplate(data.certificateTemplate)
        ? data.certificateCoordinates || JSON.stringify({ nameY: 50, timeY: 60, catY: 70 })
        : parseCertificateSettings(data.certificateCoordinates).v === 2
          ? (data.certificateCoordinates ?? defaultCertificateSettingsJson())
          : defaultCertificateSettingsJson(),
    },

    // Null on the row means the race was open from the moment it was
    // published, which is the picker's first card.
    opening: openingDraft(data.registrationOpensAt),

    // No delivery column: a race offers delivery when a zone has a fee.
    deliveryOn: deliveryOffered(data),

    bankAccounts: (data.bankAccounts ?? []).map(b => ({
      id: b.id,
      bankName: b.bankName ?? '',
      accountName: b.accountName ?? '',
      accountNumber: b.accountNumber ?? '',
      qrImageUrl: b.qrImageUrl ?? '',
    })),

    eventType: asEventType(data.eventType),
    clientId: data.clientId ?? '',
    registrationCount: data._count?.registrations ?? 0,
    promotions: data.promotions ?? [],

    categories:
      data.categories && data.categories.length > 0
        ? data.categories.map(c => ({
            id: c.id,
            name: c.name,
            distance: c.distance,
            price: toPesos(c.price),
            imageUrl: c.imageUrl || '',
            // Stored as an array, edited as lines — the same conversion the
            // money fields get, in the other direction.
            inclusions: formatInclusions(c.inclusions),
            // Null means uncapped, and a number input cannot hold null.
            slotLimit: c.slotLimit ?? '',
            // Read-only, so the organizer can see what they are capping.
            slotsTaken: c.slotsTaken ?? 0,
          }))
        : null,
  };
}
