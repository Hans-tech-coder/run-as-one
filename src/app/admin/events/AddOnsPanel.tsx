"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import AdminSwitch from '../AdminSwitch';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import { formatEventInstant } from '@/lib/event-schedule';
import {
  ADD_ON_SELLER_LABELS,
  addOnChoices,
  addOnSalesClosed,
  asSeller,
  stockLeft,
} from '@/lib/add-ons';
import AddOnFormModal, { type AddOnCategory, type PanelAddOn } from './AddOnFormModal';

/**
 * Event edit › Add-ons (ADD_ONS_PLAN.md Batch 1): the optional items a runner
 * can buy with their entry — a commemorative shirt, a cap — each with its
 * poster, price, seller, stock and an on/off switch.
 *
 * **Saved as it goes, not by Update Event.** Each add, edit, switch, move and
 * delete is its own request to `/api/admin/events/[id]/add-ons`, audited on
 * its own, because an item has a life of its own (its stock is counted
 * against live orders) and folding it into the event's big PUT would make
 * every event save rewrite every item. The panel says so, so nobody waits for
 * the form's button to keep a change it already kept.
 *
 * A list of cards rather than a table at every width, like Promotions beside
 * it: a panel inside a form has no toolbar, pager or sort, and a card already
 * reads at 360px without the table-to-card switch.
 *
 * Every row action is an icon **and** a label (the owner's standing rule for
 * row actions). Delete is offered only while nobody has bought the item;
 * after that the row says why it can only be switched off.
 */
type Loaded = { addOns: PanelAddOn[]; categories: AddOnCategory[] } | { error: string };

async function fetchAddOns(eventId: string): Promise<Loaded> {
  try {
    const res = await fetch(`/api/admin/events/${eventId}/add-ons`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { error: payload.error ?? 'The add-ons could not be loaded. Please refresh the page.' };
    return { addOns: payload.addOns, categories: payload.categories };
  } catch {
    return { error: 'The add-ons could not be loaded. Check your connection and refresh the page.' };
  }
}

export default function AddOnsPanel({ eventId }: { eventId: string }) {
  const { confirm, toast, alert } = useAlert();
  const [addOns, setAddOns] = useState<PanelAddOn[] | null>(null);
  const [categories, setCategories] = useState<AddOnCategory[]>([]);
  const [loadError, setLoadError] = useState('');
  // undefined: closed; null: adding; an item: editing it.
  const [editing, setEditing] = useState<PanelAddOn | null | undefined>(undefined);
  // The item a request is in flight for, so only its controls wait.
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = useCallback((result: Loaded) => {
    if ('error' in result) {
      setLoadError(result.error);
      return;
    }
    setAddOns(result.addOns);
    setCategories(result.categories);
    setLoadError('');
  }, []);
  const load = useCallback(async () => apply(await fetchAddOns(eventId)), [apply, eventId]);

  useEffect(() => {
    let current = true;
    fetchAddOns(eventId).then(result => {
      if (current) apply(result);
    });
    return () => {
      current = false;
    };
  }, [apply, eventId]);

  const send = async (addOn: PanelAddOn, init: RequestInit) => {
    setBusyId(addOn.id);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/add-ons/${addOn.id}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', message: payload.error ?? 'That did not save. Please try again.' });
        return false;
      }
      await load();
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (addOn: PanelAddOn) => send(addOn, { method: 'PATCH', body: JSON.stringify({ active: !addOn.active }) });
  const move = (addOn: PanelAddOn, direction: 'up' | 'down') =>
    send(addOn, { method: 'PATCH', body: JSON.stringify({ move: direction }) });
  const remove = async (addOn: PanelAddOn) => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Delete this add-on?',
      message: `${addOn.name} will be removed from this event. Nobody has bought it yet, so no order changes.`,
      confirmLabel: 'Delete Add-on',
    });
    if (!ok) return;
    if (await send(addOn, { method: 'DELETE' })) toast({ title: 'Add-on deleted', message: addOn.name });
  };

  const categoryName = (id: string) => categories.find(category => category.id === id)?.name;

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Add-ons</h2>
        <button type="button" className="btn-light" onClick={() => setEditing(null)} disabled={addOns === null}>
          <Plus size={16} /> Add Add-on
        </button>
      </div>
      <div className="admin-panel-content">
        <p className="text-sm opacity-70 mb-6">
          Optional items a runner can buy with their entry, like a commemorative shirt or a cap.
          Changes here save as you make them — Update Event is not needed.
        </p>

        {loadError ? (
          <p className="text-sm text-[var(--status-danger)] m-0" role="alert">
            {loadError}
          </p>
        ) : addOns === null ? (
          <p className="text-sm text-secondary m-0">
            <BusyLabel>Loading add-ons</BusyLabel>
          </p>
        ) : addOns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--ink-15)] bg-[var(--ink-02)] p-6 max-sm:p-4 text-center">
            <ShoppingBag size={28} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm m-0 mb-1">No add-ons on this event.</p>
            <p className="text-xs opacity-70 m-0">
              Add one and runners can pick it, per runner, while they register.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3 m-0 p-0 list-none">
            {addOns.map((addOn, index) => {
              const busy = busyId === addOn.id;
              const left = stockLeft(addOn, addOn.sold);
              const closed = addOnSalesClosed(addOn);
              const choices = addOnChoices(addOn);
              const scope =
                addOn.categoryIds.length === 0
                  ? 'Every category'
                  : addOn.categoryIds.map(categoryName).filter(Boolean).join(', ');
              const seller = asSeller(addOn.soldBy);

              return (
                <li
                  key={addOn.id}
                  className={`rounded-xl border border-[var(--dash-border)] bg-[var(--ink-02)] p-4 max-sm:p-3 ${addOn.active ? '' : 'opacity-80'}`}
                >
                  <div className="flex items-start gap-4 max-sm:gap-3">
                    <div className="w-16 h-16 max-sm:w-14 max-sm:h-14 shrink-0 rounded-lg overflow-hidden border border-[var(--dash-border)] bg-[var(--ink-05)] flex items-center justify-center">
                      {addOn.imageUrls[0] ? (
                        <img src={addOn.imageUrls[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <ImageOff size={20} className="opacity-40" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3 max-sm:flex-col max-sm:gap-1">
                        <span className="block font-bold text-accent-blue-ink [overflow-wrap:anywhere]">{addOn.name}</span>
                        <span className="flex flex-wrap gap-1.5 shrink-0">
                          <span className={`status-badge ${seller === 'RUN_AS_ONE' ? 'info' : 'neutral'} whitespace-nowrap`}>
                            Sold by {ADD_ON_SELLER_LABELS[seller]}
                          </span>
                          {!addOn.active ? (
                            <span className="status-badge neutral whitespace-nowrap">Off</span>
                          ) : left === 0 ? (
                            <span className="status-badge danger whitespace-nowrap">Sold out</span>
                          ) : closed ? (
                            <span className="status-badge pending whitespace-nowrap">Sales closed</span>
                          ) : null}
                        </span>
                      </div>
                      <span className="block text-sm">
                        ₱{formatPesos(addOn.price)}
                        {choices.length > 0 && ` · ${choices.join(', ')}`}
                        {` · up to ${addOn.maxPerRunner} per runner`}
                      </span>
                      <span className="block text-xs text-secondary mt-1">
                        {[
                          addOn.stockLimit === null ? `${addOn.sold} sold · no stock limit` : `${addOn.sold} / ${addOn.stockLimit} sold`,
                          scope,
                          addOn.salesCloseAt
                            ? `${closed ? 'Closed' : 'Closes'} ${formatEventInstant(addOn.salesCloseAt)}`
                            : 'On sale until registration closes',
                        ].join(' · ')}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <AdminSwitch
                      on={addOn.active}
                      label="On sale"
                      hint={
                        addOn.active
                          ? 'Offered to runners registering now.'
                          : 'Hidden from new orders. Orders already taken keep it.'
                      }
                      onToggle={() => toggle(addOn)}
                      disabled={busy}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-filter max-sm:min-h-11" onClick={() => setEditing(addOn)} disabled={busy}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn-filter max-sm:min-h-11"
                      onClick={() => move(addOn, 'up')}
                      disabled={busy || index === 0}
                    >
                      <ArrowUp size={14} /> Move Up
                    </button>
                    <button
                      type="button"
                      className="btn-filter max-sm:min-h-11"
                      onClick={() => move(addOn, 'down')}
                      disabled={busy || index === addOns.length - 1}
                    >
                      <ArrowDown size={14} /> Move Down
                    </button>
                    {addOn.hasSales ? (
                      <span className="text-xs text-secondary">Already bought, so it can only be switched off.</span>
                    ) : (
                      <button type="button" className="btn-filter is-danger max-sm:min-h-11" onClick={() => remove(addOn)} disabled={busy}>
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {editing !== undefined && (
        <AddOnFormModal
          eventId={eventId}
          addOn={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={name => {
            const added = editing === null;
            setEditing(undefined);
            toast({ title: added ? 'Add-on added' : 'Add-on saved', message: name });
            load();
          }}
        />
      )}
    </div>
  );
}
