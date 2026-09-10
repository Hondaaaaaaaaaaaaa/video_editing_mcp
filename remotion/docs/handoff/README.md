# Handoff — caption templates

> **Read [`START-HERE.md`](START-HERE.md) first.** The files here record what was
> MEASURED; that one records what the user WANTS — the intent, the corrections
> already made, and how to work alongside their other sessions.

Everything a fresh session (or a different account) needs to carry on. Written
2026-08-16, at the end of a long stretch of work on the **Ali** and **Speed**
templates.

The files beside this one were the assistant's working notes; they were kept
outside the repo, which meant they did not travel between machines or accounts.
They live here now so they do. **Read `adding-a-caption-template.md` in the
parent folder first** — it is the process; these are the findings.

---

## 1. What is NOT in this repo

- **The reference footage.** `remotion/public/Ali/` and `remotion/public/speed/`
  hold the reels every template was measured from, and `remotion/.gitignore`
  excludes `public/**/*.mp4` on purpose (~486 MB, and it would be copied into
  every git worktree). Move those folders by hand — a drive or cloud — or the
  new machine has no footage to render over.
- **`sample-video.mp4` IS tracked**; it predates that ignore rule.
- **`remotion/.env`** — ignored, and holds `ELEVENLABS_API_KEY` /
  `ANTHROPIC_API_KEY`. Needed by `transcribe.mjs` and `enrich.mjs`. Copy it
  across separately; never commit it.

**`Speed`'s composition currently defaults to `speed/speed 1.mp4`,** which is
one of those ignored files. On a machine without it the composition will not
load. Either bring the clip or point `defaultProps.src` back at
`sample-video.mp4` — but see the warning in §3 about judging Speed on that clip.

## 2. Where things stand

| template | state |
|---|---|
| Ali | Built and verified against the reference. Settled. |
| Speed | Built; the user was still not satisfied that it matches. See §3. |
| Edits, Typewriter, Classic | Another session's work, landed in parallel. |
| Per-caption template switching | **Still unbuilt.** The groundwork is done — every caption carries a stable `ideaIndex` and every template's variant is written into each document — so a caption can be resolved in any template. The UI and the per-run `<Sequence>` rendering are what is missing. |

## 3. Speed — read this before changing anything

Three mistakes cost a lot of time here. They are all easy to repeat.

**The frame rate is not set by the `<Composition>`.**
`calculateCaptionedVideoMetadata` RETURNS an fps, which overrides the `fps` prop.
Speed uses `captionedVideoMetadataAtFps(60)` because its 133 ms fade is 8 graded
frames at 60fps but only ~2.5 at 30 — the identical curve reads as a hard cut.
This was the single biggest cause of "it has no fading".

**Never judge Speed on `sample-video.mp4`.** Its median gap between words is
460 ms, so each fade finishes and then sits alone for ~375 ms; the template
reads as static text popping on however correct it is. The reference reel's
median gap is 200 ms, where consecutive fades nearly merge into one motion.

**Measure with the right instrument.** Full detail in
`measuring-captions-from-footage.md`, but in short: a percentile alpha estimator
saturates early and under-reports duration; an outer ink box grows because the
GLOW blooms and because outer letters cross the brightness threshold after the
thick middle strokes; only **letter pitch** — the distance between the gaps
between letters — is immune to both, and it says the true scale is ~2%.

**What is measured vs. what is set by eye** in `SPEED_DEFAULTS`:

- Measured: font size 6.28% of frame width, tracking 0.18em, word fade 133 ms,
  `ease-out` strength 2, hard-cut out, position, the four colours.
- Set by eye at the user's request, NOT measured: `popFrom: 0.94` and
  `popMs: 260` (the measured pop is only ~2%), and `slantDeg: 12`.

**Unresolved:** the geometry fit is uncomfortable with The Bold Font — at the
size matching both reference line widths its caps come out ~17% short. The file
is `THEBOLDFONT-FREEVERSION.otf`; a full version may have different metrics. The
user states the font is correct, so it was built on that.

## 4. The colour model

`EnrichedWord.color` stores the **id of a palette entry**, not a fixed enum.

- Claude assigns only `base` / `key` / `positive` / `negative` / `shock` in
  `enrich.mjs` rule 7b, so model output stays predictable.
- The user adds their own entries in the Style Tuner and applies them by hand
  in the caption editor. An id that is missing or whose entry is disabled falls
  back to base — so disabling is reversible, the tag stays on the word.
- Animation and glow are **global, not per-colour** — a deliberate product
  decision. Every word fades, pops and glows identically.

## 5. Loose ends worth picking up

1. **`caption-timing.ts`** (added by a parallel session) may duplicate the
   line-gating and caption-gap logic written inline in `PageSpeed.tsx`.
   Reconcile before building further on either.
2. **Speed's caption breaks deliberately differ from the reference's.** The user
   confirmed they want the meaning-based rule shared by all templates, not the
   reference editor's grouping. Do not "fix" this.
3. `sample-video.enriched.backup.json` and `.enriched.new.json` are scratch
   outputs from enrich runs that got committed; safe to delete.
4. Four sessions shared this one working directory. If that happens again, use
   a git worktree per template — see `adding-a-caption-template.md` §8.
