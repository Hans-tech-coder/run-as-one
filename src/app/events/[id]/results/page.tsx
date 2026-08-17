import prisma from '@/lib/db';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Search, Trophy, User, Hash } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function PublicResultsPage({ 
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
  if (query.length > 2) {
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
      take: 20
    });
  }

  return (
    <main className="min-h-screen relative">
      <Navbar />
      
      <div className="container mx-auto py-8 mt-navbar">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-accent-orange to-accent-blue pb-1">
              Race Results
            </h1>
            <p className="text-secondary text-lg">{event.title}</p>
          </div>

          {/* Search Bar */}
          <div className="glass-panel p-6 rounded-2xl mb-8 relative">
            <form className="relative" method="GET">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="text-secondary" size={20} />
              </div>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search by Name or Bib Number..."
                className="w-full bg-dark/50 border border-gray-700 text-white rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-accent-blue transition-colors"
                autoComplete="off"
              />
              <button type="submit" className="absolute right-2 top-2 bottom-2 btn-gradient px-6 rounded-lg text-sm">
                Search
              </button>
            </form>
          </div>

          {/* Results List */}
          {query.length > 2 && (
            <div className="space-y-4">
              {results.length === 0 ? (
                <div className="text-center py-12 glass-panel rounded-2xl">
                  <p className="text-secondary">No results found for "{query}".</p>
                </div>
              ) : (
                results.map(result => (
                  <Link href={`/events/${id}/results/${result.id}`} key={result.id}>
                    <div className="glass-panel p-6 rounded-xl hover:border-accent-blue transition-colors cursor-pointer group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-dark flex items-center justify-center border border-gray-800">
                            <Trophy size={20} className="text-accent-orange" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white group-hover:text-accent-blue transition-colors">
                              {result.name}
                            </h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-secondary">
                              <span className="flex items-center gap-1"><Hash size={14} /> Bib: {result.bibNumber}</span>
                              <span className="flex items-center gap-1"><User size={14} /> {result.gender}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2">
                          <div className="text-right">
                            <span className="text-xs text-secondary block mb-1">Chip Time</span>
                            <span className="font-mono text-2xl font-bold text-white">{result.chipTime}</span>
                          </div>
                          <div className="bg-accent-blue/10 text-accent-blue px-3 py-1 rounded-full text-xs font-bold border border-accent-blue/30">
                            {result.category.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
          
          {query.length > 0 && query.length <= 2 && (
             <div className="text-center py-6 text-secondary text-sm">
               Please enter at least 3 characters to search.
             </div>
          )}
        </div>
      </div>
    </main>
  );
}
