/**
 * Where a table row's portalled action menu opens.
 *
 * Every row menu in the admin (events, team, and in their own batches the
 * registrants and marketing menus) is portalled to `<body>` and fixed to its
 * trigger, because a menu inside a table cell is clipped by the table. They
 * used to place themselves at `rect.right - 210, rect.bottom + 8` and stop
 * there. That was fine on a desktop, where a trigger never sits near an edge,
 * and wrong on a phone: a card's trigger near the left of a 360px screen threw
 * the menu off that edge, and one at the foot of the screen opened below it,
 * out of reach.
 *
 * So the menu is clamped inside the viewport's sides and, when it will not fit
 * under its trigger but does fit above, flips above it. The flip also hands
 * back the transform origin, so the dropdown still grows out of its trigger
 * rather than toward it. The menu's height is measured, not assumed, because
 * each menu's items depend on the row (a finished race has no Pause item).
 */

/** `.action-dropdown-menu`'s width in Admin.css. Change one, change the other. */
export const ROW_MENU_WIDTH = 210;

/** Space between the trigger and the menu. */
const GAP = 8;

/** The closest a menu may come to the edge of the screen. */
const EDGE = 8;

export type RowMenuPlacement = {
  top: number;
  left: number;
  /** For `.t-dropdown[data-origin]`, so the open animation grows from the trigger. */
  origin: 'top-right' | 'bottom-right';
};

/**
 * @param trigger    the trigger button's `getBoundingClientRect()`
 * @param menuHeight the menu's `offsetHeight`, or 0 before it has rendered
 */
export function placeRowMenu(trigger: DOMRect, menuHeight: number): RowMenuPlacement {
  // clientWidth rather than innerWidth: a desktop scrollbar is not room.
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;

  const left = Math.max(
    EDGE,
    Math.min(trigger.right - ROW_MENU_WIDTH, viewportWidth - ROW_MENU_WIDTH - EDGE),
  );

  const below = trigger.bottom + GAP;
  const above = trigger.top - GAP - menuHeight;

  // Only flip when above actually fits. A menu that fits neither way stays
  // below, where scrolling the page brings the rest of it into view.
  if (below + menuHeight > viewportHeight - EDGE && above >= EDGE) {
    return { top: above, left, origin: 'bottom-right' };
  }
  return { top: below, left, origin: 'top-right' };
}
