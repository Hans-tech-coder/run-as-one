import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { recordWriteInCommunities, runnerCommunity } from '@/lib/running-community-store';
import crypto from 'crypto';
import { uploadPrivateProof, UploadError } from '@/lib/blob';
import { asDeliveryZone, deliveryFeeFor } from '@/app/events/[slug]/register/delivery';
import { storedShirtSize, subtotalWithUpcharge } from '@/lib/shirt-size';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const proofFile = formData.get('proofFile') as File | null;
    const eventId = formData.get('eventId') as string;
    const customerEmail = formData.get('customerEmail') as string;
    const customerName = formData.get('customerName') as string;
    const logisticsMethod = formData.get('logisticsMethod') as string;
    const deliveryZone = formData.get('deliveryZone') as string;
    const deliveryAddress = formData.get('deliveryAddress') as string;
    // Amounts arrive as centavos. Round defensively — Prisma rejects a
    // non-integer for an Int column, and a stray decimal here would 500.
    const centavos = (field: string) => Math.round(Number(formData.get(field)) || 0);

    const subtotal = centavos('subtotal');
    const deliveryFee = centavos('deliveryFee');
    const platformFee = centavos('platformFee');
    const transactionFee = centavos('transactionFee');
    const totalAmount = centavos('totalAmount');
    const paymentMethod = formData.get('paymentMethod') as string;
    const transactionNumber = formData.get('transactionNumber') as string;
    const consentGiven = formData.get('consentGiven') === 'true';

    const participantsStr = formData.get('participants') as string;
    const participants = JSON.parse(participantsStr || '[]');

    if (!proofFile) {
      return NextResponse.json({ error: 'Proof of payment is required' }, { status: 400 });
    }

    // The wizard already disables its submit button without this, but the
    // waiver is a legal gate, not a data-completeness one — an unauthorized
    // request that skips the UI must not be able to skip it either.
    if (!consentGiven) {
      return NextResponse.json(
        { error: 'Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.' },
        { status: 400 }
      );
    }

    // The client sends both the zone and the fee. They are two ways of saying
    // the same thing, so the organizer's prices decide which pairs are legal —
    // otherwise a registration could record "outside province" while paying the
    // inside rate. Same for the admin fee, which is now per event.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { categories: true }
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const zone = logisticsMethod === 'delivery' ? asDeliveryZone(deliveryZone) : null;
    const expectedDeliveryFee = deliveryFeeFor(event, zone);
    const expectedPlatformFee = event.adminFee * participants.length;
    // Category prices plus the large-size surcharge. Checked rather than
    // trusted: without this, a client could post a subtotal that leaves out the
    // 4XL surcharge and pay the smaller amount.
    const expectedSubtotal = subtotalWithUpcharge(
      participants,
      event.categories,
      event.shirtSizeUpcharge
    );

    if (
      deliveryFee !== expectedDeliveryFee ||
      platformFee !== expectedPlatformFee ||
      subtotal !== expectedSubtotal
    ) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    // 1. Store the receipt as a private blob. This route is public — anyone can
    // reach it — so uploadPrivateProof() enforces the type and size limits.
    // What we keep is the blob pathname; admins view it through
    // /api/admin/proof/[id], which signs a short-lived URL after checking auth.
    const proofPathname = await uploadPrivateProof(proofFile);

    // 2. Generate Order Reference
    const orderRef = `RM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // 3. Save to database
    const registration = await prisma.registration.create({
      data: {
        eventId,
        orderRef,
        customerEmail,
        customerName,
        logisticsMethod,
        // Only meaningful for delivery; pickup leaves it null.
        deliveryZone: zone,
        deliveryAddress,
        deliveryFee,
        subtotal,
        platformFee,
        transactionFee,
        totalAmount,
        paymentMethod: paymentMethod,
        proofOfPayment: proofPathname,
        transactionNumber: transactionNumber,
        status: 'PENDING', // Waiting for manual validation by admin
        // Checked above; recorded here as the organizer's evidence that the
        // waiver was agreed to at the moment of this specific submission.
        consentGiven: true,
        consentGivenAt: new Date(),
        runners: {
          create: participants.map((p: any) => ({
            categoryId: p.categoryId,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            gender: p.gender,
            birthdate: p.birthdate,
            singletSize: storedShirtSize(p, event.categories),
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            medicalConditions: p.medicalConditions,
            // Blank answers land on INDEPENDENT RUNNER; the field is optional.
            runningCommunity: runnerCommunity(p),
          }))
        }
      }
    });

    // Clubs nobody has approved yet go to the super admin's queue. This is
    // the only way a row enters that queue, so the list cannot be written to
    // by anyone who has not actually registered.
    await recordWriteInCommunities(participants);

    return NextResponse.json({ 
      success: true, 
      orderRef: registration.orderRef 
    });

  } catch (error: any) {
    // A rejected file is the runner's mistake, not ours — tell them what to fix.
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Manual Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
