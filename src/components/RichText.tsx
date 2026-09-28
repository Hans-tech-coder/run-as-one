import { Fragment } from 'react';
import { parseInline, parseRichText } from '@/lib/rich-text';

/**
 * An organizer's formatted text, drawn as elements rather than injected HTML.
 * The public event page and the admin editor's preview both use this, so what
 * the organizer previews is exactly what a runner reads.
 */

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((run, i) =>
        run.bold ? (
          <strong key={i} className="font-semibold text-[color:var(--rich-strong,#fff)]">{run.text}</strong>
        ) : run.italic ? (
          <em key={i}>{run.text}</em>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        )
      )}
    </>
  );
}

export default function RichText({ source, className = '' }: { source: string; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {parseRichText(source).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h3 key={i} className="pt-2 text-lg sm:text-xl font-semibold text-[color:var(--rich-strong,#fff)] tracking-tight">
                <Inline text={block.text} />
              </h3>
            );
          case 'bullets':
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-accent-blue">
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1"><Inline text={item} /></li>
                ))}
              </ul>
            );
          case 'numbers':
            return (
              <ol key={i} start={block.start} className="list-decimal space-y-1.5 pl-6 marker:text-accent-blue">
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1"><Inline text={item} /></li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i}>
                {block.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Inline text={line} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
