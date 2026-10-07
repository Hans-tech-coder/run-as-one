"use client";

import React, { useState, useEffect } from 'react';
import { Save, X, AlertCircle, CheckCircle, UploadCloud, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toPesos } from '@/lib/money';
import { formatInclusions } from '@/lib/inclusions';
import RegistrationFormPicker from '../../RegistrationFormPicker';
import RegistrationOpeningPicker from '../../RegistrationOpeningPicker';
import {
  OPENS_IMMEDIATELY,
  openingDraft,
  openingInstantISO,
  openingProblem,
  type OpeningDraft,
} from '../../registration-opening';
import EventOptionsPanel from '../../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../../category-draft';
import { DEFAULT_REGISTRATION_FORM, asRegistrationForm, type RegistrationForm } from '@/lib/registration-form';
import { DEFAULT_EVENT_TYPE, asEventType, type EventType } from '@/lib/event-type';
import ConsentWaiverField from '@/app/admin/events/ConsentWaiverField';
import { formatWaiverParagraphs } from '@/lib/consent-waiver';
import BankAccountsPanel from '@/app/admin/events/BankAccountsPanel';
import EventPromotionsPanel from '@/app/admin/events/EventPromotionsPanel';
import type { EventPromotion } from '@/lib/promo-store';
import { cleanBankAccounts, type BankAccountDraft } from '@/app/admin/events/bank-account-draft';
import { offersBankTransfer } from '@/lib/registration-form';
import AdminRouteLoading from '@/app/admin/AdminRouteLoading';
import { EVENT_FORM_SHAPE } from '@/app/admin/route-loading-shape';
import BusyLabel from '@/components/ui/BusyLabel';
import EventClientField from '@/app/admin/events/EventClientField';
import AdminDatePicker from '../../../AdminDatePicker';
import DashboardHeader from '@/app/admin/DashboardHeader';
import DescriptionEditor from '../../DescriptionEditor';
import HighlightsField from '@/app/admin/events/HighlightsField';
import { cleanHighlights, type EventHighlight } from '@/lib/event-highlights';
import LogisticsPanel, { deliveryFees, deliveryOffered, deliveryProblem } from '../../LogisticsPanel';
import CertificateSettingsPanel from '../../CertificateSettingsPanel';
import { defaultCertificateSettingsJson, parseCertificateSettings } from '@/lib/certificate-settings';

// The premade templates that used to sit under /public/certificates are gone —
// the only way to get a certificate background now is to upload one. An event
// saved back when the picker existed still points at a deleted file, so drop
// that path instead of previewing a 404.
const uploadedTemplate = (value: unknown) =>
  typeof value === 'string' && !value.startsWith('/certificates/template_') ? value : '';

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [successMsg, setSuccessMsg] = useState('');
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isSuccessClosing, setIsSuccessClosing] = useState(false);
  
  // When this race starts taking sign-ups. Outside formData because it is two
  // fields standing for one nullable column — see registration-opening.ts.
  const [opening, setOpening] = useState<OpeningDraft>(OPENS_IMMEDIATELY);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    imageUrl: '',
    highlights: [] as EventHighlight[],
    sizeChartImageUrl: '',
    description: '',
    logisticsPickup: true,
    // Where and when a race kit is collected. Only meaningful while
    // pickup is offered, and both are optional — see lib/pickup.ts.
    pickupLocation: '',
    pickupSchedule: '',
    province: '',
    logisticsDeliveryFeeInside: 0,
    logisticsDeliveryFeeOutside: 0,
    // Pesos on this form; the PUT route converts to centavos.
    adminFee: 60,
    shirtSizeUpcharge: 100,
    consentWaiver: '',
    registrationForm: DEFAULT_REGISTRATION_FORM as RegistrationForm,
    // The organizer's manual hold on sign-ups, and what runners are told while
    // it is on. Blank note means the standard sentence — see
    // src/lib/registration-gate.ts.
    registrationPaused: false,
    registrationPauseNote: '',
    certificateTemplate: '',
    certificateCoordinates: defaultCertificateSettingsJson(),
  });

  // Not part of formData because EventOptionsPanel owns it rather than a plain
  // input. Editable while the event has no registrations and locked after —
  // see lockedReason where the panel is rendered. It has to be echoed back on
  // save regardless: leaving it out of the PUT would make asEventType() fall
  // back to RACE and silently retype every fun run.
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE);
  const [registrationCount, setRegistrationCount] = useState(0);

  const [categories, setCategories] = useState<CategoryDraft[]>([blankCategory()]);
  // How many category/package posters are uploading right now, for the same
  // reason as uploadingField: saving mid-upload would store a row without its
  // poster. A count rather than a boolean because two rows can upload at once,
  // and a latched flag would clear on the first one to finish.
  const [uploadingPosters, setUploadingPosters] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([]);
  // Which client the race is for ('' for none), and whether this person may
  // set it at all — only then is it sent (EventClientField).
  const [clientId, setClientId] = useState('');
  const [canLinkClient, setCanLinkClient] = useState(false);
  const [clientError, setClientError] = useState<string | undefined>();
  // Read-only, and not part of formData for that reason: promotions belong to
  // the marketing screen and nothing here posts them back.
  const [promotions, setPromotions] = useState<EventPromotion[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${id}`);
        if (!res.ok) throw new Error('Failed to fetch event');
        const data = await res.json();
        
        setFormData({
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
              ? data.certificateCoordinates
              : defaultCertificateSettingsJson(),
        });

        // Null on the row means the race was open from the moment it was
        // published, which is the picker's first card.
        setOpening(openingDraft(data.registrationOpensAt));

        // No delivery column: a race offers delivery when a zone has a fee.
        setDeliveryOn(deliveryOffered(data));

        setBankAccounts(
          (data.bankAccounts ?? []).map((b: any) => ({
            id: b.id,
            bankName: b.bankName ?? '',
            accountName: b.accountName ?? '',
            accountNumber: b.accountNumber ?? '',
            qrImageUrl: b.qrImageUrl ?? '',
          })),
        );

        setEventType(asEventType(data.eventType));
        setClientId(data.clientId ?? '');
        setRegistrationCount(data._count?.registrations ?? 0);
        setPromotions(data.promotions ?? []);

        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories.map((c: any) => ({
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
          })));
        }
      } catch (err) {
        setError('Could not load event data. Please try again.');
      } finally {
        setIsFetching(false);
      }
    };
    fetchEvent();
  }, [id]);

  // Uploads to blob storage and stores the returned URL. This used to inline the
  // file as a base64 data URL, which meant every event row carried megabytes of
  // text that each listing query then had to pull down.
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: string,
    kind: 'image' | 'template' = 'image'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);

      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setFormData(prev => ({ ...prev, [field]: data.url }));
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      e.target.value = '';
    } finally {
      setUploadingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!formData.title || !formData.date || !formData.location) {
      setError('Title, date, and location are required.');
      setIsLoading(false);
      return;
    }

    // Scheduled to open, with no usable date: the message goes under the date
    // field rather than into the failure modal, because that is the box that
    // has to change.
    const openingFault = openingProblem(opening);
    setOpeningError(openingFault);
    if (openingFault) {
      setIsLoading(false);
      return;
    }

    // Delivery switched on with both zones at 0 would quietly save as pickup
    // only; the message sits under the two fee fields that need a number.
    const deliveryFault = deliveryProblem(deliveryOn, formData);
    setDeliveryError(deliveryFault);
    if (deliveryFault) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          ...deliveryFees(deliveryOn, formData),
          eventType,
          registrationOpensAt: openingInstantISO(opening),
          categories,
          bankAccounts: cleanBankAccounts(bankAccounts),
          ...(canLinkClient ? { clientId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        // A refusal about the client lands under the picker, not in the modal.
        if (data.errors?.clientId) setClientError(data.errors.clientId);
        else setError(data.error || 'Failed to update event');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Event updated successfully!');
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      requestAnimationFrame(() => setIsOpen(true));
    }
  }, [error]);

  const closeErrorModal = () => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setError('');
    }, 150);
  };

  useEffect(() => {
    if (successMsg) {
      requestAnimationFrame(() => setIsSuccessOpen(true));
    }
  }, [successMsg]);

  const closeSuccessModal = () => {
    setIsSuccessOpen(false);
    setIsSuccessClosing(true);
    setTimeout(() => {
      setIsSuccessClosing(false);
      setSuccessMsg('');
      router.push('/admin/events');
    }, 150);
  };

  // The event is fetched on the client after the route arrives, so this is the
  // second half of the same wait `events/loading.tsx` starts — the same frame
  // and the same shape, not a bare line of text with no header above it.
  if (isFetching) {
    return <AdminRouteLoading shape={EVENT_FORM_SHAPE} />;
  }

  return (
    <>
      <DashboardHeader title="Edit Event" crumbs={[{ label: 'Events', href: '/admin/events' }]} />

      <div className="admin-content max-w-4xl mx-auto">
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
            error && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ zIndex: 100 }}
        >
          <div 
            className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
            role="dialog"
          >
            <div className="admin-modal-body flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-[var(--status-danger)] shrink-0 mt-1">
                <AlertCircle size={24} strokeWidth={2} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-xl font-semibold text-primary">Action Failed</h3>
                <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">{error}</p>
              </div>
            </div>
            <div className="admin-modal-footer flex justify-end pt-2 border-t border-[var(--dash-hairline)]">
              <button 
                type="button"
                onClick={closeErrorModal} 
                className="px-5 py-2 bg-[var(--ink-05)] hover:bg-[var(--ink-10)] border border-[var(--dash-border)] rounded-lg text-sm font-medium text-primary transition-colors"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>

        {/* Success Modal */}
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
            successMsg && !isSuccessClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ zIndex: 100 }}
        >
          <div 
            className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-green-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isSuccessOpen ? 'is-open' : ''} ${isSuccessClosing ? 'is-closing' : ''}`}
            role="dialog"
          >
            <div className="admin-modal-body flex items-start gap-4">
              <div className="p-3 bg-green-500/10 rounded-full text-[var(--status-success)] shrink-0 mt-1">
                <CheckCircle size={24} strokeWidth={2} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-xl font-semibold text-primary">Success</h3>
                <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">{successMsg}</p>
              </div>
            </div>
            <div className="admin-modal-footer flex justify-end pt-2 border-t border-[var(--dash-hairline)]">
              <button 
                type="button"
                onClick={closeSuccessModal} 
                className="px-5 py-2 bg-green-500 hover:bg-green-600 rounded-lg text-sm font-medium text-white transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="admin-form">
          {/* Basic Info */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Basic Information</h2>
            </div>
            <div className="admin-panel-content">
              <div className="form-grid">
              <EventClientField
                value={clientId}
                onChange={next => {
                  setClientId(next);
                  setClientError(undefined);
                }}
                onAvailable={setCanLinkClient}
                error={clientError}
              />
              <div className="form-group form-group-full">
                <label className="form-label">Event Title</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="form-input"
                  placeholder="e.g. Manila Midnight Marathon 2025"
                  required
                />
              </div>
              <div className="form-group form-group-full">
                <label className="form-label">
                  About This Event <span className="text-xs opacity-70">- optional</span>
                </label>
                <DescriptionEditor
                  value={formData.description}
                  onChange={description => setFormData({...formData, description})}
                  placeholder="Route, assembly time, cut-off, what runners should bring — anything they'd ask about before signing up."
                />
              </div>
              <AdminDatePicker
                id="event-date"
                label="Date"
                value={formData.date}
                dialogLabel="Choose the race date"
                onChange={date => setFormData({...formData, date})}
              />
              <div className="form-group">
                <label className="form-label">Location</label>
                <input 
                  type="text" 
                  value={formData.location}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  className="form-input"
                  placeholder="e.g. BGC, Taguig"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input 
                  type="time" 
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input 
                  type="time" 
                  value={formData.endTime}
                  onChange={e => setFormData({...formData, endTime: e.target.value})}
                  className="form-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label className="form-label">Cover Image</label>
                {!formData.imageUrl ? (
                  <div className="file-upload-wrapper" style={{ opacity: uploadingField ? 0.6 : 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'imageUrl')}
                      className="file-upload-input"
                      disabled={uploadingField !== null}
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">
                        {uploadingField === 'imageUrl' ? <BusyLabel>Uploading</BusyLabel> : 'Click to upload cover image'}
                      </div>
                      <div className="file-upload-desc">SVG, PNG, JPG or GIF (max. 800x400px)</div>
                    </div>
                  </div>
                ) : (
                  <div className="file-preview">
                    <img src={formData.imageUrl} alt="Cover Preview" />
                    <div className="file-preview-overlay">
                      <button 
                        type="button" 
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="btn-remove-preview"
                      >
                        <Trash size={16} /> Remove Image
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <HighlightsField
                value={formData.highlights}
                onChange={update => setFormData(prev => ({ ...prev, highlights: update(prev.highlights) }))}
                onError={setError}
                onBusyChange={busy => setUploadingPosters(n => (busy ? n + 1 : n - 1))}
              />

              {/* Optional: an organizer whose shirts run to their own measurements
                  uploads their chart; without one the register page shows the
                  default chart from lib/shirt-size.ts. */}
              <div className="form-group">
                <label className="form-label">Size Chart (Optional)</label>
                {!formData.sizeChartImageUrl ? (
                  <div className="file-upload-wrapper media-tile" style={{ opacity: uploadingField ? 0.6 : 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'sizeChartImageUrl')}
                      className="file-upload-input"
                      disabled={uploadingField !== null}
                    />
                    <div className="file-upload-content">
                      <div className="file-upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="file-upload-title">
                        {uploadingField === 'sizeChartImageUrl' ? <BusyLabel>Uploading</BusyLabel> : 'Click to upload size chart'}
                      </div>
                      <div className="file-upload-desc">Optional • PNG, JPG. Leave empty to use the default size chart.</div>
                    </div>
                  </div>
                ) : (
                  <div className="file-preview media-tile">
                    <img src={formData.sizeChartImageUrl} alt="Size Chart Preview" />
                    <div className="file-preview-overlay">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, sizeChartImageUrl: '' }))}
                        className="btn-remove-preview"
                      >
                        <Trash size={16} /> Remove Size Chart
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* What the event sells. Switchable while nothing has been sold; locked
            once registrations exist — see lockedReason below. */}
        <EventOptionsPanel
            eventType={eventType}
            onEventTypeChange={setEventType}
            lockedReason={
              registrationCount > 0
                ? `Locked because ${registrationCount} registration${registrationCount === 1 ? ' has' : 's have'} already been taken. Switching now would change what those runners already paid for.`
                : null
            }
            options={categories}
            onChange={setCategories}
            onError={setError}
            onBusyChange={busy => setUploadingPosters(n => (busy ? n + 1 : n - 1))}
          />

          <BankAccountsPanel
            accounts={bankAccounts}
            offersBankTransfer={offersBankTransfer(formData.registrationForm)}
            onChange={setBankAccounts}
            onError={setError}
            onBusyChange={busy => setUploadingPosters(n => (busy ? n + 1 : n - 1))}
          />

          {/* Logistics Options */}
          <LogisticsPanel
            draft={formData}
            onChange={patch => setFormData({...formData, ...patch})}
            deliveryOn={deliveryOn}
            onDeliveryChange={on => { setDeliveryOn(on); setDeliveryError(null); }}
            deliveryError={deliveryError}
          />

          {/* Registration & Fees */}
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">Registration & Fees</h2>
            </div>
            <div className="admin-panel-content">
              <div className="flex flex-col gap-6">
                {/* When sign-ups start. Above the hold because it is the
                    earlier question: whether this race has opened at all
                    comes before whether the organizer has stopped it. */}
                <div className="form-group">
                  <label className="form-label">Registration Opening</label>
                  <RegistrationOpeningPicker
                    value={opening}
                    onChange={next => {
                      setOpening(next);
                      if (openingError) setOpeningError(null);
                    }}
                    idPrefix="editEventOpening"
                    error={openingError}
                  />
                </div>
                {/* A manual hold, distinct from an event whose options have all
                    sold out: the slots and the days both remain, and the
                    organizer has stopped anyway. It is enforced in both
                    checkout routes, not only here, because a tab opened before
                    the hold went on will still post. */}
                <div className="form-group">
                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="registrationPaused"
                      checked={formData.registrationPaused}
                      onChange={e => setFormData({...formData, registrationPaused: e.target.checked})}
                      className="w-5 h-5 accent-accent-blue"
                    />
                    <label htmlFor="registrationPaused" className="text-primary font-medium">
                      Pause Registration
                    </label>
                  </div>
                  <p className="text-xs opacity-70 mt-1">
                    Stops new sign-ups immediately. The event stays listed and its
                    page stays readable — runners are told it is paused rather than
                    finding a button that fails.
                  </p>
                </div>

                {formData.registrationPaused && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="registrationPauseNote">
                      What Runners Are Told <span className="text-xs opacity-70">- optional</span>
                    </label>
                    <textarea
                      id="registrationPauseNote"
                      value={formData.registrationPauseNote}
                      onChange={e => setFormData({...formData, registrationPauseNote: e.target.value})}
                      className="form-input"
                      rows={3}
                      placeholder="e.g. Sign-ups reopen on 15 April once the new singlets arrive."
                    />
                    <p className="text-xs opacity-70 mt-1">
                      Shown on the event page and in place of the registration form.
                      Leave it blank and we say sign-ups are paused and may reopen.
                    </p>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Admin Fee (₱) <span className="text-xs opacity-70">- charged per runner</span></label>
                  <input
                    type="number" inputMode="decimal"
                    value={formData.adminFee}
                    onChange={e => setFormData({...formData, adminFee: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Large Size Surcharge (₱) <span className="text-xs opacity-70">- added once per runner in 4XL or above</span></label>
                  <input
                    type="number" inputMode="decimal"
                    value={formData.shirtSizeUpcharge}
                    onChange={e => setFormData({...formData, shirtSizeUpcharge: Number(e.target.value)})}
                    className="form-input"
                    min={0}
                  />
                  <p className="text-xs opacity-70 mt-1">
                    Set to 0 if the larger sizes cost the same. Only charged to runners
                    whose package actually includes a singlet or shirt.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Registration Form</label>
                  <RegistrationFormPicker
                    value={formData.registrationForm}
                    onChange={value => setFormData({...formData, registrationForm: value})}
                  />
                </div>
                <ConsentWaiverField
                  value={formData.consentWaiver}
                  eventTitle={formData.title}
                  onChange={next => setFormData({...formData, consentWaiver: next})}
                />
              </div>
            </div>
          </div>

          <CertificateSettingsPanel
            template={formData.certificateTemplate}
            settings={formData.certificateCoordinates}
            onSettingsChange={(certificateCoordinates) => setFormData((prev) => ({ ...prev, certificateCoordinates }))}
            onTemplateFile={(e) => handleImageUpload(e, 'certificateTemplate', 'template')}
            uploading={uploadingField === 'certificateTemplate'}
            disabled={uploadingField !== null}
            event={{ title: formData.title, date: formData.date, location: formData.location }}
          />

          {/* Last, and read-only: what a runner can be given on this race,
              so a price set on this screen is not set without the discounts
              against it in view. Changing one is a link away rather than a
              control here — see the panel's own comment. */}
          <EventPromotionsPanel promotions={promotions} />

          <div className="form-actions">
            <Link href="/admin/events" className="btn-cancel">
              Cancel
            </Link>
            {/* Saving mid-upload would store the event without its image URL. */}
            <button
              type="submit"
              disabled={isLoading || uploadingField !== null || uploadingPosters > 0}
              className="btn-light"
            >
              {isLoading ? <BusyLabel>Saving</BusyLabel> : 'Update Event'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
