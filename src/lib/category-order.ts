/**
 * The order an event's categories are listed in, everywhere.
 *
 * A category's place is decided once, when it is created — the order the
 * organizer entered them in the form — and never moves after that. Editing the
 * event does not reorder anything; an option added later joins the end.
 *
 * This exists because nothing used to order them at all. A query with no
 * ORDER BY returns rows in Postgres's physical order, and an UPDATE writes the
 * new row version at the end of the table, so every save of the edit form sent
 * the options it touched to the bottom: an event's first category came back
 * fourth. Every read of an event's categories that a person sees — the edit
 * form, the event page, the wizard, the winners board, the promotion form —
 * passes this, so two screens cannot list the same race differently.
 *
 * `id` breaks ties. Rows created before `sortOrder` existed were backfilled
 * from it, and cuids sort in creation order, so a tie still lands the right way.
 */
import type { Prisma } from '@prisma/client';

export const CATEGORY_ORDER = [
  { sortOrder: 'asc' },
  { id: 'asc' },
] satisfies Prisma.CategoryOrderByWithRelationInput[];
