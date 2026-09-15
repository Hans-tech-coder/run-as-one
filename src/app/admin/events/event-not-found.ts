/**
 * What a single-event screen says when the event in its URL is missing, or is
 * not one this person may open.
 *
 * The two are worded the same on purpose (PROJECT_GUIDE §7): a screen that
 * answered "not yours" differently from "not there" could be used to probe
 * which ids exist. One constant for the registrants and results screens, so a
 * later edit to one cannot give that difference back.
 */
export const EVENT_NOT_FOUND = {
  title: 'Event Not Found',
  heading: 'Event not found.',
  body: 'The link may be an old one, or the event may have been deleted. Your other events are where you left them.',
  homeHref: '/admin/events',
  homeLabel: 'Back to Events',
};
