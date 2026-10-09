import { defaultCertificateSettingsJson, parseCertificateSettings } from '@/lib/certificate-settings';

/**
 * What the workspace's E-Certificate panel starts from, given the event row.
 * It moved here from the edit form's draft with the panel (RESULTS_NAV_PLAN.md,
 * Batch 2); the rules are unchanged.
 */
export type CertificateDraft = { certificateTemplate: string; certificateCoordinates: string };

// The premade templates that used to sit under /public/certificates are gone —
// the only way to get a certificate background now is to upload one. An event
// saved back when the picker existed still points at a deleted file, so drop
// that path instead of previewing a 404.
const uploadedTemplate = (value: string | null) =>
  value && !value.startsWith('/certificates/template_') ? value : '';

export function certificateDraft(event: {
  certificateTemplate: string | null;
  certificateCoordinates: string | null;
}): CertificateDraft {
  const template = uploadedTemplate(event.certificateTemplate);
  return {
    certificateTemplate: template,
    // An event with a template keeps the layout its runners have been
    // getting — legacy until an admin switches (an empty column reads as
    // legacy; see certificate-settings.ts). One with no template has no
    // runner relying on a layout, so its first template starts designed.
    certificateCoordinates: template
      ? event.certificateCoordinates || JSON.stringify({ nameY: 50, timeY: 60, catY: 70 })
      : parseCertificateSettings(event.certificateCoordinates).v === 2
        ? (event.certificateCoordinates ?? defaultCertificateSettingsJson())
        : defaultCertificateSettingsJson(),
  };
}

/** Whether a draft differs from the one it started as — the only time it is worth a save. */
export function certificateChanged(draft: CertificateDraft, from: CertificateDraft): boolean {
  return (
    draft.certificateTemplate !== from.certificateTemplate ||
    draft.certificateCoordinates !== from.certificateCoordinates
  );
}

/**
 * Saves the two certificate columns through `PUT /api/admin/events/[id]/certificate`
 * and returns what the route stored, so the next comparison is against the
 * column. Throws with the route's own words when it refuses. Shared by the
 * workspace's panel and /admin/results/new's single Save.
 */
export async function saveCertificate(eventId: string, draft: CertificateDraft): Promise<CertificateDraft> {
  const res = await fetch(`/api/admin/events/${eventId}/certificate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The certificate could not be saved. Please try again.');
  return {
    certificateTemplate: data.certificateTemplate ?? '',
    certificateCoordinates: data.certificateCoordinates ?? draft.certificateCoordinates,
  };
}
