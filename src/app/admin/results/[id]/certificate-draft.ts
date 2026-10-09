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
