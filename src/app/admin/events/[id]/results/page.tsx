import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
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
        <h1 className="admin-header-title">Race Results for {event.title}</h1>
        <ResultsUploaderClient event={event} />
      </header>

      <div className="admin-content">
        <ResultsTableClient results={results} />
      </div>
    </>
  );
}
