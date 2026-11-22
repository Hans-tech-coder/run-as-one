'use client';

import React, { Suspense, useState, useMemo, useEffect, useRef, useCallback, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, Hash, Check, X } from 'lucide-react';
import { toWholeSeconds } from '@/lib/race-time';
import { runnerResultPath } from '@/lib/event-slug';
import { compareCategoryNames } from '@/lib/category-distance';
import RunnerLoader from '@/components/ui/RunnerLoader';
import { ECertificateModal, useECertificate } from '@/components/ECertificate';
import BusyLabel from '@/components/ui/BusyLabel';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender
} from '@tanstack/react-table';
import { cssDurationMs } from '@/lib/css-duration';
import { FilterDropdown, ActionMenu } from './FullResultsMenus';
import FullResultsPager from './FullResultsPager';

interface Result {
  id: string;
  name: string;
  bibNumber: string;
  gender: string;
  category: { id: string, name: string };
  chipTime: string;
  gunTime?: string | null;
  /** Without pacers (`ranksWithoutPacers`); null for a pacer, shown as "-". */
  categoryRank?: number | null;
  genderRank?: number | null;
  /** Whether this finisher is one of the race's pacers (see pacerResultMatcher). */
  isPacer?: boolean;
  /** A pacer's pace group, for their certificate; null for everyone else. */
  paceGroup?: string | null;
}

/**
 * The tag beside a pacer's bib. Their rank is real and stays; the tag says why
 * they are not on the Race Winners podium.
 */
/** A rank as printed: "#3", or "-" for a pacer, who holds no place. */
function rankLabel(rank: number | null | undefined): string {
  return rank == null ? '-' : `#${rank}`;
}

function PacerTag() {
  return (
    <span className="shrink-0 whitespace-nowrap bg-site-surface text-site-accent px-2 py-0.5 rounded-md text-[10px] font-bold border border-site-action">
      Pacer
    </span>
  );
}

interface Props {
  results: Result[];
  event: any;
}

export default function FullResultsClient(props: Props) {
  // The page is cached (ISR), so its HTML is made without the address's query.
  // Reading `?category=` outside a boundary would leave the whole table to the
  // browser; inside this one, the cached HTML is the unfiltered table, and a
  // category link narrows it once the page hydrates.
  return (
    <Suspense fallback={<FullResults {...props} categoryParam={null} />}>
      <FullResultsFromAddress {...props} />
    </Suspense>
  );
}

function FullResultsFromAddress(props: Props) {
  return <FullResults {...props} categoryParam={useSearchParams().get('category')} />;
}

function FullResults({ results, event, categoryParam }: Props & { categoryParam: string | null }) {
  
  // Find the category name corresponding to the ID if the param exists
  const initialCategoryName = useMemo(() => {
    if (!categoryParam) return null;
    const matchedResult = results.find(r => r.category.id === categoryParam);
    return matchedResult ? matchedResult.category.name : null;
  }, [categoryParam, results]);

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A row opens its runner's result. It used to do that with
  // `window.location.href` — a full page reload, with nothing on screen to
  // say the tap was taken until the new document painted. A router push in a
  // transition keeps the page alive meanwhile, so the row's Actions button can
  // turn into the running figure until results/[slug]/loading.tsx takes over;
  // desktop rows prefetch on hover so there is usually nothing to wait for.
  const router = useRouter();
  const [isOpening, startOpening] = useTransition();
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const openResult = (path: string) => {
    setOpeningPath(path);
    startOpening(() => router.push(path));
  };
  const opening = (path: string) => isOpening && openingPath === path;

  // A certificate opens over the list, and Share Result on it points at the
  // runner's own page rather than at this leaderboard.
  const cert = useECertificate<Result>(event);
  const actionsFor = (r: Result, path: string) => opening(path) ? (
    <div className="w-10 h-10 flex items-center justify-center">
      <RunnerLoader size="sm" label="Opening this result" />
    </div>
  ) : (
    <ActionMenu
      path={path}
      onViewCert={() => cert.show(r, path)}
      isGenerating={cert.generating?.id === r.id}
    />
  );

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      accessorKey: "name",
      header: "Runner",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[16rem] xl:max-w-[20rem]">
          <div className="font-bold text-site-ink group-hover/row:text-site-accent transition-colors truncate" title={row.original.name}>
            {row.original.name}
          </div>
          <div className="text-xs text-secondary mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><Hash size={12} /> {row.original.bibNumber}</span>
            <span className="flex items-center gap-1"><User size={12} /> {row.original.gender}</span>
            {row.original.isPacer && <PacerTag />}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "category",
      accessorFn: (row) => row.category.name,
      header: "Category",
      cell: ({ row }) => (
        <span className="inline-block max-w-[10rem] truncate whitespace-nowrap align-middle bg-site-surface text-site-accent px-2 py-1 rounded-full text-xs font-bold border border-site-line" title={row.original.category.name}>
          {row.original.category.name}
        </span>
      ),
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "categoryRank",
      header: "Category Rank",
      cell: ({ row }) => <span className="font-mono text-site-ink">{rankLabel(row.original.categoryRank)}</span>,
    },
    {
      accessorKey: "genderRank",
      header: "Gender Rank",
      cell: ({ row }) => <span className="font-mono text-site-ink">{rankLabel(row.original.genderRank)}</span>,
    },
    {
      accessorKey: "gender",
      header: "Gender",
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "chipTime",
      header: "Chip Time",
      cell: ({ row }) => <span className="font-mono font-bold text-lg tabular-nums whitespace-nowrap">{toWholeSeconds(row.original.chipTime)}</span>,
    },
    {
      accessorKey: "gunTime",
      header: "Gun Time",
      cell: ({ row }) => <span className="font-mono text-secondary tabular-nums whitespace-nowrap">{toWholeSeconds(row.original.gunTime) || '-'}</span>,
    },
    {
      // Rendered by the row loop too — see `actionsFor` below — because it
      // reads the certificate state, and these columns are memoised on the
      // event alone.
      id: "actions",
      header: "Actions",
      cell: () => null,
    }
  ], [event.id]);

  // Set up TanStack Table
  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(search) ||
        row.original.bibNumber.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      columnFilters: initialCategoryName ? [{ id: 'category', value: [initialCategoryName] }] : [],
      pagination: {
        pageSize: 10,
      }
    }
  });

  const uniqueCategories = useMemo(() => Array.from(new Set(results.map(r => r.category.name))).sort(compareCategoryNames), [results]);
  const uniqueGenders = useMemo(() => Array.from(new Set(results.map(r => r.gender).filter(Boolean))).sort(), [results]);

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];
  const selectedGenders = (table.getColumn('gender')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat) ? selectedCategories.filter(c => c !== cat) : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleGender = (gen: string) => {
    const newSelected = selectedGenders.includes(gen) ? selectedGenders.filter(g => g !== gen) : [...selectedGenders, gen];
    table.getColumn('gender')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  // One press undoes the search and both filters — including a category that
  // arrived in the link. `resetColumnFilters()` would put that one back: it
  // resets to the initial state, which is where the link's category lives.
  // Focus lands on the count, which now reads the whole field again; the
  // search box would have raised the keyboard on a phone.
  const isFiltered = globalFilter !== '' || selectedCategories.length > 0 || selectedGenders.length > 0;
  const countRef = useRef<HTMLParagraphElement>(null);
  const clearFilters = () => {
    setGlobalFilter('');
    table.setColumnFilters([]);
    countRef.current?.focus({ preventScroll: true });
  };


  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows;
  const matching = table.getFilteredRowModel().rows.length;

  // Changing page from the pager under a long list left the reader at the
  // bottom of the new page, looking at its last row. Bring the top of the list
  // back into view — only when it has scrolled away, so a pager used near the
  // top of a short list never jumps.
  const listTopRef = useRef<HTMLDivElement>(null);
  const turnPage = (go: () => void) => {
    go();
    requestAnimationFrame(() => {
      const top = listTopRef.current;
      if (!top || top.getBoundingClientRect().top >= 0) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      top.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
  };

  const openOnKey = (e: React.KeyboardEvent, path: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openResult(path);
    }
  };


  return (
    <div className="w-full">
      {/* Search & Filters */}
      <div
        ref={listTopRef}
        className="flex flex-col md:flex-row gap-3 md:gap-4 mb-4 items-stretch md:items-center"
        style={{ scrollMarginTop: 'var(--nav-offset)' }}
      >
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="text-secondary" size={18} />
          </div>
          {/* 16px on a phone: iOS zooms the whole page into any field set
              smaller than that the moment it is focused. */}
          <input
            type="search"
            enterKeyHint="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search runners or bib..."
            aria-label="Search runners by name or bib number"
            className="w-full h-11 bg-site-card border border-[var(--site-field-line)] rounded-xl pl-11 pr-11 text-site-ink placeholder:text-site-muted focus:outline-none focus:border-site-ink focus:ring-2 focus:ring-[var(--site-focus)]/25 transition-colors text-base sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-secondary hover:text-site-ink transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <FilterDropdown title="Category" options={uniqueCategories} selected={selectedCategories} onToggle={toggleCategory} />
          <FilterDropdown title="Gender" options={uniqueGenders} selected={selectedGenders} onToggle={toggleGender} align="right" />
        </div>
      </div>

      {/* Clear filters shares the count's line, so it costs no row of its own
          on a phone. It is always laid out and only faded in, so the line
          never changes height; the negative margins give it a 44px target
          without making the line taller. Its hover has no fill — the label turns
          white and the X gives a quarter turn. */}
      <div className="flex items-center justify-between gap-3 mb-5 md:mb-6">
        <p ref={countRef} tabIndex={-1} className="text-sm text-secondary focus:outline-none" aria-live="polite">
          {matching === results.length
            ? <><span className="font-medium text-site-ink">{results.length.toLocaleString()}</span> finishers</>
            : <><span className="font-medium text-site-ink">{matching.toLocaleString()}</span> of {results.length.toLocaleString()} finishers</>}
        </p>
        <button
          type="button"
          onClick={clearFilters}
          className={`group -my-2.5 -mr-3 h-11 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium text-site-accent hover:text-site-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-focus)] transition-[opacity,visibility,color] duration-200 motion-reduce:transition-none ${isFiltered ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        >
          <X size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-90 motion-reduce:transition-none" />
          Clear filters
        </button>
      </div>

        {/* Desktop Table View. From lg only: seven columns need about 800px,
            and between md and lg the table overflowed its card behind a
            hidden scrollbar, cutting the Actions column off with nothing to
            say it was there. The cards cover those widths instead. */}
        <div className="hidden lg:block relative rounded-[14px] bg-site-card border border-site-line mb-8 overflow-hidden group hover:border-site-ink transition-colors duration-500">

          <div className="relative z-10 overflow-x-auto overflow-y-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-site-line bg-site-card">
                  {table.getFlatHeaders().map((header) => {
                    if (header.id === 'gender') return null; // Hide raw gender column on desktop (merged with name)
                    return (
                      <th key={header.id} className="px-4 xl:px-5 py-5 text-sm font-semibold text-site-muted whitespace-nowrap">
                        {header.isPlaceholder ? null : header.column.columnDef.header as React.ReactNode}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length - 1} className="p-12 text-center text-secondary/50 italic font-medium">
                      No results found matching your filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const path = runnerResultPath(event, row.original);
                    const isThisOpening = opening(path);
                    return (
                      <tr
                        key={row.id}
                        className="group/row border-b border-site-line hover:bg-site-surface focus-visible:bg-site-surface focus-visible:outline-none transition-colors duration-300 cursor-pointer"
                        onClick={() => openResult(path)}
                        onKeyDown={(e) => openOnKey(e, path)}
                        onMouseEnter={() => router.prefetch(path)}
                        tabIndex={0}
                        aria-label={`Open ${row.original.name}'s result`}
                        aria-busy={isThisOpening || undefined}
                      >
                        {row.getVisibleCells().map((cell) => {
                          if (cell.column.id === 'gender') return null;
                          return (
                            <td key={cell.id} className="px-4 xl:px-5 py-4 align-middle">
                              {cell.column.id === 'actions'
                                ? actionsFor(row.original, path)
                                : flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Card View — phones in one column, tablets in two. */}
      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {rows.length === 0 ? (
          <div className="md:col-span-2 bg-site-card border border-site-line p-8 rounded-[14px] text-center text-secondary/70 italic">No results found matching your filters.</div>
        ) : (
          rows.map((row, i) => {
            const r = row.original;
            const path = runnerResultPath(event, r);
            return (
              <div
                key={row.id}
                role="link"
                tabIndex={0}
                aria-label={`Open ${r.name}'s result`}
                onClick={() => openResult(path)}
                onKeyDown={(e) => openOnKey(e, path)}
                className={`block no-underline rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-focus)]`}
              >
                <div className="relative h-full rounded-[18px] bg-site-card border border-site-line p-4 hover:border-site-line hover:bg-site-surface transition-all duration-300 group/row cursor-pointer overflow-hidden">

                  <div className="flex items-start gap-3 relative z-10">
                    {/* A runner's name is untrusted length: it truncates here
                        and is spelled out in full on their own result. */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="font-bold text-site-ink text-base leading-snug truncate group-hover/row:text-site-accent transition-colors" title={r.name}>{r.name}</h3>
                      {/* One line, always: the chip gives way and truncates
                          rather than wrapping, so every card is one height —
                          wrapping put it on a second line for some runners
                          and not others. */}
                      <div className="flex items-center gap-2.5 mt-1.5 text-xs text-secondary min-w-0">
                        <span className="flex items-center gap-1 whitespace-nowrap tabular-nums shrink-0"><Hash size={12} className="text-site-muted shrink-0" /> {r.bibNumber}</span>
                        <span className="flex items-center gap-1 whitespace-nowrap shrink-0"><User size={12} className="text-site-muted shrink-0" /> {r.gender}</span>
                        {r.isPacer && <PacerTag />}
                        <span className="min-w-0 truncate whitespace-nowrap bg-site-surface text-site-accent px-2 py-0.5 rounded-md text-[10px] font-bold border border-site-line" title={r.category.name}>
                          {r.category.name}
                        </span>
                      </div>
                    </div>
                    <div className="-mt-1 -mr-1.5 shrink-0">
                      {actionsFor(r, path)}
                    </div>
                  </div>

                  {/* The time is what a runner opens this list for, so it
                      leads the strip and is the largest figure on the card. */}
                  <div className="grid grid-cols-[1.35fr_1fr_1fr] gap-3 mt-4 pt-3 border-t border-site-line relative z-10">
                    <div className="min-w-0">
                      <span className="text-[10px] text-secondary block mb-1">Chip Time</span>
                      <span className="font-mono font-bold text-lg leading-none text-site-accent tabular-nums whitespace-nowrap">{toWholeSeconds(r.chipTime)}</span>
                      {r.gunTime && (
                        <span className="block mt-1.5 text-[11px] font-mono text-secondary tabular-nums whitespace-nowrap">Gun {toWholeSeconds(r.gunTime)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-secondary block mb-1 whitespace-nowrap">Cat. Rank</span>
                      <span className="font-mono font-bold text-base leading-none text-site-ink tabular-nums">{rankLabel(r.categoryRank)}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-secondary block mb-1 whitespace-nowrap">Gender Rank</span>
                      <span className="font-mono font-bold text-base leading-none text-site-ink tabular-nums">{rankLabel(r.genderRank)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <FullResultsPager table={table} pageIndex={pageIndex} pageSize={pageSize} turnPage={turnPage} />

      {cert.open && (
        <ECertificateModal
          result={cert.open.result}
          event={event}
          pdfUrl={cert.open.pdfUrl}
          sharePath={cert.open.sharePath}
          onClose={cert.close}
        />
      )}
    </div>
  );
}
