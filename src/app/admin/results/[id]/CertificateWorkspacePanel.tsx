'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import CertificateSettingsPanel from '@/app/admin/events/CertificateSettingsPanel';
import { useEventImageUpload } from '@/app/admin/events/useEventImageUpload';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import type { CertificateDraft } from './certificate-draft';

/**
 * The workspace's E-Certificate step: the shared settings panel, saved through
 * `PUT /api/admin/events/[id]/certificate`, which writes these two columns and
 * nothing else of the event.
 *
 * Without `event:edit` the panel is still shown — what runners download is
 * worth seeing — but its controls are disabled and there is no Save, so
 * nobody lines up a layout only to be refused by the route.
 */
export default function CertificateWorkspacePanel({
  eventId,
  initial,
  event,
  canEdit,
  title,
}: {
  eventId: string;
  initial: CertificateDraft;
  event: { title: string; date: string; location: string };
  canEdit: boolean;
  title?: string;
}) {
  const router = useRouter();
  const { alert, toast } = useAlert();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { uploadingField, upload } = useEventImageUpload(setDraft, (message) => {
    if (message) alert({ variant: 'error', message });
  });

  const dirty =
    draft.certificateTemplate !== saved.certificateTemplate ||
    draft.certificateCoordinates !== saved.certificateCoordinates;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/certificate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert({ variant: 'error', message: data.error || 'The certificate could not be saved. Please try again.' });
        return;
      }
      // What the route stored, so the next comparison is against the column.
      const next = {
        certificateTemplate: data.certificateTemplate ?? '',
        certificateCoordinates: data.certificateCoordinates ?? draft.certificateCoordinates,
      };
      setDraft(next);
      setSaved(next);
      toast(
        next.certificateTemplate
          ? 'The certificate was saved. Runners download it with this template.'
          : 'The certificate was saved. Runners get the Run As One certificate.',
      );
      router.refresh();
    } catch {
      alert({ variant: 'error', message: 'The certificate could not be saved. Check the connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
      <CertificateSettingsPanel
        title={title}
        template={draft.certificateTemplate}
        settings={draft.certificateCoordinates}
        onSettingsChange={(certificateCoordinates) => setDraft(prev => ({ ...prev, certificateCoordinates }))}
        onTemplateFile={(e) => upload(e, 'certificateTemplate', 'template')}
        uploading={uploadingField === 'certificateTemplate'}
        disabled={!canEdit || uploadingField !== null}
        event={event}
        footer={
          canEdit ? (
            <div className="form-actions mt-6">
              {/* Saving mid-upload would store the certificate without its template. */}
              <button
                type="button"
                className="btn-light"
                disabled={!dirty || saving || uploadingField !== null}
                onClick={save}
              >
                {saving ? <BusyLabel>Saving</BusyLabel> : 'Save Certificate'}
              </button>
            </div>
          ) : (
            <p className="mt-6 mb-0 text-sm text-secondary">
              Only staff who can edit this event can change its certificate.
            </p>
          )
        }
      />
    </fieldset>
  );
}
