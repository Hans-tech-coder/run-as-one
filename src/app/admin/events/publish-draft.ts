import { eventInstant, eventInstantParts, formatEventInstant } from '@/lib/event-schedule';
import { publishState } from '@/lib/event-visibility';
import { DEFAULT_OPENING_TIME, type OpeningDraft } from './registration-opening';

/**
 * When an event goes public, as the admin forms hold it (EVENT_PUBLISH_PLAN.md).
 *
 * The column is one nullable instant; the organizer picks one of three answers
 * — keep it a draft, publish now, or a date and time — so the choice is carried
 * on its own, for the same reason registration-opening.ts carries `scheduled`:
 * a chosen schedule with no date typed yet is a real state the form must name.
 */
export type PublishMode = 'DRAFT' | 'NOW' | 'SCHEDULED';

export type PublishDraft = {
  mode: PublishMode;
  /** YYYY-MM-DD in Manila. Only meaningful while SCHEDULED. */
  day: string;
  /** HH:MM in Manila. Only meaningful while SCHEDULED. */
  time: string;
};

/** Where a new event starts: nobody sees it until the organizer says so. */
export const KEEP_AS_DRAFT: PublishDraft = { mode: 'DRAFT', day: '', time: '' };

/** The draft for an event as stored, for the table's publishing modal. */
export function publishDraft(value: Date | string | null | undefined): PublishDraft {
  const state = publishState({ publishAt: value ?? null });
  if (state === 'DRAFT') return KEEP_AS_DRAFT;
  if (state === 'PUBLISHED') return { mode: 'NOW', day: '', time: '' };
  const { day, time } = eventInstantParts(value!);
  return { mode: 'SCHEDULED', day, time: time || DEFAULT_OPENING_TIME };
}

/** What the routes are sent: null, 'now', or an ISO instant built in Manila. */
export function publishValue(draft: PublishDraft): string | null {
  if (draft.mode === 'DRAFT') return null;
  if (draft.mode === 'NOW') return 'now';
  return eventInstant(draft.day, draft.time)?.toISOString() ?? null;
}

/** Why this draft cannot be saved, shown under the date field, or null. */
export function publishProblem(draft: PublishDraft): string | null {
  if (draft.mode !== 'SCHEDULED') return null;
  const at = eventInstant(draft.day, draft.time);
  if (!at) return 'Pick the date the event goes public, or publish it now.';
  if (at.getTime() <= Date.now()) return 'That time has already passed. Pick a later one, or publish it now.';
  return null;
}

/** The create form's submit label, so the button says what pressing it does. */
export function publishSubmitLabel(draft: PublishDraft): string {
  return draft.mode === 'DRAFT' ? 'Save As Draft' : draft.mode === 'NOW' ? 'Publish Event' : 'Schedule Event';
}

/**
 * When the event becomes visible, as one value the two questions below can
 * share: still a draft, already public (or public on save), or an instant.
 * Null from an unreadable schedule, which publishProblem reports instead.
 */
function visibleFrom(draft: PublishDraft): 'draft' | 'now' | Date | null {
  if (draft.mode === 'DRAFT') return 'draft';
  if (draft.mode === 'NOW') return 'now';
  return eventInstant(draft.day, draft.time);
}

/**
 * Why sign-ups cannot open at this time, or null: an opening before the event
 * is public would promise runners a date they cannot see (EVENT_PUBLISH_PLAN.md
 * D8, the same rule `publishConflict` holds on the server).
 */
export function openingBeforePublish(publish: PublishDraft, opening: OpeningDraft): string | null {
  const visible = visibleFrom(publish);
  if (!(visible instanceof Date) || !opening.scheduled) return null;
  const opens = eventInstant(opening.day, opening.time);
  if (!opens || opens.getTime() >= visible.getTime()) return null;
  return `Registration can't open before the event goes public (${formatEventInstant(visible)}). Pick a later date, or choose "When It Goes Public".`;
}

/**
 * The two answers read back as one plain sentence, so staff see what runners
 * will actually experience instead of working it out from two sets of cards.
 * `saved` is for the edit form, where the event's visibility is already a fact
 * rather than something this save will do.
 */
export function describeTimeline(publish: PublishDraft, opening: OpeningDraft, saved = false): string {
  const visible = visibleFrom(publish);
  const opens = opening.scheduled ? eventInstant(opening.day, opening.time) : null;
  // An opening already gone is open now, as the picker's own note says.
  const register = opens && opens.getTime() <= Date.now()
    ? `can register right away (sign-ups opened ${formatEventInstant(opens)})`
    : opens
    ? `can register from ${formatEventInstant(opens)}`
    : opening.scheduled
      ? 'can register from the opening date you pick'
      : 'can register right away';

  if (visible === 'draft') {
    return `Runners can't see this event yet — it stays a draft until someone publishes it. Once it is public, runners ${register}.`;
  }
  if (visible === 'now') {
    return saved
      ? `Runners can see this event now and ${register}.`
      : `Runners see this event as soon as you save and ${register}.`;
  }
  if (visible === null) return 'Pick the date the event goes public to see the full timeline.';
  return `Runners see this event on ${formatEventInstant(visible)} and ${opening.scheduled ? register : 'can register from that moment'}.`;
}
