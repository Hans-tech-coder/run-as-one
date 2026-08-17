import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ResultsUploaderClient from './ResultsUploaderClient';
import ResultsTableClient from './ResultsTableClient';

export default async function AdminResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthCookie();
  if (!auth) redirect('/admin/login');

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      categories: true
    }
  });

  if (!event) return <div>Event not found</div>;

  const results = await prisma.raceResult.findMany({
    where: { eventId: id },
    include: { category: true },
    orderBy: { overallRank: 'asc' }
  });

  return (
    <>
      <header className="admin-header flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/events" className="text-secondary hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title">Race Results for {event.title}</h1>
        </div>
      </header>

      <div className="admin-content">
        <ResultsTableClient results={results} event={event} />
      </div>
    </>
  );
}
