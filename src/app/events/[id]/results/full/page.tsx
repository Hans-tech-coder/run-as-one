import prisma from '@/lib/db';
import Link from 'next/link';
import { Search, Trophy, User, Hash, ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function FullResultsPage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ q?: string }>
}) {
  const { id } = await params;
  const { q } = await searchParams;
  
  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) redirect('/');

  const query = q || '';
  let results: any[] = [];

  if (query.length > 0) {
    results = await prisma.raceResult.findMany({
      where: {
        eventId: id,
        OR: [
          { name: { contains: query } },
          { bibNumber: { contains: query } }
        ]
      },
      include: {
        category: true
      },
      orderBy: { chipTimeSecs: 'asc' },
      take: 50
    });
  } else {
    results = await prisma.raceResult.findMany({
      where: {
        eventId: id,
        status: 'FINISHED'
      },
      include: {
        category: true
      },
      orderBy: { chipTimeSecs: 'asc' },
      take: 100
    });
  }

  return (
    <div className="relative w-full">
      <div className="w-full">
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

          {/* Search Bar */}
          <div className="glass-panel p-2 rounded-2xl mb-12 max-w-2xl mx-auto">
            <form className="flex items-center bg-[var(--color-dark)] border border-gray-700 rounded-xl p-1 focus-within:border-[var(--color-accent-blue)] transition-colors" method="GET">
              <div className="pl-4 pr-2 flex items-center pointer-events-none">
                <Search className="text-secondary" size={20} />
              </div>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search by Name or Bib Number..."
                className="flex-1 bg-transparent text-white py-3 px-2 focus:outline-none min-w-0"
                autoComplete="off"
              />
              <button type="submit" className="btn-gradient px-8 py-3 rounded-lg text-sm ml-2 whitespace-nowrap">
                Search
              </button>
            </form>
          </div>

          {/* Results List */}
          <div className="space-y-4 max-w-3xl mx-auto mb-20">
            {results.length === 0 ? (
              <div className="text-center py-12 glass-panel rounded-2xl">
                <p className="text-secondary">No results found {query ? `for "${query}"` : ''}.</p>
              </div>
            ) : (
              results.map((result, idx) => (
                <Link href={`/events/${id}/results/${result.id}`} key={result.id} className="block no-underline">
                  <div className="glass-panel p-6 rounded-xl hover:border-accent-blue transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-dark flex items-center justify-center border border-gray-800 shrink-0 text-secondary font-bold text-lg group-hover:text-accent-blue transition-colors">
                        {query ? <Trophy size={20} /> : idx + 1}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold text-white group-hover:text-accent-blue transition-colors truncate">
                          {result.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-secondary">
                          <span className="flex items-center gap-1 shrink-0"><Hash size={14} /> Bib: {result.bibNumber}</span>
                          <span className="flex items-center gap-1 shrink-0"><User size={14} /> {result.gender}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 mt-2 md:mt-0">
                      <div className="text-right">
                        <span className="text-xs text-secondary block mb-1">Chip Time</span>
                        <span className="font-mono text-2xl font-bold text-white group-hover:text-accent-blue transition-colors">{result.chipTime}</span>
                      </div>
                      <div className="bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full text-xs font-bold border border-accent-blue/30 whitespace-nowrap">
                        {result.category.name}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
