---
name: kinetic-template-status
description: "Kinetic (kinetic-typography) caption template — built 2026-08-08, faithful first version, verified via render; per-word role model + concurrent-session caveat"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38e27b2a-5090-47f2-9f7b-c2da2c48d56a
  modified: 2026-08-08T12:31:36.880Z
---

**Kinetic 1** — a kinetic-typography caption template (Alex-style red/white poster look), built 2026-08-08. Reverse-engineered from reference reels in `remotion/public/kinetic 1/`. Related: [[caption-ai-decision-seams]], [[captions-remotion-architecture]], [[gadzhi-template-spec]] (previous template).

## What it does
Words ACCUMULATE one by one into a top-anchored flowing block, then clear per phrase. Each word carries a semantic ROLE (`variant`) Claude assigns:
- **base** — connective text: Montserrat 600, small, white, pops in.
- **punch** — the shouted keyword: Anton heavy UPPERCASE, big, accent red, WIPES on left→right.
- **elegant** — stylistic word: Playfair Display *italic*, medium, red or white, slides/fades up.
COLOUR rides on `emphasis` (accent red vs white), independent of role — so a red italic word is elegant+emphasis. Signature red measured off footage ≈ `#c01f1a`.

## ⚠️ Revised 2026-08-08 to match "sample 1" (the authoritative reference)
The user replaced the reference folder with clean `sample 1..5.mp4` and said: match SAMPLE 1 exactly; if a sample differs, stick to sample 1. Sample 1's look differs from the first batch (the "double your VIEWS" clips):
- Emphasis (`punch`) is NOT Anton condensed uppercase. It is the SAME sans family as base (Montserrat), just **bold (800) + red + ~1.3x bigger**, natural case. No uppercase, no condensed face.
- Colour: `emphasis:true` → red; a few bold words stay WHITE (`emphasis:false`, e.g. "correctly,"/"and").
- `elegant` = italic serif (Playfair) for ONE stylistic word (often the phrase's final noun: "comment", "hook").
- Motion: ONE shared entrance for every word = Shiny-style **slide + fade with easing** (default up, ~3.5% distance, smooth). NO pop, NO wipe (those were removed).
- Position: block top-anchored ~38% (upper-middle), centred. Red measured ≈ `#b02020` (default `#b81f1c`).
- Segments: one spoken phrase/clause each, ~3-7 words, build word-by-word.
- Validated: transcribing+enriching sample 1 itself, Claude picks the SAME emphasis words the creator did (FUCK/WRITE/GOOD/TRIPLE red, CORRECTLY white, hook/comment elegant) — deliberate, not random.
- Studio's Kinetic composition default `src` now points at `kinetic-clean.mp4` (clean sample-video + kinetic enrichment) so Studio shows the real look, not flat all-base text. Local demo file, not committed.

## Multi-shape enriched format + Studio stale-cache gotcha (2026-08-08)
- The parallel session changed the enriched sidecar to hold ALL template variants in ONE file: `{ language, segments (default), variants: { hormozi, shiny, gadzhi, kinetic }, translation }`. `CaptionedVideo` now takes a `shape` prop and loads `enriched.variants[shape] ?? enriched.segments`. `sample-video.enriched.json` has a good `variants.kinetic` matching its own audio ("Using Remotion's TikTok…"). Root's Kinetic composition uses `SAMPLE_VIDEO` so captions MATCH the speaker.
- DO NOT demo the template by pairing one clip's footage with another clip's words (I did this with `kdemo1` = sample-video footage + sample-1 words → captions didn't match the speaker; user flagged it as broken). Deleted. Any demo must use a clip WITH ITS OWN transcription.
- STALE CACHE: Remotion Studio caches the fetched `.enriched.json`; after the file changes it can keep rendering the OLD/default segmentation (looked like flat base text, no supersize/red). Fix = HARD RELOAD the Studio tab (location.reload). The `remotion still/render` path always reads fresh from disk — use it to verify, not just Studio.
- To apply to ANY video: drop `x.mp4` in public/, `node transcribe.mjs public/x.mp4` (ElevenLabs) → `node enrich.mjs public/x.json` (Claude; emits variants incl. kinetic) → point a Kinetic composition/clip at it. The template captions that video's OWN words.

## Architecture (the new seams)
- `types.ts`: added optional `variant?: "base"|"punch"|"elegant"` to `EnrichedWord` (optional → other templates/docs untouched).
- `enrich.mjs`: new `--shape=kinetic`. `buildOutputSchema(shape)` adds a required `variant` enum to the word schema ONLY when a shape declares `variants`. `buildEnriched` carries `variant` through. Use `--model=claude-sonnet-5` — role assignment is much better than Haiku. Verified on the demo clip: sensible base/punch/elegant split.
- `fonts.ts`: added **Playfair Display** (Google font, loaded italic 500/700) for the elegant role.
- `PageKinetic.tsx`: reuses Shiny's `ENTRANCE_VECTOR`/`makeEntranceEasing`/`directionEnum`/`easingTypeEnum`/`groupWordsIntoBlocks`, plus the font-slot system (3 slots: base/punch/elegant, each uploadable). Entrance modes per role: `pop` (overshoot settle) / `fade` / `slide` (dir+distance) / `wipe` (clip-path inset L→R). Sizes are % of frame width. Own `segmentsToBlocks` that CARRIES variant (Shiny's `enrichedToBlocks` drops it).
- Registered in `playground/styles.ts` (documentDriven) and `Root.tsx` (Kinetic composition, singleSurface, defaults spread from `KINETIC_DEFAULTS`).

## How to preview
- Demo clip already prepared: `public/kinetic-demo.mp4` (copy of "how to double your views…") + `kinetic-demo.json` + `kinetic-demo.enriched.json` (kinetic shape).
- Render a still sequence: `node_modules/.bin/remotion render Kinetic <outdir> --props='{"src":"kinetic-demo.mp4"}' --frames=24-64 --sequence --image-format=png`. CaptionedVideo auto-loads `<src>.enriched.json`.
- NOTE: the reference clips already have their OWN captions burned in, so rendering over them shows both. Over a clean client video, the caption sits alone in the upper third. Verified faithful (matches the reference "double / your VIEWS" frame closely).

## Status / next
- Faithful FIRST version done & verified; user wanted to "add our input after". NOT committed yet.
- Future/editor overrides the user asked for (per the answers): change colours, change per-word animation, emphasise, make words bigger/smaller — the data model has room (`variant`, `emphasis`); per-word `scale`/`anim` overrides + editor UI are a follow-up.

## ⚠️ Concurrent-session caveat (important before committing)
A parallel Claude session has been editing this same repo. As of 2026-08-08 it left an UNFINISHED "sweep animation" feature that does NOT typecheck: `src/CaptionedVideo/styles/PageHormozi.tsx`, `PageShiny.tsx`, and the Shiny/Highlight composition defaults in `Root.tsx` (missing `animate/speed/bounce` sweep props, unused vars). These are TYPE errors only — Vite/Remotion bundlers type-erase, so the playground and `remotion render` still work. My kinetic files typecheck clean on their own. Do NOT try to fix their sweep work (collision risk); when committing kinetic, stage only kinetic files by pathspec (like the Gadzhi commit `97b682d`), and expect `tsc` to still report their errors until they finish.
