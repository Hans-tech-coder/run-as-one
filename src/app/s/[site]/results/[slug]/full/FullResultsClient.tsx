'use client';

import React, { Suspense, useState, useMemo, useEffect, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, Hash, X } from 'lucide-react';
import { toWholeSeconds } from '@/lib/race-time';
import { runnerResultPath } from '@/lib/event-slug';
import { compareCategoryNames } from '@/lib/category-distance';
import RunnerLoader from '@/components/ui/RunnerLoader';
import { ECertificateModal, useECertificate } from '@/components/ECertificate';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  PaginationState,
  ColumnDef,
  flexRender
} from '@tanstack/react-table';
import { FilterDropdown, CertButton } from './FullResultsMenus';
import FullResultsCards, { PacerTag, rankLabel, type LeaderboardEvent, type Result } from './FullResultsCards';
import FullResultsPager from './FullResultsPager';
import { readView, writeView } from './fullResultsView';

interface Props {
  results: Result[];
  event: LeaderboardEvent;
}

export default function FullResultsClient(props: Props) {
  // The page is cached (ISR), so its HTML is made without the address's query.
  // Reading the query outside a boundary would leave the whole table to the
  // browser; inside this one, the cached HTML is the unfiltered table, and a
  // shared link (?q=, ?category=, ?gender=, ?page= — fullResultsView.ts)
  // narrows it once the page hydrates. The fallback never writes the address.
  return (
    <Suspense fallback={<FullResults {...props} address={null} />}>
      <FullResultsFromAddress {...props} />
    </Suspense>
  );
}

function FullResultsFromAddress(props: Props) {
  return <FullResults {...props} address={useSearchParams()} />;
}

function FullResults({ results, event, address }: Props & { address: URLSearchParams | null }) {

  // The view the address asked for, read once: after that the table owns it
  // and the address only follows.
  const [initial] = useState(() => readView(
    new URLSearchParams(address?.toString() ?? ''),
    results.map(r => r.category),
    Array.from(new Set(results.map(r => r.gender).filter(Boolean))),
  ));

  const [globalFilter, setGlobalFilter] = useState(initial.q);
  const [sorting, setSorting] = useState<SortingState>([]);
  // Held here rather than in initialState: a filter change resets the page to
  // initialState's, which would send it back to the shared link's page.
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: initial.pageIndex, pageSize: 10 });

  // A row opens its runner's result. It used to do that with
  // `window.location.href` — a full page reload, with nothing on screen to
  // say the tap was taken until the new document painted. A router push in a
  // transition keeps the page alive meanwhile, so the row's E-Cert button can
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
    <div className="h-11 lg:h-10 min-w-[6.5rem] flex items-center justify-center">
      <RunnerLoader size="sm" label="Opening this result" />
    </div>
  ) : (
    <CertButton
      name={r.name}
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
          <div className="lb-row__name font-bold text-site-ink truncate" title={row.original.name}>
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
        <span className="inline-block max-w-[10rem] truncate whitespace-nowrap align-middle bg-site-surface text-site-accent px-2 py-1 rounded-chip text-xs font-bold border border-site-line" title={row.original.category.name}>
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
      // reads the certificate state, and these columns are memoised once
      // (no cell reads props or state).
      id: "actions",
      header: "Certificate",
      cell: () => null,
    }
  ], []);

  // Set up TanStack Table
  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // Its reset also fired on the first render, sending a shared link's page
    // back to 1; the page goes back to 1 below, on a real change only.
    autoResetPageIndex: false,
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
      columnFilters: [
        ...(initial.categories.length ? [{ id: 'category', value: initial.categories }] : []),
        ...(initial.genders.length ? [{ id: 'gender', value: initial.genders }] : []),
      ],
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

  // A shared link's page past the end of what it matches lands on the last page.
  const pageCount = table.getPageCount();
  useEffect(() => {
    if (pageCount > 0 && pageIndex >= pageCount) table.setPageIndex(pageCount - 1);
  }, [pageCount, pageIndex, table]);

  // The address follows the view (fullResultsView.ts), so the link in the bar
  // is the one to share. Replaced, never pushed: Back leaves the leaderboard
  // rather than stepping through every keystroke and filter. The search waits
  // for typing to pause; filters and pages go straight through.
  const [settledQuery, setSettledQuery] = useState(globalFilter);
  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(globalFilter), 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);
  const following = address !== null;
  const categoryKey = selectedCategories.join('\n');
  const genderKey = selectedGenders.join('\n');
  // A new search, filter or sort starts again from page 1.
  const narrowedBy = JSON.stringify([globalFilter, categoryKey, genderKey, sorting]);
  const lastNarrowedBy = useRef(narrowedBy);
  useEffect(() => {
    if (narrowedBy === lastNarrowedBy.current) return;
    lastNarrowedBy.current = narrowedBy;
    setPagination(p => (p.pageIndex ? { ...p, pageIndex: 0 } : p));
  }, [narrowedBy]);
  useEffect(() => {
    if (!following) return;
    const current = new URLSearchParams(window.location.search);
    const next = writeView(current, {
      q: settledQuery,
      categories: categoryKey ? categoryKey.split('\n') : [],
      genders: genderKey ? genderKey.split('\n') : [],
      pageIndex,
    });
    if (next === current.toString()) return;
    // The History API, not router.replace: Next keeps useSearchParams in step
    // with it (docs: linking-and-navigating, "Native History API") without a
    // server round trip. router.replace fetched the page's payload again on
    // every change, and the fresh `results` it brought reset the table to
    // page 1 — a page turn undid itself.
    const { pathname, hash } = window.location;
    window.history.replaceState(null, '', `${pathname}${next ? `?${next}` : ''}${hash}`);
  }, [following, settledQuery, categoryKey, genderKey, pageIndex]);

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
            className="w-full h-11 bg-site-card border border-[var(--site-field-line)] rounded-control pl-11 pr-11 text-site-ink placeholder:text-site-muted focus:outline-none focus:border-site-ink focus:ring-2 focus:ring-[var(--site-focus)]/25 transition-colors text-base sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
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
          className={`group -my-2.5 -mr-3 h-11 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-control text-sm font-medium text-site-accent hover:text-site-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-focus)] transition-[opacity,visibility,color] duration-200 motion-reduce:transition-none ${isFiltered ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        >
          <X size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:rotate-90 motion-reduce:transition-none" />
          Clear Filters
        </button>
      </div>

        {/* Desktop Table View. From lg only: seven columns need about 800px,
            and between md and lg the table overflowed its card behind a
            hidden scrollbar, cutting the Actions column off with nothing to
            say it was there. The cards cover those widths instead. */}
        {/* The table itself does not answer the pointer: only its rows open
            anything (`.lb-row`, site.css). */}
        {/* The header row sticks under the navbar on the page scroll. That is
            why the card clips (`overflow-clip`, which makes no scroller)
            instead of `overflow-hidden`, and why there is no overflow-x
            wrapper: either would trap `position: sticky`. */}
        <div className="hidden lg:block relative rounded-panel bg-site-card border border-site-line mb-8 overflow-clip">

          <div className="relative z-10">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-[var(--nav-offset)] z-20">
                <tr className="bg-site-card">
                  {table.getFlatHeaders().map((header) => {
                    if (header.id === 'gender') return null; // Hide raw gender column on desktop (merged with name)
                    return (
                      <th key={header.id} className="px-3.5 xl:px-5 py-5 text-sm font-semibold text-site-muted whitespace-nowrap bg-site-card shadow-[inset_0_-1px_0_var(--site-line)]">
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
                        className="lb-row border-b border-site-line last:border-b-0"
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
                            <td key={cell.id} className="px-3.5 xl:px-5 py-4 align-middle">
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

      <FullResultsCards
        rows={rows}
        event={event}
        openResult={openResult}
        openOnKey={openOnKey}
        actionsFor={actionsFor}
      />

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
