"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, MailX, Plus, Users, X } from 'lucide-react';
import AdminSelect from '../../../AdminSelect';
import PacerActionsMenu from './PacerActionsMenu';
import AdminCardList from '../../../AdminCardList';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MAX_PACER_NAME_LENGTH,
  WAIVE_REFUSAL,
  isPacerRegistered,
  needsCodeSent,
  normalizePacerName,
} from '@/lib/pacer';

/**
 * One race's pacers, and the form that adds another.
 *
 * **Grouped by category**, because a pacer code is locked to one and the
 * question this screen is opened with is "who is pacing the 21K?". The groups
 * come in the event's own category order (`CATEGORY_ORDER`, applied on the
 * server), and each names its distance beside its name — the two are not always
 * the same thing, so dropping one would be dropping information.
 *
 * From `lg` up each group is a table; below it the same rows are cards, the
 * dashboard's standing pair (`.dash-desktop-only` / `.dash-mobile-only`). The
 * rows are not searchable or sortable and deliberately carry no TanStack
 * instance: a race has a handful of pacers, and a toolbar of controls over four
 * rows is furniture rather than help.
 *
 * Every rule about what a pacer *is* — whether they still need their code,
 * whether they have registered, what a name may be — comes from
 * `src/lib/pacer.ts`, which the routes read too, so this screen cannot predict
 * a different answer from the one it will be given.
 */

/** One pacer, as `pacers/page.tsx` hands it over. */
export type PacerRow = {
  id: string;
  code: string;
  assigneeName: string | null;
  waiveAdminFee: boolean;
  /** ISO, or null while staff have not marked the code as sent. */
  codeSentAt: string | null;
  paused: boolean;
  usageCount: number;
  /**
   * The category this code is locked to. The name and distance are not repeated
   * here: the screen groups by this id against the `categories` it is given, so
   * a second copy could only ever disagree with the heading above the row.
   */
  categoryId: string | null;
  /** The order this pacer registered with, or null while the code is unclaimed. */
  order: { orderRef: string; status: string } | null;
};

export type PacerCategory = { id: string; name: string; distance: string | null };

/** The Add Pacer form, and what a rename holds. */
type AddForm = { categoryId: string; assigneeName: string; waiveAdminFee: boolean };

const EMPTY_FORM: AddForm = { categoryId: '', assigneeName: '', waiveAdminFee: false };

/** How long the Copy button says "Copied" before going back to itself. */
const COPIED_MS = 1600;

export default function PacersClient({
  eventId,
  categories,
  pacers,
  reminder,
  canWaiveAdminFee,
}: {
  eventId: string;
  /** This event's categories, in the event's own order. */
  categories: PacerCategory[];
  pacers: PacerRow[];
  /** The amber line, or null when nobody is waiting for their code. */
  reminder: string | null;
  /** Whether this person holds `promo:waive-fee` — the Super Admin alone. */
  canWaiveAdminFee: boolean;
}) {
  const router = useRouter();
  const { alert, confirm, toast } = useAlert();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [problem, setProblem] = useState<{ field: string; error: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [renaming, setRenaming] = useState<PacerRow | null>(null);
  const [renameValue, setRenameValue] = useState('');

  /** Which row has a request in flight, so only that row's items go quiet. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /**
   * The pacers of each category, in the event's category order, with anything
   * whose category has since been deleted gathered at the end.
   *
   * The last group should never appear — the create route writes exactly one
   * category row and it cascades — but a screen that crashed on it would be a
   * worse answer than a screen that shows the pacer and lets somebody deal with
   * them.
   */
  /**
   * How far down the list is (`PACER_DISCOUNT_PLAN.md` Batch 3). Counted here
   * from the rows the screen holds rather than handed down from the server, so
   * adding or deleting a pacer moves it at once — and from the same
   * `isPacerRegistered` the chip on each row reads, so the line and the list
   * can never disagree about who has signed up.
   */
  const registeredCount = useMemo(() => pacers.filter(isPacerRegistered).length, [pacers]);

  const groups = useMemo(() => {
    const byCategory = categories.map(category => ({
      key: category.id,
      name: category.name,
      distance: category.distance,
      rows: pacers.filter(pacer => pacer.categoryId === category.id),
    }));

    const orphans = pacers.filter(
      pacer => !pacer.categoryId || !categories.some(category => category.id === pacer.categoryId),
    );
    if (orphans.length > 0) {
      byCategory.push({
        key: '__orphans__',
        name: 'No category',
        distance: null,
        rows: orphans,
      });
    }

    return byCategory.filter(group => group.rows.length > 0);
  }, [categories, pacers]);

  const openAdd = () => {
    setProblem(null);
    setForm({
      ...EMPTY_FORM,
      // One category means one answer, so it is chosen already rather than
      // making somebody open a picker with a single option in it.
      categoryId: categories.length === 1 ? categories[0].id : '',
    });
    setIsAddOpen(true);
  };

  const copyCode = async (pacer: PacerRow) => {
    try {
      await navigator.clipboard.writeText(pacer.code);
      setCopiedId(pacer.id);
      setTimeout(() => setCopiedId(current => (current === pacer.id ? null : current)), COPIED_MS);
    } catch {
      await alert(
        'Your browser would not let us reach the clipboard. Select the code and copy it by hand.',
      );
    }
  };

  /** One PATCH, for every row action that is a single field. */
  const patchPacer = async (pacer: PacerRow, body: Record<string, unknown>, done: string) => {
    setBusyId(pacer.id);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${pacer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        await alert({
          variant: 'danger',
          message: payload.error ?? 'That change could not be saved. Please try again.',
        });
        return;
      }
      toast(done);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleCodeSent = (pacer: PacerRow) => {
    const sent = pacer.codeSentAt === null;
    return patchPacer(
      pacer,
      { codeSent: sent },
      sent
        ? `${nameOf(pacer)} is marked as sent.`
        : `${nameOf(pacer)} is back on the not-sent list.`,
    );
  };

  const handleTogglePause = (pacer: PacerRow) =>
    patchPacer(
      pacer,
      { paused: !pacer.paused },
      pacer.paused ? `${nameOf(pacer)}'s code works again.` : `${nameOf(pacer)}'s code is paused.`,
    );

  const handleToggleWaiver = (pacer: PacerRow) =>
    patchPacer(
      pacer,
      { waiveAdminFee: !pacer.waiveAdminFee },
      pacer.waiveAdminFee
        ? `${nameOf(pacer)} now pays the admin fee.`
        : `${nameOf(pacer)}'s admin fee is waived.`,
    );

  const handleDelete = async (pacer: PacerRow) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Remove this pacer?',
      message: (
        <>
          <strong>{nameOf(pacer)}</strong>&rsquo;s code <strong>{pacer.code}</strong> will stop
          working and the slot it was holding goes back to the category. If you only want to stop
          the code for now, pause it instead.
        </>
      ),
      confirmLabel: 'Remove pacer',
    });
    if (!ok) return;

    setBusyId(pacer.id);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${pacer.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        await alert({
          variant: 'danger',
          message: payload.error ?? 'That pacer could not be removed. Please try again.',
        });
        return;
      }
      toast(`${nameOf(pacer)} was removed.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const openRename = (pacer: PacerRow) => {
    setProblem(null);
    setRenaming(pacer);
    setRenameValue(pacer.assigneeName ?? '');
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renaming) return;

    // Checked here with the same rule the route enforces, so the form says what
    // is wrong before a round trip rather than after one.
    if (!normalizePacerName(renameValue)) {
      setProblem({
        field: 'renameName',
        error: 'Enter the pacer’s name, so this code can be told whose it is.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers/${renaming.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeName: renameValue }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({ field: 'renameName', error: payload.error ?? 'That name could not be saved.' });
        return;
      }
      setRenaming(null);
      toast('The pacer was renamed.');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);

    // Both checks are the route's own, run here first so each names its own box
    // instead of the form showing one catch-all sentence.
    if (!form.categoryId) {
      setProblem({ field: 'categoryId', error: 'Choose the category this pacer will run.' });
      return;
    }
    if (!normalizePacerName(form.assigneeName)) {
      setProblem({
        field: 'assigneeName',
        error: 'Enter the pacer’s name, so this code can be told whose it is.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pacers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem({
          field: payload.field ?? 'assigneeName',
          error: payload.error ?? 'That pacer could not be added. Please try again.',
        });
        return;
      }
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      toast({
        title: 'Pacer added',
        message: `${payload.pacer?.code ?? 'Their code'} is ready to send.`,
      });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  /** The code, with the button that puts it on the clipboard. */
  const renderCode = (pacer: PacerRow) => (
    <span className="pacer-code">
      {pacer.code}
      <button
        type="button"
        onClick={() => copyCode(pacer)}
        className="pacer-copy"
        aria-label={`Copy ${nameOf(pacer)}'s code`}
      >
        {copiedId === pacer.id ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </span>
  );

  /**
   * A row's state, and the two facts that sit beside it.
   *
   * The state badge answers "can this code still be used"; the chips answer
   * "is there anything to do about it". Each chip carries an icon as well as a
   * colour, because a colour on its own is not a message.
   */
  const renderStatus = (pacer: PacerRow) => (
    <div className="pacer-chips">
      {isPacerRegistered(pacer) ? (
        <span className="status-badge success">Registered</span>
      ) : pacer.paused ? (
        <span className="status-badge neutral">Paused</span>
      ) : (
        <span className="status-badge neutral">Not yet used</span>
      )}

      {needsCodeSent(pacer) && (
        <span className="status-badge pending inline-flex items-center gap-1.5">
          <MailX size={12} aria-hidden="true" />
          Code not sent
        </span>
      )}

      {pacer.waiveAdminFee && <span className="status-badge info">Admin fee waived</span>}

      {/* Who the entry actually belongs to now, and one click to their row on
          the registrants list — the same `?search=` link the marketing screen's
          redemptions panel uses. */}
      {pacer.order && (
        <>
          <Link
            href={`/admin/events/${eventId}/registrants?search=${encodeURIComponent(pacer.order.orderRef)}`}
            className="text-xs font-semibold text-accent-blue-ink hover:underline"
          >
            {pacer.order.orderRef}
          </Link>
          {/* A pacer who still owes the admin fee can be sitting on a bank
              transfer nobody has checked yet, and *Registered* on its own would
              read as settled. Only said when it is not. */}
          {pacer.order.status !== 'PAID' && (
            <span className="status-note pending">{pacer.order.status}</span>
          )}
        </>
      )}
    </div>
  );

  /**
   * A row's actions. In the table it is the menu alone, under the Actions
   * header; on a card it is the dashboard's card footer — a labelled shortcut
   * for the thing this screen is opened to do, with the menu pushed to the
   * right, exactly as the events and marketing cards lay theirs out.
   */
  const renderActions = (pacer: PacerRow, variant: 'table' | 'card' = 'table') => (
    <div className={`action-dropdown-container flex ${variant === 'card' ? 'w-full items-center' : ''}`}>
      {variant === 'card' && (
        <button
          type="button"
          onClick={() => copyCode(pacer)}
          className="btn-filter"
          aria-label={`Copy ${nameOf(pacer)}'s code`}
        >
          {copiedId === pacer.id ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          {copiedId === pacer.id ? 'Copied' : 'Copy code'}
        </button>
      )}
      <div className={variant === 'card' ? 'flex ml-auto' : 'flex'}>
      <PacerActionsMenu
        label={nameOf(pacer)}
        isPaused={pacer.paused}
        isCodeSent={pacer.codeSentAt !== null}
        isRegistered={isPacerRegistered(pacer)}
        isBusy={busyId === pacer.id}
        copied={copiedId === pacer.id}
        isFeeWaived={pacer.waiveAdminFee}
        onCopyCode={() => copyCode(pacer)}
        onToggleCodeSent={() => handleToggleCodeSent(pacer)}
        onRename={() => openRename(pacer)}
        onTogglePause={() => handleTogglePause(pacer)}
        // Offered only to the Super Admin, the same `can()` the route asks, so
        // nobody else is shown an item that would come back 403. The waiver is
        // set when a pacer is added; this is how it is changed afterwards, which
        // the PATCH route supports and something has to be able to call.
        onToggleFeeWaiver={canWaiveAdminFee ? () => handleToggleWaiver(pacer) : undefined}
        onDelete={() => handleDelete(pacer)}
      />
      </div>
    </div>
  );

  const categoryOptions = categories.map(category => ({
    value: category.id,
    // The distance stays beside the name: "10K" and "10 km Fun Run" are the
    // organizer's own two labels for two different things.
    label: category.distance ? `${category.name} · ${category.distance}` : category.name,
  }));

  return (
    <>
      {/* The reminder, above everything. It is a status message rather than
          decoration, so a screen reader hears it when the list re-renders after
          a Mark as sent. */}
      {reminder && (
        <p className="pacer-reminder" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          {reminder}
        </p>
      )}

      <p className="mb-6 text-sm text-secondary max-w-prose">
        A pacer code is a free entry for one named pacer in one category of this race. It covers
        their entry and their singlet, it takes a slot like any other runner, and the pacer
        registers with it themselves so they still give consent, the waiver and an emergency
        contact. <strong>Send the code to them yourself</strong> — the app emails no pacer — then
        mark it as sent.
      </p>

      {/* Where this race stands, in one line. The reminder above says what is
          still owed to the pacers; this says what they have done with it, and
          it is the figure an organizer counts bibs and singlets against. */}
      {pacers.length > 0 && (
        <p className="mb-6 -mt-3 text-sm font-medium text-primary">
          {registeredCount} of {pacers.length} {pacers.length === 1 ? 'pacer' : 'pacers'} registered
        </p>
      )}

      <div className="admin-toolbar">
        <div className="toolbar-actions">
          <button type="button" onClick={openAdd} className="btn-light" disabled={categories.length === 0}>
            <Plus size={16} /> Add Pacer
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
          This race has no categories yet, so there is nothing for a pacer to run. Add a distance
          category to the event first.
        </div>
      ) : groups.length === 0 ? (
        <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
          No pacers yet. Add one and this race gets a code you can send them; they register with it
          themselves and pay nothing for their entry.
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="pacer-group">
            <div className="pacer-group-head">
              <h2 className="pacer-group-title">{group.name}</h2>
              {group.distance && <span className="pacer-group-distance">{group.distance}</span>}
              <span className="pacer-group-count">
                {group.rows.length} {group.rows.length === 1 ? 'pacer' : 'pacers'}
              </span>
            </div>

            {/* From `lg` up; the cards below take its place under it. */}
            <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
              <Table>
                <TableHeader className="bg-transparent">
                  <TableRow className="border-b border-[var(--dash-border)] hover:bg-transparent">
                    <TableHead className="py-4 px-4 pl-8 text-secondary font-medium h-auto">
                      Pacer
                    </TableHead>
                    <TableHead className="py-4 px-4 text-secondary font-medium h-auto">Code</TableHead>
                    <TableHead className="py-4 px-4 text-secondary font-medium h-auto">
                      Status
                    </TableHead>
                    {/* The Actions cells sit under this label rather than
                        against the row's right edge, as they do on every other
                        table in the dashboard. */}
                    <TableHead className="py-4 px-4 text-secondary font-medium h-auto">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map(pacer => (
                    <TableRow
                      key={pacer.id}
                      className="border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors"
                    >
                      <TableCell className="py-4 px-4 pl-8 text-primary font-semibold">
                        {nameOf(pacer)}
                      </TableCell>
                      <TableCell className="py-4 px-4 text-primary">{renderCode(pacer)}</TableCell>
                      <TableCell className="py-4 px-4 text-primary">{renderStatus(pacer)}</TableCell>
                      <TableCell className="py-4 px-4 text-primary">{renderActions(pacer)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* The same rows below `lg`, as cards — no horizontal scroll at
                375px, which a four-column table cannot manage. */}
            <div className="dash-mobile-only">
              <AdminCardList
                items={group.rows}
                getKey={pacer => pacer.id}
                label={`${group.name} pacers`}
                className="is-flush"
                title={pacer => <span className="font-bold">{nameOf(pacer)}</span>}
                badges={pacer => renderStatus(pacer)}
                fields={pacer => [{ label: 'Code', value: renderCode(pacer), full: true }]}
                actions={pacer => renderActions(pacer, 'card')}
              />
            </div>
          </section>
        ))
      )}

      {/* ── Add Pacer ────────────────────────────────────────────────────── */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pacer-form-title"
            className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-lg overflow-clip"
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
              <h2
                id="pacer-form-title"
                className="text-xl font-bold m-0 flex items-center gap-2 min-w-0"
              >
                <Users size={20} className="text-accent-orange-ink shrink-0" />
                Add Pacer
              </h2>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body px-6 pt-2 pb-6 max-sm:px-4">
              <form id="pacer-form" onSubmit={submitAdd} className="flex flex-col gap-5">
                <AdminSelect
                  label={
                    <>
                      Category <span className="text-[var(--status-danger)]">*</span>
                    </>
                  }
                  value={form.categoryId}
                  options={categoryOptions}
                  placeholder="Which distance will they pace?"
                  listboxLabel="Category"
                  onChange={next => setForm({ ...form, categoryId: next })}
                  error={problem?.field === 'categoryId' ? problem.error : undefined}
                  hint="The code is locked to this category, and it cannot be changed afterwards."
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="pacer-name">
                    Pacer name <span className="text-[var(--status-danger)]">*</span>
                  </label>
                  <input
                    id="pacer-name"
                    type="text"
                    className="form-input"
                    value={form.assigneeName}
                    maxLength={MAX_PACER_NAME_LENGTH}
                    // Uppercase, because that is how the name is stored and how
                    // it will be shown — a sample in sentence case would promise
                    // something the row does not deliver.
                    placeholder="JUAN DELA CRUZ"
                    onChange={event => setForm({ ...form, assigneeName: event.target.value })}
                    aria-invalid={problem?.field === 'assigneeName' ? true : undefined}
                    aria-describedby={
                      problem?.field === 'assigneeName' ? 'pacer-name-error' : undefined
                    }
                  />
                  <FieldError
                    id="pacer-name-error"
                    message={problem?.field === 'assigneeName' ? problem.error : undefined}
                  />
                </div>

                {/* The money decision. Off means the pacer still goes through
                    checkout and pays the admin fee; on means the order is ₱0 and
                    there is no payment step at all. */}
                <div className="form-group">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.waiveAdminFee}
                    disabled={!canWaiveAdminFee}
                    onClick={() => setForm({ ...form, waiveAdminFee: !form.waiveAdminFee })}
                    className="admin-switch-row"
                  >
                    <span className="admin-switch-label">
                      <span>Include admin fee in discount</span>
                      <span className="admin-switch-hint">
                        {canWaiveAdminFee
                          ? 'On, the pacer pays nothing at all and skips the payment step. Off, they still pay the admin fee.'
                          : WAIVE_REFUSAL.error}
                      </span>
                    </span>
                    <span
                      className="t-toggle admin-switch"
                      data-on={form.waiveAdminFee}
                      aria-hidden="true"
                    >
                      <span className="t-toggle-thumb" />
                    </span>
                  </button>
                  <FieldError
                    id="pacer-waiver-error"
                    message={problem?.field === 'waiveAdminFee' ? problem.error : undefined}
                  />
                </div>
              </form>
            </div>

            {/* Outside the scrolling body, so it is always in reach; `form` ties
                it back to the form it submits. */}
            <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
              <button type="submit" form="pacer-form" className="btn-light w-full" disabled={isSubmitting}>
                <Plus size={16} />
                {isSubmitting ? 'Saving' : 'Add Pacer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename ───────────────────────────────────────────────────────── */}
      {renaming && (
        <div className="fixed inset-0 bg-[var(--dash-scrim)] backdrop-blur-sm z-50 flex items-center justify-center p-4 max-sm:p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pacer-rename-title"
            className="admin-modal-panel bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-xl w-full max-w-md overflow-clip"
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 max-sm:px-4 max-sm:pt-3 shrink-0">
              <h2 id="pacer-rename-title" className="text-xl font-bold m-0 min-w-0">
                Rename pacer
              </h2>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body px-6 pt-2 pb-6 max-sm:px-4">
              <form id="pacer-rename-form" onSubmit={submitRename}>
                <p className="mb-4 text-sm text-secondary">
                  The code <strong>{renaming.code}</strong> stays as it is, so a pacer already
                  holding it can still use it.
                </p>
                <div className="form-group">
                  <label className="form-label" htmlFor="pacer-rename">
                    Pacer name <span className="text-[var(--status-danger)]">*</span>
                  </label>
                  <input
                    id="pacer-rename"
                    type="text"
                    className="form-input"
                    value={renameValue}
                    maxLength={MAX_PACER_NAME_LENGTH}
                    placeholder="JUAN DELA CRUZ"
                    onChange={event => setRenameValue(event.target.value)}
                    aria-invalid={problem?.field === 'renameName' ? true : undefined}
                    aria-describedby={
                      problem?.field === 'renameName' ? 'pacer-rename-error' : undefined
                    }
                  />
                  <FieldError
                    id="pacer-rename-error"
                    message={problem?.field === 'renameName' ? problem.error : undefined}
                  />
                </div>
              </form>
            </div>

            <div className="admin-modal-footer px-6 pt-4 pb-6 max-sm:p-4 border-t border-[var(--dash-border)] shrink-0">
              <button
                type="submit"
                form="pacer-rename-form"
                className="btn-light w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving' : 'Save name'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * What to call this pacer.
 *
 * The name, or the code for a row that somehow has none — a row written before
 * `assigneeName` existed cannot happen (the column arrived with the kind), but a
 * screen that printed "null" would be worse than one that prints the code.
 */
function nameOf(pacer: PacerRow): string {
  return pacer.assigneeName || pacer.code;
}
