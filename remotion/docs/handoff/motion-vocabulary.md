---
name: motion-vocabulary
description: "Agreed names for caption text animations (fade/pop/slide/wipe/track/zoom continuous) live in remotion/docs/motion-vocabulary.md — use them, don't invent"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1040704f-d917-47da-bca5-19db927e3cc3
  modified: 2026-09-06T00:15:33.486Z
---

`remotion/docs/motion-vocabulary.md` is the agreed naming for caption motion,
written 2026-08-19 after "pop out" and "fade out as a sentence" turned out to
mean different things to the user and the assistant.

Every animation is named `<unit> <property> <phase>` — e.g. "per-word fade in",
"whole-caption fade out". **Say all three**; "fade in" alone is ambiguous.

- phase: `in`/`entrance`, `out`/`exit`. Never "entrance out".
- property: fade = opacity, pop = scale, slide = position, wipe = a mask edge,
  blur, highlight = colour, track = letter-spacing, wiggle/jitter = random
  oscillation.
- unit: per-letter / per-word / per-line / per-caption.

**"Zoom continuous"** is the user's own name (chosen 2026-09-06) for a
per-caption scale that grows at a fixed rate and NEVER settles — still growing
when the next sentence takes over. Distinct from a `pop in`, which scales to 1
and stops. This is the motion the user picked out of a four-way comparison.

Track and zoom both read as "inside to outside" by eye; tell them apart by
measuring one glyph's cap height — a zoom grows it, tracking cannot. See
[[measuring-captions-from-footage]].

If a look does not fit an existing name, add a row to that doc rather than
inventing a word in one file. And see [[dont-overwrite-agreed-decisions]] before
letting a new definition replace an agreed one.
