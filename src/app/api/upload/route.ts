import { NextResponse } from 'next/server';
import { canSomewhere, getActor } from '@/lib/actor';
import { uploadPublicFile, UploadError } from '@/lib/blob';

/**
 * Image uploads for the admin event forms (banner, race kit, certificate
 * template). Organizer-only: without the auth check this would be an open
 * upload endpoint that anyone could use to fill the blob store.
 *
 * Both event forms share it, so it asks whether the actor may create or edit
 * an event anywhere rather than on one: the create form has no event id yet.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canSomewhere(actor, 'event:create') && !canSomewhere(actor, 'event:edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();

    // Certificate templates may also be PDFs; everything else is images only.
    const kind = formData.get('kind') === 'template' ? 'template' : 'image';

    const url = await uploadPublicFile(formData.get('file'), 'events', kind);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Image upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
