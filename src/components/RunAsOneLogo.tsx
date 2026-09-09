import React from 'react';
import { SITE_NAME } from '@/lib/site-contact';
import { MARK_ARCS, MARK_DOT, MARK_VIEWBOX, type MarkInk } from '@/lib/brand-mark';

/**
 * The RunAsOne brand lockup.
 *
 * Two halves that are deliberately made of different material:
 *
 * - **The mark is SVG geometry.** Three concentric arcs sharing one centre —
 *   ink, then blue, then orange, each shorter than the one outside it — with a
 *   solid orange dot carrying on past the end of the outer arc. It reads as a
 *   track curve with the pack tucked inside it and one runner already clear.
 *   The arcs are flat colour, not the site's orange->blue gradient: this logo
 *   has to survive a race bib, a shirt and a tarpaulin, and a ramp is the first
 *   thing a printer loses.
 * - **The wordmark is real HTML text**, not `<text>` inside the SVG. SVG text
 *   is laid out with whatever font actually resolved, so its width — and with
 *   it the cropping of a fixed `viewBox` — changes between the fallback face
 *   and the real one. Live text sidesteps that entirely, scales crisply, gets
 *   the accessible name right for free, and is what a screen reader announces
 *   when the lockup sits inside a link.
 *
 * **Colour comes from four CSS variables** (`--logo-ink`, `--logo-mid`,
 * `--logo-accent`, `--logo-muted`, defined in `globals.css`) rather than from
 * hex literals in here, so the same component serves the dark app today and a
 * light theme the day the switch lands — and so a logo dropped on an unusual
 * surface can be re-tinted by setting `--logo-ink` on its container.
 *
 * **Size is one number.** `--rao-logo-size` is the height of the mark; the
 * wordmark, the tagline and every gap are `em` off it, so the lockup keeps its
 * proportions at any size. Set it per call site, responsively if needed:
 * `className="[--rao-logo-size:34px] sm:[--rao-logo-size:40px]"`.
 */

type LogoVariant = 'full' | 'stacked' | 'mark';

interface RunAsOneLogoProps {
  /** `full` = mark beside the wordmark, `stacked` = mark above it, `mark` = the arcs alone. */
  variant?: LogoVariant;
  className?: string;
  /** Accessible name for the `mark` variant. The other two are named by their own text. */
  title?: string;
  /** Set when the parent link or heading already carries the name, so it is not announced twice. */
  decorative?: boolean;
}

/**
 * The arcs, drawn from the shared geometry in `lib/brand-mark` so the browser
 * tab and this component can never disagree about the shape. Colour is the one
 * thing that stays here: on the page the mark draws in the `--logo-*` variables
 * and follows the theme, which a standalone favicon document cannot do.
 */
const inkVar = (ink: MarkInk) => `var(--logo-${ink}, currentColor)`;

function Mark() {
  return (
    <g fill="none" strokeLinecap="round">
      {MARK_ARCS.map((arc) => (
        <path key={arc.d} d={arc.d} stroke={inkVar(arc.ink)} strokeWidth={arc.width} />
      ))}
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={inkVar(MARK_DOT.ink)} />
    </g>
  );
}

export function RunAsOneLogo({
  variant = 'full',
  className,
  title = SITE_NAME,
  decorative = false,
}: RunAsOneLogoProps) {
  const markOnly = variant === 'mark';

  // In the lockups the wordmark is the accessible name, so the drawing beside it
  // is decoration and must stay silent; alone, it is the name.
  const markA11y =
    markOnly && !decorative
      ? { role: 'img' as const, 'aria-label': title }
      : { 'aria-hidden': true as const };

  const mark = (
    <svg
      viewBox={MARK_VIEWBOX}
      className="rao-logo__mark"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...markA11y}
    >
      <Mark />
    </svg>
  );

  if (markOnly) {
    return (
      <span className={`rao-logo rao-logo--mark${className ? ` ${className}` : ''}`}>
        {mark}
      </span>
    );
  }

  return (
    <span
      className={`rao-logo rao-logo--${variant}${className ? ` ${className}` : ''}`}
      aria-hidden={decorative || undefined}
    >
      {mark}
      <span className="rao-logo__words">
        {/* Written in mixed case and uppercased in CSS: a screen reader reading
            the DOM text says the brand rather than spelling out four capitals. */}
        <span className="rao-logo__word">Run as One</span>
        <span className="rao-logo__byline">by CRC</span>
      </span>
    </span>
  );
}

export default RunAsOneLogo;
