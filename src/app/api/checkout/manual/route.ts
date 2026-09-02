import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';
import { uploadPrivateProof, UploadError } from '@/lib/blob';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const proofFile = formData.get('proofFile') as File | null;
    const eventId = formData.get('eventId') as string;
    const customerEmail = formData.get('customerEmail') as string;
    const customerName = formData.get('customerName') as string;
    const logisticsMethod = formData.get('logisticsMethod') as string;
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
    
    const participantsStr = formData.get('participants') as string;
    const participants = JSON.parse(participantsStr || '[]');

    if (!proofFile) {
      return NextResponse.json({ error: 'Proof of payment is required' }, { status: 400 });
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
        runners: {
          create: participants.map((p: any) => ({
            categoryId: p.categoryId,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            gender: p.gender,
            birthdate: p.birthdate,
            singletSize: p.singletSize,
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            medicalConditions: p.medicalConditions,
          }))
        }
      }
    });

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
