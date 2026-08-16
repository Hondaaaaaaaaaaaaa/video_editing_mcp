---
name: arabic-rendering-working
description: Arabic captions render correctly in the Remotion templates — the technical rules that make it work (and what breaks it)
metadata: 
  node_type: memory
  type: project
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
  modified: 2026-07-28T05:38:12.059Z
---

Validated 2026-07-28 on a real GCC-dialect clip (`public/Copy of short #15 CTA #1.mp4`): the full pipeline renders correct Arabic captions end-to-end — Scribe → Caption JSON → Hormozi template → joined RTL Arabic with English code-switch words kept in Latin. This is the core competitive advantage (Submagic/Captions.ai render Arabic broken). See [[transcription-architecture-decision]], [[captions-remotion-architecture]].

**The rules that make Arabic render correctly (empirically confirmed):**
- **Word-level animation is SAFE; letter-level BREAKS joining.** Wrapping each WORD in its own span keeps the cursive shaping run intact. Never `text.split('')` Arabic into per-letter styled/inline-block spans — it collapses words to disconnected isolated letters. (Typewriter template = letter-level = will break Arabic; Hormozi/Shiny = word-level = safe.)
- **`dir="auto"`** on each caption line → Arabic lays out RTL, English LTR, and mixed lines are ordered by the Unicode bidi algorithm (English words inside Arabic stay readable). Added to `PageHormozi` line rows.
- **Word spacing must be a real flex `columnGap`, NOT CSS `word-spacing`.** Scribe returns clean space-less words, and `word-spacing` only affects literal space chars → words touched. Fixed in PageHormozi: `columnGap: fontSize * wordSpacing` px on the line row.
- **Chrome/HarfBuzz shapes Arabic correctly out of the box** — the advantage comes free from Remotion rendering in Chromium (vs ffmpeg drawtext, which doesn't shape Arabic).

**Fonts:** custom `.ttf` files go in `remotion/public/fonts/`. Currently `KufyanArabic-Medium.ttf` (Kufi display, a bit light for big captions — a heavier 800-900 Arabic weight like Cairo/Tajawal would be better). Loaded in `styles/fonts.ts` via the native FontFace API (no @remotion/fonts pkg), guarded for SSR, awaited in `loadFonts()`; added to the `FONT_FAMILIES` picker as "Kufyan Arabic".

**Still TODO for polish:** swap `-webkit-text-stroke` → fill+drop-shadow for Arabic (stroke makes seams at cursive joins); heavier Arabic font; the Claude layer to fix the `الـ-digital` article-dash seams Scribe leaves. Related: [[caption-ai-decision-seams]].
