"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  OPENS_IMMEDIATELY,
  openingInstantISO,
  openingProblem,
  type OpeningDraft,
} from '../registration-opening';
import EventOptionsPanel from '../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../category-draft';
import { DEFAULT_EVENT_TYPE, type EventType } from '@/lib/event-type';
import BankAccountsPanel from '@/app/admin/events/BankAccountsPanel';
import { cleanBankAccounts, type BankAccountDraft } from '@/app/admin/events/bank-account-draft';
import { offersBankTransfer } from '@/lib/registration-form';
import BusyLabel from '@/components/ui/BusyLabel';
import DashboardHeader from '@/app/admin/DashboardHeader';
import LogisticsPanel, { deliveryFees, deliveryProblem } from '../LogisticsPanel';
import BasicInfoPanel from '../BasicInfoPanel';
import RegistrationFeesPanel from '../RegistrationFeesPanel';
import EventFormResultModals from '../EventFormResultModals';
import { blankEventDraft } from '../event-form-draft';
import { useEventImageUpload } from '../useEventImageUpload';

/**
 * The create-event form. `page.tsx` reads the default platform fee on the
 * server and hands it in, so the Admin Fee box starts at the Super Admin's
 * saved default (SETTINGS_PLAN.md Batch 4) without a flash of the old ₱60.
 *
 * The panels are shared with the edit form (BasicInfoPanel,
 * RegistrationFeesPanel, LogisticsPanel…); this file owns only the draft, the
 * validation before POST, and the POST itself.
 */
export default function NewEventForm({ defaultAdminFee }: { defaultAdminFee: number }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Pesos on this form; the API converts to centavos. The Admin Fee starts at
  // the default platform fee set on /admin/settings (Organizer.adminFee).
  const [formData, setFormData] = useState(() => blankEventDraft(defaultAdminFee));
  const patchForm = (patch: Partial<typeof formData>) => setFormData(prev => ({ ...prev, ...patch }));

  const { uploadingField, upload } = useEventImageUpload(setFormData, setError);
  // How many category posters are uploading right now, for the same reason as
  // uploadingField: saving mid-upload would store a category without its
  // poster. A count rather than a boolean because two rows can upload at once,
  // and a latched flag would clear on the first one to finish.
  const [uploadingPosters, setUploadingPosters] = useState(0);
  const posterBusy = (busy: boolean) => setUploadingPosters(n => (busy ? n + 1 : n - 1));
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([]);
  // Which client the race is for ('' for none), and whether this person may
  // set it at all — only then is it sent (EventClientField).
  const [clientId, setClientId] = useState('');
  const [canLinkClient, setCanLinkClient] = useState(false);
  const [clientError, setClientError] = useState<string | undefined>();
  // Distances or packages. Freely switchable here — nothing is sold yet.
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE);

  const [categories, setCategories] = useState<CategoryDraft[]>([blankCategory()]);

  // When this race starts taking sign-ups. Kept beside the form rather than in
  // it because it is two fields standing for one nullable column — see
  // registration-opening.ts. Most races open immediately, so that is where it
  // starts.
  const [opening, setOpening] = useState<OpeningDraft>(OPENS_IMMEDIATELY);
  // Why the opening date cannot be saved, shown under the date field itself
  // rather than in the error modal: a validation message belongs beside the
  // box it is about.
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic Validation
    if (!formData.title || !formData.date || !formData.location) {
      setError('Title, date, and location are required.');
      setIsLoading(false);
      return;
    }

    // An organizer who chose to schedule the opening and left the date empty
    // gets told which field is missing, beside that field. Saving anyway would
    // publish the race open, which is the one thing they said not to do.
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
      const res = await fetch('/api/admin/events', {
        method: 'POST',
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
        else setError(data.error || 'Failed to create event');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Event created successfully!');
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <>
      <DashboardHeader title="Create New Event" crumbs={[{ label: 'Events', href: '/admin/events' }]} />

      <div className="admin-content max-w-4xl mx-auto">
        <EventFormResultModals
          error={error}
          onErrorDismissed={() => setError('')}
          successMsg={successMsg}
          onSuccessContinue={() => {
            setSuccessMsg('');
            router.push('/admin/events');
          }}
        />

        <form onSubmit={handleSubmit} className="admin-form">
          <BasicInfoPanel
            draft={formData}
            setDraft={setFormData}
            uploadingField={uploadingField}
            onImageFile={upload}
            clientId={clientId}
            onClientChange={next => {
              setClientId(next);
              setClientError(undefined);
            }}
            onClientAvailable={setCanLinkClient}
            clientError={clientError}
            onError={setError}
            onBusyChange={posterBusy}
          />

          <EventOptionsPanel
            eventType={eventType}
            onEventTypeChange={setEventType}
            options={categories}
            onChange={setCategories}
            onError={setError}
            onBusyChange={posterBusy}
          />

          <BankAccountsPanel
            accounts={bankAccounts}
            offersBankTransfer={offersBankTransfer(formData.registrationForm)}
            onChange={setBankAccounts}
            onError={setError}
            onBusyChange={posterBusy}
          />

          {/* Logistics Options */}
          <LogisticsPanel
            draft={formData}
            onChange={patchForm}
            deliveryOn={deliveryOn}
            onDeliveryChange={on => { setDeliveryOn(on); setDeliveryError(null); }}
            deliveryError={deliveryError}
          />

          <RegistrationFeesPanel
            draft={formData}
            onChange={patchForm}
            opening={opening}
            onOpeningChange={next => {
              setOpening(next);
              // The message goes the moment the organizer starts
              // fixing it; leaving it up while they type reads as a
              // field that is still wrong.
              if (openingError) setOpeningError(null);
            }}
            openingError={openingError}
            openingIdPrefix="newEventOpening"
            adminFeeHint={
              <>
                Starts at the default platform fee set in Settings. A change here
                applies to this event only.
              </>
            }
          />

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
              {isLoading ? <BusyLabel>Saving</BusyLabel> : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
