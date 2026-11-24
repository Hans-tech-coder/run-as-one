---
name: handoff
description: Compact the current conversation into a handoff document in docs/plans/ so either Claude Code or Antigravity can pick up seamlessly in the next session.
argument-hint: "What will the next session be used for?"
---

Write a concise handoff document summarising the current conversation so a fresh session — in **either Claude Code or Antigravity** — can continue without re-reading the codebase.

## Where to save

- **Inside `run-as-one`:** Save to `docs/plans/HANDOFF.md` (or update the active `docs/plans/<NAME>_PLAN.md` if the work already belongs to a named plan). `docs/plans/` is gitignored and lives in the main checkout, so both Claude Code and Antigravity can find it immediately.
- **Outside a repo with `docs/plans/`:** Save to `C:\Users\user\Web Projects\Claude Scratch\` — never to an ephemeral OS temp folder (`AppData\Local\Temp`) or agent-private scratchpad.

## What to include

1. **Goal & current state:** What is done (verified vs unverified) and what sits uncommitted in `git status`.
2. **Next steps:** Ordered, concrete actions for the next session (tailored to the user's arguments if provided).
3. **Key decisions & constraints:** Numbered decisions made in this session so they are not re-litigated.
4. **Suggested skills:** Project/global skills from `.agents/skills/` or `~/.agents/skills/` the next session should load.

Do not duplicate content already captured in specs, plans, commits, or diffs — cite them by relative path (`file:line`) instead. Redact any secrets, tokens, passwords, or PII.
