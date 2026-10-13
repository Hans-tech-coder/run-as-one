import React from 'react';

/** One group of answers in ApplicationPanel. `list` draws a `<ul>` rather
 *  than a `<dl>`, for the Sign-ins, which are people rather than
 *  question-and-answer pairs. */
export function Section({
  title,
  list = false,
  children,
}: {
  title: string;
  list?: boolean;
  children: React.ReactNode;
}) {
  const frame = 'm-0 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 rounded-[12px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4';
  return (
    <section className="min-w-0">
      <h4 className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-secondary">
        {title}
      </h4>
      {list ? (
        <ul className={`${frame} list-none`}>{children}</ul>
      ) : (
        <dl className={frame}>{children}</dl>
      )}
    </section>
  );
}

/** One answer. An optional question left blank says so, rather than showing
 *  an empty line that reads like a rendering fault. */
export function Detail({
  label,
  value,
  full = false,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  const blank = value === null || value === undefined || value === '' || value === false;
  return (
    <div className={`min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="mb-1 text-xs text-secondary">{label}</dt>
      <dd className={`m-0 text-sm ${blank ? 'text-secondary italic' : 'text-[var(--ink-85)]'} [overflow-wrap:anywhere]`}>
        {blank ? 'Not given' : value}
      </dd>
    </div>
  );
}
