---
name: ali-template-spec
description: "Measured spec of the Ali caption template (Ali Abdaal sticker look) — Poppins 700 on a hugging cream pill, karaoke by colour"
metadata: 
  node_type: memory
  type: project
  originSessionId: ee0740c1-5831-423d-9939-6df8bbdcb0cd
  modified: 2026-08-11T16:24:02.749Z
---

**Ali caption template**, built 2026-08-11 from `remotion/public/Ali/` (three reels; the 1080x1920 `ali 2.mp4` is the one measured frame-accurately). Implemented in `remotion/src/CaptionedVideo/styles/PageAli.tsx`, template key `ali`. See [[adding-a-template-handoff]].

## The mechanic
ONE line, always, on a rounded "sticker" that HUGS the text. Karaoke by COLOUR only: spoken words black, upcoming words pale warm grey, each word crossing over ~280ms. Nothing moves, scales or pops; captions HARD-CUT. Per-word `emphasis` is ignored.

## Measured values (1080-wide frame)
- Font **Poppins 700** — identified, not guessed: 38 Google families x 3 weights, fitted two independent ways. Width fit 0.44% mean error (runner-up 0.85%) AND glyph-silhouette **IoU 0.845 vs 0.733** for the next best. The `a` is single-storey; that IS the reference's letterform.
- **fontSizePct 5.4** (58.3px) + **wordSpacing 0.26em** — from a JOINT least-squares fit over 21 captions solving size and gap together. The reference sets words ~4px wider than Poppins' own 0.212em space; fitting size alone hides that in a too-big face (0.44% -> 0.25% mean error).
- Pill: fill `#fffaee`, paddingX 0.62em (36px), paddingY 0.39em (-> 104px tall), radius 0.38em (22px), subtle shadow. Centre x50% **y78%** (under the chin).
- Spoken `#000000`, upcoming `#d3cfc3`. Fade ramp measured every frame: 211→204→178→146→110→79→47→8→0.
- Capacity `charsPerLine(5.4, 0.8, ADVANCE_NORMAL)` = **28**, and the reference's own longest captions are 27-28 chars. Derived AND confirmed.

## Gotchas
- The fade is a **uniform colour interpolation, not a left-to-right wipe** — proved with a per-column luminance scan at mid-transition. A frame showing three greys is one word caught mid-fade, not a third tier.
- Colourway differs per reference reel (ali 1 grey pill, ali 2 cream, ali 3 white). Defaults are ali 2's; all of it is props.
- The source tool sometimes sizes the pill to a GROUP of captions (three consecutive captions shared an 804px pill). We hug per caption deliberately.
- Measurement toolchain: no system ffmpeg/Python here, so frames were decoded with a hand-rolled PNG decoder in Node (`zlib` + unfilter) and fonts were fitted in a throwaway static-server page driven by the Browser pane. See [[gadzhi-template-spec]] for the ffmpeg limits.
