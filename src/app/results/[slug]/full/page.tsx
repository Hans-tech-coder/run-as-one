import prisma from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import FullResultsClient from './FullResultsClient';
import EventHeroBanner from '@/components/EventHeroBanner';
import { canonicalResultsPath, eventByParam } from '@/lib/event-slug';
import { withPacerRanks } from '@/lib/pacer-store';
import { genderDivision } from '@/lib/gender-division';

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

  const canonical = canonicalResultsPath(event, slug, '/full');
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

  // Each finisher's pacer flag and their ranks without the pacers: a pacer's
  // ranks read "-", everyone behind them moves up. The rows keep their order,
  // so a pacer still sits where their time puts them. Only the flag and the
  // numbers go to the client — never the pacer list itself.
  const ranked = await withPacerRanks(event.id, results);
  // The sheet's "M"/"F" reach the table, the cards and the Gender filter as words.
  const tagged = ranked.map(result => ({ ...result, gender: genderDivision(result.gender) }));

  return (
    <div className="relative w-full">
      <EventHeroBanner event={event as any} />
      <div className="w-full mt-12">
        <div className="w-full">
          {/* Back Button */}
          <div className="mb-6">
            <Link href={`/results/${event.slug}`} className="inline-flex items-center gap-2 text-secondary hover:text-white transition-colors no-underline text-sm font-medium">
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
            <FullResultsClient results={tagged} event={event} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
