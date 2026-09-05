<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Start here: PROJECT_GUIDE.md

`PROJECT_GUIDE.md` at the repository root is the briefing on this app — what it
is, its data model, its routes, the domain rules that live in `src/lib`, the
security model, and the standing preferences this project is held to. **Read it
before your first edit in a session**, so you are not re-deriving decisions the
codebase already made.

**Keep it accurate.** Any change that adds or alters a feature, a model or
column, a page or API route, a shared module, or a project convention must update
`PROJECT_GUIDE.md` in the same change. Its closing section lists which part to
touch for which kind of change. A guide that has drifted is worse than none,
because the next session will trust it.
