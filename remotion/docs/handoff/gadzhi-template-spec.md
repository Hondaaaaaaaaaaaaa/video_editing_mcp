---
name: gadzhi-template-spec
description: "Measured spec of the Gadzhi caption template (reverse-engineered from gadzhi.mp4) — font, geometry, mechanic"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38e27b2a-5090-47f2-9f7b-c2da2c48d56a
  modified: 2026-08-14T16:35:20.448Z
---

**Gadzhi caption template**, built 2026-07-30 from `remotion/public/gadzhi.mp4` (480x854, 29.97fps, 35.4s). Implemented in `remotion/src/CaptionedVideo/styles/PageGadzhi.tsx`. Same mechanic as [[captions-remotion-architecture]]'s Hormozi; only the visual layer differs.

## The mechanic
Two stacked lines per caption, both on screen, dead centre. The line being SPOKEN is bold + opaque; the other is the SAME white in a thin weight at lower opacity. **No accent colour anywhere** — weight + opacity is the entire signal. The swap is INSTANT (one frame), nothing moves or resizes. Each caption fades in over ~5 frames; the outgoing one is a hard cut, with one blank frame between.

## Measured values (from raw pixels, 480-wide frame)
- Font: **Montserrat Bold 700 / ExtraLight 200**. Identified by least-squares fitting ONE font size across 4 bold lines: Montserrat max error 0.47%, MontserratAlternates 1.99%, ExtraBold 2.72%. Cross-checked: "incredibly valuable." at 31.8px Montserrat Bold = 322.8px ink vs 322px measured.
- fontSize **31.8px on 480 wide = 6.63% of frame width** (stored as `fontSizePct` so it holds at any export resolution — an absolute px default silently trips the auto-fit on small clips).
- Block centre **x=50%, y=69%**; line-height **1.19** (38px baseline gap); wordSpacing **0.27em** (= the face's own space advance).
- inactiveOpacity **0.85** (0.70 too faint, 1.00 too solid — matched by rendering all three against the reference crop).
- No stroke; shadow subtle and for legibility only, not in the reference.

## Content rules
`--shape=gadzhi` in `enrich.mjs`: exactly 2 lines, 2-5 words/line, 5-9 per caption, lead-in then payoff, break only at phrase boundaries, **never let a sentence end mid-caption**. Capitalising each caption's first word is done at RENDER time in PageGadzhi (`capitalizeFirstWord`), not in the doc, so it survives the user re-splitting captions. Per-word `emphasis` is deliberately ignored.

## The optional yellow accent (added 2026-08-14, from `public/gadzhi 2.mp4`)
"Gadzhi 2" is NOT a separate template — it is a flag on this one. Reference clip is 720x1280/30fps; measured across every caption: the spoken line is coloured only when it is the caption's **second** line, a spoken FIRST line stays white. Per LINE, not per word (the lit line's x-extent is identical on every frame it is lit — no karaoke sweep) and POSITIONAL, not `emphasis` ("and who we become" gets lit). Recolour lands on the same single frame as the weight swap, so it rides the existing `activeLine` step and needed no new timing.

**User's deliberate choices — do not "correct" these to match the reference:** feature defaults **OFF** (`text.accentEnabled`), and the colour is **pure `#ffff00`**, chosen over the reference's own measured `#d9ff00` (mean of purest glyph pixels rgb(216,255,0)). A caption that came out as a single line has no second line and stays white.

## Gotchas
- gadzhi.mp4 has the ORIGINAL captions burned in at the same coordinates the template renders to — to measure your own output, move `positionY` first or the two overlap and every measurement is contaminated.
- Remotion's bundled ffmpeg (`npx remotion ffmpeg`) has **no `fps`, `tile`, or `vstack` filters and no rawvideo/ppm/bmp muxers** — only PNG out. Use `-r N` as an output option to sample frames. No Python, no system ffmpeg on this machine.
