import React from 'react';
import Link from 'next/link';
import { CalendarDays, IdCard, ListChecks } from 'lucide-react';
import prisma from '@/lib/db';
import { isClientViewer, type Actor } from '@/lib/actor';
import { formatEventDay } from '@/lib/event-schedule';
import {
  CLIENT_VIEWER_HINT,
  CLIENT_VIEWER_LABEL,
  MATRIX_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  roleCan,
} from '@/lib/permissions';
import { SITE_NAME } from '@/lib/site-contact';

/**
 * The settings page's read-only panels on what this person may do.
 *
 * It answers "why can't I see that event?" without anybody having to ask.
 * Everything on it comes from the same places the checks do — the role and
 * its sentence from `ROLE_LABELS` / `ROLE_HINTS`, the list of what an
 * organizer-wide role may do from the matrix (`roleCan`), and a staff
 * member's races from the assignments already on the actor — so it can never
 * describe access the routes would refuse.
 *
 * - **Super Admin / Admin**: every event, and the matrix's list for the role.
 * - **Staff**: each assigned race with the role held on it, linking to its
 *   registrants (every event role may see them, `registration:view`).
 * - **Client viewer**: its organization, and the one thing it may see.
 */
export default async function AccessPanels({ actor }: { actor: Actor }) {
  const clientViewer = isClientViewer(actor);

  const roleLabel = clientViewer ? CLIENT_VIEWER_LABEL : ROLE_LABELS[actor.role];
  const roleHint = clientViewer ? CLIENT_VIEWER_HINT : ROLE_HINTS[actor.role];

  const [client, events] = await Promise.all([
    clientViewer && actor.clientId
      ? prisma.client.findUnique({ where: { id: actor.clientId }, select: { name: true } })
      : null,
    actor.role === 'STAFF' && actor.assignments.size > 0
      ? prisma.event.findMany({
          where: { id: { in: [...actor.assignments.keys()] }, organizerId: actor.orgId },
          select: { id: true, title: true, date: true },
          orderBy: { date: 'asc' },
        })
      : [],
  ]);

  const orgWide = actor.role === 'OWNER' || actor.role === 'ADMIN';
  const allowed = orgWide
    ? MATRIX_PERMISSIONS.filter(permission => roleCan(actor.role as 'OWNER' | 'ADMIN', permission))
    : [];

  return (
    <>
      <section className="admin-panel" aria-labelledby="access-role-title">
        <div className="admin-panel-header">
          <h2 id="access-role-title" className="admin-panel-title flex items-center gap-2">
            <IdCard size={18} className="text-accent-blue-ink" aria-hidden="true" />
            Your Role
          </h2>
        </div>
        <div className="admin-panel-content">
          <dl className="settings-facts">
            <div>
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt>{client ? 'Organization' : 'Works for'}</dt>
              <dd>{client?.name ?? SITE_NAME}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>
                {orgWide
                  ? 'Every event'
                  : clientViewer
                    ? "Your organization's events"
                    : events.length === 1
                      ? '1 assigned event'
                      : `${events.length} assigned events`}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-secondary mt-4">{roleHint}</p>
        </div>
      </section>

      {orgWide && (
        <section className="admin-panel" aria-labelledby="access-can-title">
          <div className="admin-panel-header">
            <h2 id="access-can-title" className="admin-panel-title flex items-center gap-2">
              <ListChecks size={18} className="text-accent-orange-ink" aria-hidden="true" />
              What You Can Do
            </h2>
          </div>
          <div className="admin-panel-content">
            <ul className="settings-can-list">
              {allowed.map(permission => (
                <li key={permission}>{PERMISSION_LABELS[permission]}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {actor.role === 'STAFF' && (
        <section className="admin-panel" aria-labelledby="access-events-title">
          <div className="admin-panel-header">
            <h2 id="access-events-title" className="admin-panel-title flex items-center gap-2">
              <CalendarDays size={18} className="text-accent-orange-ink" aria-hidden="true" />
              Your Events
            </h2>
          </div>
          <div className="admin-panel-content">
            {events.length === 0 ? (
              <p className="text-sm text-secondary">
                You have no events assigned yet. An admin on your team assigns
                them from the Team page.
              </p>
            ) : (
              <ul className="settings-event-list">
                {events.map(event => {
                  const role = actor.assignments.get(event.id);
                  return (
                    <li key={event.id} className="settings-event">
                      <div className="settings-event-head">
                        <div className="min-w-0">
                          <p className="settings-event-title">{event.title}</p>
                          <p className="text-xs text-secondary">{formatEventDay(event.date)}</p>
                        </div>
                        {role && <span className="settings-role-pill">{ROLE_LABELS[role]}</span>}
                      </div>
                      {role && <p className="text-xs text-secondary">{ROLE_HINTS[role]}</p>}
                      <Link
                        href={`/admin/events/${event.id}/registrants`}
                        className="settings-inline-link text-sm self-start"
                      >
                        Open registrants
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-secondary mt-4">
              Need a different event or role? Ask an admin on your team.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
