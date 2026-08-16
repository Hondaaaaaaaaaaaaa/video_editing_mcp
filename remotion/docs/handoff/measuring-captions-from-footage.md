---
name: measuring-captions-from-footage
description: "How to measure a caption template off reference footage on this machine — the three methods, which fails when, and the one that works over moving footage"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ee0740c1-5831-423d-9939-6df8bbdcb0cd
  modified: 2026-08-14T14:50:34.870Z
---

Reverse-engineering a caption look means measuring PIXELS, not eyeballing. Toolchain here: no system ffmpeg/Python, so frames are decoded by a hand-rolled PNG decoder in Node (`zlib` inflate + unfilter) and fonts are fitted in a throwaway static-server page driven by the Browser pane. See [[gadzhi-template-spec]] for the ffmpeg limits (`npx remotion ffmpeg` has no `fps`/`tile`/`vstack` filters, no `drawbox`, PNG out only, use `-r N`).

## Isolating the text — in order of preference
1. **Opaque plate** (Ali's cream pill): trivial, gives an exact anchor. Use it if the look has one.
2. **Colour predicate**: only when the background has no similar hue. FAILS on graded footage (Speed's grade pushed the background into the same reds/greens as the captions).
3. **Temporal differencing vs a pre-entrance frame**: FAILS whenever the camera moves. Speed's whip-pans made 110k+ px differ every frame.
4. **Gradient-energy mask** (text is sharper than blurred background): FAILS on busy backgrounds — jerseys/faces/signage gave 25-38k high-gradient px spanning the full width.
5. **Per-column background interpolation — THE ONE THAT WORKS.** Estimate the background under the text from rows well above and below the glyph band IN THE SAME FRAME, interpolate vertically, then `alpha = (observed - bg) / (text - bg)` on whichever channel separates them (blue for yellow/white text on a pale wall). Survives camera motion because the reference comes from the frame itself. Restrict to a few letters over a locally flat patch — you do NOT need the whole caption.

## Separating a POP from a FADE
Report per-frame **alpha** (opacity) and **extent** (bbox) separately. If extent tracks alpha it is a soft-edge threshold artifact; if extent keeps growing after alpha saturates it is a real scale. Watch for the ROI clipping the glyphs — if the reported height equals the ROI height exactly, widen it before concluding anything.

## Fitting the easing
Fit against the repo's OWN `makeEntranceEasing` (in `PageShiny.tsx`) so the measurement lands directly in a shippable prop. Speed measured as `smooth` @ speed 1.0 (easeOutQuad), rms 0.03. Sanity contrast at the same duration: `sharp` is 80% opaque one frame in, `bouncy` overshoots, linear is 20% — a measured 36% is unambiguous. Then RE-MEASURE your own render the same way to close the loop.

## Fitting the font
Two independent tests, both needed: least-squares size fit over many caption ink-widths, AND glyph-silhouette IoU against the video's own pixels. Fit letter-spacing (and word gap) as a FREE PARAMETER or the fit hides tracking inside a too-big font size. Pick a test word WITH CURVES — "NAME" is all straight strokes and every candidate scored 0.77.
