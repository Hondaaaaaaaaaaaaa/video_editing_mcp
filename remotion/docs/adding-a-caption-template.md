# Adding a caption template

Everything a fresh session needs to build a new caption template in this repo.
Written 2026-08-10, right after per-template screen splitting landed.

---

## 1. The model: three levels, not two

```
CAPTION   Claude, by MEANING, decided ONCE for the whole video.
          The same words in every template. Never moved by code.
  |
  +-- SCREEN   code, per-template, capacity-driven.
  |            Usually 1. A template whose text is too big shows the SAME
  |            caption across consecutive screens.
  |
  +-- LINE     code, per-template. How one screen's words stack.
```

The rule that makes everything else safe: **a split never crosses a caption
boundary.** Segments carry `ideaIndex`; grouping by it reproduces Claude's
captions exactly. That stable identity is what lets a user pick a different
template per caption without words leaking between captions.

Claude is called **once per video**. Layout is pure code — free, deterministic,
instant. Never add an LLM call to the layout path.

## 2. Where the code lives

| File | Role |
| --- | --- |
| `layout.mjs` | The whole layout engine. `TEMPLATES`, `splitInto`, `layoutFor`. No model, no I/O. |
| `enrich.mjs` | The Claude pass (meaning + emphasis + word roles). Imports layout. |
| `relayout.mjs` | Re-lays existing `.enriched.json` files with **no Claude call**. Run after any capacity change. |
| `src/CaptionedVideo/styles/Page*.tsx` | One file per template — the look. |
| `src/Root.tsx` | Registers the Studio composition + its default props. |
| `playground/styles.ts` | Registers the template for the web editor. |
| `src/CaptionedVideo/styles/fonts.ts` | Google/custom font registration. |

## 3. Capacity is DERIVED, never copied

This is the one rule that matters most, because breaking it caused a real bug.

```js
charsPerLine = fitFraction / ((fontSizePct / 100) * advance)
```

- `fontSizePct` — glyph height as a % of frame width (the template's own default)
- `fitFraction` — how much of the frame width one line may occupy (`FIT_WIDTH_FRACTION`)
- `advance` — average glyph advance as a fraction of font size:
  `ADVANCE_NORMAL = 0.52`, `ADVANCE_CONDENSED = 0.45`

Anchored on Gadzhi, which renders correctly: 26 chars at `fontSizePct 6.63`,
`fitFraction 0.9` implies `advance 0.52`.

**Do not copy a `charsPerLine` number from another template.** Hormozi 2 was
given Gadzhi's `26` while rendering at *double* the glyph height (13.5 vs 6.63).
Its real capacity is 15. It spent weeks cramming ~2x what fits, which read as
"the top line is big and the bottom line is a shrunken stub".

Four entries (`hormozi`, `shiny`, `kinetic`, `minimal`) are still literals and
have NOT been converted. Do not copy those either.

Roughly where a template lands (2-line, normal face):

| fontSizePct | chars/line | screens for a 41-char caption |
| --- | --- | --- |
| 5% | 35 | 1 |
| 6.63% (Gadzhi) | 26 | 1 |
| 8% | 22 | 1 |
| 10% | 17 | 2 |
| 13.5% (Hormozi 2) | 15 | 2 |

`OVERFLOW_TOLERANCE = 1.1` — a caption may run 10% past a screen budget before
splitting, because templates shrink an overrunning line and a ~10% shrink is
invisible. Without it, a caption one character over budget would split.

The renderer stays the final authority: templates measure true pixel width in
the DOM and shrink to fit. The formula only has to land in the right zone. It is
a rougher approximation for Arabic than for Latin.

## 4. Two sizing styles — pick one deliberately

- **Fixed size** (Gadzhi, Hormozi 2): declares `fontSizePct`. Capacity is
  computable up front. Predictable. **Prefer this for new templates.**
- **Auto-fit** (Hormozi): measures text and picks the largest size that fits
  *every* caption (`PageHormozi.tsx` ~line 497). Never overflows, but one long
  caption shrinks the text for the whole video.

## 5. Building the look

Templates are reverse-engineered from reference reels, not invented. Measure the
reference — font family/weight, cap height as % of frame width, position, colours
sampled off actual frames — and record the measurements as the defaults, with a
comment saying they ARE the measurements (see `HORMOZI2_DEFAULTS`).

Shared helpers currently live in `PageShiny.tsx` (`enrichedToBlocks`,
`enrichedToWords`, `groupWordsIntoBlocks`, `KineticWord`). Gadzhi, Highlight,
Hormozi, Hormozi 2 and Kinetic all import from it — which is why `PageShiny.tsx`
is 1334 lines and cannot be deleted. **These helpers should be extracted into
their own module before many more templates are added.**

## 6. Verifying

```bash
npx tsc --noEmit -p .                                  # types
node relayout.mjs "public/*.enriched.json" --overwrite # re-lay after a capacity change
npm run dev                                            # Studio on :3000
```

All node/npm/remotion commands on this machine need `NODE_OPTIONS=--use-system-ca`.

Check segment counts per template directly — this catches a wrong capacity
faster than looking at the preview:

```js
const d = require("./public/sample-video.enriched.json");
for (const [k, v] of Object.entries(d.variants)) console.log(k, v.length);
```

Baseline for `sample-video` (4 captions): every template 4 screens, except
`hormozi2` at 7.

Remotion Studio caches the fetched `.enriched.json` — hard-reload the tab after
regenerating, or verify with `remotion render`, which always reads from disk.

**Studio writes props back to `Root.tsx`.** Arrow keys while a props field has
focus will nudge values and save them. Check `git diff src/Root.tsx` before
committing.

## 7. Known gaps

- **Per-caption template switching is NOT built.** Needs a `template` field per
  caption, a click-a-block UI, contiguous same-template runs rendered as separate
  `<Sequence>`s, and per-run font sizing.
- **Manual screen-break override is NOT built.** The scorer keeps an adjective
  with its noun rather than balancing width, so it will not always pick the break
  a human would. Needs Hormozi 2 added to `EDITOR_STYLES`, a
  move-word-across-screen-break op, and an override stored per
  (caption, template) so editing one template cannot disturb another.
- **Classic and Typewriter are unwired** — they pass no `shape` prop, so they
  fall back to the default (Hormozi's) layout.
- **`minimal` is an orphan** — it is in `TEMPLATES` and written into every
  enriched file, but nothing in `src/` references it.

## 8. Working on two templates at once

Every new template edits the same four files: `Root.tsx`, `layout.mjs`,
`playground/styles.ts`, `fonts.ts`. Two sessions sharing one working directory
**will** clobber each other — this already happened on 2026-08-08 and left a
tree that did not typecheck.

Use a separate git worktree per template:

```bash
git worktree add ../vemcp-template-a -b feature/template-a
git worktree add ../vemcp-template-b -b feature/template-b
```

Each session works in its own directory on its own branch, then merges. Conflicts
become visible git conflicts in four small registration spots instead of silent
overwrites. Run Studio on a different port per worktree.

Commit outstanding work BEFORE creating worktrees, so both branch from a tree
that already has it.
