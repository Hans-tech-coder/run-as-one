import prisma from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import FullResultsClient from './FullResultsClient';
import EventHeroBanner from '@/components/EventHeroBanner';

export default async function FullResultsPage({ 
  params 
}: { 
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  
  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) redirect('/');

  // Fetch ALL finished results for the event to hand off to the client-side table
  const results = await prisma.raceResult.findMany({
    where: {
      eventId: id,
      status: 'FINISHED'
    },
    include: {
      category: true
    },
    orderBy: [
      { categoryId: 'asc' },
      { categoryRank: 'asc' } // Ensure accurate rank ordering
    ]
  });

  return (
    <div className="relative w-full">
      <EventHeroBanner event={event as any} />
      <div className="w-full mt-12">
        <div className="w-full">
          {/* Back Button */}
          <div className="mb-6">
            <Link href={`/events/${id}/results`} className="inline-flex items-center gap-2 text-secondary hover:text-white transition-colors no-underline text-sm font-medium">
              <ArrowLeft size={16} /> Back to Winners
            </Link>
          </div>

          <div className="text-center mb-12">
            <h1 
              className="text-4xl md:text-5xl font-bold mb-4 text-transparent bg-clip-text pb-1"
              style={{ backgroundImage: 'var(--gradient-primary)' }}
            >
              Full Leaderboard
            </h1>
            <p className="text-secondary text-lg">{event.title}</p>
          </div>

          <Suspense fallback={<div className="text-center text-white py-12">Loading results...</div>}>
            <FullResultsClient results={results} event={event} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
