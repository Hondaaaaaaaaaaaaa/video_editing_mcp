# Start here

The other files in this folder hold **measurements** — fonts, geometry, file
maps. This one holds **intent**: what the user is building, what they have
already corrected, and how they want to be worked with.

Written 2026-09-10, distilled from a long back-and-forth. That conversation is
gone; this is what it produced. Read this before `adding-a-caption-template.md`.

---

## 1. What is being built

A Submagic / Captions.ai-style SaaS. Captions first, then B-roll, then autocut.
Templates are reverse-engineered from real reels so a user's video looks like
the creator they admire.

## 2. The five things the user cares about most

1. **Match the reference exactly.** Measure the pixels. Never estimate by eye,
   and never say "close enough".
2. **Never break what already works.** Every template cost real measurement
   work. A regression is worse than a missing feature.
3. **Automatic by default, adjustable by slider.** Sensible defaults so it just
   works, every value exposed so a user can make it theirs.
4. **Controls must be organised, not confusing.** A feature shows its name with
   a checkmark; its options appear only when it is switched on.
5. **Explain simply.** Short answers, plain words. Long replies get skimmed.

## 3. Corrections the user made — these cost hours, do not repeat them

- **"Slide" means the text physically travels.** Not a wipe, not a reveal. When
  they say slide, they mean it moves from A to B, and they want a distance
  slider.
- **The Hormozi 2 caption does NOT pop in from 70%.** It appears at full size
  and full opacity on frame one. An earlier "starts at 70%" reading came from a
  frame sitting inside a whole-frame transition blur, which dimmed the glyphs
  below the detection threshold so they measured narrow. The user said it
  looked wrong; they were right and the measurement was wrong.
- **A blur on the text is usually not a text effect.** Check the background. If
  the background blurs too, it is a transition in the edit, not something the
  caption template does.
- **Wiggle is slow and wide, not fast and small.** A first attempt at ±7.5px /
  1.1Hz was called "heavy" and "confused". The measured truth is ±0.48em over a
  ~4.75s period, with x and y on DIFFERENT periods so the path never repeats.
- **Captions must not cover the face.** Even when the reference does. The
  Hormozi reel puts its captions at ~54% height, squarely on the face; ours sit
  at 78%, under the chin. Faithfulness loses to legibility here.
- **Do not replace controls, add to them.** Fade in and pop in stay available on
  every template even when the reference uses neither.

## 4. Shared vocabulary — use these words

Full detail in `motion-vocabulary.md`. The short version:

An animation is named `<unit> <property> <phase>`.

- **Property is what changes**: fade (opacity), pop (scale), slide (position),
  wipe (mask), blur, highlight (colour), tracking (letter-spacing).
- **pop = scale = zoom.** Three words, one effect. Do not treat them as three.
- **Phase is when**: `in` (entrance), `out` (exit), `idle` (while it sits
  there). Wiggle and zoom-continuous are `idle` — they are not entrances, and
  nothing "wiggles in".
- **Easing is not an effect.** It is the speed shape applied to one.

## 5. Decisions already settled — do not silently reopen

| Decision | Settled as |
| --- | --- |
| Duration units | **Milliseconds, never frames.** A frame count changes meaning when the project frame rate does. See `timing.ts`. |
| Easing set | Five names the user sees (linear, smooth, overshoot, elastic, spring), each with one intensity dial. The full curve set stays internal for matching references. |
| Entrance vs exit easing | Automatic — entrances ease out, exits ease in. Users never see "ease-in vs ease-out", which reads backwards to everyone. |
| Frame rate | The user picks 30 or 60. Templates must work at both. |
| Per-caption template switching | Keyed on `ideaIndex`, stored in the caption document, hard cut between runs, font family shared across the video. **Designed, not built.** |
| Reference matching | Rebuild natively in Remotion by measurement. No .mogrt import. |

## 6. How to work here

- **Measure, then build.** Extract frames, threshold the ink, fit the numbers.
  `measuring-captions-from-footage.md` has the methods that work.
- **Baseline before you touch anything.** `node baseline.mjs <dir> <Template>`
  then `compare.mjs` after. Every differing pixel must be one you intended.
- **A new control must be a no-op at its default.** Then a clean pixel diff
  proves you broke nothing. `fadeMs` defaulting to the old entrance duration is
  the worked example.
- **Show, don't describe.** The user decides by looking. Build the thing, render
  it, put it in front of them.
- **Ask rather than assume** — but ask once, with a recommendation, not a list.

### Parallel sessions

The user runs 4-5 chats at once. Three collisions happened in one day.

- You own your `Page<Name>.tsx`. Nothing else.
- Insert registry entries **alphabetically**, never append — two sessions that
  both append collide on the same line.
- **Stop before editing a shared file** (`easing-slot.ts`, `timing.ts`,
  `text-animation-slot.ts`, `templates.ts`, `index.tsx`) and say so.
- Commit early. Uncommitted work is unrecoverable work.

## 7. Where things actually stand

**Built and shared:** `timing.ts` (ms), `easing-slot.ts` (8 curves incl. spring
and elastic), `text-animation-slot.ts` (fade with word/caption unit, pop,
tracking, zoom-continuous), `wiggle-slot.ts`, `templates.ts` (one registry),
`baseline.mjs` + `compare.mjs` (pixel regression harness).

**The big gap:** those shared slots are wired into **Hormozi 2 only**. The other
templates still carry private fade/pop controls under four different names
(`fadeInMs`, `fadeMs`, `wordFadeMs`, `outFadeMs`). Migrating them is not a
rename — `wordFadeMs` fades each word on its own cue while `fadeInMs` fades the
whole block, which is exactly why `fadeUnit` exists.

**Also unbuilt:** per-caption template switching (§5), and face-aware caption
placement (nothing looks at the video; position is a fixed percentage).
