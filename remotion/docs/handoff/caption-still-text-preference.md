---
name: caption-still-text-preference
description: Caption templates should render STILL text by default — no per-word entrance/build-up animation
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
---

The user does not want per-word entrance animation on caption templates — text should appear fully formed ("still") the moment a block/segment is spoken, not build up word-by-word.

**Why:** the per-word fade-in on the Hormozi template made the accent color look like it spread word-to-word; the user wants the color to read as a whole SENTENCE (line) at once. Stated 2026-07-17.

**How to apply:** default new caption templates to static text (each block appears complete when its Sequence starts). The Hormozi template had its entrance/easing schema + logic removed for this. Note: Typewriter is intentionally an animation and is exempt; confirm before stripping animation from existing templates (Shiny/Highlight) since it may be wanted there. Related: [[captions-remotion-architecture]], [[caption-ai-decision-seams]].

Also for Hormozi specifically: the two-line color model is one WHOLE line accent-colored (yellow) / one WHOLE line white — never per-word coloring. The highlight FOLLOWS THE SPOKEN LINE: line 1 is yellow while its words are spoken, then the highlight switches (quick/instant) to line 2 when its first word is reached — driven by caption timing (`switchFrame` in PageHormozi). Confirmed by analyzing the user's `remotion/public/Hormozi.mp4` reference (extracted frames with the Remotion-bundled ffmpeg at `node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe`, since it's the only ffmpeg here and lacks the `fps` filter — extract single frames by timestamp with `-ss T -frames:v 1`). Font: Montserrat, Title Case (not uppercase), stroke + shadow on. This REPLACED an earlier per-block alternation model.
