"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  OPENS_IMMEDIATELY,
  openingInstantISO,
  openingProblem,
  type OpeningDraft,
} from '../../registration-opening';
import EventOptionsPanel from '../../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../../category-draft';
import { DEFAULT_EVENT_TYPE, EVENT_TYPES, type EventType } from '@/lib/event-type';
import BankAccountsPanel from '@/app/admin/events/BankAccountsPanel';
import EventPromotionsPanel from '@/app/admin/events/EventPromotionsPanel';
import type { EventPromotion } from '@/lib/promo-store';
import { cleanBankAccounts, type BankAccountDraft } from '@/app/admin/events/bank-account-draft';
import { offersBankTransfer } from '@/lib/registration-form';
import AdminRouteLoading from '@/app/admin/AdminRouteLoading';
import { EVENT_FORM_SHAPE } from '@/app/admin/route-loading-shape';
import BusyLabel from '@/components/ui/BusyLabel';
import DashboardHeader from '@/app/admin/DashboardHeader';
import LogisticsPanel, { deliveryFees, deliveryProblem } from '../../LogisticsPanel';
import CertificateSettingsPanel from '../../CertificateSettingsPanel';
import BasicInfoPanel from '../../BasicInfoPanel';
import ResultsOnlyPanel from '../../ResultsOnlyPanel';
import RegistrationFeesPanel from '../../RegistrationFeesPanel';
import EventFormResultModals from '../../EventFormResultModals';
import { useEventImageUpload } from '../../useEventImageUpload';
import { blankEditDraft, editStateFromEvent } from './event-edit-draft';

/**
 * The edit-event form. The panels are shared with the create form
 * (BasicInfoPanel, RegistrationFeesPanel, LogisticsPanel…), and turning the
 * fetched event into form state is `event-edit-draft.ts`; this file owns the
 * fetch, the validation before PUT, the PUT itself, and what only a saved
 * event has: the registration hold, the certificate and the promotions.
 */
export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // When this race starts taking sign-ups. Outside formData because it is two
  // fields standing for one nullable column — see registration-opening.ts.
  const [opening, setOpening] = useState<OpeningDraft>(OPENS_IMMEDIATELY);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const [formData, setFormData] = useState(blankEditDraft);
  const patchForm = (patch: Partial<typeof formData>) => setFormData(prev => ({ ...prev, ...patch }));
  const { uploadingField, upload } = useEventImageUpload(setFormData, setError);

  // Not part of formData because EventOptionsPanel owns it rather than a plain
  // input. Editable while the event has no registrations and locked after —
  // see lockedReason where the panel is rendered. It has to be echoed back on
  // save regardless: leaving it out of the PUT would make asEventType() fall
  // back to RACE and silently retype every fun run.
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE);
  const [registrationCount, setRegistrationCount] = useState(0);

  const [categories, setCategories] = useState<CategoryDraft[]>([blankCategory()]);

  // The client runs registration elsewhere and we only post results
  // (ResultsOnlyPanel). Outside formData because it decides which panels exist
  // rather than filling one. Turning it on also makes the event distances: a
  // results table is grouped by distance, and a package has none.
  const [resultsOnly, setResultsOnly] = useState(false);
  const changeResultsOnly = (on: boolean) => {
    setResultsOnly(on);
    if (on) setEventType(EVENT_TYPES.RACE);
  };
  // How many category/package posters are uploading right now, for the same
  // reason as uploadingField: saving mid-upload would store a row without its
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
  // Read-only, and not part of formData for that reason: promotions belong to
  // the marketing screen and nothing here posts them back.
  const [promotions, setPromotions] = useState<EventPromotion[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${id}`);
        if (!res.ok) throw new Error('Failed to fetch event');
        const loaded = editStateFromEvent(await res.json());

        setFormData(loaded.formData);
        setOpening(loaded.opening);
        setDeliveryOn(loaded.deliveryOn);
        setBankAccounts(loaded.bankAccounts);
        setEventType(loaded.eventType);
        setResultsOnly(loaded.resultsOnly);
        setClientId(loaded.clientId);
        setRegistrationCount(loaded.registrationCount);
        setPromotions(loaded.promotions);
        if (loaded.categories) setCategories(loaded.categories);
      } catch (err) {
        setError('Could not load event data. Please try again.');
      } finally {
        setIsFetching(false);
      }
    };
    fetchEvent();
  }, [id]);

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
    // Neither check applies to a results-only event: it never opens, and it
    // ships no kits. Their panels are hidden, so a stale value in either would
    // be a message about a field the organizer cannot see.
    const openingFault = resultsOnly ? null : openingProblem(opening);
    setOpeningError(openingFault);
    if (openingFault) {
      setIsLoading(false);
      return;
    }

    // Delivery switched on with both zones at 0 would quietly save as pickup
    // only; the message sits under the two fee fields that need a number.
    const deliveryFault = resultsOnly ? null : deliveryProblem(deliveryOn, formData);
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
          resultsOnly,
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
          <ResultsOnlyPanel
            on={resultsOnly}
            onChange={changeResultsOnly}
            registrationCount={registrationCount}
          />

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
            resultsOnly={resultsOnly}
          />

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
            onBusyChange={posterBusy}
            resultsOnly={resultsOnly}
          />

          {/* Everything about selling an entry. A results-only event sells
              none, so these panels are not shown at all; what they hold stays
              in state, so switching back restores it. */}
          {!resultsOnly && (
            <>
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
                  if (openingError) setOpeningError(null);
                }}
                openingError={openingError}
                openingIdPrefix="editEventOpening"
              >
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
                      onChange={e => patchForm({ registrationPaused: e.target.checked })}
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
                      onChange={e => patchForm({ registrationPauseNote: e.target.value })}
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
              </RegistrationFeesPanel>
            </>
          )}

          <CertificateSettingsPanel
            template={formData.certificateTemplate}
            settings={formData.certificateCoordinates}
            onSettingsChange={(certificateCoordinates) => setFormData((prev) => ({ ...prev, certificateCoordinates }))}
            onTemplateFile={(e) => upload(e, 'certificateTemplate', 'template')}
            uploading={uploadingField === 'certificateTemplate'}
            disabled={uploadingField !== null}
            event={{ title: formData.title, date: formData.date, location: formData.location }}
          />

          {/* Last, and read-only: what a runner can be given on this race,
              so a price set on this screen is not set without the discounts
              against it in view. Changing one is a link away rather than a
              control here — see the panel's own comment. */}
          {!resultsOnly && <EventPromotionsPanel promotions={promotions} />}

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
