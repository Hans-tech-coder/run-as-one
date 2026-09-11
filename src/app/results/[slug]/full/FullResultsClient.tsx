'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, Hash, ChevronDown, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { toWholeSeconds } from '@/lib/race-time';
import { runnerResultPath } from '@/lib/event-slug';
import RunnerLoader from '@/components/ui/RunnerLoader';
import { ECertificateModal, useECertificate } from '@/components/ECertificate';
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

interface Result {
  id: string;
  name: string;
  bibNumber: string;
  gender: string;
  category: { id: string, name: string };
  chipTime: string;
  gunTime?: string | null;
  categoryRank?: number;
  genderRank?: number;
}

interface Props {
  results: Result[];
  event: any;
}

/**
 * An open/close pair for the small menus on this page, with the dismissal they
 * all need: a press outside closes it, and so does Escape. The outside-press
 * listener is re-bound whenever the menu opens — it used to be bound once on
 * mount, closing over the first render's `isOpen` (false), so a press outside
 * never closed the filter menus and the only way out was the button itself.
 */
function useDismissableMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 150); // Matches --dropdown-close-dur
  }, []);

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      setIsClosing(false);
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    function handlePointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, close]);

  return { isOpen, isClosing, ref, toggle, close };
}

// Custom Dropdown Component using transitions-dev.
// On a phone the two filters split the row between them, so the second one's
// menu opens from its right edge — laid out from the left, a 224px menu
// starting halfway across a 375px screen ran off it.
function FilterDropdown({ title, options, selected, onToggle, align = 'left' }: { title: string, options: string[], selected: string[], onToggle: (val: string) => void, align?: 'left' | 'right' }) {
  const { isOpen, isClosing, ref, toggle } = useDismissableMenu();

  return (
    <div className="relative flex-1 sm:flex-none" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="w-full h-11 flex items-center justify-between sm:justify-start gap-2 bg-dark/50 border border-white/10 px-4 rounded-xl text-sm text-white hover:border-accent-blue/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {title} {selected.length > 0 && <span className="bg-accent-blue text-white text-[10px] leading-none px-1.5 py-1 rounded-full">{selected.length}</span>}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        className={`t-dropdown absolute top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden ${align === 'right' ? 'right-0 sm:left-0 sm:right-auto' : 'left-0'} ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        data-origin={align === 'right' ? 'top-right' : 'top-left'}
      >
        <div className="max-h-60 overflow-y-auto p-2 scrollbar-thin">
          {options.length === 0 && <div className="p-2 text-xs text-secondary">No options</div>}
          {options.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                aria-pressed={isSelected}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className={`truncate ${isSelected ? 'text-accent-blue font-medium' : 'text-secondary'}`}>{opt}</span>
                {isSelected && <Check size={14} className="text-accent-blue shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}

// Custom Action Menu using transitions-dev.
// The menu is rendered into <body> and positioned against the trigger's viewport
// rect, because the results card and its horizontal scroller both clip their
// overflow — a menu laid out inside the row was cut off on the last rows. It
// also flips above the trigger when the space below it cannot hold the menu.
// View E-Cert opens the certificate here, over the leaderboard: it used to be
// a link to the runner's page with ?cert=1, so the reader lost their place in
// the list for a dialog they could have had where they were. The menu stays
// open, its item saying the certificate is being drawn, until it is ready.
function ActionMenu({ path, onViewCert, isGenerating }: { path: string, onViewCert: () => Promise<void>, isGenerating: boolean }) {
  const MENU_WIDTH = 160;   // matches w-40
  const MENU_HEIGHT = 104;  // the two items plus padding, used before the first measure
  const GAP = 8;            // the old mt-2
  const EDGE = 8;           // breathing room against the viewport edges

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<{ top: number, left: number, origin: 'top-right' | 'bottom-right' }>({
    top: 0,
    left: 0,
    origin: 'top-right',
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || MENU_HEIGHT;

    const roomBelow = window.innerHeight - rect.bottom - GAP - EDGE;
    const roomAbove = rect.top - GAP - EDGE;
    const flipUp = height > roomBelow && roomAbove >= height;

    setPlacement({
      top: flipUp ? rect.top - GAP - height : rect.bottom + GAP,
      left: Math.min(
        Math.max(rect.right - MENU_WIDTH, EDGE),
        Math.max(window.innerWidth - MENU_WIDTH - EDGE, EDGE)
      ),
      origin: flipUp ? 'bottom-right' : 'top-right',
    });
  }, []);

  const close = useCallback(() => {
    const el = menuRef.current;
    if (!el) {
      setIsOpen(false);
      return;
    }
    const closeMs = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--dropdown-close-dur')
    ) || 150;

    el.classList.remove('is-open');
    el.classList.add('is-closing');
    setTimeout(() => setIsOpen(false), closeMs);
  }, []);

  // Once the menu is in the DOM its real height is known, so measure again and
  // play the open transition on the next frame.
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const frame = requestAnimationFrame(() => {
      menuRef.current?.classList.remove('is-closing');
      menuRef.current?.classList.add('is-open');
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    }
    function handleScrollOrResize() {
      updatePosition();
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, close, updatePosition]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      close();
    } else {
      updatePosition();
      setIsOpen(true);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="t-dropdown fixed w-40 bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl overflow-hidden"
      data-origin={placement.origin}
      style={{ top: placement.top, left: placement.left, zIndex: 9999 }}
    >
      <div className="p-1">
        <Link
          href={path}
          onClick={(e) => e.stopPropagation()}
          className="w-full text-left block px-3 py-2.5 text-sm text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          View Details
        </Link>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await onViewCert();
            close();
          }}
          disabled={isGenerating}
          aria-busy={isGenerating || undefined}
          className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm text-accent-blue font-medium rounded-lg hover:bg-white/5 disabled:hover:bg-transparent disabled:cursor-wait transition-colors"
        >
          {isGenerating ? (
            <>
              <RunnerLoader size="sm" tone="current" label="" />
              Generating…
            </>
          ) : (
            'View E-Cert'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors text-secondary hover:text-white"
        title="Actions"
        aria-label="Result actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>

      {mounted && isOpen && createPortal(menu, document.body)}
    </>
  );
}

export default function FullResultsClient({ results, event }: Props) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  
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
  // transition keeps the page alive meanwhile, so the row's number can turn
  // into the running figure until results/[slug]/loading.tsx takes over;
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
  const actionsFor = (r: Result, path: string) => (
    <ActionMenu
      path={path}
      onViewCert={() => cert.show(r, path)}
      isGenerating={cert.generating?.id === r.id}
    />
  );

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      // Rendered by the row loop, which knows the row's place on the page —
      // see `positionOf` below.
      id: "index",
      header: "No.",
      cell: () => null,
    },
    {
      accessorKey: "name",
      header: "Runner",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[16rem] xl:max-w-[20rem]">
          <div className="font-bold text-white group-hover/row:text-accent-blue transition-colors truncate" title={row.original.name}>
            {row.original.name}
          </div>
          <div className="text-xs text-secondary mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><Hash size={12} /> {row.original.bibNumber}</span>
            <span className="flex items-center gap-1"><User size={12} /> {row.original.gender}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "category",
      accessorFn: (row) => row.category.name,
      header: "Category",
      cell: ({ row }) => (
        <span className="inline-block max-w-[10rem] truncate whitespace-nowrap align-middle bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-full text-xs font-bold border border-accent-blue/30" title={row.original.category.name}>
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
      cell: ({ row }) => <span className="font-mono text-white">#{row.original.categoryRank}</span>,
    },
    {
      accessorKey: "genderRank",
      header: "Gender Rank",
      cell: ({ row }) => <span className="font-mono text-white">#{row.original.genderRank}</span>,
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

  const uniqueCategories = useMemo(() => Array.from(new Set(results.map(r => r.category.name))).sort(), [results]);
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

  const pageSizeMenu = useDismissableMenu();

  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows;
  const matching = table.getFilteredRowModel().rows.length;

  // A row's number is its place in the list being looked at, so it is counted
  // from where this page starts. The phone cards used to add the page offset
  // to `row.index` — which is already the row's place in the *whole* sheet —
  // so page 3 of ten began at 41, and a filtered list skipped numbers.
  const positionOf = (i: number) => pageIndex * pageSize + i + 1;

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

  const pagerButton = "w-10 h-10 flex items-center justify-center rounded-xl bg-dark border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors";

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
            className="w-full h-11 bg-dark/50 border border-white/10 rounded-xl pl-11 pr-11 text-white placeholder:text-secondary/70 focus:outline-none focus:border-accent-blue transition-colors text-base sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-secondary hover:text-white transition-colors"
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

      <p className="text-sm text-secondary mb-5 md:mb-6" aria-live="polite">
        {matching === results.length
          ? <><span className="font-medium text-white">{results.length.toLocaleString()}</span> finishers</>
          : <><span className="font-medium text-white">{matching.toLocaleString()}</span> of {results.length.toLocaleString()} finishers</>}
      </p>

        {/* Desktop Table View. From lg only: eight columns need about 850px,
            and between md and lg the table overflowed its card behind a
            hidden scrollbar, cutting the Actions column off with nothing to
            say it was there. The cards cover those widths instead. */}
        <div className="hidden lg:block relative rounded-[24px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] mb-8 overflow-hidden group hover:border-white/[0.12] transition-colors duration-500">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent-blue/5 rounded-full blur-[100px] pointer-events-none"></div>

          <div className="relative z-10 overflow-x-auto overflow-y-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] bg-black/40">
                  {table.getFlatHeaders().map((header) => {
                    if (header.id === 'gender') return null; // Hide raw gender column on desktop (merged with name)
                    return (
                      <th key={header.id} className="px-4 xl:px-5 py-5 text-xs font-bold text-secondary uppercase tracking-[0.1em] whitespace-nowrap">
                        {header.isPlaceholder ? null : header.column.columnDef.header as React.ReactNode}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={`t-stagger ${mounted ? 'is-shown' : ''}`}>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length - 1} className="p-12 text-center text-secondary/50 italic font-medium">
                      No results found matching your filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => {
                    const path = runnerResultPath(event, row.original);
                    const isThisOpening = opening(path);
                    return (
                      <tr
                        key={row.id}
                        className="group/row border-b border-white/[0.03] hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none transition-colors duration-300 cursor-pointer"
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
                              {cell.column.id === 'index'
                                ? (isThisOpening
                                    ? <RunnerLoader size="sm" label="Opening this result" />
                                    : <div className="text-secondary font-mono tabular-nums">{positionOf(i)}</div>)
                                : cell.column.id === 'actions'
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
      <div className={`lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 t-stagger ${mounted ? 'is-shown' : ''}`}>
        {rows.length === 0 ? (
          <div className="md:col-span-2 bg-black/30 border border-white/5 p-8 rounded-[20px] text-center text-secondary/70 italic">No results found matching your filters.</div>
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
                className={`block no-underline rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 t-stagger-line t-stagger-line--${(i % 4) + 1}`}
              >
                <div className="relative h-full rounded-[18px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-4 hover:border-accent-blue/30 hover:bg-white/[0.06] transition-all duration-300 group/row cursor-pointer overflow-hidden">
                  <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-accent-blue/5 rounded-full blur-[50px] -mr-16 -mt-16 pointer-events-none"></div>

                  <div className="flex items-start gap-3 relative z-10">
                    <div className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-white font-bold text-sm tabular-nums shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
                      {opening(path)
                        ? <RunnerLoader size="sm" label="Opening this result" />
                        : positionOf(i)}
                    </div>
                    {/* A runner's name is untrusted length: it truncates here
                        and is spelled out in full on their own result. */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="font-bold text-white text-base leading-snug truncate group-hover/row:text-accent-blue transition-colors" title={r.name}>{r.name}</h3>
                      {/* One line, always: the chip gives way and truncates
                          rather than wrapping, so every card is one height —
                          wrapping put it on a second line for some runners
                          and not others. */}
                      <div className="flex items-center gap-2.5 mt-1.5 text-xs text-secondary min-w-0">
                        <span className="flex items-center gap-1 whitespace-nowrap tabular-nums shrink-0"><Hash size={12} className="text-accent-blue/70 shrink-0" /> {r.bibNumber}</span>
                        <span className="flex items-center gap-1 whitespace-nowrap shrink-0"><User size={12} className="text-accent-blue/70 shrink-0" /> {r.gender}</span>
                        <span className="min-w-0 truncate whitespace-nowrap bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-md text-[10px] font-bold border border-accent-blue/30" title={r.category.name}>
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
                  <div className="grid grid-cols-[1.35fr_1fr_1fr] gap-3 mt-4 pt-3 border-t border-white/[0.06] relative z-10">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-secondary block mb-1">Chip Time</span>
                      <span className="font-mono font-bold text-lg leading-none text-accent-orange tabular-nums whitespace-nowrap">{toWholeSeconds(r.chipTime)}</span>
                      {r.gunTime && (
                        <span className="block mt-1.5 text-[11px] font-mono text-secondary tabular-nums whitespace-nowrap">Gun {toWholeSeconds(r.gunTime)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-secondary block mb-1 whitespace-nowrap">Cat. Rank</span>
                      <span className="font-mono font-bold text-base leading-none text-white tabular-nums">#{r.categoryRank}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-secondary block mb-1 whitespace-nowrap">Gender Rank</span>
                      <span className="font-mono font-bold text-base leading-none text-white tabular-nums">#{r.genderRank}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12">
        <div className="flex items-center gap-3 text-sm text-secondary">
          <span>Rows per page:</span>
          <div className="relative" ref={pageSizeMenu.ref}>
            <button
              type="button"
              onClick={pageSizeMenu.toggle}
              aria-haspopup="true"
              aria-expanded={pageSizeMenu.isOpen}
              className="h-10 flex items-center gap-1.5 bg-dark px-3.5 rounded-xl border border-white/10 text-white hover:border-white/30 transition-colors"
            >
              {pageSize}
              <ChevronDown size={14} className={`transition-transform ${pageSizeMenu.isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div
              className={`t-dropdown absolute bottom-full left-0 mb-2 w-24 bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden ${pageSizeMenu.isOpen ? 'is-open' : ''} ${pageSizeMenu.isClosing ? 'is-closing' : ''}`}
              data-origin="bottom-left"
            >
              {[10, 25, 50, 100].map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => { turnPage(() => table.setPageSize(size)); pageSizeMenu.close(); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-white/5 ${pageSize === size ? 'text-accent-blue font-medium bg-white/5' : 'text-white'}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm" aria-label="Results pages">
          <button type="button" onClick={() => turnPage(() => table.setPageIndex(0))} disabled={!table.getCanPreviousPage()} className={pagerButton} aria-label="First page">
            <ChevronsLeft size={18} />
          </button>
          <button type="button" onClick={() => turnPage(() => table.previousPage())} disabled={!table.getCanPreviousPage()} className={pagerButton} aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <span className="text-secondary px-1.5 sm:px-2 whitespace-nowrap tabular-nums">
            Page <span className="font-medium text-white">{pageIndex + 1}</span> of{' '}
            <span className="font-medium text-white">{table.getPageCount() || 1}</span>
          </span>
          <button type="button" onClick={() => turnPage(() => table.nextPage())} disabled={!table.getCanNextPage()} className={pagerButton} aria-label="Next page">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => turnPage(() => table.setPageIndex(table.getPageCount() - 1))} disabled={!table.getCanNextPage()} className={pagerButton} aria-label="Last page">
            <ChevronsRight size={18} />
          </button>
        </nav>
      </div>

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
