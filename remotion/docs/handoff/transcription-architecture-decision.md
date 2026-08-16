---
name: transcription-architecture-decision
description: "Transcription pipeline plan — ElevenLabs Scribe for all languages behind a transcribe(audio,lang) interface, then a Claude cleanup/segmentation pass"
metadata: 
  node_type: memory
  type: project
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
  modified: 2026-07-28T21:25:47.758Z
---

Decided 2026-07-28, after deep research into the 2026 ASR landscape. The product is **Arabic-first** (Egypt + GCC creators), English second, more languages/dialects later. See [[vemcp-saas-goal]].

**Pipeline:**
```
audio → transcribe(audio, lang)  → Claude pass  → captions JSON → Remotion templates
```
- **transcribe():** a swappable per-language interface. Decision: use **ElevenLabs Scribe v2 for ALL languages** (English, Arabic, everything) — one vendor, precise NATIVE word timestamps (so no separate forced-alignment stage), diarization, code-switching leader, managed/scalable. ~$0.22/hr.
- **Claude pass (mandatory — the quality moat):** ONE call does spelling correction + Arabic punctuation (،؟) + segmentation (semantic line/segment split) + emphasis + translation. Evidence: LLM post-correction cuts Arabic ASR error ~20% (MSA) / ~9% (dialect). This is where "almost perfect" is won. Replaces the count-based `decideSentenceSplit` / `decideEmphasis` seams (see [[caption-ai-decision-seams]]).
  - **Built as `remotion/enrich.mjs`** (raw fetch, `.env` for `ANTHROPIC_API_KEY`, `npm run enrich`). Reads a Scribe caption `.json`, returns `{language, segments:[{lines:[{align, words:[{i,text,emphasis}]}]}], translation}` keyed by original word index so timestamps are preserved; writes `<name>.enriched.json`.
  - **Model decision (2026-07-28): `claude-haiku-4-5`** — validated on the GCC clip, ~$0.014/clip vs opus-5's ~$0.17 (opus-5 burns ~4k thinking tokens; Haiku has no thinking). MODEL is a one-line const swap (Sonnet-5 for more polish). **Structured outputs (`output_config.format` + JSON schema) is REQUIRED** — without it Haiku emits malformed JSON. Haiku 4.5 supports structured outputs.
  - Still TODO: wire the templates to CONSUME `enriched.json` (segments+emphasis) instead of the count-based `groupWordsIntoBlocks`; then face-avoidance layout (OpenCV, phase 2).

**Why not the alternatives (constraints: must give timestamps + scale + Arabic dialects + code-switching):**
- **Whisper** — free/excellent English (via Groq large-v3, $0.04-0.11/hr) BUT ~37% WER on Arabic, 56% Saudi dialect, and LOOSE timestamps (needs alignment). Kept as a FUTURE cost-optimization for the English branch only (flip via the interface, no rewrite). Note: local whisper.cpp is dev-only (slow on CPU); production Whisper = Groq.
- **Cohere Transcribe Arabic** — best RAW Arabic words (free, Apache-2.0) BUT no timestamps + must self-host on GPU + canonicalizes spelling. Fails the timestamp/scale requirements → excluded.
- **Pure-Arabic models are WRONG for this audience** — creators code-switch (mix English words), and a pure-Arabic model writes English words in Arabic letters (كونتنت instead of "content"). Need a code-switching model → Scribe.
- Speechmatics = the cheaper Arabic alternative ($0.129/hr + 50 free hrs) if Scribe cost ever matters.

**Config already fixed:** `remotion/whisper-config.mjs` now uses `large-v3` (was `medium.en`) + `WHISPER_LANG=null` (auto-detect) — the `.en` model couldn't do Arabic at all.

**Pending:** bake-off testing Scribe on the user's real Egyptian/Gulf clips before final commit (they tested Cohere/Whisper/Speechmatics but NOT Scribe). Needs an ElevenLabs API key (→ `remotion/.env`, gitignored) + Anthropic key. Related: [[captions-remotion-architecture]].
