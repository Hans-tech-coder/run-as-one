import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor, type Actor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { UploadError, uploadPublicFile } from '@/lib/blob';

/**
 * The signed-in person's own profile photo: POST sets it, DELETE takes it off.
 *
 * Self-service like the rest of `admin/profile` — the id comes from the
 * session, so anyone who can sign in (a client viewer too) may set their own
 * and nobody else's. The form shrinks the picture to a small square before it
 * is sent, so what lands in the public store (`avatars/`) is a few kilobytes;
 * the usual upload rules (image types, 4 MB) still apply here as the backstop.
 *
 * **The old photo's blob is not deleted.** Both blob stores are shared between
 * local development and production (PROJECT_GUIDE §2), and a local-dev branch
 * reset from production carries production's URLs: deleting "the old photo"
 * from a laptop could take the live site's with it. A replaced avatar is a
 * few kilobytes, which is the cheaper failure.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const avatarUrl = await uploadPublicFile(formData.get('file'), 'avatars', 'image');
    await saveAvatar(actor, avatarUrl);
    return NextResponse.json({ avatarUrl });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Avatar upload failed:', error);
    return NextResponse.json({ error: 'Could not upload your photo. Please try again.' }, { status: 500 });
  }
}

export async function DELETE() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await saveAvatar(actor, null);
    return NextResponse.json({ avatarUrl: null });
  } catch (error) {
    console.error('Avatar removal failed:', error);
    return NextResponse.json({ error: 'Could not remove your photo. Please try again.' }, { status: 500 });
  }
}

async function saveAvatar(
  actor: Actor,
  avatarUrl: string | null,
) {
  const isStaff = actor.kind === 'STAFF';
  await prisma.$transaction(async tx => {
    if (isStaff) {
      await tx.staffAccount.update({ where: { id: actor.id }, data: { avatarUrl } });
    } else {
      await tx.organizer.update({ where: { id: actor.id }, data: { avatarUrl } });
    }
    await recordAudit(tx, actor, {
      action: 'profile.updated',
      entityType: isStaff ? 'StaffAccount' : 'Organizer',
      entityId: actor.id,
      summary: avatarUrl ? 'Changed their profile photo.' : 'Removed their profile photo.',
    });
  });
}
