/**
 * The formatting an organizer may give "About This Event", and how it is read.
 *
 * The description stays a plain string in the same column. What the admin
 * toolbar writes into it is a small subset of Markdown — `**bold**`, `*italic*`,
 * a `## heading`, `- ` bullets and `1. ` numbered lines — because that subset
 * is also what an organizer already types by hand. A description written before
 * the toolbar existed is therefore still valid input: its paragraphs stay
 * paragraphs, and a hand-typed "1. … 2. …" becomes the list it always meant.
 *
 * This module only parses into data. Rendering it as React elements (never as
 * an HTML string) is what keeps an organizer's text from ever running as markup,
 * so there is nothing here to sanitize.
 *
 * Runs of blank lines collapse to one break: the gap between two paragraphs is
 * the page's to decide, not however many times Enter was pressed.
 */

export type RichInline = { text: string; bold?: boolean; italic?: boolean };

export type RichBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; start: number; items: string[] };

const HEADING = /^#{1,3}\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;

/** Split a description into headings, paragraphs and lists. */
export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let last: RichBlock | undefined;

  for (const raw of (source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      last = undefined;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1].trim() });
      last = undefined;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (last?.kind === 'bullets') last.items.push(bullet[1]);
      else blocks.push((last = { kind: 'bullets', items: [bullet[1]] }));
      continue;
    }

    const number = NUMBER.exec(line);
    if (number) {
      if (last?.kind === 'numbers') last.items.push(number[2]);
      else blocks.push((last = { kind: 'numbers', start: Number(number[1]), items: [number[2]] }));
      continue;
    }

    // A single Enter inside a paragraph is a line break the organizer chose —
    // "WAIVER AND RELEASE OF LIABILITY" on its own line above its first clause.
    if (last?.kind === 'paragraph') last.lines.push(line.trim());
    else blocks.push((last = { kind: 'paragraph', lines: [line.trim()] }));
  }

  return blocks;
}

const EMPHASIS = /\*\*(.+?)\*\*|\*(\S(?:[^*]*\S)?)\*/g;

/** Split one line into plain, bold and italic runs. */
export function parseInline(text: string): RichInline[] {
  const runs: RichInline[] = [];
  let at = 0;

  EMPHASIS.lastIndex = 0;
  for (let match = EMPHASIS.exec(text); match; match = EMPHASIS.exec(text)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index) });
    if (match[1] !== undefined) runs.push({ text: match[1], bold: true });
    else runs.push({ text: match[2], italic: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });

  return runs;
}
