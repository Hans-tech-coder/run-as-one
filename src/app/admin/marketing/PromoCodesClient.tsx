"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  Copy,
  ExternalLink,
  Plus,
  Search,
  Tag,
  Ticket,
  X,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  FilterFn,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import PromoActionsMenu from './PromoActionsMenu';
import { useRouter } from 'next/navigation';
import { useAlert } from '@/components/ui/AlertProvider';
import FieldError from '@/components/ui/FieldError';
import SkeletonSwap, { SkeletonBar } from '@/components/ui/Skeleton';
import AdminSelect from '../AdminSelect';
import {
  DISCOUNT_TYPES,
  DISCOUNT_TYPE_LABELS,
  DiscountType,
  MAX_PROMO_CODE_LENGTH,
  PROMO_STATUS_LABELS,
  PROMO_STATUS_TONES,
  describePromo,
  isExhausted,
  normalizePromoCode,
  promoConditions,
  promoEndingSoon,
  promoStatus,
} from '@/lib/discount';
import { MAX_VOUCHER_BATCH } from '@/lib/voucher-codes';
import { formatPesos } from '@/lib/money';
import type { PromoRedemption } from '@/lib/promo-redemptions';

/**
 * The organizer's discount codes: what exists, and the form that makes more.
 *
 * The table groups a bulk-generated batch into a single row. Two hundred
 * single-use vouchers are one promotion an organizer thinks about as one
 * thing, and listing them individually would bury every ordinary code beneath
 * them — so the batch row carries the promotion and opens to show the codes
 * when somebody actually needs to hand them out.
 */

type PromoRow = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  usageLimit: number | null;
  usageCount: number;
  /**
   * Centavos this code has actually taken off, and how many of its orders
   * were paid. Counted on the server from the code text stamped on each
   * registration (lib/promo-redemptions.ts), because `promoCode` is a
   * snapshot string rather than a relation there is an id to join on.
   */
  given: number;
  paidOrders: number;
  validFrom: string | null;
  validUntil: string | null;
  minSubtotal: number | null;
  minRunners: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  batchLabel: string | null;
  automatic: boolean;
  paused: boolean;
  eventId: string | null;
  event: { id: string; title: string } | null;
};

type EventOption = { id: string; title: string; date: string };

/** One line of the table: a single code, or a whole batch of vouchers. */
type Group = {
  key: string;
  /** The batch's name, or null for a code created on its own. */
  batchLabel: string | null;
  codes: PromoRow[];
  /**
   * Any member — they share every term except the code itself, and its `id`
   * is what an edit or a delete is aimed at. The route treats a batch as one
   * promotion, so any of them will do.
   */
  terms: PromoRow;
  used: number;
  /** Redemptions still available across the group, or null when unlimited. */
  left: number | null;
  /** Centavos given away across every code of this promotion, paid orders only. */
  given: number;
  /** How many of those redemptions reached PAID. */
  paid: number;
};

const ALL_EVENTS = '';

/** An empty form. Named once so opening and clearing cannot drift apart. */
const BLANK_FORM = {
  code: '',
  eventId: ALL_EVENTS,
  discountType: DISCOUNT_TYPES.PERCENTAGE as DiscountType,
  discountValue: '',
  buyQuantity: '',
  getQuantity: '',
  usageLimit: '',
  minSubtotal: '',
  minRunners: '',
  validFrom: '',
  validUntil: '',
  batchLabel: '',
  batchPrefix: '',
  batchCount: '',
};

/** What `GET /api/admin/promos/[id]/redemptions` answers with. */
type RedemptionsResponse = {
  name: string;
  /** Whether a row should name which voucher of a batch was used. */
  isBatch: boolean;
  automatic: boolean;
  redemptions: PromoRedemption[];
  /** True when there were more orders than one listing returns. */
  truncated: boolean;
  limit: number;
};

/** How a runner comes to have this promotion. */
type Claim = 'CODE' | 'VOUCHERS' | 'AUTOMATIC';

const CLAIMS: { value: Claim; label: string; hint: string }[] = [
  {
    value: 'CODE',
    label: 'One shared code',
    hint: 'One code you publish, redeemable by anyone who has it, up to the limit you set.',
  },
  {
    value: 'VOUCHERS',
    label: 'Single-use vouchers',
    hint: 'A batch of distinct codes, each good for exactly one order. For invites and prizes.',
  },
  {
    value: 'AUTOMATIC',
    label: 'Automatic',
    hint: 'No code at all. It applies on its own to every order that meets the conditions below, and it is shown on the event page. This is what an early bird is.',
  },
];

/** What the View menu calls a column, where its id is not the whole name. */
const COLUMN_LABELS: Record<string, string> = {
  code: 'Code',
  discount: 'Discount',
  event: 'Applies To',
  conditions: 'Conditions',
  used: 'Used',
  given: 'Given',
  status: 'Status',
  actions: 'Actions',
};

/**
 * What the search box looks at.
 *
 * Every code in a batch, not just its label: an organizer holding a voucher
 * somebody could not redeem types *that* code, and the row they need is the
 * batch it came from. The event title is in there too, because "which codes
 * are on this race" is the other question this box is asked.
 */
const searchPromos: FilterFn<Group> = (row, _columnId, filterValue) => {
  const term = String(filterValue ?? '').trim().toLowerCase();
  if (!term) return true;
  const group = row.original;
  return [group.batchLabel ?? '', group.terms.event?.title ?? '', ...group.codes.map(c => c.code)]
    .join(' ')
    .toLowerCase()
    .includes(term);
};

/**
 * Three orders that have not arrived yet.
 *
 * Deliberately the same box as the real redemption row — same border, same
 * radius, same padding, a code and a line of meta on the left against an
 * amount and a badge on the right — because a placeholder that is not the
 * shape of the answer is just a grey rectangle saying "wait". Three rows
 * rather than one: the panel is a list, and one row would promise a list of
 * one. They are direct children of the pulsing layer so each one breathes.
 */
function RedemptionsPlaceholder() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/30 p-4 mb-3 last:mb-0"
        >
          <span className="flex flex-col gap-2 min-w-0 flex-1">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-3 w-full max-w-[15rem]" />
          </span>
          <span className="flex flex-col items-end gap-2 shrink-0">
            <SkeletonBar className="h-4 w-16" />
            <SkeletonBar className="h-4 w-14" />
          </span>
        </div>
      ))}
    </>
  );
}

export default function PromoCodesClient({
  initialPromos,
  events,
}: {
  initialPromos: PromoRow[];
  events: EventOption[];
}) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert, confirm, toast } = useAlert();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Which row's pause request is in flight, so its menu item can say so
  // rather than looking like nothing happened.
  const [pausingKey, setPausingKey] = useState<string | null>(null);
  // The redemptions panel: which promotion it is showing, and what came back.
  // Closing runs through the same open/closing pair the registrants screen's
  // modals use, so the panel animates out rather than vanishing.
  const [redemptionsOf, setRedemptionsOf] = useState<Group | null>(null);
  const [isRedemptionsOpen, setIsRedemptionsOpen] = useState(false);
  const [isRedemptionsClosing, setIsRedemptionsClosing] = useState(false);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionsResponse | null>(null);
  const [redemptionsError, setRedemptionsError] = useState('');

  // The promotion the modal is editing, or null when it is creating one.
  // One form serves both, so an edit can never offer a field the create
  // form validates differently.
  const [editing, setEditing] = useState<Group | null>(null);

  // The promotion a new one is being copied from, by name, or null. This is a
  // *create* — the form posts to the create route and says so on its button —
  // and the name is kept only to tell the organizer where the values in front
  // of them came from.
  const [duplicating, setDuplicating] = useState<string | null>(null);
  // Whether the copy arrived with its dates stripped, so the sentence
  // explaining that is written once beside the reason for it.
  const [datesCleared, setDatesCleared] = useState(false);

  // Which field the API refused, so the message lands under the control that
  // caused it rather than in a dialog that names none of them.
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  // How this promotion is claimed. Three shapes, one form: a shared code,
  // a batch of one-shot vouchers, or nothing to type at all.
  const [claim, setClaim] = useState<Claim>('CODE');
  const [form, setForm] = useState(BLANK_FORM);

  // The table's own state, in the shape the other admin tables keep it:
  // sorting, one search box, which columns are showing, and which rows are
  // ticked.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
      if (pageSizeRef.current && !pageSizeRef.current.contains(event.target as Node)) {
        setIsPageSizeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const set = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setFieldError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setDuplicating(null);
    setDatesCleared(false);
    setClaim('CODE');
    setForm(BLANK_FORM);
    setFieldError(null);
    setShowModal(true);
  };

  /**
   * The same promotion again, ready to be given its own name.
   *
   * No route of its own: this is the create form with values in it, which is
   * why `formFrom` — written to put a stored promotion back into the form that
   * made it — does almost all of the work. Only what has to be unique is
   * blanked: a code, a promotion name and a batch label are one per organizer,
   * and a batch's size is a decision rather than a term to inherit.
   */
  const openDuplicate = (group: Group) => {
    const source = formFrom(group);
    // A copy of a promotion whose window has already closed would be created
    // expired — a promotion born dead, and one an organizer would have to
    // notice the badge on to find out about. The dates come out and the
    // sentence above the form says so, rather than the app silently keeping
    // last summer's.
    const ended = Boolean(group.terms.validUntil)
      && new Date(group.terms.validUntil as string).getTime() < Date.now();

    setEditing(null);
    setDuplicating(group.batchLabel ?? group.terms.code);
    setDatesCleared(ended);
    setClaim(group.terms.automatic ? 'AUTOMATIC' : group.batchLabel ? 'VOUCHERS' : 'CODE');
    setForm({
      ...source,
      // The identity, in whichever shape this promotion is claimed.
      code: '',
      batchLabel: '',
      batchPrefix: '',
      batchCount: '',
      // A voucher's limit of 1 belongs to the batch machinery rather than to
      // the organizer's intent, and carrying it into a form where the field is
      // hidden would put a 1 in the Total uses box the moment they changed
      // this copy into a shared code.
      usageLimit: group.batchLabel ? '' : source.usageLimit,
      validFrom: ended ? '' : source.validFrom,
      validUntil: ended ? '' : source.validUntil,
    });
    setFieldError(null);
    setShowModal(true);
  };

  const openEdit = (group: Group) => {
    setEditing(group);
    setDuplicating(null);
    setDatesCleared(false);
    // The shape is not editable: turning a code into a codeless promotion
    // would take it away from everyone already holding the code. The
    // segmented control is hidden while editing for the same reason.
    setClaim(group.terms.automatic ? 'AUTOMATIC' : group.batchLabel ? 'VOUCHERS' : 'CODE');
    setForm(formFrom(group));
    setFieldError(null);
    setShowModal(true);
  };

  const groups = useMemo(() => groupPromos(initialPromos), [initialPromos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFieldError(null);

    try {
      // An edit targets any member of the group: the route treats a batch as
      // the one promotion the table already shows it to be.
      const res = await fetch(
        editing ? `/api/admin/promos/${editing.terms.id}` : '/api/admin/promos',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            eventId: form.eventId || null,
            // A batch is what the count turns this into; the other two
            // shapes send none, which is what the route branches on.
            batchCount: claim === 'VOUCHERS' ? form.batchCount : '',
            automatic: claim === 'AUTOMATIC',
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        if (data?.field) {
          setFieldError({ field: data.field, message: data.error });
          return;
        }
        throw new Error(data.error || 'Failed to save');
      }

      // Worded before the resets below, which are the lines that wipe the two
      // facts the sentence is made of. The modal closing is not by itself an
      // answer: it closes on cancel too.
      const saved = editing
        ? 'Promotion saved.'
        : claim === 'VOUCHERS'
          ? `${form.batchCount} vouchers generated.`
          : claim === 'AUTOMATIC'
            ? 'Automatic promotion is live.'
            : `${form.code} is live.`;

      setShowModal(false);
      setEditing(null);
      setDuplicating(null);
      setDatesCleared(false);
      setClaim('CODE');
      setForm(BLANK_FORM);
      router.refresh();
      toast(saved);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCodes = async (group: Group) => {
    try {
      await navigator.clipboard.writeText(group.codes.map(c => c.code).join('\n'));
      setCopied(group.key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      alert('Your browser would not let us reach the clipboard. Select the codes and copy them by hand.');
    }
  };

  const handleTogglePause = async (group: Group) => {
    const next = !group.terms.paused;
    setPausingKey(group.key);
    try {
      // Only the switch. The row menu has no form open, so it has no terms
      // to re-post — sending some would be inventing values it never
      // rendered, which is the same reason the events table PATCHes its
      // registration hold on its own.
      const res = await fetch(`/api/admin/promos/${group.terms.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      router.refresh();
      // Pausing is a decision with consequences off this screen — a code on a
      // poster stops working — so it says what it did rather than leaving the
      // organizer to read a badge in the row they just clicked away from.
      toast(
        next
          ? `${group.batchLabel ?? group.terms.code} paused. Runners can no longer use it.`
          : `${group.batchLabel ?? group.terms.code} is live again.`,
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPausingKey(null);
    }
  };

  const handleDelete = async (group: Group) => {
    const name = group.batchLabel ?? group.terms.code;
    const many = group.codes.length > 1;

    // The redemption count is the fact that changes the decision, so it is
    // in the question rather than discovered afterwards. Deleting is safe
    // for those orders — Registration.promoCode and discountAmount are
    // snapshots taken at checkout — and saying so is what stops an
    // organizer assuming it will unwind a discount somebody already had.
    const used =
      group.used > 0
        ? ` It has been used ${group.used} time${group.used === 1 ? '' : 's'}; those registrations keep the discount they were given.`
        : '';

    const ok = await confirm({
      title: `Delete ${name}?`,
      message: many
        ? `All ${group.codes.length} vouchers in this batch will stop working, and any that have not been claimed cannot be recovered.${used}`
        : `Runners will no longer be able to use this ${group.terms.automatic ? 'promotion' : 'code'}.${used}`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/promos/${group.terms.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      router.refresh();
      toast(`${name} deleted.`);
    } catch (err: any) {
      alert(err.message);
    }
  };
  /**
   * Who used this promotion.
   *
   * Fetched when the panel opens rather than shipped with the page: the table
   * shows every promotion an organizer has, and loading every order behind
   * every one of them to fill a modal nobody may open is a page that stops
   * loading the first time somebody generates two hundred vouchers.
   */
  const openRedemptions = async (group: Group) => {
    setRedemptionsOf(group);
    setRedemptions(null);
    setRedemptionsError('');
    setIsRedemptionsOpen(true);
    setIsLoadingRedemptions(true);
    try {
      const res = await fetch(`/api/admin/promos/${group.terms.id}/redemptions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The redemptions could not be loaded.');
      setRedemptions(data);
    } catch (err: any) {
      setRedemptionsError(err.message || 'Something went wrong while loading the redemptions.');
    } finally {
      setIsLoadingRedemptions(false);
    }
  };

  const closeRedemptions = () => {
    setIsRedemptionsOpen(false);
    setIsRedemptionsClosing(true);
    setTimeout(() => {
      setIsRedemptionsClosing(false);
      setRedemptionsOf(null);
      setRedemptions(null);
      setRedemptionsError('');
    }, 150);
  };

  /**
   * The table itself is the one the events, registrants and results screens
   * use — `components/ui/table` driven by TanStack — so a promotion is read
   * the same way an event or a registrant is: the same search box, the same
   * View menu, the same sort arrows and the same pager. The only thing this
   * table does that the others do not is open a batch, and that stays a row
   * rather than becoming a column.
   */
  const columns = useMemo<ColumnDef<Group>[]>(() => [
    {
      id: "select",
      header: ({ table }) => {
        const isChecked = table.getIsAllPageRowsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={table.getToggleAllPageRowsSelectedHandler()}
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
            </div>
          </div>
        );
      },
      cell: ({ row }) => {
        const isChecked = row.getIsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={row.getToggleSelectedHandler()}
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
            </div>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "index",
      header: "No.",
      // Counted by row id rather than by object identity: sorting rebuilds
      // the rows, so an `indexOf` on them finds nothing and every line numbers
      // itself 0 the moment a column header is clicked.
      cell: ({ row, table }) => {
        const index = table.getSortedRowModel().flatRows.findIndex(sorted => sorted.id === row.id);
        return <span className="text-gray-400 font-mono">{index + 1}</span>;
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "code",
      header: "Code",
      // A batch sorts and searches under its label, because that is the name
      // the organizer gave the promotion; the vouchers inside it are reached
      // by opening the row.
      accessorFn: row => row.batchLabel ?? row.terms.code,
      cell: ({ row }) => {
        const group = row.original;
        const isBatch = group.codes.length > 1;
        const isOpen = expanded === group.key;

        return isBatch ? (
          <button
            type="button"
            onClick={() => setExpanded(isOpen ? null : group.key)}
            aria-expanded={isOpen}
            className="flex items-center gap-2 text-left"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
            <span>
              <span className="font-bold text-accent-blue block">{group.batchLabel}</span>
              <span className="text-xs text-secondary">
                {group.codes.length} single-use vouchers
              </span>
            </span>
          </button>
        ) : (
          <span>
            <span className="font-bold text-accent-blue block">{group.terms.code}</span>
            {/* Naming it here rather than in a column of its own: what an
                organizer needs at a glance is whether this is something they
                have to hand out. */}
            {group.terms.automatic && (
              <span className="text-xs text-secondary">
                Automatic &middot; no code to give out
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "discount",
      header: "Discount",
      accessorFn: row => describePromo(row.terms),
      cell: ({ row }) => describePromo(row.original.terms),
    },
    {
      id: "event",
      header: "Applies To",
      accessorFn: row => row.terms.event ? row.terms.event.title : 'All my events',
      cell: ({ row }) => (
        <span className="text-secondary">
          {row.original.terms.event ? row.original.terms.event.title : 'All my events'}
        </span>
      ),
    },
    {
      id: "conditions",
      header: "Conditions",
      cell: ({ row }) => (
        <span className="text-secondary text-xs">
          {promoConditions(row.original.terms).join(' · ') || '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "used",
      header: "Used",
      accessorFn: row => row.used,
      cell: ({ row }) => {
        const group = row.original;
        return (
          <>
            <span className="block">
              {group.used}
              {group.left !== null && (
                <span className="text-secondary"> / {group.used + group.left}</span>
              )}
            </span>
            {/* A code is spent the moment the order is placed, the same
                instant a slot is taken, but the money only moves when that
                order is paid. An abandoned online checkout therefore leaves a
                redemption behind with nothing in the Given column to match it,
                and saying so here is what stops the gap looking like an
                arithmetic error. Silent when the two agree, which is most
                rows. */}
            {group.paid !== group.used && (
              <span className="text-xs text-secondary">
                {`${group.used} redeemed · ${group.paid} paid`}
              </span>
            )}
          </>
        );
      },
    },
    {
      // Beside Used rather than instead of it: "twelve times" and "₱4,500"
      // are different questions, and only the second one answers whether the
      // promotion was worth running.
      id: "given",
      header: "Given",
      accessorFn: row => row.given,
      cell: ({ row }) => (
        <span className={row.original.given > 0 ? '' : 'text-secondary'}>
          &#8369;{formatPesos(row.original.given)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      // Five states, not two. The column used to call an expired promotion
      // and one that has not started yet "Active", which is the opposite of
      // what an organizer needs from a status column — and now that Pause is
      // one of the answers, the other four have to be honest beside it.
      // promoStatus is the same rule the checkout gates on.
      accessorFn: row => PROMO_STATUS_LABELS[promoStatus(groupTerms(row))],
      cell: ({ row }) => {
        const terms = groupTerms(row.original);
        const status = promoStatus(terms);
        // The one thing the five states cannot say: a promotion that is
        // running now and stops this week. Without it the first an organizer
        // hears of the end is the word EXPIRED, by which point extending it
        // is a decision they can no longer make in time.
        const endingSoon = promoEndingSoon(terms);
        return (
          <>
            <span className={`status-badge ${PROMO_STATUS_TONES[status]}`}>
              {PROMO_STATUS_LABELS[status]}
            </span>
            {endingSoon && <span className="status-note pending">{endingSoon}</span>}
          </>
        );
      },
    },
    {
      // The menu sits at the column's left edge, under its own header, rather
      // than pushed to the row's right edge — standing rule, and the same
      // thing the events and registrants tables do.
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="action-dropdown-container flex">
          <PromoActionsMenu
            label={row.original.batchLabel ?? row.original.terms.code}
            isPaused={row.original.terms.paused}
            isTogglingPause={pausingKey === row.original.key}
            onViewRedemptions={() => openRedemptions(row.original)}
            onEdit={() => openEdit(row.original)}
            onDuplicate={() => openDuplicate(row.original)}
            onTogglePause={() => handleTogglePause(row.original)}
            onDelete={() => handleDelete(row.original)}
          />
        </div>
      ),
      enableSorting: false,
    },
  ], [expanded, pausingKey]);

  const table = useReactTable({
    data: groups,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: searchPromos,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const errorFor = (field: string) =>
    fieldError?.field === field ? fieldError.message : undefined;

  const type = form.discountType;

  return (
    <>
      <div className="flex flex-col gap-4 w-full text-white">
        {/* Top Toolbar */}
        <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
          <div className="toolbar-actions" style={{ flex: 1 }}>
            <div className="search-wrapper">
              <Search className="search-icon" size={16} />
              <input
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                className="search-input"
                placeholder="Search promotions by code, batch or event..."
              />
              {globalFilter && (
                <button
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div ref={viewRef} className="relative view-dropdown-container">
              <button
                onClick={() => setIsViewOpen(!isViewOpen)}
                className="btn-filter"
              >
                <Columns size={16} /> View
              </button>
              {isViewOpen && (
                <div className="absolute right-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                  {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => (
                    <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white">
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${column.getIsVisible() ? 'bg-white/10' : ''}`}>
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                          className="opacity-0 absolute w-0 h-0"
                        />
                        {column.getIsVisible() && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      <span className="capitalize">{COLUMN_LABELS[column.id] ?? column.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="toolbar-actions">
            <button onClick={openCreate} className="btn-light">
              <Plus size={16} /> New Promotion
            </button>
          </div>
        </div>

        {/* Table Area */}
        <div className="border border-white/10 rounded-lg overflow-hidden bg-transparent">
          <Table>
            <TableHeader className="bg-transparent">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="border-b border-white/10 hover:bg-transparent">
                  {headerGroup.headers.map(header => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'code' ? 'pl-8' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUp className="w-3.5 h-3.5" />,
                          desc: <ChevronDown className="w-3.5 h-3.5" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map(row => {
                  const group = row.original;
                  const isBatch = group.codes.length > 1;
                  const isOpen = expanded === group.key;

                  return (
                    <React.Fragment key={row.id}>
                      <TableRow className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        {row.getVisibleCells().map(cell => (
                          <TableCell
                            key={cell.id}
                            className={`py-4 px-4 text-white ${cell.column.id === 'code' ? 'pl-8' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>

                      {/* The batch, opened. A row of its own rather than a
                          modal: the organizer opened it to copy the codes out,
                          and a panel covering the table is in the way of
                          checking them against the rest of the list. */}
                      {isBatch && isOpen && (
                        <TableRow className="border-b border-white/5 hover:bg-transparent">
                          <TableCell colSpan={row.getVisibleCells().length} className="bg-black/30 px-8 py-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs uppercase tracking-wider text-secondary">
                                Vouchers in {group.batchLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyCodes(group)}
                                className="flex items-center gap-2 text-xs font-bold text-white hover:text-accent-orange transition-colors"
                              >
                                {copied === group.key ? <Check size={14} /> : <Copy size={14} />}
                                {copied === group.key ? 'Copied' : 'Copy all codes'}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.codes.map(voucher => (
                                <span
                                  key={voucher.id}
                                  className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
                                    voucher.usageCount > 0
                                      ? 'border-white/5 bg-white/5 text-secondary line-through'
                                      : 'border-white/10 bg-black/40 text-white'
                                  }`}
                                >
                                  {voucher.code}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
                    {groups.length === 0
                      ? 'No promotions yet. A code you create here is redeemed by runners in the registration wizard, and an automatic promotion applies on its own.'
                      : 'No promotion matches that search.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <div className="flex justify-between items-center flex-wrap gap-4 mt-1">
          <div className="flex items-center gap-3 text-white text-sm font-medium">
            <span className="text-secondary">Rows per page</span>

            <div ref={pageSizeRef} className="relative">
              <button
                onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
                className="flex items-center gap-3 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white bg-transparent hover:bg-white/5 transition-colors cursor-pointer"
              >
                {table.getState().pagination.pageSize}
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {isPageSizeOpen && (
                <div className="absolute bottom-[calc(100%+4px)] left-0 bg-[#050505] border border-white/10 rounded-md p-1 min-w-[80px] z-50 shadow-2xl">
                  {[5, 10, 25, 50].map(pageSize => (
                    <div
                      key={pageSize}
                      className={`flex items-center justify-between px-3 py-1.5 cursor-pointer rounded-md text-sm transition-colors ${table.getState().pagination.pageSize === pageSize ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                      onClick={() => {
                        table.setPageSize(pageSize);
                        setIsPageSizeOpen(false);
                      }}
                    >
                      <span>{pageSize}</span>
                      {table.getState().pagination.pageSize === pageSize && <Check size={14} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-white text-sm font-medium">
              {table.getFilteredRowModel().rows.length === 0 ? '0-0 of 0' :
               `${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-${Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of ${table.getFilteredRowModel().rows.length}`}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => table.firstPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.lastPage()}
                disabled={!table.getCanNextPage()}
                className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>


      {/*
        Redemptions.

        A purpose-built panel rather than AlertModal, for the same reason the
        registrants screen's manual-email modal is one: AlertModal asks a
        question and takes an answer, and this is a list. It borrows that
        modal's frame exactly — the t-modal open/closing pair, the header, the
        scrolling body and the quiet footer — because the project's rule is
        that a new control copies an existing one.

        Every row is a link into that event's registrants screen with the order
        reference already in the search box, so "who is this?" is one click
        rather than a hunt through a table of a thousand runners.
      */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isRedemptionsOpen && !isRedemptionsClosing
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`t-modal w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isRedemptionsOpen ? 'is-open' : ''} ${isRedemptionsClosing ? 'is-closing' : ''}`}
        >
          <div className="p-6 border-b border-white/10 flex justify-between items-start gap-4 shrink-0">
            <div>
              <h3 className="text-xl font-semibold text-white m-0">Redemptions</h3>
              {redemptionsOf && (
                <p className="text-sm text-gray-400 mt-1 m-0">
                  {`${redemptionsOf.batchLabel ?? redemptionsOf.terms.code} · ${redemptionsOf.used} redeemed · ₱${formatPesos(redemptionsOf.given)} given away`}
                </p>
              )}
            </div>
            <button
              onClick={closeRedemptions}
              className="text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* The placeholder is the shape of the answer rather than a sentence
              about waiting, and it cross-fades into the orders in place, so
              the panel does not jump from one height to another as they land.
              Every branch below drops its !isLoadingRedemptions guard because
              the swap already hides the content layer while the fetch runs. */}
          <div className="p-6 overflow-y-auto flex-1">
            <SkeletonSwap
              loading={isLoadingRedemptions}
              skeleton={<RedemptionsPlaceholder />}
            >
              <div className="space-y-3">
                {redemptionsError && (
                  <p className="text-sm text-red-400 m-0">{redemptionsError}</p>
                )}

                {/* An empty state that says so, rather than a hidden panel: "nobody
                    has used this yet" is an answer, and the organizer asked. */}
                {redemptions && redemptions.redemptions.length === 0 && (
                  <p className="text-sm text-gray-400 m-0">
                    {`Nobody has used this ${
                      redemptions.automatic ? 'promotion' : 'code'
                    } yet, so it has given away ₱0.00.`}
                  </p>
                )}

                {redemptions?.redemptions.map(order => (
                  <Link
                    key={order.id}
                    href={`/admin/events/${order.eventId}/registrants?search=${encodeURIComponent(order.orderRef)}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-black/30 p-4 no-underline transition-colors hover:border-white/20 hover:bg-white/5"
                  >
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="font-mono text-sm font-bold text-white flex items-center gap-2">
                        {order.orderRef}
                        <ExternalLink size={13} className="text-secondary shrink-0" aria-hidden="true" />
                      </span>
                      <span className="text-xs text-secondary truncate">
                        {`${order.eventTitle} · ${order.runners} ${
                          order.runners === 1 ? 'runner' : 'runners'
                        } · ${new Date(order.createdAt).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}`}
                      </span>
                      {/* Inside a batch this is the only thing telling one
                          redemption from another — which voucher went where. */}
                      {redemptions.isBatch && order.code && (
                        <span className="font-mono text-xs text-accent-blue">{order.code}</span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold text-white">
                        {`−₱${formatPesos(order.discountAmount)}`}
                      </span>
                      <span
                        className={`status-badge ${order.status === 'PAID' ? 'success' : 'pending'}`}
                      >
                        {order.status}
                      </span>
                    </span>
                  </Link>
                ))}

                {redemptions?.truncated && (
                  <p className="text-xs text-gray-500 m-0">
                    {`Showing the ${redemptions.limit} most recent orders. There are more.`}
                  </p>
                )}

                {redemptions && redemptions.redemptions.length > 0 && (
                  <p className="text-xs text-gray-500 m-0">
                    A code is spent when the order is placed, so an order still waiting on payment
                    appears here and counts as a redemption &mdash; but nothing it was given is
                    counted as money until it is paid.
                  </p>
                )}
              </div>
            </SkeletonSwap>
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end bg-black/20 shrink-0">
            <button
              type="button"
              onClick={closeRedemptions}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#111] border border-white/10 rounded-xl w-full max-w-lg p-6 relative my-8">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-secondary hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Tag size={20} className="text-accent-orange" />
              {editing ? 'Edit Promotion' : duplicating ? 'Duplicate Promotion' : 'Create Discount'}
            </h2>

            {/* What an edit cannot change, said once at the top rather than
                as a surprise on a greyed-out field further down. */}
            {editing && (
              <p className="mb-6 text-sm text-secondary">
                {editing.batchLabel
                  ? `Editing all ${editing.codes.length} vouchers in this batch. The codes themselves stay as they are, and each stays single-use.`
                  : editing.used > 0
                    ? `Used ${editing.used} time${editing.used === 1 ? '' : 's'} already. Those registrations keep the discount they were given — a change here only affects new ones.`
                    : 'Not used yet, so a change here affects every registration from now on.'}
              </p>
            )}

            {/* Where these values came from, said once at the top — the form
                below is the ordinary create form, and an organizer who is not
                told would reasonably read a filled-in modal as an edit and
                expect the original to change. */}
            {!editing && duplicating && (
              <p className="mb-6 text-sm text-secondary">
                {`Copied from ${duplicating}. Give this one its own ${
                  claim === 'VOUCHERS' ? 'batch name' : claim === 'AUTOMATIC' ? 'name' : 'code'
                } — everything else came across and can be changed before you save.`}
                {datesCleared && ' Its dates are blank because the promotion you copied has already ended.'}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Scope first: what a code is worth reads differently once you
                  know whether it is for one race or all of them. */}
              <AdminSelect
                label="Applies to"
                listboxLabel="Event this code applies to"
                value={form.eventId}
                onChange={next => set({ eventId: next })}
                error={errorFor('eventId')}
                options={[
                  { value: ALL_EVENTS, label: 'All my events', hint: 'Every event you run, now and later' },
                  ...events.map(event => ({
                    value: event.id,
                    label: event.title,
                    hint: event.date,
                  })),
                ]}
              />

              <AdminSelect
                label="Discount type"
                listboxLabel="Kind of discount"
                value={type}
                onChange={next => set({ discountType: next as DiscountType })}
                error={errorFor('discountType')}
                options={[
                  { value: DISCOUNT_TYPES.PERCENTAGE, label: DISCOUNT_TYPE_LABELS.PERCENTAGE, hint: 'A share of the entry fees' },
                  { value: DISCOUNT_TYPES.FIXED, label: DISCOUNT_TYPE_LABELS.FIXED, hint: 'A flat peso amount off' },
                  { value: DISCOUNT_TYPES.FREE_DELIVERY, label: DISCOUNT_TYPE_LABELS.FREE_DELIVERY, hint: 'Waives the race-kit delivery fee' },
                  { value: DISCOUNT_TYPES.BUY_X_GET_Y, label: DISCOUNT_TYPE_LABELS.BUY_X_GET_Y, hint: 'Register 5, the 6th is free' },
                ]}
              />

              {type === DISCOUNT_TYPES.PERCENTAGE && (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-value">Percentage off</label>
                  <input
                    id="promo-value"
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    className="form-input"
                    placeholder="10"
                    aria-invalid={errorFor('discountValue') ? true : undefined}
                    value={form.discountValue}
                    onChange={e => set({ discountValue: e.target.value })}
                  />
                  <FieldError id="promo-value-error" message={errorFor('discountValue')} />
                </div>
              )}

              {type === DISCOUNT_TYPES.FIXED && (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-value">Amount off (₱)</label>
                  <input
                    id="promo-value"
                    type="number"
                    min="1"
                    step="0.01"
                    className="form-input"
                    placeholder="200"
                    aria-invalid={errorFor('discountValue') ? true : undefined}
                    value={form.discountValue}
                    onChange={e => set({ discountValue: e.target.value })}
                  />
                  <FieldError id="promo-value-error" message={errorFor('discountValue')} />
                </div>
              )}

              {type === DISCOUNT_TYPES.FREE_DELIVERY && (
                <p className="text-xs text-secondary -mt-2">
                  Takes the whole delivery fee off. A runner who chose to collect their race kit
                  themselves has no fee to waive, and is told so rather than shown a discount of
                  nothing.
                </p>
              )}

              {type === DISCOUNT_TYPES.BUY_X_GET_Y && (
                <>
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-buy">Register</label>
                      <input
                        id="promo-buy"
                        type="number"
                        min="1"
                        className="form-input"
                        placeholder="5"
                        aria-invalid={errorFor('buyQuantity') ? true : undefined}
                        value={form.buyQuantity}
                        onChange={e => set({ buyQuantity: e.target.value })}
                      />
                      <FieldError id="promo-buy-error" message={errorFor('buyQuantity')} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-get">Get free</label>
                      <input
                        id="promo-get"
                        type="number"
                        min="1"
                        className="form-input"
                        placeholder="1"
                        aria-invalid={errorFor('getQuantity') ? true : undefined}
                        value={form.getQuantity}
                        onChange={e => set({ getQuantity: e.target.value })}
                      />
                      <FieldError id="promo-get-error" message={errorFor('getQuantity')} />
                    </div>
                  </div>
                  <p className="text-xs text-secondary -mt-2">
                    Counted per whole group on one order, and the cheapest entries are the free
                    ones. Register 5 and get 1 means a group of six pays for five.
                  </p>
                </>
              )}

              {/* How the runner claims it. An automatic promotion is the one
                  nobody has to be told about: it applies on its own to any
                  order that meets the conditions below.

                  Hidden while editing: turning a code into a codeless
                  promotion would take it away from everyone already holding
                  the code, and the reverse would leave a promotion nobody
                  was ever told about. Creating the other one is the honest
                  way, and the route refuses the change too. */}
              <div className="form-group" hidden={Boolean(editing)}>
                <span className="form-label">How runners get it</span>
                <div className="flex rounded-[10px] border border-white/10 bg-black/30 p-1">
                  {CLAIMS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setClaim(option.value); setFieldError(null); }}
                      aria-pressed={claim === option.value}
                      className={`flex-1 rounded-[8px] px-3 py-2 text-sm font-bold transition-colors ${
                        claim === option.value
                          ? 'bg-white/10 text-white'
                          : 'text-secondary hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-secondary">
                  {CLAIMS.find(option => option.value === claim)?.hint}
                </p>
              </div>

              {claim === 'AUTOMATIC' ? (
                <div className="form-group">
                  <label className="form-label" htmlFor="promo-name">Promotion name</label>
                  <input
                    id="promo-name"
                    type="text"
                    maxLength={MAX_PROMO_CODE_LENGTH}
                    className="form-input"
                    placeholder="EARLY BIRD"
                    aria-invalid={errorFor('code') ? true : undefined}
                    value={form.code}
                    onChange={e => set({ code: normalizePromoCode(e.target.value) })}
                  />
                  <FieldError id="promo-name-error" message={errorFor('code')} />
                  <p className="text-xs text-secondary">
                    Nobody types this — it is what the runner sees on the event page and
                    on their receipt, so name it the way you would say it out loud.
                  </p>
                </div>
              ) : claim === 'VOUCHERS' ? (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-batch">Batch name</label>
                    <input
                      id="promo-batch"
                      type="text"
                      className="form-input"
                      placeholder="Summer VIP invites"
                      aria-invalid={errorFor('batchLabel') ? true : undefined}
                      value={form.batchLabel}
                      onChange={e => set({ batchLabel: e.target.value })}
                      // The label is what groups these rows into one
                      // promotion, so renaming it would split the batch in
                      // two rather than rename it.
                      disabled={Boolean(editing)}
                    />
                    <FieldError id="promo-batch-error" message={errorFor('batchLabel')} />
                  </div>
                  <div className="flex gap-4" hidden={Boolean(editing)}>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-prefix">Code prefix (optional)</label>
                      <input
                        id="promo-prefix"
                        type="text"
                        className="form-input"
                        placeholder="SUMMER"
                        value={form.batchPrefix}
                        onChange={e => set({ batchPrefix: normalizePromoCode(e.target.value) })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-count">How many</label>
                      <input
                        id="promo-count"
                        type="number"
                        min="1"
                        max={MAX_VOUCHER_BATCH}
                        className="form-input"
                        placeholder="50"
                        aria-invalid={errorFor('batchCount') ? true : undefined}
                        value={form.batchCount}
                        onChange={e => set({ batchCount: e.target.value })}
                      />
                      <FieldError id="promo-count-error" message={errorFor('batchCount')} />
                    </div>
                  </div>
                  {!editing && (
                    <p className="text-xs text-secondary -mt-2">
                      Each voucher is redeemable once. Codes are random rather than numbered,
                      so handing one out does not hand out the rest.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-code">Code</label>
                    <input
                      id="promo-code"
                      type="text"
                      maxLength={MAX_PROMO_CODE_LENGTH}
                      className="form-input"
                      placeholder="EARLYBIRD20"
                      aria-invalid={errorFor('code') ? true : undefined}
                      value={form.code}
                      onChange={e => set({ code: normalizePromoCode(e.target.value) })}
                    />
                    <FieldError id="promo-code-error" message={errorFor('code')} />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="promo-limit">
                      Total uses (leave blank for unlimited)
                    </label>
                    <input
                      id="promo-limit"
                      type="number"
                      min="1"
                      className="form-input"
                      value={form.usageLimit}
                      onChange={e => set({ usageLimit: e.target.value })}
                    />
                  </div>
                </>
              )}

              <details className="rounded-[10px] border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-bold text-white">
                  Conditions (optional)
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-min-spend">Minimum spend (₱)</label>
                      <input
                        id="promo-min-spend"
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        value={form.minSubtotal}
                        onChange={e => set({ minSubtotal: e.target.value })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-min-runners">Minimum runners</label>
                      <input
                        id="promo-min-runners"
                        type="number"
                        min="1"
                        className="form-input"
                        value={form.minRunners}
                        onChange={e => set({ minRunners: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-from">Starts</label>
                      <input
                        id="promo-from"
                        type="date"
                        className="form-input"
                        style={{ colorScheme: 'dark' }}
                        value={form.validFrom}
                        onChange={e => set({ validFrom: e.target.value })}
                      />
                    </div>
                    <div className="form-group flex-1">
                      <label className="form-label" htmlFor="promo-until">Ends</label>
                      <input
                        id="promo-until"
                        type="date"
                        className="form-input"
                        style={{ colorScheme: 'dark' }}
                        aria-invalid={errorFor('validUntil') ? true : undefined}
                        value={form.validUntil}
                        onChange={e => set({ validUntil: e.target.value })}
                      />
                      <FieldError id="promo-until-error" message={errorFor('validUntil')} />
                    </div>
                  </div>
                  <p className="text-xs text-secondary">
                    Dates are Manila days: a code that ends on the 30th works to the end of the
                    30th. The minimum is on the entry fees, not on the platform fee.
                  </p>
                </div>
              </details>

              <button
                type="submit"
                className="btn-light w-full mt-2"
                disabled={isSubmitting}
              >
                {claim === 'VOUCHERS' ? <Ticket size={16} /> : <Tag size={16} />}
                {isSubmitting
                  ? 'Saving'
                  : editing
                    ? 'Save Changes'
                    : claim === 'VOUCHERS'
                      ? 'Generate Vouchers'
                      : claim === 'AUTOMATIC'
                        ? 'Create Automatic Promotion'
                        : 'Create Promo Code'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One row per promotion: a batch's vouchers collapse into their label, and a
 * code created on its own stands alone.
 */
function groupPromos(promos: PromoRow[]): Group[] {
  const groups = new Map<string, Group>();

  for (const promo of promos) {
    const key = promo.batchLabel ? `batch:${promo.batchLabel}` : `code:${promo.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.codes.push(promo);
      existing.used += promo.usageCount;
      existing.given += promo.given;
      existing.paid += promo.paidOrders;
      if (existing.left !== null) {
        existing.left += remaining(promo) ?? 0;
      }
      continue;
    }
    groups.set(key, {
      key,
      batchLabel: promo.batchLabel,
      codes: [promo],
      terms: promo,
      used: promo.usageCount,
      left: remaining(promo),
      given: promo.given,
      paid: promo.paidOrders,
    });
  }

  return [...groups.values()];
}

/**
 * A group's terms as `promoStatus` wants them: the shared columns, with the
 * redemptions counted across the whole batch.
 *
 * A batch's rows each carry a limit of 1, so asking any single one of them
 * whether the promotion is used up would answer about that voucher rather
 * than about the promotion the table is showing.
 */
function groupTerms(group: Group) {
  return {
    ...group.terms,
    usageCount: group.used,
    usageLimit: group.left === null ? null : group.used + group.left,
  };
}

/** Redemptions still available on one code, or null when it is unlimited. */
function remaining(promo: PromoRow): number | null {
  if (!promo.usageLimit || promo.usageLimit <= 0) return null;
  return isExhausted(promo) ? 0 : promo.usageLimit - promo.usageCount;
}

/**
 * A stored promotion back into the form that made it.
 *
 * The units have to be undone as carefully as they were applied: basis points
 * become a percentage again and centavos become pesos, because those are what
 * the organizer typed. Getting this backwards would show a ₱200 discount as
 * ₱20,000 and invite them to "correct" it.
 */
function formFrom(group: Group): typeof BLANK_FORM {
  const promo = group.terms;
  return {
    ...BLANK_FORM,
    // A batch has no single code to show; its name is the batch label.
    code: group.batchLabel ?? promo.code,
    eventId: promo.eventId ?? ALL_EVENTS,
    discountType: (promo.discountType as DiscountType) ?? DISCOUNT_TYPES.PERCENTAGE,
    discountValue:
      promo.discountType === DISCOUNT_TYPES.PERCENTAGE
        ? String(promo.discountValue / 100)
        : promo.discountType === DISCOUNT_TYPES.FIXED
          ? String(promo.discountValue / 100)
          : '',
    buyQuantity: promo.buyQuantity ? String(promo.buyQuantity) : '',
    getQuantity: promo.getQuantity ? String(promo.getQuantity) : '',
    usageLimit: promo.usageLimit ? String(promo.usageLimit) : '',
    minSubtotal: promo.minSubtotal ? String(promo.minSubtotal / 100) : '',
    minRunners: promo.minRunners ? String(promo.minRunners) : '',
    // The date inputs want a Manila calendar day, not an instant: a window
    // that ends at 23:59 Manila is already the next day in UTC, and reading it
    // back as one would move every end date forward by a day on every save.
    validFrom: manilaCalendarDay(promo.validFrom),
    validUntil: manilaCalendarDay(promo.validUntil),
    batchLabel: group.batchLabel ?? '',
  };
}

/** An ISO instant as the `YYYY-MM-DD` a Manila organizer meant by it. */
function manilaCalendarDay(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // en-CA formats as YYYY-MM-DD, which is what <input type="date"> wants.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}
