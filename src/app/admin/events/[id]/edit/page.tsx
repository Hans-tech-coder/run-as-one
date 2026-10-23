"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { takesResults } from '@/lib/event-format';
import CertificatePointer from './CertificatePointer';
import {
  OPENS_IMMEDIATELY,
  openingInstantISO,
  openingProblem,
  type OpeningDraft,
} from '../../registration-opening';
import EventOptionsPanel from '../../EventOptionsPanel';
import { blankCategory, type CategoryDraft } from '../../category-draft';
import { DEFAULT_EVENT_TYPE, type EventType } from '@/lib/event-type';
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
import BasicInfoPanel from '../../BasicInfoPanel';
import EventFormatPanel from '../../EventFormatPanel';
import { basicInfoProblem, changeUntilISO } from '../../event-form-draft';
import RegistrationFeesPanel from '../../RegistrationFeesPanel';
import PublishingPanel from '../../PublishingPanel';
import RegistrationHoldFields from './RegistrationHoldFields';
import AfterRacePanel from '../../AfterRacePanel';
import { openingBeforePublish, publishDraft } from '../../publish-draft';
import { describePublish } from '@/lib/event-visibility';
import EventFormResultModals from '../../EventFormResultModals';
import { useEventImageUpload } from '../../useEventImageUpload';
import { blankEditDraft, editStateFromEvent } from './event-edit-draft';

/**
 * The edit-event form. The panels are shared with the create form
 * (BasicInfoPanel, RegistrationFeesPanel, LogisticsPanel…), and turning the
 * fetched event into form state is `event-edit-draft.ts`; this file owns the
 * fetch, the validation before PUT, the PUT itself, and what only a saved
 * event has: the registration hold (RegistrationHoldFields), what shows after
 * the race (AfterRacePanel), the promotions, and the link to its certificate
 * in the results workspace.
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
  // When the event went (or goes) public. Read-only here: it changes from the
  // events list's Publish item, never by saving this form.
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [deliveryOn, setDeliveryOn] = useState(false);
  // Why a virtual run's window cannot be saved, under the day that is wrong.
  const [dateError, setDateError] = useState<string | undefined>();
  const [windowError, setWindowError] = useState<string | undefined>();
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

  // The client runs registration elsewhere and we only post results. Set when
  // the race is created (/admin/results/new) and never changed here — the
  // route ignores it on save. Outside formData because it decides which panels
  // exist rather than filling one.
  const [resultsOnly, setResultsOnly] = useState(false);
  // The saved title: what the breadcrumb of a results-only race goes by. Such a
  // race is listed under Results alone (RESULTS_NAV_PLAN.md R5), so its trail
  // leads back there rather than to an Events table it is not in.
  const [savedTitle, setSavedTitle] = useState('');
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
  // Why a photo album was refused, under that album's card (AfterRacePanel).
  const [albumError, setAlbumError] = useState<{ index: number; message: string } | null>(null);
  // Read-only, and not part of formData for that reason: promotions belong to
  // the marketing screen and nothing here posts them back.
  const [promotions, setPromotions] = useState<EventPromotion[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${id}`);
        if (!res.ok) throw new Error('Failed to fetch event');
        const raw = await res.json();
        const loaded = editStateFromEvent(raw);
        setPublishAt(raw.publishAt ?? null);

        setFormData(loaded.formData);
        setOpening(loaded.opening);
        setDeliveryOn(loaded.deliveryOn);
        setBankAccounts(loaded.bankAccounts);
        setEventType(loaded.eventType);
        setResultsOnly(loaded.resultsOnly);
        setSavedTitle(loaded.formData.title);
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

    // On-site needs a title, day and venue; a virtual run a title and a
    // window whose end is not before its start (event-form-draft.ts).
    const basicFault = basicInfoProblem(formData);
    setDateError(basicFault?.dateError);
    setWindowError(basicFault?.windowError);
    if (basicFault) {
      setError(basicFault.message);
      setIsLoading(false);
      return;
    }

    // Scheduled to open, with no usable date: the message goes under the date
    // field rather than into the failure modal, because that is the box that
    // has to change.
    // Neither check applies to a results-only event: it never opens, and it
    // ships no kits. Their panels are hidden, so a stale value in either would
    // be a message about a field the organizer cannot see.
    const openingFault = resultsOnly
      ? null
      : openingProblem(opening) ?? openingBeforePublish(publishDraft(publishAt), opening);
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
          registrationOpensAt: openingInstantISO(opening),
          categoryChangeUntil: changeUntilISO(formData.categoryChangeUntil),
          logisticsChangeUntil: changeUntilISO(formData.logisticsChangeUntil),
          categories,
          bankAccounts: cleanBankAccounts(bankAccounts),
          ...(canLinkClient ? { clientId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        // A refusal about the client or an album lands under its field, not the modal.
        if (data.errors?.clientId) setClientError(data.errors.clientId);
        else if (data.errors?.photoAlbums) {
          const index = Number(data.photoAlbumIndex) || 0;
          setAlbumError({ index, message: data.errors.photoAlbums });
          document.getElementById(`photoAlbum-${index}-url`)?.focus();
        } else setError(data.error || 'Failed to update event');
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
      {resultsOnly ? (
        <DashboardHeader
          title="Edit Details"
          crumbs={[
            { label: 'Results', href: '/admin/results' },
            { label: savedTitle, href: `/admin/results/${id}` },
          ]}
        />
      ) : (
        <DashboardHeader title="Edit Event" crumbs={[{ label: 'Events', href: '/admin/events' }]} />
      )}

      <div className="admin-content max-w-4xl mx-auto">
        <EventFormResultModals
          error={error}
          onErrorDismissed={() => setError('')}
          successMsg={successMsg}
          onSuccessContinue={() => {
            setSuccessMsg('');
            // Where the race lives: a results-only race is not on the Events
            // table, so landing there would look like it vanished.
            router.push(resultsOnly ? `/admin/results/${id}` : '/admin/events');
          }}
        />

        <form onSubmit={handleSubmit} className="admin-form">
          {/* On-site or virtual, first as on Create Event. Locked once anyone
              has registered (VIRTUAL_RUN_PLAN.md D7); a results-only race has
              no runners to run anywhere, so it is not asked. */}
          {!resultsOnly && (
            <EventFormatPanel
              format={formData.format}
              onChange={format => {
                patchForm({ format });
                setDateError(undefined);
                setWindowError(undefined);
              }}
              lockedReason={
                registrationCount > 0
                  ? `Locked because ${registrationCount} registration${registrationCount === 1 ? ' has' : 's have'} already been taken. Those runners signed up for this format.`
                  : null
              }
            />
          )}

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
            dateError={dateError}
            windowError={windowError}
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

              <RegistrationFeesPanel draft={formData} onChange={patchForm} />

              <PublishingPanel
                publish={publishDraft(publishAt)}
                publishStatus={
                  <p className="text-sm text-secondary m-0">
                    {describePublish({ publishAt })} To change it, use{' '}
                    <strong className="text-primary">Publish Event</strong> (or{' '}
                    <strong className="text-primary">Change Publishing</strong>) in this event&apos;s
                    menu on the{' '}
                    <Link href="/admin/events" className="underline">
                      Events list
                    </Link>
                    .
                  </p>
                }
                opening={opening}
                onOpeningChange={next => {
                  setOpening(next);
                  if (openingError) setOpeningError(null);
                }}
                openingError={openingError}
                idPrefix="editEvent"
                paused={formData.registrationPaused}
              >
                {/* The organizer's manual hold on sign-ups (RegistrationHoldFields). */}
                <RegistrationHoldFields draft={formData} onChange={patchForm} />
              </PublishingPanel>
            </>
          )}

          {/* What a finished race shows: its photos, and whether it promises
              times (PAST_EVENTS_PLAN.md D7). */}
          <AfterRacePanel
            draft={formData}
            eventType={eventType}
            resultsOnly={resultsOnly}
            onChange={patch => {
              patchForm(patch);
              if (patch.photoAlbums !== undefined) setAlbumError(null);
            }}
            albumError={albumError}
          />

          {/* A virtual run has no results, so no certificate (lib/event-format.ts). */}
          {takesResults(formData) && <CertificatePointer eventId={id} />}

          {/* Last, and read-only: what a runner can be given on this race,
              so a price set on this screen is not set without the discounts
              against it in view. Changing one is a link away rather than a
              control here — see the panel's own comment. */}
          {!resultsOnly && <EventPromotionsPanel promotions={promotions} />}

          <div className="form-actions">
            <Link href={resultsOnly ? `/admin/results/${id}` : '/admin/events'} className="btn-cancel">
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
