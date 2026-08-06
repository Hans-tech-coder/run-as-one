import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const proofFile = formData.get('proofFile') as File | null;
    const eventId = formData.get('eventId') as string;
    const customerEmail = formData.get('customerEmail') as string;
    const customerName = formData.get('customerName') as string;
    const logisticsMethod = formData.get('logisticsMethod') as string;
    const deliveryAddress = formData.get('deliveryAddress') as string;
    const subtotal = parseFloat(formData.get('subtotal') as string);
    const deliveryFee = parseFloat(formData.get('deliveryFee') as string);
    const platformFee = parseFloat(formData.get('platformFee') as string);
    const transactionFee = parseFloat(formData.get('transactionFee') as string);
    const totalAmount = parseFloat(formData.get('totalAmount') as string);
    const paymentMethod = formData.get('paymentMethod') as string;
    const transactionNumber = formData.get('transactionNumber') as string;
    
    const participantsStr = formData.get('participants') as string;
    const participants = JSON.parse(participantsStr || '[]');

    if (!proofFile) {
      return NextResponse.json({ error: 'Proof of payment is required' }, { status: 400 });
    }

    // 1. Save the file locally
    const bytes = await proofFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Generate a unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = path.extname(proofFile.name) || '.jpg';
    const filename = `proof-${uniqueSuffix}${extension}`;
    
    // Set path to public/uploads/proofs directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');
    const filePath = path.join(uploadDir, filename);
    
    // Save to disk
    await writeFile(filePath, buffer);
    
    // Path to save in DB (accessible from frontend via /uploads/proofs/filename)
    const publicPath = `/uploads/proofs/${filename}`;

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
        proofOfPayment: publicPath,
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
    console.error('Manual Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
