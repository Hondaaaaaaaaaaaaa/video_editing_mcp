# Brief — building a NEW caption template

Paste into a fresh chat:

> Read `remotion/docs/handoff/brief-new-template.md` and follow it.
> Reference clip: `remotion/public/References/<FOLDER>/<FILE>.mp4`
> I call this template: **<NAME>**

---

## Read first

- `remotion/docs/adding-a-caption-template.md` — the three-level model, capacity
- `remotion/docs/motion-vocabulary.md` — the shared names for animations
- `remotion/docs/handoff/measuring-captions-from-footage.md` — how to measure

## What you own

**Your own `src/CaptionedVideo/styles/PageX.tsx`, and nothing else.** That file
is yours alone, so parallel sessions never collide on it.

You also add exactly one entry to each of:

| File | Entry |
| --- | --- |
| `layout.mjs` | capacity for your shape |
| `src/CaptionedVideo/templates.ts` | the registry entry |
| `src/Root.tsx` | a factory line + one `<Composition>` |

**Insert every one of those in ALPHABETICAL position — never append at the end.**
Two sessions that both append land on the same line and conflict; two that
insert alphabetically land in different places and git merges them
automatically. This one rule is what makes parallel work painless.

## Hard rules

- **Measure from pixels. Never estimate by eye.** Record the measurements as the
  defaults, with a comment saying they ARE the measurements.
- **Every duration in milliseconds**, never frames. Use `styles/timing.ts`
  (`durationMsSchema`, `msToFrames`). A frame count changes meaning when the
  project frame rate changes.
- **Easing comes from `styles/easing-slot.ts`.** Do not write your own curve.
  Available: `linear`, `ease-in`, `ease-out`, `ease-in-out`, `smooth`, `bouncy`
  (overshoots once), `elastic` (wobbles), `spring` (real physics).
- **Never copy `charsPerLine` from another template** — derive it. See
  `adding-a-caption-template.md` §3. Copying it is a bug that has happened.
- **Defaults live in `X_DEFAULTS`, and `Root.tsx` spreads them.** Never write a
  literal `defaultProps` object — it silently stops tracking the defaults.
- **If you need to change a SHARED file — `easing-slot.ts`, `timing.ts`,
  `index.tsx`, `templates.ts`, `text-effects.ts`, `font-slot.ts` — STOP and ask.**
  Shared-file edits are what collide between sessions.
- **Commit early and often.** Uncommitted work is unrecoverable work.

## Verify before you say it is done

```bash
npx tsc --noEmit -p .
npx eslint src
node baseline.mjs <outDir> <YourTemplateId>
```

Then look at the stills. A template is done when it matches its reference, not
when it compiles.
