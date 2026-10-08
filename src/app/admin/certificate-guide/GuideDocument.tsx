import React from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { CONTENT_AREA_PRESETS, DEFAULT_DESIGNED_SETTINGS } from '@/lib/certificate-settings';
import { MAX_UPLOAD_MB } from '@/lib/uploads';
import { SITE_NAME } from '@/lib/site-contact';
import GuideDiagram from './GuideDiagram';
import GuideChecklist from './GuideChecklist';
import GuideToc from './GuideToc';
import { PrintHead, SavePdfAside, SavePdfPanel } from '../PrintableCopy';

/**
 * The guide's text, once for the screen and once for the printer
 * (`PrintableCopy`). `printedOn` marks the print render: it adds a title
 * block, so a forwarded PDF explains itself, and draws the checklist as plain
 * boxes to tick by hand. `idPrefix` keeps the two renders' ids apart.
 *
 * **Every claim here is something the app does**, and where a number is a
 * constant in code it is read from that constant, so the guide cannot drift
 * from the certificate:
 * - the content area: `CONTENT_AREA_PRESETS` (lib/certificate-settings.ts);
 * - the byline height: `DEFAULT_DESIGNED_SETTINGS.bylineBottom`, same file;
 * - the fields: `CertificateFields`, same file; the rank tile and the pacer
 *   edition: `rankFigure` / `pacerFigure` / `drawContentBlock`
 *   (lib/e-certificate-layout.ts); name and finish time always print;
 * - dark or light text: `inkFor` / `sampleLightness` (lib/e-certificate.ts);
 * - never stretched: `loadTemplate`, same file;
 * - the size limit: `MAX_UPLOAD_MB` (lib/uploads.ts);
 * - a long name shrinks: `fitted` (lib/e-certificate-draw.ts).
 * A change to any of those rules changes the sentence here in the same edit.
 *
 * On screen the article stands beside an aside from `xl` up: **Save as PDF**,
 * then an "On this page" list (`GuideToc`), so a wide screen gets the page's
 * one action and a way around it rather than an empty strip on the right.
 * Below `xl` the aside is not drawn and Save as PDF closes the page instead,
 * after the reader has seen what they would be sending. The button is not in
 * the header: no other dashboard screen puts an action there on a phone, and
 * the owner wanted this one to match. Paper gets the article alone.
 */

const [SPONSORS, CLEAN] = CONTENT_AREA_PRESETS;

/** The sections, in page order, as the contents list names them. */
const CONTENTS = [
  { key: 'layout', label: 'Where things go' },
  { key: 'file', label: 'File specifications' },
  { key: 'what-we-print', label: 'What we print' },
  { key: 'do-and-dont', label: "Do and don't" },
  { key: 'send', label: 'Send with your file' },
  { key: 'checklist', label: 'Checklist' },
] as const;

const CHECKLIST = [
  'A4 landscape, 3508 px wide (1754 px at the least)',
  `PNG, JPG or a one-page PDF, under ${MAX_UPLOAD_MB} MB`,
  'The middle of the page is clear and one tone',
  'No name lines, sample names or "Finish time" labels',
  'Sponsors, if any, are below the middle or along the sides',
  'One clear spot just above the bottom edge for the byline',
  'Brand hex code and the four answers above are ready',
];

export default function GuideDocument({ idPrefix, printedOn }: { idPrefix: string; printedOn?: string }) {
  const printed = printedOn !== undefined;
  const id = (name: string) => `${idPrefix}guide-${name}`;

  const article = (
    <article className="cert-guide" aria-labelledby={printed ? id('doc-title') : undefined}>
      {printed && (
        <PrintHead id={id('doc-title')} title="E-Certificate Template Guide" line={`${SITE_NAME} · ${printedOn}`} />
      )}

      <section className="cert-guide-intro">
        <span className="cert-guide-eyebrow">For race organizers and their designers</span>
        <p className="cert-guide-lede">
          You design the artwork. We print every finisher&apos;s details on it: their name, finish
          time, category and bib, laid out in the same finished style as the {SITE_NAME} certificate.
          Follow this guide and the template will look right for every runner, from a short name to
          a very long one.
        </p>
      </section>

      <Section id={id('layout')} eyebrow="The layout" title="Where things go on the page">
        <GuideDiagram idPrefix={idPrefix} />
        <ul className="cert-guide-legend">
          <li><span className="cert-guide-swatch is-brand" /><span><strong>Top quarter:</strong> your branding and event artwork.</span></li>
          <li><span className="cert-guide-swatch is-content" /><span><strong>Middle:</strong> leave it clear. We print the runner&apos;s details here.</span></li>
          <li><span className="cert-guide-swatch is-sponsor" /><span><strong>Lower part (optional):</strong> sponsor and partner logos, or leave it clean for a classic look.</span></li>
          <li><span className="cert-guide-swatch is-byline" /><span><strong>Bottom edge:</strong> one clear spot, about a quarter of the width, just inside the safe margin, for our small byline.</span></li>
        </ul>
        <p className="cert-guide-note">
          Sponsors are up to you. With a sponsor band, keep the middle clear from about{' '}
          {SPONSORS.top}% to {SPONSORS.bottom}% of the height. Without one, the clear space can run
          from about {CLEAN.top}% to {CLEAN.bottom}%, the same room the {SITE_NAME} certificate uses.
          The byline sits about {DEFAULT_DESIGNED_SETTINGS.bylineBottom}% up from the bottom edge.
          These are starting points, not rules: the content area is set to match your design before
          the certificate goes live.
        </p>
      </Section>

      <Section id={id('file')} eyebrow="The file" title="File specifications">
        <table className="cert-guide-specs">
          <tbody>
            <tr><th scope="row">Page</th><td><strong>A4 landscape</strong> (297 × 210 mm). Letter size also works and is never stretched, but A4 is preferred.</td></tr>
            <tr><th scope="row">Size</th><td><strong className="font-mono">3508 × 2480 px</strong> at 300 dpi. For a sharp result, don&apos;t go below <span className="font-mono">1754 × 1240 px</span>.</td></tr>
            <tr><th scope="row">Format</th><td><strong>PNG or JPG</strong>, or a <strong>PDF</strong> exported from Illustrator, Canva or similar. Send one page only.</td></tr>
            <tr><th scope="row">File size</th><td>Up to <strong>{MAX_UPLOAD_MB} MB</strong>. A high-quality JPG of a full A4 design is usually 1 to 3 MB.</td></tr>
            <tr><th scope="row">Color</th><td>RGB. Runners mostly view and share the certificate on screen.</td></tr>
            <tr><th scope="row">Text in your art</th><td>Convert fonts to outlines or flatten them, so your titles look the same on every device.</td></tr>
          </tbody>
        </table>
      </Section>

      <Section id={id('what-we-print')} eyebrow="What we add" title="What we print for each runner">
        <p className="cert-guide-note">
          These are drawn automatically for every finisher. Don&apos;t put any of them in your template.
        </p>
        <ul className="cert-guide-fields">
          <Field always>Runner&apos;s name</Field>
          <Field always>Finish time</Field>
          <Field>&ldquo;Certificate of Completion&rdquo;</Field>
          <Field>Event name</Field>
          <Field>Event date and venue</Field>
          <Field>Category (e.g. 21K)</Field>
          <Field>Bib number</Field>
          <Field>Rank: division, with overall under it</Field>
        </ul>
        <p className="cert-guide-note">
          Text color adjusts to your design: dark text on a light background, white text on a dark
          one. The finish time and accents use your brand color. A long name shrinks to fit instead
          of running off the page.
        </p>
        <p className="cert-guide-note">
          <strong>Pacers get a pacer edition.</strong> A runner who paced the race gets an
          &ldquo;Official Pacer&rdquo; mark, reads &ldquo;has successfully paced&rdquo;, and shows
          their pace group where the rank would be. It uses the same template, so there is nothing
          extra to design.
        </p>
      </Section>

      <Section id={id('do-and-dont')} eyebrow="Design rules" title="Do and don't">
        <div className="cert-guide-dodont">
          <div className="cert-guide-col is-do">
            <h3><CircleCheck size={18} aria-hidden="true" /> Do</h3>
            <ul>
              <li>Keep the middle of the page plain or with a very soft pattern.</li>
              <li>Keep that middle area one tone: all light or all dark.</li>
              <li>If you have sponsors, put their logos below the middle or along the sides. A clean design with none works just as well.</li>
              <li>Keep logos and important text 5% in from every edge.</li>
              <li>Leave one clear spot just above the bottom edge for our byline.</li>
            </ul>
          </div>
          <div className="cert-guide-col is-dont">
            <h3><CircleX size={18} aria-hidden="true" /> Don&apos;t</h3>
            <ul>
              <li>Add &ldquo;Name: ______&rdquo;, blank lines or sample names.</li>
              <li>Print &ldquo;Finish time&rdquo;, &ldquo;Category&rdquo; or &ldquo;Bib&rdquo; labels. We add them with the values.</li>
              <li>Run a strong gradient or photo through the middle, half light and half dark.</li>
              <li>Place logos or a watermark behind the content area.</li>
              <li>Send a portrait page or a multi-page PDF.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id={id('send')} eyebrow="Your reply" title="Send these with your file">
        <ol className="cert-guide-send">
          <li><span><strong>Your brand color as a hex code</strong>, for example <span className="font-mono">#C2410C</span>. It is used for the finish time and the accents.</span></li>
          <li><span><strong>Whether your artwork already says &ldquo;Certificate of Completion&rdquo; or the event name</strong>, so we don&apos;t print them twice.</span></li>
          <li><span><strong>Which optional details to show</strong>: category, bib, rank, event date and venue.</span></li>
          <li><span><strong>Where the byline goes</strong>: bottom center, bottom left or bottom right, wherever your design is clear.</span></li>
        </ol>
      </Section>

      <Section id={id('checklist')} eyebrow="Before you send" title="Checklist">
        {printed ? (
          <ul className="cert-guide-checklist">
            {CHECKLIST.map(item => (
              <li key={item} className="cert-guide-check">
                <span className="cert-guide-box" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <GuideChecklist items={CHECKLIST} />
        )}
      </Section>

      <p className="cert-guide-footer">
        Before your certificate goes live, it is previewed with a sample runner and with a very long
        name, so your design is checked with real details on it.
      </p>
    </article>
  );

  if (printed) return article;
  return (
    <div className="cert-guide-layout">
      {article}
      <aside className="cert-guide-aside">
        <SavePdfAside />
        <GuideToc items={CONTENTS.map(({ key, label }) => ({ id: id(key), label }))} />
      </aside>
      <SavePdfPanel id="guide-save-title" title="Sending this to a designer?" />
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="admin-panel cert-guide-section" aria-labelledby={`${id}-title`}>
      <div className="admin-panel-header">
        <div>
          <span className="cert-guide-eyebrow">{eyebrow}</span>
          <h2 id={`${id}-title`} className="admin-panel-title">{title}</h2>
        </div>
      </div>
      <div className="admin-panel-content cert-guide-body">{children}</div>
    </section>
  );
}

function Field({ always = false, children }: { always?: boolean; children: React.ReactNode }) {
  return (
    <li className="cert-guide-field">
      <span>{children}</span>
      <span className={`cert-guide-tag ${always ? 'is-always' : 'is-optional'}`}>
        {always ? 'Always' : 'Optional'}
      </span>
    </li>
  );
}
