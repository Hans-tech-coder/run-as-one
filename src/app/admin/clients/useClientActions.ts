"use client";

import { useAlert } from '@/components/ui/AlertProvider';
import type { ClientRow, ClientViewerRow } from './application-rows';
import type { InviteResult } from './InviteDialog';

/**
 * What /admin/clients does to a client: send (or resend) an invite, reset a
 * viewer's two-step sign-in, archive or restore. Split out of ClientsClient,
 * which keeps the list and the panels; each call refreshes the list through
 * `refresh` whatever the answer, since a 409 may mean the row moved under it.
 */
export function useClientActions(refresh: () => void) {
  // Shadows window.alert / window.confirm on purpose — see AlertProvider.
  const { alert, confirm, toast, progress } = useAlert();

  /** Sends one invitation. Answers with the route's refusal; never throws. */
  const sendInvite = async (
    client: ClientRow,
    invitee: { name: string; email: string },
  ): Promise<InviteResult> => {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invitee),
      });
      const data = await res.json().catch(() => ({}));
      // Refreshed whatever the answer: a 409 may mean the row moved under us.
      refresh();
      if (!res.ok) {
        return {
          ok: false,
          errors: data?.errors,
          error: data?.error ?? 'The invitation could not be sent. Please try again.',
        };
      }

      if (data.reactivated) {
        toast({
          variant: 'success',
          message: `${data.name} already had a sign-in for ${client.name}, so the client is active again.`,
        });
      } else if (data.emailSent) {
        toast({
          variant: 'success',
          message: `${data.resent ? 'Invitation resent' : 'Invitation sent'} to ${data.name} at ${invitee.email}.`,
        });
      } else {
        // After the dialog has closed, so the alert never opens over it.
        window.setTimeout(() => {
          alert({
            variant: 'error',
            title: 'Invitation saved, but the email did not go out',
            message: `${data.emailError ?? 'The email could not be sent.'} Use Resend invite to try again, or let ${data.name} know at ${invitee.email}.`,
          });
        }, 200);
      }
      return { ok: true };
    } catch (error) {
      console.error(error);
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
  };

  // A viewer's lost phone with no recovery codes left (TWO_FACTOR_PLAN.md D4).
  // It asks first: it weakens somebody's account and signs them out.
  const resetTwoFactor = async (client: ClientRow, viewer: ClientViewerRow) => {
    const name = viewer.staff.name;
    const confirmed = await confirm({
      variant: 'danger',
      title: `Reset two-step sign-in for ${name}?`,
      message: `Do this only when you are sure it is ${name} asking — usually a lost phone with no recovery codes left. Two-step sign-in is turned off on their account, they are signed out everywhere, and they get an email saying you did it. Until they turn it on again in Settings › Security, their password alone signs them in.`,
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;

    const status = progress(`Resetting two-step sign-in for ${name}`);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/viewers/${viewer.id}/two-factor`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      refresh();
      if (res.ok) {
        status.done({ variant: 'success', message: `Two-step sign-in is reset for ${name}. They have been emailed.` });
      } else {
        status.clear();
        alert(data?.error ?? 'Two-step sign-in could not be reset. Please try again.');
      }
    } catch (error) {
      console.error(error);
      status.clear();
      alert('Could not reach the server. Check your connection and try again.');
    }
  };

  const moveClient = async (client: ClientRow, move: 'archive' | 'restore') => {
    const confirmed = await confirm(
      move === 'archive'
        ? {
            variant: 'danger',
            title: 'Archive This Client',
            message: `${client.name} leaves the submissions list, and anyone signing in for it is signed out. Nothing is deleted — you can restore it from Archived.`,
            confirmLabel: 'Archive',
          }
        : {
            variant: 'info',
            title: 'Restore This Client',
            message: `${client.name} goes back to the list as New. Nobody can sign in for it until you send an invite.`,
            confirmLabel: 'Restore',
          },
    );
    if (!confirmed) return;

    // The row menu has closed by now; this is the sign the press landed (§9).
    const status = progress(`${move === 'archive' ? 'Archiving' : 'Restoring'} ${client.name}`);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: move === 'archive' ? 'ARCHIVED' : 'NEW' }),
      });
      const data = await res.json().catch(() => ({}));
      refresh();
      if (res.ok) {
        status.done({
          variant: 'success',
          message: `${client.name} ${move === 'archive' ? 'archived' : 'restored as New'}.`,
        });
      } else {
        status.clear();
        alert(data?.error ?? 'The client could not be changed. Please try again.');
      }
    } catch (error) {
      console.error(error);
      status.clear();
      alert('Could not reach the server. Check your connection and try again.');
    }
  };

  return { sendInvite, resetTwoFactor, moveClient };
}
