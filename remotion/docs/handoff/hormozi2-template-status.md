---
name: hormozi2-template-status
description: "Hormozi 2 caption template (built 2026-08-09) — karaoke line-highlight with changing colour + vertical bob + pop; measured spec, files, gotchas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38e27b2a-5090-47f2-9f7b-c2da2c48d56a
  modified: 2026-08-09T13:57:43.531Z
---

**Hormozi 2** — the "changing-colour + wiggle" viral caption look, built 2026-08-09. Reverse-engineered frame-by-frame from `remotion/public/Hormozi 2/` (4 reels, 1080x1920). Related: [[gadzhi-template-spec]], [[kinetic-template-status]], [[caption-ai-decision-seams]].

## The look (measured off the footage)
- Two stacked ALL-CAPS lines, heavy CONDENSED ITALIC face = **Avenir Next Condensed Heavy Italic** (`public/fonts/avenir-next-condensed-heavy-italic.ttf`, a single static weight → font-slot renders it at natural weight, no faux bold).
- **KARAOKE, line-level**: the line currently SPOKEN lights up in an accent colour; the other line is white. Highlight steps top→bottom with the voice (led by SWITCH_LEAD_MS=130, same as Hormozi), then reverts to white.
- **Changing colour**: accent rotates through a 3-colour palette (red / yellow / green). Implemented as a **hash-seeded rotation in reading order** (not pure per-line random — that clumped badly on short clips, whole video came out one colour). Only the START colour is hash-seeded from the doc text; guarantees all 3 show, adjacent lit lines differ, deterministic per render.
- **Stroke follows colour**: red→white outline, yellow/green→dark outline (each palette entry carries its own stroke).
- **NO pop / no scaling** — an earlier version had a 1.4x pop on the lit line; user rejected it ("weird pop wiggle"). Lines hold their size always. (The "THAT RUNS bigger" frame was a transient/width artefact, not a real scale.)
- **Wiggle = continuous float of the WHOLE BLOCK** (both lines together as one unit), NOT per-line. Measured off the SLOWED reference clip (see below): the block drifts up/down ~±9px @1080 (≈0.08×fontSize, `bobEm`) over ~0.7s (`bobSpeed`~1.4/sec), PLUS a small tilt (`rotateDeg`~1.2°) on a slower, unrelated rhythm (`rotateSpeed`~0.55/sec) so it drifts in/out of phase = organic "sometimes a little tilt". Applied to the OUTER container transform, driven by caption-local frame (starts from rest, no jump on appear). Sliders exposed for all 4.
- **Shadow = soft dark BLURRED halo** hugging glyphs — layered `drop-shadow()` filters (not flat text-shadow), the "lifted sticker" look.
- Size: fontSizePct 13.5 (big). FIT: **measureText UNDER-measures the uploaded italic font** → the old whole-doc auto-fit let wide lines run OFF SCREEN. Fixed by measuring each line's ACTUAL rendered width via a DOM ref (offsetWidth of an inner inline-flex span) in useLayoutEffect + delayRender, and scaling ONLY the too-wide line (floor MIN_FIT_SCALE 0.5, avail = width×0.94). offsetWidth is unaffected by transform:scale → stable, no oscillation. Result: per-line sizing (short lines big, long lines shrink) = the reference's natural variance; text NEVER overflows. User chose "keep grouping, shrink wide lines" over shortening captions.
- Position: references sit ~53% (their speakers framed high). Default is **64%** ("under the chin") so it clears the face on close-ups; tune per clip.

## Files
- `src/CaptionedVideo/styles/PageHormozi2.tsx` — the template (scaffolded on PageGadzhi; reuses `groupWordsIntoBlocks`/`enrichedToBlocks`/`KineticWord` from PageShiny, font-slot system). singleSurface, documentDriven.
- Registered: `src/Root.tsx` (composition "Hormozi2", shape="hormozi2") + `playground/styles.ts` (id "Hormozi 2").
- `enrich.mjs`: added `hormozi2` shape = same robust 2-line meaning-based config as gadzhi (minLines/maxLines 2, no min word count, endCaptionAtSentenceEnd, validate-and-retry). Emphasis is IGNORED (colour is karaoke, not marked words).

## Decisions the user made (this template)
- Colour = follow SPOKEN line (karaoke), not AI emphasis. Palette pick = "random from 3" but I shipped seeded ROTATION (told them; one-line change to switch to true-random or single colour).
- Font = the Avenir file they dropped in public/fonts. Emojis skipped for v1 (v11 had a 🏃 under the caption — separate layer, deferred).
- Motion = match reference (~1.4x pop, gentle bob).

## Reference footage + how I measure motion (IMPORTANT lesson)
- Authoritative reference is now `public/Hormozi 2/Don't use the excuse…` (720x1280, italic-heavy caps) + its **`… slowed .mp4`** (exactly 2x/0.5x speed). The user provided the SLOWED version specifically so motion could be measured.
- I read STILLS, I don't watch video. To measure a fast/subtle wiggle I must extract CONSECUTIVE frames (every frame) and track the block against the fixed frame edges. Duration doesn't matter (I have the clips, I extract frames myself) — what helps is a SLOW-MO of ONE caption + a word description. On the slowed clip, tracking "WHEN I WENT" top-edge over consecutive frames gave the ±9px / ~0.7s numbers.
- Rotation <~2° is invisible to me in stills (worse with an italic face) → I exposed it as a slider and set a small default rather than measuring it.
- `remotion ffmpeg` in this repo is a MINIMAL build: `crop` works, but `tile`/`vstack`/`hstack`/`fps=` filters are NOT available (can't montage) — read frames individually.

## Static look on the "excuse" creator: 2-line meaning groups (WHEN I WENT / THERE THAT DAY), size ~13.5% of width (fills ~74%), italic heavy caps, green/red actives (red→white stroke). Position sits ~53% there (speaker framed high); default is 64% ("under chin") for close-ups.

## VOCABULARY (agreed with user — use these exact terms)
- **Line break** = the split between the TOP and BOTTOM line WITHIN one caption. User wants this balanced by SIZE (both lines ~equal width → both big). Done in the TEMPLATE: `balanceTwoLines()` flattens the caption's words and re-splits at the point that minimises |top width − bottom width| (width ≈ char count + gaps). `layout.balanceLines` toggle (default true). Applied in the parent BEFORE accent indices / line-switch timing so everything aligns. Keeps every word in the same caption (user chose "Option A"); tight pairs like "whisper CPP" naturally stay on one line.
- **Caption break** (block break) = where one caption ends and the next begins (the blue timeline blocks). User wants tight phrases NEVER split across captions (no "reels" | "and tiktoks"); break at sentences. This is enrich/Claude's job (shape rules H2-H4).

## User's tuned defaults (in Root.tsx inline defaultProps, synced into HORMOZI2_DEFAULTS): bobSpeed 0.4 (slow), rotateDeg 0 (rotation OFF — pure up/down float), bobEm 0.08. The template eases the float IN over ~0.6s (smoothstep envelope) so it glides up to amplitude instead of starting mid-swing. NOTE: user later INLINED the Hormozi2 defaultProps in Root.tsx (no longer spreads HORMOZI2_DEFAULTS) — when adding a schema field, update BOTH the inline Root props AND HORMOZI2_DEFAULTS (playground reads the latter).

## How to test (clean clip, no double-captions)
Reference clips already have captions burned in → render over a CLEAN clip. Copied `sample-video.mp4`+`.json` → `hormozi2-demo.mp4`+`.json`, `node enrich.mjs public/hormozi2-demo.json --shape=hormozi2` (Sonnet), render `Hormozi2` with `--props='{"src":"hormozi2-demo.mp4"}'`. Grouping came out clean (4 captions, correct boundaries). Local demo files, not committed.

## Not committed yet. Standard caveats: NODE_OPTIONS=--use-system-ca; `node enrich.mjs` prints a harmless Windows libuv "Assertion failed" at teardown (file writes fine); Studio caches enriched.json → hard-reload after regen; parallel session maintains sample-video.enriched.json variants.
