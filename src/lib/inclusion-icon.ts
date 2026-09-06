/**
 * Which icon stands for a line of "What's Included".
 *
 * Inclusions are free text — the organizer types "Finisher Shirt" or "Race Bib"
 * on their own — so there is nothing structured to switch on. Drawing the same
 * check beside every line was the honest answer to that, but it also meant the
 * list said nothing at a glance: a runner scanning five identical ticks has to
 * read all five to learn what they get.
 *
 * So the keyword decides, and it decides here rather than in the component.
 * Both the event page and anything that lists inclusions later have to agree —
 * an inclusion that draws a shirt on one screen and a medal on another is worse
 * than the row of checks it replaced.
 *
 * Unrecognised text keeps the check. A wrong icon misinforms; a plain check
 * only fails to inform, which is where we started.
 */

import {
  Backpack,
  Badge,
  Camera,
  Check,
  Gift,
  GlassWater,
  Medal,
  Shirt,
  Ticket,
  Timer,
  Utensils,
  Watch,
  createLucideIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * The two icons lucide does not carry, drawn on its own 24-unit grid through
 * its own factory so they take the same stroke, size and props as every other
 * icon in the app — a hand-rolled <svg> would drift the moment an icon size
 * changes anywhere else.
 */

/** A chequered flag: the race symbol a plain pennant does not carry. */
const RaceFlag = createLucideIcon('RaceFlag', [
  ['path', { d: 'M5 22V4', key: 'pole' }],
  ['path', { d: 'M5 4h15v11H5z', key: 'cloth' }],
  ['path', { d: 'M5 4h7.5v5.5H5z', fill: 'currentColor', stroke: 'none', key: 'sq1' }],
  ['path', { d: 'M12.5 9.5H20V15h-7.5z', fill: 'currentColor', stroke: 'none', key: 'sq2' }],
]);

/** A bandana: the tie across the top, the folded cloth hanging from it. */
const Bandana = createLucideIcon('Bandana', [
  ['path', { d: 'M3 8c4-4 14-4 18 0', key: 'tie' }],
  ['path', { d: 'M5.5 7.5 12 20l6.5-12.5', key: 'cloth' }],
]);

/**
 * Ordered, and the order is the tie-breaker: the first rule that matches wins.
 *
 * The order is what settles the lines that name two things at once. "Race Bib
 * with Timing Chip" is a bib, so the flag beats the stopwatch; "Sponsor
 * Lootbag" is a bag and nothing more specific, which is why the bag sits last —
 * "race kit" is the umbrella an organizer writes when the singlet, the bib and
 * the bag all come together.
 *
 * The vocabulary itself is the organizer's, not ours: the ticket belongs to the
 * raffle rather than the bib, a band on the wrist is a tracker rather than a
 * scarf, and anything phrased as an entitlement is a gift.
 */
const RULES: readonly { icon: LucideIcon; keywords: readonly string[] }[] = [
  { icon: Shirt, keywords: ['singlet', 'shirt', 'jersey', 'tee', 'dri-fit', 'drifit'] },
  { icon: Medal, keywords: ['medal', 'medallion'] },
  { icon: RaceFlag, keywords: ['bib', 'race number', 'race no'] },
  { icon: Bandana, keywords: ['bandana', 'bandanna', 'scarf', 'buff', 'neckerchief'] },
  { icon: Watch, keywords: ['wristband', 'band', 'headband', 'armband', 'tracker'] },
  { icon: Badge, keywords: ['pin', 'badge', 'patch'] },
  { icon: Timer, keywords: ['timing', 'chip', 'timer'] },
  { icon: GlassWater, keywords: ['hydration', 'water', 'drink', 'refreshment', 'flask', 'tumbler'] },
  { icon: Utensils, keywords: ['meal', 'food', 'snack', 'breakfast', 'lunch', 'dinner'] },
  { icon: Ticket, keywords: ['raffle', 'ticket'] },
  { icon: Gift, keywords: ['entitlement', 'gift', 'giveaway', 'freebie', 'souvenir'] },
  { icon: Camera, keywords: ['photo', 'photobooth', 'photography'] },
  { icon: Backpack, keywords: ['kit', 'bag', 'lootbag', 'backpack', 'pouch', 'sling', 'tote'] },
];

/**
 * Whole words only, plus an optional plural.
 *
 * Substring matching would turn "canteen" into a shirt and "chipotle" into a
 * stopwatch, and a wrong icon is the one outcome this is meant to avoid. It is
 * also what keeps "bandana" out of the wristband rule. The trailing "s" is
 * allowed for free because organizers write both "Finisher Medal" and "Race
 * Photos" and neither should fall through to the check.
 */
const MATCHERS: readonly { icon: LucideIcon; pattern: RegExp }[] = RULES.map(
  rule => ({
    icon: rule.icon,
    pattern: new RegExp(
      `(^|[^a-z0-9])(${rule.keywords.join('|')})s?([^a-z0-9]|$)`,
      'i'
    ),
  })
);

/** The icon for one inclusion, or a plain check when nothing is recognised. */
export function inclusionIcon(item: string): LucideIcon {
  const text = (item ?? '').toLowerCase();
  return MATCHERS.find(m => m.pattern.test(text))?.icon ?? Check;
}
