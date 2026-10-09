'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, Trash2 } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import CertificateSettingsPanel from '../[id]/CertificateSettingsPanel';
import ResultsUploaderClient from '../[id]/ResultsUploaderClient';
import type { UploadCategory } from '../[id]/TargetCategoryPicker';
import type { CertificateDraft } from '../[id]/certificate-draft';
import type { PreparedResults } from '../[id]/results-upload';
import { listPhrase } from '../[id]/results-sheet';
import { upperCaseForStorage } from '@/lib/text-case';
import { SAVE_STAGE_LABEL, type SaveStage } from './save-new-results';

/**
 * The pieces both ways of starting a race's results share on
 * /admin/results/new: the numbered step titles, step 2 (the results file),
 * step 3 (the e-certificate) and the one Save at the foot.
 *
 * Steps 2 and 3 only gather. Nothing is sent until Save, because a
 * results-only race has no id to store them against before then — and one
 * Save at the end is the whole point of putting the three steps on one page.
 */

/** "2. Upload results - optional", in the form's own "- optional" style. */
export function StepTitle({ n, label, optional = false }: { n: number; label: string; optional?: boolean }) {
  return (
    <>
      {n}. {label}
      {optional && <span className="ml-2 text-xs font-normal opacity-70">- optional</span>}
    </>
  );
}

/**
 * A step that cannot be used yet, with the reason at full contrast (the title
 * is the part that dims — PROJECT_GUIDE §8 rule 2).
 */
export function LockedStep({ n, label, reason }: { n: number; label: string; reason: string }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title flex items-center gap-2 opacity-60">
          <Lock size={16} aria-hidden="true" />
          {n}. {label}
        </h2>
      </div>
      <div className="admin-panel-content">
        <p className="m-0 text-sm text-secondary">{reason}</p>
      </div>
    </section>
  );
}

/**
 * Step 2: the timing company's file, read and mapped in the usual modal, then
 * held here as a summary until Save. The uploader stays mounted in both
 * states, so Change file reopens the modal with the mapping as it was left.
 */
export function UploadStep({
  categories,
  resultsOnly,
  prepared,
  onPrepared,
  onRemove,
}: {
  categories: UploadCategory[];
  resultsOnly: boolean;
  prepared: PreparedResults | null;
  onPrepared: (prepared: PreparedResults) => void;
  onRemove: () => void;
}) {
  const created = prepared?.newCategories.map(cat => upperCaseForStorage(cat.name)) ?? [];

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">
          <StepTitle n={2} label="Upload results" optional />
        </h2>
      </div>
      <div className="admin-panel-content flex flex-col items-start gap-4">
        <p className="m-0 text-sm text-secondary">
          The timing company&apos;s spreadsheet, .xlsx or .csv. Each sheet maps to
          {resultsOnly ? ' a category made from the sheet name' : ' one category of this race'}. Not in yet? Skip
          this step and upload them later from Results.
        </p>

        {prepared && (
          <div
            className="flex w-full items-start gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--ink-02)] p-4"
            role="status"
          >
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--status-success)]" aria-hidden="true" />
            <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
              <p className="m-0 font-medium text-primary">
                {prepared.results.length} finisher{prepared.results.length === 1 ? '' : 's'} from{' '}
                {listPhrase(prepared.sheets)}, ready to save
              </p>
              {created.length > 0 && (
                <p className="m-0 mt-1 text-secondary">
                  Creates {created.length === 1 ? 'the category' : 'the categories'} {listPhrase(created)}.
                </p>
              )}
              {prepared.skippedSheets.length > 0 && (
                <p className="m-0 mt-1 text-secondary">
                  {listPhrase(prepared.skippedSheets)} had no usable rows and will be skipped.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <ResultsUploaderClient
            event={{ categories, resultsOnly }}
            onPrepared={onPrepared}
            triggerLabel={prepared ? 'Change file' : 'Choose results file'}
          />
          {prepared && (
            <button type="button" onClick={onRemove} className="btn-filter min-h-11">
              <Trash2 size={16} aria-hidden="true" /> Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Step 3: the shared certificate settings, held in the page's draft and saved
 * with everything else. The template image itself uploads the moment it is
 * picked, as on every form; only the race's setting waits for Save.
 */
export function CertificateStep({
  draft,
  onChange,
  onTemplateFile,
  uploading,
  event,
}: {
  draft: CertificateDraft;
  onChange: (certificateCoordinates: string) => void;
  onTemplateFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  event: { title: string; date: string; location: string };
}) {
  return (
    <CertificateSettingsPanel
      title={<StepTitle n={3} label="E-Certificate" optional />}
      template={draft.certificateTemplate}
      settings={draft.certificateCoordinates}
      onSettingsChange={onChange}
      onTemplateFile={onTemplateFile}
      uploading={uploading}
      disabled={uploading}
      event={event}
    />
  );
}

/**
 * The one Save. Its label names what it will save, so nobody wonders whether
 * the file in step 2 went up already; with nothing to save it is disabled and
 * says why beside it.
 */
export function SaveBar({
  label,
  emptyHint,
  stage,
  busy,
  onSave,
}: {
  /** "Save Race, Results and Certificate"; null when there is nothing to save. */
  label: string | null;
  emptyHint?: string;
  stage: SaveStage | null;
  /** An image still uploading: saving now would store the race without it. */
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <>
      {!label && emptyHint && <p className="m-0 text-right text-sm text-secondary">{emptyHint}</p>}
      <div className="form-actions">
        <Link href="/admin/results" className="btn-cancel">
          Cancel
        </Link>
        <button type="button" onClick={onSave} disabled={!label || stage !== null || busy} className="btn-light">
          {stage ? <BusyLabel>{SAVE_STAGE_LABEL[stage]}</BusyLabel> : label ?? 'Save'}
        </button>
      </div>
    </>
  );
}
