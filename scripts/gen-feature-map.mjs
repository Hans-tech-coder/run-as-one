/**
 * Generates docs/FEATURE-MAP.md — the "which files does this feature live in"
 * index the project guide points at.
 *
 * Why this is generated and not written by hand: a hand-kept map drifts the
 * moment a route is added, and a drifted map is worse than none because the
 * next session trusts it. This walks the tree instead, so it is always true.
 *
 * Run it after adding a route, a page, or a module in src/lib:
 *   node scripts/gen-feature-map.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const CODE = /\.(ts|tsx)$/;
const SPLIT_AT = 400;

/** Every .ts/.tsx under a directory, as forward-slashed paths from the repo root. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

const lines = (file) => readFileSync(join(ROOT, file), 'utf8').split('\n');
const loc = (file) => lines(file).length;

/** One sentence, capped, so a table cell stays a cell. */
function firstSentence(text) {
  const trimmed = text.trim();
  const stop = trimmed.search(/\.\s|\.$/);
  const sentence = stop > 0 ? trimmed.slice(0, stop + 1) : trimmed;
  return sentence.length > 150 ? sentence.slice(0, 147) + '…' : sentence;
}

/**
 * The one-liner a module declares about itself, taken from its own header.
 *
 * Only a block comment at the top of the file counts, plus a `//` run that
 * stands alone (blank line before the code). A `//` comment sitting directly on
 * top of an import is about that import, not about the module, so it is ignored
 * — otherwise the map would quote the wrong thing with total confidence.
 */
function headline(file) {
  const src = lines(file);
  const parts = [];
  let i = 0;
  while (i < src.length && !src[i].trim()) i += 1;
  const opening = (src[i] || '').trim();

  if (opening.startsWith('/*')) {
    for (; i < src.length && i < 40; i += 1) {
      const line = src[i].trim();
      const closed = line.endsWith('*/');
      const body = line
        .replace(/^\/\*\*?/, '')
        .replace(/\*\/$/, '')
        .replace(/^\*\s?/, '')
        .trim();
      if (body) parts.push(body);
      if (closed) break;
    }
  } else if (opening.startsWith('//')) {
    const run = [];
    let j = i;
    for (; j < src.length; j += 1) {
      const line = src[j].trim();
      if (!line.startsWith('//')) break;
      run.push(line.replace(/^\/\/\s?/, ''));
    }
    // A header stands on its own; a comment touching the next line describes it.
    if (!(src[j] || '').trim()) parts.push(...run);
  }

  return firstSentence(parts.join(' '));
}

/**
 * §5 of the guide already names the rule most of these modules own, in a table
 * of "| `module.ts` | the rule |" rows. A module with no header comment of its
 * own falls back to that row, so the map says something true instead of a dash.
 */
function guideRules() {
  const rules = new Map();
  let doc;
  try {
    doc = lines('docs/domain-rules.md');
  } catch {
    return rules; // The guide part is optional; the map still generates without it.
  }
  for (const line of doc) {
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (!row) continue;
    const name = row[1].split('/').pop();
    const text = row[2]
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\\\|/g, '/');
    if (!rules.has(name)) rules.set(name, firstSentence(text));
  }
  return rules;
}

/** src/app/admin/events/[id]/page.tsx → /admin/events/[id] */
function urlOf(file) {
  const seg = dirname(file)
    .replace(/^src\/app/, '')
    .split('/')
    .filter((s) => s && !(s.startsWith('(') && s.endsWith(')')));
  return '/' + seg.join('/');
}

const RULES = guideRules();
const all = walk(SRC);
const appFiles = all.filter((f) => f.startsWith('src/app/'));

// ---- Pages: every page.tsx, with the client components sitting beside it ----
const SKIP_SIBLING = ['layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx', 'route.ts'];
const pages = appFiles
  .filter((f) => basename(f) === 'page.tsx' && !f.includes('/api/'))
  .map((file) => {
    const dir = dirname(file);
    const siblings = appFiles.filter(
      (f) => dirname(f) === dir && f !== file && !SKIP_SIBLING.includes(basename(f)),
    );
    return { url: urlOf(file), file, siblings };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

// ---- API routes: every route.ts, with the HTTP verbs it exports ----
const apis = appFiles
  .filter((f) => basename(f) === 'route.ts')
  .map((file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const verbs = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].filter((v) =>
      new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b`).test(src),
    );
    return { url: urlOf(file), file, verbs };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

// ---- src/lib: the rule modules, by the headline each one declares ----
const libs = all
  .filter((f) => f.startsWith('src/lib/'))
  .map((file) => {
    const name = basename(file);
    return { name, file, headline: headline(file) || RULES.get(name) || '' };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// ---- Split candidates: the files that make a task expensive to work on ----
const big = all
  .map((file) => ({ file, loc: loc(file) }))
  .filter((f) => f.loc > SPLIT_AT)
  .sort((a, b) => b.loc - a.loc);

const esc = (s) => s.replace(/\|/g, '/');
/** Route groups put parentheses in paths, which would close a markdown link early. */
const href = (path) => `../${path}`.replace(/\(/g, '%28').replace(/\)/g, '%29');
const out = [];
const w = (s = '') => out.push(s);
const totalLoc = all.reduce((n, f) => n + loc(f), 0);

w('<!-- GENERATED by scripts/gen-feature-map.mjs — do not edit by hand.');
w('     Regenerate after adding a route, a page, or a module in src/lib:');
w('       node scripts/gen-feature-map.mjs -->');
w();
w('# Feature map');
w();
w('Which files a feature lives in, so a task can open two or three files instead');
w('of searching for them. Generated from the tree, so it cannot drift.');
w();
w('**Grep this file, do not read it whole** — one feature is a handful of rows:');
w();
w('```bash');
w('grep -n "promo" docs/FEATURE-MAP.md');
w('```');
w();
w(
  `${pages.length} pages · ${apis.length} API routes · ${libs.length} modules in \`src/lib\` · ` +
    `${all.length} files · ${totalLoc.toLocaleString('en-US')} lines`,
);
w();
w('---');
w();
w('## Pages');
w();
w('The route, the server component behind it, and the client components beside it.');
w();
w('| Route | Page | Beside it |');
w('| --- | --- | --- |');
for (const p of pages) {
  const beside = p.siblings.length ? p.siblings.map((f) => `\`${basename(f)}\``).join(' ') : '—';
  w(`| \`${esc(p.url)}\` | [\`${p.file.replace('src/app', '')}\`](${href(p.file)}) | ${esc(beside)} |`);
}
w();
w('---');
w();
w('## API routes');
w();
w('| Route | Verbs | File |');
w('| --- | --- | --- |');
for (const a of apis) {
  w(
    `| \`${esc(a.url)}\` | ${a.verbs.join(' ') || '—'} | ` +
      `[\`${a.file.replace('src/app/api', '')}\`](${href(a.file)}) |`,
  );
}
w();
w('---');
w();
w('## `src/lib` — the shared rules');
w();
w('The rule each module owns, from its own header comment where it has one and');
w('from §5 otherwise. The long-form reasoning is in');
w('[`domain-rules.md`](domain-rules.md); the authority when the two disagree is');
w('the file itself.');
w();
w('| Module | What it owns |');
w('| --- | --- |');
for (const l of libs) w(`| [\`${l.name}\`](${href(l.file)}) | ${esc(l.headline) || '—'} |`);
w();
w('---');
w();
w('## Split candidates');
w();
w(`Files over ${SPLIT_AT} lines. Any edit inside one of these costs a full read, so`);
w('when a task touches one, split it before editing rather than after.');
w();
w('| Lines | File |');
w('| --- | --- |');
for (const b of big) w(`| ${b.loc} | [\`${b.file}\`](${href(b.file)}) |`);
w();

writeFileSync(join(ROOT, 'docs', 'FEATURE-MAP.md'), out.join('\n'));
console.log(
  `docs/FEATURE-MAP.md — ${pages.length} pages, ${apis.length} API routes, ` +
    `${libs.length} lib modules, ${big.length} split candidates`,
);
