"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, UploadCloud } from 'lucide-react';
import AdminSelect from '@/app/admin/AdminSelect';
import BusyLabel from '@/components/ui/BusyLabel';
import { acceptAttribute } from '@/lib/uploads';
import {
  BYLINE_BOTTOM_RANGE,
  CONTENT_AREA_PRESETS,
  DEFAULT_DESIGNED_SETTINGS,
  MIN_CONTENT_SPAN,
  parseCertificateSettings,
  serializeCertificateSettings,
  type CertificateFields,
  type CertificateSettings,
  type DesignedCertificateSettings,
} from '@/lib/certificate-settings';

/**
 * A race's E-Certificate Settings: the organizer's template, and how the
 * certificate is drawn on it (`lib/certificate-settings.ts`). Mounted only
 * under Results — the workspace, /admin/results/[id] (RESULTS_NAV_PLAN.md,
 * Batch 2), and step 3 of /admin/results/new — so the event form never edits
 * the same setting.
 *
 * The preview is the real PDF — `buildCertificatePdf` run on a sample runner
 * with the settings as they stand — so what an admin lines up here is exactly
 * what a runner downloads. It replaced a CSS imitation that cropped the
 * template while the PDF stretched it, and could be off by several percent.
 */

const FIELD_LABELS: [keyof CertificateFields, string][] = [
  ['title', 'Certificate of Completion'],
  ['eventTitle', 'Event title'],
  ['eventDetails', 'Event date & location'],
  ['category', 'Category'],
  ['bib', 'Bib number'],
  ['rank', 'Rank (gender, with overall under it)'],
];

const INK_OPTIONS = [
  { value: 'auto', label: 'Auto', hint: 'Reads the template and picks dark or light text' },
  { value: 'dark', label: 'Dark text', hint: 'For a light template' },
  { value: 'light', label: 'Light text', hint: 'For a dark template' },
] as const;

const BYLINE_OPTIONS = [
  { value: 'center', label: 'Bottom center' },
  { value: 'right', label: 'Bottom right' },
  { value: 'left', label: 'Bottom left' },
] as const;

const SAMPLE_RUNNERS = {
  typical: { name: 'Juan Dela Cruz', chipTime: '1:52:47', bibNumber: '1042', categoryRank: 12, genderRank: 9, gender: 'M', category: { name: '21K' } },
  long: {
    name: 'Maria Concepcion Dela Cruz-Santiago de los Reyes', chipTime: '2:04:33', bibNumber: '21507',
    categoryRank: 128, genderRank: 41, gender: 'F', category: { name: '21K Half Marathon' },
  },
};

const RUN_AS_ONE_ORANGE = '#ff6b00';

interface Props {
  template: string;
  settings: string;
  onSettingsChange: (next: string) => void;
  onTemplateFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  disabled: boolean;
  /** The event as the form currently has it, for the preview. */
  event: { title: string; date: string; location: string };
  /** The workspace and /admin/results/new number it as a step. */
  title?: React.ReactNode;
  /** Under the controls, inside the panel: the workspace's Save. */
  footer?: React.ReactNode;
}

export default function CertificateSettingsPanel({
  template, settings, onSettingsChange, onTemplateFile, uploading, disabled, event,
  title = 'E-Certificate Settings', footer,
}: Props) {
  const parsed = useMemo(() => parseCertificateSettings(settings), [settings]);
  const update = (next: CertificateSettings) => onSettingsChange(serializeCertificateSettings(next));

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">{title}</h2>
      </div>
      <div className="admin-panel-content">
        <div className="form-group mb-6">
          <label className="form-label">Certificate Template</label>
          <div className="file-upload-wrapper" style={{ opacity: disabled ? 0.6 : 1 }}>
            <input
              type="file"
              accept={acceptAttribute('template')}
              onChange={onTemplateFile}
              className="file-upload-input"
              disabled={disabled}
            />
            <div className="file-upload-content">
              <div className="file-upload-icon">
                <UploadCloud size={32} />
              </div>
              <div className="file-upload-title">
                {uploading ? <BusyLabel>Uploading</BusyLabel> : 'Upload Certificate Template'}
              </div>
              <div className="file-upload-desc">
                PNG, JPG, or PDF — A4 landscape (3508 × 2480 px) with a clear space in the middle. Without one, runners get the Run As One certificate.
              </div>
            </div>
          </div>
          {/* A new tab, because leaving the workspace would drop an unsaved
              template or settings change. */}
          <a
            href="/admin/certificate-guide"
            target="_blank"
            rel="noopener"
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-accent-blue-ink"
          >
            <ExternalLink size={16} aria-hidden="true" /> Template guide
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>

        {template && (
          <div className="mt-8 border border-[var(--dash-border)] rounded-lg p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="w-full lg:w-1/3 flex flex-col gap-6 order-2 lg:order-none">
                {parsed.v === 2 ? (
                  <DesignedControls settings={parsed} onChange={update} />
                ) : (
                  <LegacyControls
                    settings={parsed}
                    onChange={update}
                    onUpgrade={() => update(DEFAULT_DESIGNED_SETTINGS)}
                  />
                )}
              </div>
              <div className="w-full lg:w-2/3">
                <CertificatePreview template={template} settings={settings} event={event} />
              </div>
            </div>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

function Range({ label, value, min = 0, max = 100, step = 1, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="form-label flex justify-between">
        <span>{label}</span>
        <span className="text-accent-blue-ink">{value}%</span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-blue max-lg:h-11"
      />
    </div>
  );
}

function DesignedControls({ settings, onChange }: {
  settings: DesignedCertificateSettings; onChange: (next: DesignedCertificateSettings) => void;
}) {
  const set = (patch: Partial<DesignedCertificateSettings>) => onChange({ ...settings, ...patch });
  const accent = settings.accent || RUN_AS_ONE_ORANGE;

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-primary">Content area</h3>
        <p className="text-secondary text-sm mt-1">
          The clear space on the template. The certificate&apos;s text is fitted inside it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Content area presets">
        {CONTENT_AREA_PRESETS.map((preset) => {
          const active = settings.top === preset.top && settings.bottom === preset.bottom;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => set({ top: preset.top, bottom: preset.bottom })}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left ${active ? 'border-[var(--accent-blue-text)] bg-[var(--dash-hover)]' : 'border-[var(--dash-border)]'}`}
            >
              <span className="block text-sm font-semibold text-primary">{preset.label}</span>
              <span className="block text-xs text-secondary">{preset.hint}</span>
            </button>
          );
        })}
      </div>
      <Range
        label="Top edge" value={settings.top} max={100 - MIN_CONTENT_SPAN}
        onChange={(top) => set({ top, bottom: Math.max(settings.bottom, top + MIN_CONTENT_SPAN) })}
      />
      <Range
        label="Bottom edge" value={settings.bottom} min={MIN_CONTENT_SPAN}
        onChange={(bottom) => set({ bottom, top: Math.min(settings.top, bottom - MIN_CONTENT_SPAN) })}
      />

      <AdminSelect
        label="Text color"
        listboxLabel="Text color"
        value={settings.ink}
        options={INK_OPTIONS}
        onChange={(ink) => set({ ink: ink as DesignedCertificateSettings['ink'] })}
        hint="Auto works on PNG and JPG templates; a PDF template gets dark text unless you pick light."
      />

      <div className="form-group">
        <label className="form-label" htmlFor="certificateAccent">Accent color</label>
        <div className="flex items-center gap-3">
          <input
            id="certificateAccent"
            type="color"
            value={accent}
            onChange={(e) => set({ accent: e.target.value.toLowerCase() })}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-[var(--dash-border)] bg-transparent"
          />
          <span className="font-mono text-sm text-primary">{accent.toUpperCase()}</span>
          {settings.accent && (
            <button type="button" onClick={() => set({ accent: '' })} className="ml-auto min-h-11 text-sm text-accent-blue-ink">
              Use Run As One orange
            </button>
          )}
        </div>
        <p className="text-secondary text-sm mt-2">The finish time, the rule under the title and the dots. Use the organizer&apos;s brand color.</p>
      </div>

      <fieldset className="form-group">
        <legend className="form-label">Show on the certificate</legend>
        <p className="text-secondary text-sm mb-2">The runner&apos;s name and finish time are always shown.</p>
        <div className="flex flex-col">
          {FIELD_LABELS.map(([key, label]) => (
            <div key={key} className="checkbox-group min-h-11">
              <input
                type="checkbox"
                id={`certificateField-${key}`}
                checked={settings.fields[key]}
                onChange={(e) => set({ fields: { ...settings.fields, [key]: e.target.checked } })}
                className="w-5 h-5 accent-accent-blue"
              />
              <label htmlFor={`certificateField-${key}`} className="text-primary font-medium">{label}</label>
            </div>
          ))}
        </div>
      </fieldset>

      <AdminSelect
        label="Run As One byline"
        listboxLabel="Run As One byline"
        value={settings.byline}
        options={BYLINE_OPTIONS}
        onChange={(byline) => set({ byline: byline as DesignedCertificateSettings['byline'] })}
        hint="The small “e-certificate by Run As One” mark. Put it where the template is clear."
      />
      <Range
        label="Byline height from the bottom"
        value={settings.bylineBottom}
        min={BYLINE_BOTTOM_RANGE.min}
        max={BYLINE_BOTTOM_RANGE.max}
        step={0.5}
        onChange={(bylineBottom) => set({ bylineBottom })}
      />
    </>
  );
}

function LegacyControls({ settings, onChange, onUpgrade }: {
  settings: Extract<CertificateSettings, { v: 1 }>;
  onChange: (next: CertificateSettings) => void;
  onUpgrade: () => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-[var(--dash-border)] p-4">
        <h3 className="text-base font-bold text-primary">Old three-line layout</h3>
        <p className="text-secondary text-sm mt-1 mb-4">
          This event still prints only the name, time and category in plain text. The designed layout adds the
          full Run As One certificate design on top of the template, in the organizer&apos;s colors.
        </p>
        <button type="button" onClick={onUpgrade} className="btn-light w-full">
          Switch to designed layout
        </button>
      </div>
      <Range label="Name Position (Y%)" value={settings.nameY} onChange={(nameY) => onChange({ ...settings, nameY })} />
      <Range label="Finish Time Position (Y%)" value={settings.timeY} onChange={(timeY) => onChange({ ...settings, timeY })} />
      <Range label="Category Position (Y%)" value={settings.catY} onChange={(catY) => onChange({ ...settings, catY })} />
    </>
  );
}

/**
 * The certificate exactly as a runner will get it, regenerated half a second
 * after the last change. A phone's browser cannot show a PDF in a frame, so the
 * same file is always a link away too.
 */
function CertificatePreview({ template, settings, event }: {
  template: string; settings: string; event: Props['event'];
}) {
  const [sample, setSample] = useState<keyof typeof SAMPLE_RUNNERS>('typical');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Read field by field: the form hands over a fresh object on every render,
  // and keying the effect on it would redraw the PDF at each keystroke.
  const { title, date, location } = event;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const { buildCertificatePdf } = await import('@/lib/e-certificate');
        const bytes = await buildCertificatePdf(SAMPLE_RUNNERS[sample], {
          title, date, location, certificateTemplate: template, certificateCoordinates: settings,
        });
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        setPdfUrl(url);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [template, settings, title, date, location, sample]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-primary">Preview</h3>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--dash-border)] p-1" role="group" aria-label="Sample runner">
          {(['typical', 'long'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={sample === key}
              onClick={() => setSample(key)}
              className={`min-h-9 rounded-md px-3 text-sm ${sample === key ? 'bg-[var(--dash-hover)] text-primary font-semibold' : 'text-secondary'}`}
            >
              {key === 'typical' ? 'Sample runner' : 'Long name'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative w-full aspect-[1.414] rounded-md border border-[var(--dash-border)] overflow-hidden bg-[var(--dash-sunken)]">
        {pdfUrl && (
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`}
            title="Certificate preview"
            className="absolute inset-0 h-full w-full"
          />
        )}
        {(busy || !pdfUrl) && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-secondary text-sm">
            <BusyLabel>Drawing preview</BusyLabel>
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[var(--status-danger)]">
            The template could not be read. Upload a PNG, JPG or PDF.
          </div>
        )}
      </div>
      {pdfUrl && (
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-accent-blue-ink">
          <ExternalLink size={16} /> Open the sample PDF
        </a>
      )}
    </div>
  );
}
