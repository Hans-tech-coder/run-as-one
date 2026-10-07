import React from 'react';
import { CONTENT_AREA_PRESETS } from '@/lib/certificate-settings';
import { SITE_NAME } from '@/lib/site-contact';

/**
 * The template's zones on an A4 landscape page (842 × 595, the certificate's
 * own points), the guide's centrepiece.
 *
 * The content area's band is drawn from `CONTENT_AREA_PRESETS`, the same
 * numbers the E-Certificate Settings presets apply, so the picture cannot
 * promise a clear space the app does not use. The ghost of the printed block
 * inside it is illustration only.
 *
 * Colours are classes in certificate-guide.css reading the dashboard's tokens,
 * so the drawing follows the Dark Mode switch and turns light in the print
 * copy along with everything else.
 */

const PAGE_H = 595;
const y = (pct: number) => Math.round((pct / 100) * PAGE_H);

export default function GuideDiagram({ idPrefix }: { idPrefix: string }) {
  const [sponsors, clean] = CONTENT_AREA_PRESETS;
  const contentTop = y(sponsors.top);
  const contentBottom = y(sponsors.bottom);
  const titleId = `${idPrefix}guide-diagram-title`;
  const descId = `${idPrefix}guide-diagram-desc`;

  return (
    <div className="cert-guide-diagram-scroll">
      <svg
        className="cert-guide-diagram"
        viewBox="0 0 842 595"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Template layout on an A4 landscape page</title>
        <desc id={descId}>
          {`Branding across the top quarter, a clear content area from about ${sponsors.top} to ${sponsors.bottom} percent of the height, an optional sponsor band below it, and a small byline spot just inside the bottom safe margin.`}
        </desc>

        <rect className="cg-paper" x="0" y="0" width="842" height="595" rx="6" />

        {/* The 5% safe margin. */}
        <rect className="cg-margin" x="42" y="30" width="758" height="535" />
        <text className="cg-faint-text" x="50" y="22" fontSize="11">5% safe margin: keep important artwork inside</text>

        {/* Branding, from the margin down to the content area. */}
        <rect className="cg-brand" x="42" y="30" width="758" height={contentTop - 36} />
        <text className="cg-ink" x="421" y="80" textAnchor="middle" fontSize="19" fontWeight="600">Your branding</text>
        <text className="cg-ink cg-soft" x="421" y="104" textAnchor="middle" fontSize="13">
          Event logo, organizer logo, event name artwork
        </text>

        {/* The content area. */}
        <rect
          className="cg-content"
          x="74"
          y={contentTop}
          width="694"
          height={contentBottom - contentTop}
          rx="8"
        />
        <text className="cg-content-label" x="90" y={contentTop + 22} fontSize="12" fontWeight="600" letterSpacing="1.5">
          {`CONTENT AREA · KEEP CLEAR · ABOUT ${sponsors.top}% TO ${sponsors.bottom}% (${clean.top}% TO ${clean.bottom}% WITHOUT SPONSORS)`}
        </text>

        {/* A ghost of what is printed there. */}
        <g className="cg-ghost">
          <text className="cg-ink" x="421" y="214" textAnchor="middle" fontSize="30" fontWeight="700" letterSpacing="7">CERTIFICATE</text>
          <text className="cg-accent" x="421" y="232" textAnchor="middle" fontSize="8.5" fontWeight="700" letterSpacing="4">OF COMPLETION</text>
          <text className="cg-ink" x="421" y="262" textAnchor="middle" fontSize="7" letterSpacing="2.5">THIS CERTIFIES THAT</text>
          <text className="cg-ink" x="421" y="294" textAnchor="middle" fontSize="26" fontWeight="700" letterSpacing="1">JUAN DELA CRUZ</text>
          <rect className="cg-ink" x="271" y="303" width="300" height="0.8" />
          <text className="cg-ink" x="421" y="322" textAnchor="middle" fontSize="7" letterSpacing="2.5">
            HAS SUCCESSFULLY FINISHED · YOUR EVENT
          </text>
        </g>
        <g fontSize="8" fontWeight="700" textAnchor="middle" letterSpacing="1.5">
          <rect className="cg-tile-accent" x="246" y="343" width="108" height="50" rx="8" />
          <text className="cg-accent" x="300" y="362">FINISH TIME</text>
          <text className="cg-accent" x="300" y="382" fontSize="15" letterSpacing="0">1:52:47</text>
          <rect className="cg-tile" x="367" y="343" width="108" height="50" rx="8" />
          <text className="cg-ink cg-soft" x="421" y="362">CATEGORY</text>
          <text className="cg-ink cg-soft" x="421" y="382" fontSize="15" letterSpacing="0">21K</text>
          <rect className="cg-tile" x="488" y="343" width="108" height="50" rx="8" />
          <text className="cg-ink cg-soft" x="542" y="362">BIB</text>
          <text className="cg-ink cg-soft" x="542" y="382" fontSize="15" letterSpacing="0">1042</text>
        </g>

        {/* Sponsors, optional, under the content area. */}
        <rect className="cg-sponsor" x="42" y={contentBottom + 2} width="758" height="88" />
        <g className="cg-logos">
          <rect x="120" y={contentBottom + 18} width="70" height="28" rx="4" />
          <rect x="206" y={contentBottom + 18} width="56" height="28" rx="14" />
          <rect x="278" y={contentBottom + 18} width="84" height="28" rx="4" />
          <rect x="378" y={contentBottom + 18} width="60" height="28" rx="14" />
          <rect x="454" y={contentBottom + 18} width="78" height="28" rx="4" />
          <rect x="548" y={contentBottom + 18} width="56" height="28" rx="14" />
          <rect x="620" y={contentBottom + 18} width="88" height="28" rx="4" />
        </g>
        <text className="cg-ink cg-soft" x="421" y={contentBottom + 72} textAnchor="middle" fontSize="13">
          Optional: sponsors and partners, or leave it clean
        </text>

        {/* The byline: centre, or either corner. */}
        <g fontSize="8.5" letterSpacing="1.4">
          <rect className="cg-byline" x="315" y="534" width="212" height="22" rx="4" />
          <text className="cg-ink cg-soft" x="421" y="549" textAnchor="middle">{`E-CERTIFICATE BY ${SITE_NAME.toUpperCase()}`}</text>
          <rect className="cg-byline-alt" x="50" y="534" width="150" height="22" rx="4" />
          <text className="cg-ink cg-faint" x="125" y="549" textAnchor="middle">or here</text>
          <rect className="cg-byline-alt" x="642" y="534" width="150" height="22" rx="4" />
          <text className="cg-ink cg-faint" x="717" y="549" textAnchor="middle">or here</text>
        </g>
      </svg>
    </div>
  );
}
