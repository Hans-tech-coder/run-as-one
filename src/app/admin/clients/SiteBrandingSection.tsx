"use client";

import React, { useId, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { BrandGlyph } from '@/components/BrandIcons';
import PhoneField from '@/app/events/[slug]/register/PhoneField';
import { SaveConfirmation } from '@/app/admin/settings/SettingsPanels';
import {
  BRANDING_FIELDS,
  MAX_HERO_HEADLINE,
  MAX_HERO_TAGLINE,
  SOCIAL_COLUMN,
  brandingDraft,
  brandingFieldError,
  type BrandingDraft,
  type BrandingField,
  type ClientBranding,
} from '@/lib/client-branding';
import { DEFAULT_COUNTRY } from '@/lib/phone';
import { MAX_SOCIAL_LINK, SITE_URL, SOCIAL_CHANNELS } from '@/lib/site-contact';
import { MAX_SUBDOMAIN, clientOrigin } from '@/lib/site-host';
import BrandImageField from './BrandImageField';

/** `runasone.ph`, the root every client site sits under. */
const SITE_ROOT = new URL(SITE_URL).hostname;

/**
 * ApplicationPanel's **Site & branding**: the client's own site,
 * `<subdomain>.runasone.ph` (CLIENT_SUBDOMAIN_PLAN.md D7, D8) — its subdomain,
 * logo, the hero on its /events page, and the contacts and socials its footer
 * shows. Staff only, like the rest of this screen.
 *
 * One form with one Save, through `PATCH /api/admin/clients/[id]`; every field
 * is checked as it loses focus and again on Save by the same rule the route
 * runs (lib/client-branding.ts). Images upload on pick but are only kept once
 * saved. The live link shows only for a saved subdomain, beside the reminder
 * that the address works only after its DNS record and Vercel domain exist
 * (plan §6) — a subdomain saved here does not set either up.
 */
export default function SiteBrandingSection({
  clientId,
  clientName,
  branding,
  onSaved,
}: {
  clientId: string;
  clientName: string;
  branding: ClientBranding;
  /** Refreshes the list, so the panel reopens on what was saved. */
  onSaved: () => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const baseId = useId();
  const [saved, setSaved] = useState(() => brandingDraft(branding));
  const [draft, setDraft] = useState(() => brandingDraft(branding));
  const [errors, setErrors] = useState<Partial<Record<BrandingField, string>>>({});
  const [uploads, setUploads] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const isDirty = BRANDING_FIELDS.some(f => draft[f].trim() !== saved[f]);
  const savedSubdomain = saved.subdomain;

  const set = (field: BrandingField, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };
  const check = (field: BrandingField) =>
    setErrors(prev => ({ ...prev, [field]: brandingFieldError(field, draft[field]) ?? '' }));
  const fieldId = (field: BrandingField) => `${baseId}-${field}`;
  const describedBy = (field: BrandingField) => (errors[field] ? `${fieldId(field)}-error` : undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found: Partial<Record<BrandingField, string>> = {};
    for (const field of BRANDING_FIELDS) {
      const problem = brandingFieldError(field, draft[field]);
      if (problem) found[field] = problem;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setJustSaved(false);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.errors) {
          setErrors(data.errors);
          return;
        }
        throw new Error(data?.error || 'The site and branding could not be saved.');
      }

      // What the route kept: lowercased, links given their https://.
      const next: BrandingDraft = brandingDraft(data.branding);
      setSaved(next);
      setDraft(next);
      setErrors({});
      setJustSaved(true);
      onSaved();
    } catch (err) {
      await alert(err instanceof Error ? err.message : 'The site and branding could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const textInput = (
    field: BrandingField,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    hint?: string,
  ) => (
    <div className="form-group min-w-0">
      <label className="form-label" htmlFor={fieldId(field)}>
        {label}
      </label>
      <input
        id={fieldId(field)}
        className="form-input"
        value={draft[field]}
        onChange={e => set(field, e.target.value)}
        onBlur={() => check(field)}
        disabled={isSaving}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field)}
        {...props}
      />
      {hint && <p className="text-xs text-secondary mt-1 mb-0">{hint}</p>}
      <FieldError id={`${fieldId(field)}-error`} message={errors[field]} />
    </div>
  );

  return (
    <section className="min-w-0">
      <h4 className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-secondary">
        Site &amp; branding
      </h4>
      <form
        className="rounded-[12px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="form-group min-w-0">
          <label className="form-label" htmlFor={fieldId('subdomain')}>
            Subdomain
          </label>
          <div className="flex items-center gap-2 min-w-0">
            <input
              id={fieldId('subdomain')}
              className="form-input min-w-0 flex-1"
              value={draft.subdomain}
              placeholder="crc"
              maxLength={MAX_SUBDOMAIN}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={e => set('subdomain', e.target.value.toLowerCase())}
              onBlur={() => check('subdomain')}
              disabled={isSaving}
              aria-invalid={errors.subdomain ? true : undefined}
              aria-describedby={`${fieldId('subdomain')}-hint${errors.subdomain ? ` ${fieldId('subdomain')}-error` : ''}`}
            />
            <span className="text-sm text-secondary shrink-0">.{SITE_ROOT}</span>
          </div>
          <p id={`${fieldId('subdomain')}-hint`} className="text-xs text-secondary mt-1 mb-0">
            Leave empty for no site. The address works only once its DNS record and Vercel
            domain are set up; saving here does not do that.
          </p>
          <FieldError id={`${fieldId('subdomain')}-error`} message={errors.subdomain} />
          {savedSubdomain && (
            <a
              href={clientOrigin(savedSubdomain)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent-blue-ink [overflow-wrap:anywhere]"
            >
              <Globe size={14} aria-hidden="true" />
              {clientOrigin(savedSubdomain).replace(/^https?:\/\//, '')}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BrandImageFieldFor
            field="logoUrl"
            label="Logo"
            hint="shown in the navbar and footer"
            alt={`${clientName} logo`}
            draft={draft}
            error={errors.logoUrl}
            disabled={isSaving}
            onChange={url => set('logoUrl', url)}
            onError={message => alert(message)}
            onBusyChange={busy => setUploads(n => n + (busy ? 1 : -1))}
          />
          <BrandImageFieldFor
            field="faviconUrl"
            label="Site Icon"
            hint="square, at least 180 × 180; the browser tab icon"
            alt={`${clientName} site icon`}
            draft={draft}
            error={errors.faviconUrl}
            disabled={isSaving}
            square
            onChange={url => set('faviconUrl', url)}
            onError={message => alert(message)}
            onBusyChange={busy => setUploads(n => n + (busy ? 1 : -1))}
          />
          <BrandImageFieldFor
            field="heroImageUrl"
            className="sm:col-span-2"
            label="Hero Image"
            preset="photo"
            hint="wide, above the events list"
            alt={`${clientName} hero`}
            draft={draft}
            error={errors.heroImageUrl}
            disabled={isSaving}
            onChange={url => set('heroImageUrl', url)}
            onError={message => alert(message)}
            onBusyChange={busy => setUploads(n => n + (busy ? 1 : -1))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {textInput('heroHeadline', 'Hero Headline', { maxLength: MAX_HERO_HEADLINE, placeholder: 'Run with us' })}
          {textInput('heroTagline', 'Hero Tagline', { maxLength: MAX_HERO_TAGLINE })}
          {textInput(
            'publicEmail',
            'Public Email',
            { type: 'email', inputMode: 'email', autoComplete: 'off', spellCheck: false },
            'Shown in the footer. The sign-in email stays private.',
          )}
          <div className="min-w-0">
            <PhoneField
              id={fieldId('publicPhone')}
              label="Public Phone"
              value={draft.publicPhone}
              defaultCountry={DEFAULT_COUNTRY}
              onChange={e164 => set('publicPhone', e164)}
              hint="Shown in the footer."
              error={errors.publicPhone || undefined}
            />
          </div>
          {SOCIAL_CHANNELS.map(channel => {
            const field = SOCIAL_COLUMN[channel.key];
            return (
              <div key={channel.key} className="form-group min-w-0">
                <label className="form-label flex items-center gap-2" htmlFor={fieldId(field)}>
                  <BrandGlyph channel={channel.key} size={14} />
                  {channel.name}
                </label>
                <input
                  id={fieldId(field)}
                  type="url"
                  inputMode="url"
                  className="form-input"
                  value={draft[field]}
                  placeholder={channel.example}
                  maxLength={MAX_SOCIAL_LINK}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => set(field, e.target.value)}
                  onBlur={() => check(field)}
                  disabled={isSaving}
                  aria-invalid={errors[field] ? true : undefined}
                  aria-describedby={describedBy(field)}
                />
                <FieldError id={`${fieldId(field)}-error`} message={errors[field]} />
              </div>
            );
          })}
        </div>

        <div className="form-actions settings-actions">
          <SaveConfirmation visible={justSaved && !isDirty} message="Site and branding saved" />
          <button type="submit" className="btn-light" disabled={isSaving || uploads > 0 || !isDirty}>
            {isSaving ? <BusyLabel>Saving</BusyLabel> : 'Save Site & Branding'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** A BrandImageField bound to one draft field, with that field's error under it. */
function BrandImageFieldFor({
  field,
  draft,
  error,
  className = '',
  ...props
}: {
  field: 'logoUrl' | 'faviconUrl' | 'heroImageUrl';
  draft: BrandingDraft;
  error?: string;
  /** For the hero, which spans the whole row: it is a wide banner. */
  className?: string;
} & Omit<React.ComponentProps<typeof BrandImageField>, 'value'>) {
  const errorId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <BrandImageField value={draft[field]} {...props} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
