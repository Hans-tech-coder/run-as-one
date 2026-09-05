import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

// Helper to convert "HH:MM:SS" or "MM:SS" to seconds
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 999999;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 999999; // Fallback for invalid format
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = id;
    const body = await req.json();
    const { results } = body;

    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty results data' }, { status: 400 });
    }

    // Prepare data by calculating seconds and deduplicating by bibNumber
    const uniqueResultsMap = new Map();
    
    results.forEach(r => {
      const chipSecs = parseTimeToSeconds(r.chipTime);
      const bibStr = String(r.bibNumber).trim();
      
      // Keep the first valid entry for a bibNumber
      if (!uniqueResultsMap.has(bibStr)) {
        uniqueResultsMap.set(bibStr, {
          eventId,
          categoryId: r.categoryId,
          bibNumber: bibStr,
          name: r.name,
          gender: r.gender,
          chipTime: r.chipTime,
          chipTimeSecs: chipSecs,
          gunTime: r.gunTime || null,
          overallRank: 0,
          genderRank: 0,
          categoryRank: 0,
          status: r.status || 'FINISHED'
        });
      }
    });

    let processedResults = Array.from(uniqueResultsMap.values());

    // Compute Overall Rank (across entire event, ascending by chipTimeSecs)
    processedResults.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
    processedResults.forEach((r, idx) => {
      if (r.status === 'FINISHED') {
        r.overallRank = idx + 1;
      }
    });

    // Compute Category Rank
    const categoryGroups: Record<string, typeof processedResults> = {};
    processedResults.forEach(r => {
      if (!categoryGroups[r.categoryId]) categoryGroups[r.categoryId] = [];
      categoryGroups[r.categoryId].push(r);
    });

    for (const catId in categoryGroups) {
      let group = categoryGroups[catId];
      group.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      group.forEach((r, idx) => {
        if (r.status === 'FINISHED') r.categoryRank = idx + 1;
      });
    }

    // Compute Gender Rank per Category
    for (const catId in categoryGroups) {
      let group = categoryGroups[catId];
      
      const maleGroup = group.filter(r => {
        const g = r.gender.trim().toLowerCase();
        return g === 'male' || g === 'm';
      });
      maleGroup.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      maleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });

      const femaleGroup = group.filter(r => {
        const g = r.gender.trim().toLowerCase();
        return g === 'female' || g === 'f';
      });
      femaleGroup.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      femaleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });
    }

    // Perform DB Operations
    await prisma.$transaction(async (tx) => {
      // 1. Delete old results for this event (to replace them completely)
      await tx.raceResult.deleteMany({
        where: { eventId }
      });

      // 2. Insert new results.
      // Chip times commonly carry tenths ("1:18:56.9"). The tenths decide the
      // ranking above, but chipTimeSecs is a whole-second column, so the value
      // is rounded here rather than left for the database to round.
      await tx.raceResult.createMany({
        data: processedResults.map(({ chipTimeSecs, ...rest }) => ({
          ...rest,
          chipTimeSecs: Math.round(chipTimeSecs)
        }))
      });
    });

    return NextResponse.json({ message: 'Results uploaded successfully', count: processedResults.length }, { status: 200 });
  } catch (error) {
    console.error('Error uploading results:', error);
    return NextResponse.json({ error: 'Failed to upload results' }, { status: 500 });
  }
}
