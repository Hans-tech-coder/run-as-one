# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Start here: PROJECT_GUIDE.md

`PROJECT_GUIDE.md` at the repository root is the index to this app's briefing —
what it is, the stack and its hard constraints, the directory map, and the
standing preferences this project is held to. **Read it before your first edit in
a session**, so you are not re-deriving decisions the codebase already made.

It is short on purpose. The detailed parts — the data model, the domain rules in
`src/lib`, the routes, the security model, the conventions, the current state —
live in `docs/` and are listed in §0 of the guide. **Read only the part your task
touches.**

# Work from the map, not from a sweep

This repository is ~64,000 lines across ~300 files. Reading broadly to "get
oriented" is the most expensive possible way to start, and it is never necessary:

1. **`docs/FEATURE-MAP.md` names the files behind every route, API and module.**
   Grep it for the feature; go straight to the two or three files it names. Do not
   rediscover the layout with sweeps of Glob and Grep.
2. **Read ranges, not whole files.** Use `grep -n` to find the line, then
   `sed -n 'start,endp'` to read around it. `docs/FEATURE-MAP.md` ends with the
   files over 400 lines — inside one of those, a careless full read costs tens of
   thousands of tokens.
3. **Split before you edit.** When a task lands inside a file on that
   split-candidates list, break it up along its seams first, then make the change.
   The list is the backlog; it shrinks as features get touched.
4. **One feature per session.** A long session re-sends its whole history every
   turn, so finishing a batch and starting fresh is cheaper than continuing.

# Which skill for which task

The active skills live flat in `.claude/skills/` (Claude Code) and
`.agents/skills/` (other agents). Pick from this table instead of browsing the
list; one or two skills per task is the norm.

| Task | Skill |
|---|---|
| Bug fix or small behavior change | `surgical-patch`; `investigate-first` when the cause is unknown |
| New feature | `lean-build`; plus `ui-ux-pro-max` (and `transitions-dev` if it animates) for UI |
| Refactor or splitting a large file | `safe-refactor` |
| Prisma queries | `prisma-client-api` |
| Prisma CLI / schema migration | `prisma-cli`, `migration` |
| Checking finished work | `verify-and-stop`; `caveman-review` for a diff review |
| Stress-testing a plan | `grilling` |
| Ending a session mid-work | `/handoff` |
| Merge conflict (dev → main) | `resolving-merge-conflicts` |
| Security audit | built-in `/security-review`; the Strix skills only on request, **never against the production URL** |
| Saving tokens | `caveman*`, `cavecrew` |

Skills that do not fit this stack or duplicate the ones above are parked in
`.agents/skills-archive/` and `.claude/skills-archive/`, which no agent reads.
Move one back into the active folder only when a task needs it.

# Keep the guide accurate

Any change that adds or alters a feature, a model or column, a page or API route,
a shared module, or a project convention must update the right part of the guide
**in the same change**. The guide's closing section lists which file to touch for
which kind of change. A guide that has drifted is worse than none, because the
next session will trust it.

After adding a route, a page, or a module in `src/lib`, regenerate the map:

```bash
npm run map
```

A new module in `src/lib` should carry a header comment saying **the rule it
owns** — the map reads that comment, so a documented module costs the next
session nothing to understand.
