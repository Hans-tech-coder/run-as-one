'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import { postResults, type PreparedResults } from '../[id]/results-upload';
import { saveCertificate, type CertificateDraft } from '../[id]/certificate-draft';
import { listPhrase } from '../[id]/results-sheet';

/**
 * The one Save of /admin/results/new: up to three requests to routes that
 * already exist, in order — make the race (results-only only), upload its
 * results, save its certificate — then open the race's workspace.
 *
 * They cannot be one transaction, so what happens on a failure depends on
 * what was already stored:
 * - **nothing yet**: stay on the page with everything still filled in, and
 *   say what went wrong;
 * - **something**: open the race's workspace anyway, where the rest is one
 *   button away, and say which part did not save. Staying would invite a
 *   second Save, and a second results-only race.
 */

export type SaveStage = 'race' | 'results' | 'certificate';

export const SAVE_STAGE_LABEL: Record<SaveStage, string> = {
  race: 'Saving race',
  results: 'Uploading results',
  certificate: 'Saving certificate',
};

const STAGE_NAME: Record<SaveStage, string> = {
  race: 'the race',
  results: 'the results',
  certificate: 'the certificate',
};

const WHERE_TO_RETRY: Record<SaveStage, string> = {
  race: '',
  results: 'Upload them again in step 2 below.',
  certificate: 'Save it again in the E-Certificate section below.',
};

/** "Save Race, Results and Certificate" — what the button will do, in its own words. */
export function saveLabel(parts: { race?: boolean; results: boolean; certificate: boolean }): string | null {
  const things = [
    parts.race && 'Race',
    parts.results && 'Results',
    parts.certificate && 'Certificate',
  ].filter((thing): thing is string => Boolean(thing));
  return things.length ? `Save ${listPhrase(things)}` : null;
}

function messageOf(err: unknown): string {
  // fetch throws a TypeError when the request never got an answer.
  if (err instanceof TypeError) return 'The connection dropped. Check it and try again.';
  return err instanceof Error ? err.message : String(err);
}

export function useSaveNewResults() {
  const router = useRouter();
  const { alert, toast } = useAlert();
  // Stays set through the navigation that follows a save, so the button
  // cannot be pressed again while the workspace loads.
  const [stage, setStage] = useState<SaveStage | null>(null);

  const save = async (job: {
    /** Results-only: makes the race and resolves to its id. */
    createRace?: () => Promise<string>;
    /** An existing race's id; ignored when `createRace` is given. */
    eventId?: string;
    prepared: PreparedResults | null;
    /** Only when it changed — an untouched certificate is not re-saved. */
    certificate: CertificateDraft | null;
  }) => {
    let eventId = job.eventId ?? null;
    const done: SaveStage[] = [];
    let current: SaveStage = 'race';

    try {
      if (job.createRace) {
        setStage((current = 'race'));
        eventId = await job.createRace();
        done.push('race');
      }
      if (!eventId) throw new Error('No race was chosen.');
      if (job.prepared) {
        setStage((current = 'results'));
        await postResults(eventId, job.prepared);
        done.push('results');
      }
      if (job.certificate) {
        setStage((current = 'certificate'));
        await saveCertificate(eventId, job.certificate);
        done.push('certificate');
      }
    } catch (err) {
      const message = messageOf(err);
      if (done.length === 0 || !eventId) {
        setStage(null);
        alert({ variant: 'error', message });
        return;
      }
      router.push(`/admin/results/${eventId}`);
      const saved = listPhrase(done.map(stage => STAGE_NAME[stage]));
      alert({
        variant: 'error',
        message: `${saved.charAt(0).toUpperCase()}${saved.slice(1)} ${done.length === 1 ? 'was' : 'were'} saved, but ${STAGE_NAME[current]} did not: ${message} ${WHERE_TO_RETRY[current]}`,
      });
      return;
    }

    router.push(`/admin/results/${eventId}`);
    toast('Saved.');
  };

  return { stage, save };
}
