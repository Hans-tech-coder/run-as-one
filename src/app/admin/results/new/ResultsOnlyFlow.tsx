'use client';

import React, { useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import { EVENT_TYPES } from '@/lib/event-type';
import BasicInfoPanel from '../../events/BasicInfoPanel';
import { blankEventDraft } from '../../events/event-form-draft';
import { useEventImageUpload } from '../../events/useEventImageUpload';
import { certificateChanged, certificateDraft } from '../[id]/certificate-draft';
import type { PreparedResults } from '../[id]/results-upload';
import { listPhrase } from '../[id]/results-sheet';
import { CertificateStep, SaveBar, UploadStep } from './ResultsSteps';
import { saveLabel, useSaveNewResults } from './save-new-results';

/** A new race's certificate before anyone touches it: no template, the designed layout. */
const BLANK_CERTIFICATE = certificateDraft({ certificateTemplate: null, certificateCoordinates: null });

/**
 * "Results only, registration was elsewhere": 1. the race's details, 2. its
 * results and 3. its certificate, the last two optional, all saved by the one
 * Save at the foot. The race is made through the ordinary
 * `POST /api/admin/events` as results-only with no categories — so every gate
 * keyed on `resultsOnly` (refused checkouts, the D1 visibility) holds from the
 * start — and the upload then makes its categories from the sheet names.
 */
export default function ResultsOnlyFlow({ defaultAdminFee }: { defaultAdminFee: number }) {
  const { alert } = useAlert();
  const showError = (message: string) => {
    if (message) alert({ variant: 'error', message });
  };
  const [draft, setDraft] = useState(() => blankEventDraft(defaultAdminFee));
  const cover = useEventImageUpload(setDraft, showError);
  const [clientId, setClientId] = useState('');
  const [canLinkClient, setCanLinkClient] = useState(false);
  const [clientError, setClientError] = useState<string | undefined>();

  const [prepared, setPrepared] = useState<PreparedResults | null>(null);
  const [certificate, setCertificate] = useState(BLANK_CERTIFICATE);
  const template = useEventImageUpload(setCertificate, showError);
  const certificateDirty = certificateChanged(certificate, BLANK_CERTIFICATE);

  const { stage, save } = useSaveNewResults();

  const createRace = async (): Promise<string> => {
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        // A results table is grouped by distance, and a package has none.
        eventType: EVENT_TYPES.RACE,
        resultsOnly: true,
        // None yet: the upload makes them from the sheet names.
        categories: [],
        ...(canLinkClient ? { clientId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A refusal about the client is also marked under its picker.
      if (data.errors?.clientId) setClientError(data.errors.clientId);
      throw new Error(data.error || 'The race could not be saved. Try again.');
    }
    return data.id;
  };

  const handleSave = () => {
    const missing = [
      !draft.title.trim() && 'title',
      !draft.date && 'date',
      !draft.location.trim() && 'location',
    ].filter((field): field is string => Boolean(field));
    if (missing.length > 0) {
      alert({ variant: 'error', message: `Add the race's ${listPhrase(missing)} in step 1 before saving.` });
      return;
    }
    save({ createRace, prepared, certificate: certificateDirty ? certificate : null });
  };

  return (
    <>
      <BasicInfoPanel
        draft={draft}
        setDraft={setDraft}
        uploadingField={cover.uploadingField}
        onImageFile={cover.upload}
        clientId={clientId}
        onClientChange={next => {
          setClientId(next);
          setClientError(undefined);
        }}
        onClientAvailable={setCanLinkClient}
        clientError={clientError}
        onError={showError}
        onBusyChange={() => {}}
        resultsOnly
        title="1. Details"
      />

      <UploadStep
        categories={[]}
        resultsOnly
        prepared={prepared}
        onPrepared={setPrepared}
        onRemove={() => setPrepared(null)}
      />

      <CertificateStep
        draft={certificate}
        onChange={certificateCoordinates => setCertificate(prev => ({ ...prev, certificateCoordinates }))}
        onTemplateFile={e => template.upload(e, 'certificateTemplate', 'template')}
        uploading={template.uploadingField === 'certificateTemplate'}
        event={draft}
      />

      <SaveBar
        label={saveLabel({ race: true, results: prepared !== null, certificate: certificateDirty })}
        stage={stage}
        // Saving mid-upload would store the race without its cover or template.
        busy={cover.uploadingField !== null || template.uploadingField !== null}
        onSave={handleSave}
      />
    </>
  );
}
