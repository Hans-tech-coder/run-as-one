"use client";

import React, { useEffect, useState } from 'react';
import AdminSelect, { type AdminSelectOption } from '../AdminSelect';
import { clientStatusLabel } from '@/lib/client';

/**
 * Which client a race is run for — the event form's **Client** picker
 * (ADMIN_MERGE_PLAN.md, Batch 3). Optional: a race with no client is simply
 * one nobody outside Run As One can see the counts of yet.
 *
 * **It draws itself only for staff who may link one** (`platform:manage`).
 * The options route answers anyone else with a 403, and the picker then
 * renders nothing and tells the form so through `onAvailable`, which is how
 * the form knows to leave `clientId` out of what it saves — an event manager
 * editing a race must neither see nor change who its counts are shown to
 * (lib/client-store.ts, where the route enforces the same rule).
 *
 * Archived clients are not offered, except the one a race is already linked
 * to, which is shown so the form never claims a race has no client when it
 * does.
 */

type ClientOption = { id: string; name: string; status: string };

export default function EventClientField({
  value,
  onChange,
  onAvailable,
  error,
}: {
  /** The linked client's id, or '' for none. */
  value: string;
  onChange: (clientId: string) => void;
  /** Whether this person may link a client — false once the route refuses. */
  onAvailable: (available: boolean) => void;
  error?: string;
}) {
  const [clients, setClients] = useState<ClientOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/clients/options');
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setClients(data.clients);
        onAvailable(true);
      } catch {
        if (!cancelled) onAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Asked once per form; the answer does not change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!clients) return null;

  const options: AdminSelectOption[] = [
    { value: '', label: 'No client yet', hint: 'Only Run As One sees this race in the dashboard' },
    ...clients
      .filter(client => client.status !== 'ARCHIVED' || client.id === value)
      .map(client => ({
        value: client.id,
        label: client.name,
        hint: clientStatusLabel(client.status),
      })),
  ];

  return (
    <div className="form-group-full">
      <AdminSelect
        label={
          <>
            Client <span className="text-xs opacity-70">- optional</span>
          </>
        }
        value={value}
        options={options}
        placeholder="No client yet"
        listboxLabel="Client"
        onChange={onChange}
        error={error}
        hint="The organization this race is run for. Anyone signing in for that client sees its registrant counts."
      />
    </div>
  );
}
