'use client';

import React, { useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import { useEventImageUpload } from '../../events/useEventImageUpload';
import { certificateChanged } from '../[id]/certificate-draft';
import type { PreparedResults } from '../[id]/results-upload';
import EventPicker, { type PickableEvent } from './EventPicker';
import { CertificateStep, LockedStep, SaveBar, UploadStep } from './ResultsSteps';
import { saveLabel, useSaveNewResults } from './save-new-results';

/**
 * "Event is already in the system": 1. pick the race, then 2. its results and
 * 3. its certificate, both optional, saved together. Until a race is chosen
 * the two steps show locked, so the page still reads as three steps.
 */
export default function ExistingRaceFlow({ events }: { events: PickableEvent[] }) {
  const [selected, setSelected] = useState<PickableEvent | null>(null);

  return (
    <>
      <EventPicker events={events} selected={selected} onSelect={setSelected} />
      {selected ? (
        // Keyed by the race, so choosing another starts its steps afresh
        // rather than carrying one race's file over to the next.
        <ExistingRaceSteps key={selected.id} race={selected} />
      ) : (
        <>
          <LockedStep n={2} label="Upload results" reason="Choose the race first." />
          <LockedStep n={3} label="E-Certificate" reason="Choose the race first." />
          <SaveBar label={null} stage={null} busy={false} onSave={() => {}} />
        </>
      )}
    </>
  );
}

function ExistingRaceSteps({ race }: { race: PickableEvent }) {
  const { alert } = useAlert();
  const [prepared, setPrepared] = useState<PreparedResults | null>(null);
  const [certificate, setCertificate] = useState(race.certificate);
  const { uploadingField, upload } = useEventImageUpload(setCertificate, message => {
    if (message) alert({ variant: 'error', message });
  });
  const { stage, save } = useSaveNewResults();
  const certificateDirty = certificateChanged(certificate, race.certificate);

  return (
    <>
      <UploadStep
        categories={race.categories}
        resultsOnly={false}
        prepared={prepared}
        onPrepared={setPrepared}
        onRemove={() => setPrepared(null)}
      />
      <CertificateStep
        draft={certificate}
        onChange={certificateCoordinates => setCertificate(prev => ({ ...prev, certificateCoordinates }))}
        onTemplateFile={e => upload(e, 'certificateTemplate', 'template')}
        uploading={uploadingField === 'certificateTemplate'}
        event={race}
      />
      <SaveBar
        label={saveLabel({ results: prepared !== null, certificate: certificateDirty })}
        emptyHint="Add the results file or change the certificate to save. Nothing ready yet? Cancel and come back later."
        stage={stage}
        busy={uploadingField !== null}
        onSave={() =>
          save({
            eventId: race.id,
            prepared,
            certificate: certificateDirty ? certificate : null,
          })
        }
      />
    </>
  );
}
