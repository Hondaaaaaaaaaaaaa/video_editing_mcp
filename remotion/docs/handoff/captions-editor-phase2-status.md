---
name: captions-editor-phase2-status
description: "RESUME POINT (2026-07-30) — caption editor phase status, how to run, file map, exact next steps"
metadata: 
  node_type: memory
  type: project
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
  modified: 2026-08-01T16:05:48.924Z
---

**Resume point as of 2026-07-30.** Branch `feature/captions-remotion`. Continue the caption-editor build from here. See [[caption-ai-decision-seams]] for the confirmed architecture and [[captions-remotion-architecture]] / [[vemcp-saas-goal]] for the big picture.

## Phase status (3-phase plan)
- **Phase 1 — data model + rendering: DONE**, committed `d333d3c`. CaptionDoc + per-caption `id`/`edited`; templates render the document's lines as authored; N-line color swap in Hormozi.
- **Phase 2 — editor UI: DONE & COMMITTED.** `5a4e656` (slice 1), `45e1ab0` (move word ←/→ + Hormozi size/color fixes), `cd4e18b` (FULL BLOCK CONTROL: add/edit/remove word, add caption block, line break, per-word ms timing editor). Verified via Node unit test + browser.
- **Phase 3 — per-caption "AI re-segment" button: NOT STARTED.** Claude redoes one caption on demand.
- Competitor pain research delivered as an Artifact (caption-craft edition): https://claude.ai/code/artifact/12cdbadd-7af9-4760-b2bd-a2afa88b4635

## How to run (this machine)
- Always prefix node/npm/remotion with `NODE_OPTIONS=--use-system-ca` (TLS) — see [[node-tls-system-ca]].
- Remotion Studio: `cd remotion && NODE_OPTIONS=--use-system-ca npm run dev` → http://localhost:3000 (open **Hormozi**).
- Editor playground: `cd remotion && NODE_OPTIONS=--use-system-ca npm run playground` → http://localhost:3100 → **Caption Editor** tab (Vite; browser screenshots need the pane displayed, else use read_page).
- Pipeline: `node transcribe.mjs "public/x.mp4"` then `node enrich.mjs "public/x.json" --shape=hormozi|shiny|minimal`.

## Phase 2 file map (all under remotion/playground/)
- `captionDoc.ts` — pure edit ops (return new CaptionDoc, preserve word timestamps, mark `edited:true`): `toggleEmphasis`, `breakLineBefore`, `mergeLineUp`, `splitCaptionBefore`, `mergeCaptionWithNext`, `moveWordsToNextSentence`/`moveWordsToPrevSentence` (word + rest → adjacent caption), `setLineCount`, `withIds`, and the block-control ops: `removeWord`, `editWordText`, `setWordTime`, `insertWord` (before/after, interpolated timing), `addCaptionAfter` (s=-1 = start; borrows time from prev caption when contiguous).
- `EditorPreview.tsx` — live preview = real template (Hormozi/Shiny) fed the in-memory doc via `segments`.
- `CaptionEditor.tsx` — caption cards + clickable word chips (double-click / ⏎ to edit text). Word action bar: ←/→ move to prev/next sentence, ↩ line break (⌘B), ★ emphasis (E), ✎ edit, ＋ word (⌘I), 🗑 delete (⌘D), start/end **ms timing inputs** (commit on blur, keyed by selection). Per-caption: 1/2/3 lines, ⇊ merge-next, ＋ add caption after; "＋ Add caption at start". Undo/redo (⌘Z/⌘Y). Export JSON.
- `index.tsx` — tab shell: Caption Editor | Style Tuner.
- `styles.ts` — style registry; entries carry `documentDriven` and `EDITOR_STYLES` lists only those (Hormozi, Shiny) — the per-page styles can't be driven by the editor.
- `useHistory.ts` — generic undo/redo. `push` = edit (undo step), `replace` = selection only (no step), `reset` = new doc. Doc + selection are ONE state so undo restores the caret.
- `vite.config.mts` — dev endpoints `/api/clips` (lists every `<name>.enriched.json` in public/ with a matching video) and `/api/file?name=…` (range-capable streamer). The name goes in a QUERY param because Vite's static serve cannot serve clip names containing `#` — the fragment never reaches the server.

## Exact next steps
1. **Styling extras** (deferred, from the caption-craft research): per-word emoji, Supersize, draggable/subject-aware caption position, transitions. User chose "freedom primitives first" — those are now done, so styling is next candidate.
2. **Phase 3**: per-caption AI re-segment button (one Claude call re-splits just the selected caption).
3. Emit ALL shape variants in ONE enrich call into one file (today the enriched file holds one shape).
4. **Main `tsc` is RED**: `src/Root.tsx(40)` imports `GADZHI_DEFAULTS` but never uses it (parallel Gadzhi work). Playground tsc is clean. Fix the unused import (or use it) to green the main build.
5. Playground has 2 pre-existing eslint errors (`index.tsx` unused `label`, `styles.ts` unused `_src`) — `npm run lint` only covers `src/`.
- Confirmed editor decisions: manual line break YES (⌘B, distinct from move-to-sentence); new word/block timing auto-interpolated; per-word ms time editing exposed NOW; freedom primitives before new templates.

## Standing reminders
- **Rotate BOTH API keys** (ElevenLabs + Anthropic) — they were pasted in chat earlier. Keys live only in gitignored `remotion/.env`; never commit or paste them.
- Not committed on purpose: 114MB `Copy of short #15 CTA #1.mp4`, `Hormozi.mp4`, reference PNG/JPGs, the Arabic clip's json/enriched, `skills-lock.json`.
