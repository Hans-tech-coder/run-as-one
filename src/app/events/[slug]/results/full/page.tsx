import prisma from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import FullResultsClient from './FullResultsClient';
import EventHeroBanner from '@/components/EventHeroBanner';
import { canonicalEventPath, eventByParam } from '@/lib/event-slug';

export default async function FullResultsPage({ 
  params 
}: { 
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params;

  // Slug or cuid — the old id links stay alive; see eventByParam.
  const event = await prisma.event.findFirst({
    where: eventByParam(slug),
  });

  if (!event) redirect('/');

  const canonical = canonicalEventPath(event, slug, '/results/full');
  if (canonical) redirect(canonical);

  // Fetch ALL finished results for the event to hand off to the client-side table
  const results = await prisma.raceResult.findMany({
    where: {
      eventId: event.id,
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
            <Link href={`/events/${event.slug}/results`} className="inline-flex items-center gap-2 text-secondary hover:text-white transition-colors no-underline text-sm font-medium">
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
