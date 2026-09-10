---
name: dont-overwrite-agreed-decisions
description: Never let new work silently replace a decision already agreed on another template or in another chat — ask first and show both side by side
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1040704f-d917-47da-bca5-19db927e3cc3
  modified: 2026-09-06T00:15:12.734Z
---

When something new (a text animation, a measured default, a naming) would change
or replace behaviour that was **already agreed** on another template or in
another chat, do NOT apply it. The previously agreed one stands as the right one
until the user says otherwise. Ask first, and **show the two side by side** —
rendered, not described — so the user can compare before choosing.

Stated by the user 2026-09-06, and explicitly scoped to **every chat, not just
the one it was said in.**

**Why:** work on caption templates runs across several parallel sessions on the
same repo (see [[adding-a-template-handoff]]). A new session that measures a
look afresh will happily "correct" a value another session already settled with
the user, and the user loses a decision they had already made. This has a
history here — [[speed-template-spec]] records defaults set by eye at the user's
request precisely so nobody re-measures them back.

**How to apply:** before wiring anything shared, grep for an existing slot that
already covers it (`src/CaptionedVideo/styles/*-slot.ts` is where shared
controls live). If one exists, name the difference concretely — usually the UNIT
(per word vs per caption) or whether the ramp settles — render both, and ask.
Add the new one alongside; never redefine the existing one. Terms are defined in
`remotion/docs/motion-vocabulary.md`; see [[motion-vocabulary]].
