---
name: speed-template-spec
description: "Measured spec of the Speed caption template — The Bold Font all-caps, per-phrase semantic colour, 85ms easeOutQuad word fades at 60fps"
metadata: 
  node_type: memory
  type: project
  originSessionId: ee0740c1-5831-423d-9939-6df8bbdcb0cd
  modified: 2026-08-15T20:17:48.854Z
---

**Speed caption template**, built 2026-08-14 from `remotion/public/speed/` (two reels, 1080x1440 @ **60fps**). Implemented in `remotion/src/CaptionedVideo/styles/PageSpeed.tsx`, template key `speed`. See [[measuring-captions-from-footage]] for method and [[adding-a-template-handoff]] for process.

## The mechanic
Heavy ALL-CAPS display type mid-frame, 1-2 lines. Words appear **one at a time** on their own timestamps. Colour attaches to a **phrase**, and carries meaning.

## Measured values
- Font **The Bold Font** (user-stated; `public/fonts/THEBOLDFONT-FREEVERSION.otf`), cap/em 0.735.
- Cap height **48px** on a 1080-wide frame → **fontSizePct 6.28**, **letterSpacing 0.18em**.
- positionY **47%** (mid-frame, not under the chin), lineSpacing 1.12, wordSpacing 0.3em.
- Word fade **85ms**, using the shared `easing-slot.ts` at **`{ type: "ease-out", strength: 2 }`** (rms 0.030 against the measured ramp 0 → 0.36 → 0.65 → 0.82 → 0.90 → 1.0, confirmed on three separate words). **The slot's default `smooth` is badly wrong here** — it reaches 0.66 one frame in where the reference is 0.36 — so Speed must set easing explicitly. Uses `makeOpacityEasing` (not `makeEasing`) because the curve drives alpha and `bouncy` overshoots past 1.
- **NO SCALE.** Horizontal extent constant within 3% from the first visible frame. It reads as a pop only because 85ms is fast — a spring/overshoot is the WRONG model.
- Out-fade ~35ms, then **~100ms of empty screen** before the next caption builds.
- Palette (6 roles): base `#ffffff`, key `#ffe000`, **loud** `#ff1a1a`, positive `#22e34a`, wild `#ff3ea5`, cool `#22d3d3`.
- **Punctuation keeps the base colour** ("NAME" yellow, its "?" white; "TIM" green inside white quotes).
- Capacity `charsPerLine(6.28, 0.87, ADVANCE_NORMAL + 0.18)` = 20. The +0.18 is TRACKING, which ADVANCE_NORMAL does not account for.

## THE TWO BUGS THAT MADE THE FIRST BUILD LOOK WRONG
1. **fps.** `calculateCaptionedVideoMetadata` RETURNS an fps, which **overrides a `<Composition>`'s own `fps` prop** — the hard-coded constant, not the prop, decides the rate. At 30fps an 85ms fade is 2.5 frames and reads as a HARD CUT. Fixed with `captionedVideoMetadataAtFps(60)`.
2. **Colour was per-word, sparse, and red meant the wrong thing.** The rule told Claude "most captions are entirely base plus one key; do not colour every caption" — the OPPOSITE of the references, which accent nearly every caption. Colour a PHRASE or a whole line. `loud` (red) = excitement/shouting, NOT bad news; it is the most-used accent.

## Fitting the typography — the trap
ANCHOR ON CAP HEIGHT, not on line widths. Solving two line widths exactly lets cap height drift 17% and demands an implausible 0.38em of tracking. And measure on a **DARK-background frame**: on the pale-wall shot the near-white wall passes a "white text" threshold and inflates every width — that error made all 14 candidate fonts want NEGATIVE tracking, which is the tell that the reference measurement is wrong, not the font.

## Data model
`EnrichedWord.color?: WordColor` (`base|key|loud|positive|wild|cool`) in `styles/types.ts`, assigned by Claude in `enrich.mjs` rule 7b. PageSpeed reads `segments` DIRECTLY (not via `enrichedToBlocks`, which drops `color`). Falls back to `emphasis` → key when absent. `relayout.mjs` passes whole word objects through, so `color` survives a re-layout. `varyAccents` in PageSpeed guarantees consecutive captions never wear the same accent. A line waits for the line above it to finish building.

## DO NOT JUDGE THIS TEMPLATE ON `sample-video`
Its median gap between words is **460ms**, so each 85ms fade finishes and then sits alone for ~375ms — the template reads as static text popping on, however correct it is. The reference reel's median gap is **200ms**, where consecutive fades nearly run together into continuous motion. That pacing difference — not a missing animation — is what "it has no fading, no easing" looked like. Speed's `<Composition>` therefore defaults to `speed/speed 1.mp4`, not the shared sample clip. Verified in Studio: 1080x1920, 60 FPS, duration 34.58s.

## Gotchas
- Reference is **3:4**; template is 9:16 with everything as % of frame width, so it works at both.
- The `@DEAGZZZSHORTS` watermark and the per-letter Google-coloured "GOOGLE" are NOT template features.
- Not yet done: re-enrich a speed reference clip so the new colour rule can actually be seen (keys are present in `remotion/.env`).
