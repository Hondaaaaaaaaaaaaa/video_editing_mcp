# Brief — CHANGING an existing caption template

Paste into a fresh chat:

> Read `remotion/docs/handoff/brief-modify-template.md` and follow it.
> Template: **<NAME>**
> What I want changed: <describe it>

---

## The one thing that makes this different from building new

The existing templates are **already pixel-matched to their reference reels**,
and that match cost real measurement work. So the danger here is not "does it
compile" — it is **changing something you did not mean to change.**

So: capture a baseline BEFORE you touch anything.

```bash
node baseline.mjs /tmp/before <TemplateId>     # run this FIRST, before editing
# ... make your change ...
node baseline.mjs /tmp/after  <TemplateId>
node compare.mjs  /tmp/after  /tmp/before
```

Every still that differs must be a difference you INTENDED. If something else
moved, that is a regression — find it before moving on, not after.

## What you own

**Only that template's `PageX.tsx`.** Everything is already registered, so there
is no entry to add to `layout.mjs`, `templates.ts` or `Root.tsx`.

Because of that, two sessions changing two different templates cannot collide at
all. This is the safest kind of parallel work.

## Hard rules

- **Change the defaults in `X_DEFAULTS`**, in the template file. `Root.tsx`
  spreads them, so that is the single source of truth — editing it now really
  does change what the Studio renders.
- **Every duration in milliseconds** (`styles/timing.ts`). If you find a field
  still measured in frames, say so rather than quietly converting it.
- **Easing comes from `styles/easing-slot.ts`.** Do not hand-roll a curve.
- **If you need to change a SHARED file — `easing-slot.ts`, `timing.ts`,
  `index.tsx`, `templates.ts`, `text-effects.ts`, `font-slot.ts` — STOP and ask.**
  Another session is probably in one of them.
- **Adding a control? Its default must be a NO-OP.** A new slider must reproduce
  today's output exactly at its default value, so a clean pixel diff proves you
  broke nothing. `PageShiny`'s `fadeMs` is the worked example: it defaults to the
  same value as `durationMs`, which is precisely the old behaviour.
- **Commit early and often.**

## Verify

```bash
npx tsc --noEmit -p .
npx eslint src
node compare.mjs /tmp/after /tmp/before
```

Note: `EditsMatch@1300` is known non-deterministic — that frame lands on a scene
cut and two renders of identical code differ by ~85%. `compare.mjs` already
ignores it.
