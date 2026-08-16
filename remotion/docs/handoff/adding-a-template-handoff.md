---
name: adding-a-template-handoff
description: Briefing doc for building a new caption template lives at remotion/docs/adding-a-caption-template.md — point any new session at it first
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9f1db97d-91d4-44ee-8e50-0345b358b5dd
  modified: 2026-08-10T20:41:30.551Z
---

Before building a caption template in any session, read
`remotion/docs/adding-a-caption-template.md` (written 2026-08-10). It carries the
three-level caption/screen/line model, the DERIVED capacity formula, the file map,
verification commands, known gaps, and the parallel-work warning.

Two facts from it that bite hardest:
- **Never copy a `charsPerLine` number between templates.** Derive it:
  `fitFraction / ((fontSizePct/100) * advance)`. Copying Gadzhi's 26 into Hormozi 2
  (which renders at double the glyph height) was the whole "doesn't fit" bug.
- **Every new template edits the same four files** — `Root.tsx`, `layout.mjs`,
  `playground/styles.ts`, `fonts.ts`. Two sessions in one working directory clobber
  each other; it already happened once. Use a git worktree per template.

Also: Remotion Studio writes props back to `Root.tsx` (arrow keys on a focused
props field will nudge and save values) — always `git diff src/Root.tsx` before
committing.

See [[caption-ai-decision-seams]] for the architecture this rests on, and
[[node-tls-system-ca]] for the `NODE_OPTIONS=--use-system-ca` requirement.
