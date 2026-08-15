// The Claude "enrich" pass — the quality moat of the caption pipeline.
//
// Takes raw ASR caption words (from transcribe.mjs / Scribe) and, in ONE Claude
// call, produces a corrected + structured result:
//   - fixes spelling/orthography (Arabic hamza, ة/ه, ى/ي, the "الـ-word" seams)
//   - applies correct punctuation (Arabic ، ؟ ؛ where appropriate)
//   - breaks the transcript into CAPTIONS purely BY MEANING (no word counts)
//   - marks the emphasis word(s) per caption (the payload word, not function words)
//   - tags each word's TYPE ROLE (base / punch / elegant) for kinetic templates
//   - provides a natural translation
// Word TIMESTAMPS are preserved: Claude only regroups/edits text and references
// each original word by its index, so nothing ever desyncs.
//
// SPLIT OF RESPONSIBILITY (the thing that makes captions consistent):
//   Claude decides MEANING — where one idea ends and the next begins. Once, for
//   the whole video. Every template shares that one answer, so a caption is the
//   same words no matter which template is painting it.
//   CODE decides LAYOUT — how each caption's words stack into that template's
//   lines (2 for Gadzhi/Hormozi, 3 for Shiny/Kinetic). Deterministic, free, and
//   it cannot move a word into the wrong caption because it never touches the
//   caption boundaries. The template then MEASURES the real rendered width and
//   shrinks to fit, which is why there are no word-count rules anywhere here.
//
// This is the swappable LLM seam — Claude today, swap the provider later.
//
// Usage:
//   node enrich.mjs "public/clip.json"                # writes clip.enriched.new.json
//   node enrich.mjs "public/clip.mp4"                 # (resolves to clip.json)
//   node enrich.mjs "public/clip.json" --overwrite    # replaces clip.enriched.json
//
// Writes the enriched document and prints a raw-vs-corrected comparison plus
// every template's captions, so the segmentation can be eyeballed before use.

import path from "path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
// The LAYOUT half — how each template fits Claude's captions on screen. Pure
// code, and re-runnable on its own via relayout.mjs.
import { TEMPLATES, DEFAULT_TEMPLATE, layoutFor } from "./layout.mjs";

// --- .env loader (same as transcribe.mjs). Runs FIRST so the config below can
// read ENRICH_MODEL / ANTHROPIC_API_KEY out of remotion/.env. ---
const loadEnv = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
};
loadEnv();

// ---------------------------------------------------------------------------
// Config. MODEL is the one knob to trade quality for cost:
//   claude-opus-5    — best quality
//   claude-sonnet-5  — near-best, cheaper
//   claude-haiku-4-5 — cheapest, for high-volume bulk correction
// ---------------------------------------------------------------------------
// Overridable per run with `--model=claude-sonnet-5` (or ENRICH_MODEL in .env).
// Segmentation is the one stage where a stronger model visibly pays off: the
// whole job is now a judgement call about meaning, with no count rule to lean on.
const modelArg = process.argv.find((a) => a.startsWith("--model="));
const MODEL =
  (modelArg && modelArg.split("=")[1]) || process.env.ENRICH_MODEL || "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---------------------------------------------------------------------------
// JSON Schema for structured outputs — the API constrains the model to this
// shape, so the response is ALWAYS valid JSON. Note there are no `lines` here
// any more: Claude returns a FLAT word list per caption and code does the rest.
// ---------------------------------------------------------------------------
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    language: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          words: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                i: { type: "integer" },
                text: { type: "string" },
                emphasis: { type: "boolean" },
                variant: { type: "string", enum: ["base", "punch", "elegant"] },
                color: {
                  type: "string",
                  enum: ["base", "key", "loud", "positive", "wild", "cool"],
                },
              },
              required: ["i", "text", "emphasis", "variant", "color"],
            },
          },
        },
        required: ["words"],
      },
    },
    translation: { type: "string" },
  },
  required: ["language", "segments", "translation"],
};

// ---------------------------------------------------------------------------
// The instructions Claude follows. This is the seam where all the caption
// CONTENT decisions live — spelling, caption breaks, emphasis, translation.
// There is deliberately NOTHING here about line counts or words per line: those
// are layout, and layout is code's job (see TEMPLATES / splitInto above).
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert multilingual subtitle editor for short-form social video captions (TikTok/Reels), with deep Arabic expertise including Egyptian and Gulf dialects.

You receive an ordered ASR word list from speech-to-text, each word with an index. The transcription has errors. Produce ONE JSON object that corrects and structures it for on-screen captions.

RULES:
1. SPELLING/ORTHOGRAPHY: Fix errors. Arabic: correct hamza seats (أ إ آ ء ؤ ئ), taa marbuta ة vs haa ه, yaa ي vs alef maqsura ى, and fix ASR artifacts like an article glued to a word with a dash. Fix obvious mis-hearings only when context makes the intended word unambiguous; otherwise keep the ASR word.
2. DIALECT: Keep the words AS SPOKEN. Do NOT convert Egyptian/Gulf dialect to Modern Standard Arabic. "عايز/عاوز", "الحين", "بختار", "مو", "بس" stay as-is (spelled correctly).
3. CODE-SWITCHING: Keep English (or other Latin-script) words that the speaker actually said in Latin script. Never transliterate a spoken English word into Arabic letters.
4. PUNCTUATION: Add natural punctuation. For Arabic use Arabic marks: comma ، question mark ؟ semicolon ؛. Do NOT add tashkeel/diacritics.

5. CAPTION BREAKS — THE MOST IMPORTANT RULE, AND YOUR MAIN JOB.
   Split the transcript into captions. A caption is ONE screen of text.
   You are deciding MEANING ONLY. You are NOT laying out lines — a separate
   layout step stacks each caption into whatever line shape the template needs
   and shrinks the text to fit. So NEVER think about how many words fit, how
   long a caption is, or how many lines it will take. Think only about ideas.

   a. ONE COMPLETE IDEA PER CAPTION. A caption must read on its own as a whole
      thought — a clause, a phrase, a statement. When the idea is finished, the
      caption is finished.
   b. THERE IS NO MINIMUM AND NO MAXIMUM LENGTH. A caption may be two words if
      that is the whole idea ("Three things."). It may be ten words if the idea
      genuinely runs that long. NEVER pad a caption to make it longer, and never
      cut an idea short to make it smaller.
   c. NEVER MERGE TWO IDEAS. Start a NEW caption before a new subject+verb
      ("you can …", "he said …"), before a coordinating conjunction that opens a
      new clause (and / but / so / because / if / when / و / لكن / لأن / عشان),
      and ALWAYS after a sentence-ending mark (. ! ? ؟) — a sentence must never
      end in the middle of a caption.
      WORKED EXAMPLE: "Using Remotion's TikTok template you can create engaging
      reels and TikToks by transcribing your audio using Whisper CPP" becomes
      FOUR captions:
        1) "Using Remotion's TikTok template,"
        2) "you can create engaging reels and TikToks"
        3) "by transcribing your audio using Whisper CPP"
      WRONG: "Using Remotion's TikTok template, you" — "you" opens a new clause.
      WRONG: "using Whisper" + "CPP" — a name must never be split across captions.
   d. KEEP MEANING UNITS WHOLE inside one caption: a name or product ("Whisper
      CPP", "After Effects"), a number and its unit, an Arabic article ال and its
      noun, an idafa (إضافة), a preposition and its object.
   e. Follow the speaker's natural breath and rhythm. Where they pause, the
      caption usually ends.

6. EMPHASIS: Mark the "payload" word(s) per caption as emphasis:true — the words a viewer's eye should land on. PREFER THE CONCRETE PAYLOAD: the specific noun/object being talked about, a number/money figure, a name, a superlative/contrast word, or the outcome. DEPRIORITIZE generic action verbs (make, get, do, use, create, build, go, have, want, need) and helper/function words (في، من، و، على، the، a، of، to، is، you، can) — emphasize the concrete thing over the generic verb (e.g. "you can create engaging reels" → emphasize "engaging reels", NOT "create"; "make it 100 times better" → "100"/"better", NOT "make"). TEST: reading only the emphasized words should still convey the point. Most words are emphasis:false; some captions have zero.

7. WORD ROLE ("variant") — tag EVERY word with exactly one. Kinetic-typography templates map the role to a font/size/entrance; every other template ignores it, so this never changes their look.
   - "punch"   = a KEY word: the concrete noun/object, a number, a name, or the outcome. Usually 1-3 per caption. Do NOT punch a generic verb (make, get, do, use, create, build) when there is a concrete noun to carry the point. Do NOT punch filler (the, a, of, to, is, do, you, how, so, and, if).
   - "elegant" = at most ONE per caption, rendered in an italic serif for flavour — the single most "quotable" noun or verb, often the last word of the phrase. Optional; many captions have none. Never a filler word.
   - "base"    = everything else. Most words are base.
   Keep NATURAL casing in "text" — templates uppercase at render time if they want to.

7b. WORD COLOUR ("color") — tag EVERY word with exactly one. SEMANTIC, not decorative: it says what the words MEAN. The Speed template paints it; other templates ignore it.

   COLOUR A PHRASE, NOT A WORD. The unit is a contiguous RUN of words that belong together — give every word in the run the SAME role. In the reference edits it is "DESTROY YOU", "MET YOU", "SOUTH DAKOTA", "RANDOM RESTAURANT", or an entire line like "MY MAN BE CAREFUL". A lone coloured word happens, but a phrase is the norm. Never colour a function word ("the", "of", "you") that is stranded outside its phrase.

   ACCENT NEARLY EVERY CAPTION. Most captions carry ONE accented phrase, with the rest of the caption "base". A caption with nothing accented should be the exception, not the rule — this look is loud and constantly coloured.

   ONE ACCENT ROLE PER CAPTION. Do not mix two different accent roles inside a single caption.

   VARY IT. Do not give two captions in a row the same role. Move through the roles across the video so the colour keeps changing.

   - "base"     = ordinary words — still the majority of words overall.
   - "key"      = the thing being named: concrete noun/object, a number or money figure, a proper name, a place, a product.
   - "loud"     = excitement, disbelief, shouting, a threat, a dare. THE MOST-USED ACCENT — "NO WAY", "THAT'S CRAZY", "MY MAN BE CAREFUL", "DESTROY YOU". Note this is about VOLUME AND ENERGY, not about bad news.
   - "positive" = good news landing: approval, success, praise, a reveal going well.
   - "wild"     = playful, absurd or cheeky flavour.
   - "cool"     = interjections, sounds, laughs and asides ("HA-", "UHM", "WAIT").

8. TRANSLATION: Provide a natural, fluent English translation of the whole transcript (colloquial where the source is colloquial). If the source is already English, translate to Arabic instead.
9. WORD INDICES: Reference every original word exactly once by its index "i", in ascending order, across all captions. Do not add, drop, or reorder words. "text" is the CORRECTED form of that word.

OUTPUT: Return ONLY a JSON object, no prose, no markdown fences:
{
  "language": "<ISO code, e.g. ar or en>",
  "segments": [
    { "words": [ { "i": 0, "text": "...", "emphasis": false, "variant": "base", "color": "base" } ] }
  ],
  "translation": "..."
}`;

// ---------------------------------------------------------------------------
// VALIDATION — the deterministic half of quality.
//
// Only checks things CODE CAN ACTUALLY VERIFY. The old word-per-line caps are
// gone (they were the thing corrupting the meaning boundaries); what is left is
// structural truth: every word used exactly once in order, no empty caption, and
// no sentence ending in the middle of a caption. Violations are fed straight
// back to the model as the retry message.
// ---------------------------------------------------------------------------
const MAX_RETRIES = 2;

const validateSegments = (parsed, rawWords) => {
  const out = [];
  const segs = Array.isArray(parsed?.segments) ? parsed.segments : [];
  if (!segs.length) return ["no captions were returned."];

  const indices = segs.flatMap((s) => (s.words ?? []).map((w) => w.i));
  if (indices.length !== rawWords.length) {
    out.push(
      `you used ${indices.length} words but the transcript has ${rawWords.length} — every original word must appear exactly once.`,
    );
  } else {
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i) {
        out.push(
          `word indices break at position ${i} (got ${indices[i]}) — keep every index in ascending order with none missing or repeated.`,
        );
        break;
      }
    }
  }

  segs.forEach((seg, i) => {
    const ws = seg.words ?? [];
    const show = `caption ${i + 1} ("${ws.map((w) => w.text).join(" ")}")`;
    if (!ws.length) {
      out.push(`caption ${i + 1} is empty — remove it.`);
      return;
    }
    ws.forEach((w, wi) => {
      // A sentence-final mark anywhere but on the last word means the next
      // sentence has been pulled onto the same screen.
      if (wi < ws.length - 1 && /[.!?؟]["')\]]?$/.test(w.text ?? "")) {
        out.push(`${show} ends a sentence at "${w.text}" but keeps going — start a NEW caption right after it.`);
      }
    });
  });
  return out;
};

// ---------------------------------------------------------------------------
// Call Claude with the raw words, return the parsed enrichment. A structurally
// invalid answer is fed back for up to MAX_RETRIES corrections before we accept
// the best attempt we got.
// ---------------------------------------------------------------------------
const callClaude = async (key, messages) => {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages,
      // Guarantees the response matches OUTPUT_SCHEMA — valid JSON on any model.
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();

  if (data.stop_reason === "refusal") {
    throw new Error("Claude refused this request (stop_reason: refusal).");
  }
  // Pull the text out of the content blocks (skip thinking blocks).
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  // Strip accidental ```json fences if present.
  const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Could not parse Claude JSON: ${e.message}\n---\n${text.slice(0, 500)}`);
  }
  return { parsed, raw: jsonStr, usage: data.usage };
};

const enrichWithClaude = async (words, languageHint) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing — add it to remotion/.env");

  const wordList = words.map((w, i) => ({ i, text: w.text }));
  const userContent =
    `Detected language: ${languageHint || "unknown"}\n` +
    `Words (index -> text):\n${JSON.stringify(wordList)}`;

  const messages = [{ role: "user", content: userContent }];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let best = null;
  let bestViolations = Infinity;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { parsed, raw, usage: u } = await callClaude(key, messages);
    usage.input_tokens += u?.input_tokens ?? 0;
    usage.output_tokens += u?.output_tokens ?? 0;

    const violations = validateSegments(parsed, words);
    if (violations.length < bestViolations) {
      best = parsed;
      bestViolations = violations.length;
    }
    if (!violations.length) return { parsed, usage };

    if (attempt === MAX_RETRIES) {
      console.warn(`  ! kept the best of ${MAX_RETRIES + 1} attempts with ${bestViolations} violation(s).`);
      break;
    }
    console.warn(`  ~ ${violations.length} violation(s), re-asking …`);
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          `That breaks the caption rules. Fix ONLY what is listed — keep the same corrected word text, the same word indices, and the same translation.\n\n` +
          `Violations:\n${violations.map((v) => `- ${v}`).join("\n")}\n\n` +
          `Return the complete corrected JSON object.`,
      },
    );
  }
  return { parsed: best, usage };
};

// ---------------------------------------------------------------------------
// Reconstruct: attach original timestamps to corrected words (by index), then
// lay the SAME captions out once per template.
// ---------------------------------------------------------------------------
const buildCaptions = (rawWords, parsed) =>
  (parsed.segments || []).map((seg) =>
    (seg.words || []).map((w) => {
      const orig = rawWords[w.i] || {};
      const out = {
        text: w.text,
        emphasis: !!w.emphasis,
        startMs: orig.startMs ?? 0,
        endMs: orig.endMs ?? 0,
      };
      if (w.variant) out.variant = w.variant;
      // Only carried when Claude actually assigned one; templates that read it
      // fall back to `emphasis` when it is absent, so older documents still work.
      if (w.color) out.color = w.color;
      return out;
    }),
  );

const buildDocument = (captions, parsed) => ({
  language: parsed.language || null,
  // Fallback for any template without its own entry — same captions, 2 lines.
  segments: layoutFor(captions, TEMPLATES[DEFAULT_TEMPLATE]),
  // Every template, generated here. Nothing to merge by hand, nothing to forget.
  variants: Object.fromEntries(
    Object.entries(TEMPLATES).map(([name, tpl]) => [name, layoutFor(captions, tpl)]),
  ),
  translation: parsed.translation || "",
});

const showSegments = (segments) =>
  segments
    .map((s, i) => {
      const body = s.lines
        .map((l) => l.words.map((w) => (w.emphasis ? `*${w.text}*` : w.text)).join(" "))
        .join("  /  ");
      // Only annotate captions that had to be shown across more than one screen.
      const tag = s.parts > 1 ? `   <- caption ${s.ideaIndex + 1}, screen ${s.part + 1}/${s.parts}` : "";
      return `  ${String(i + 1).padStart(2)}. ${body}${tag}`;
    })
    .join("\n");

// --- CLI ---
const target = process.argv[2];
if (!target) {
  console.error('Usage: node enrich.mjs "public/clip.json" [--overwrite]');
  process.exit(1);
}
const OVERWRITE = process.argv.includes("--overwrite");
const jsonPath = target.replace(/\.(mp4|webm|mkv|mov|m4a|mp3|wav)$/i, ".json");
const full = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
if (!existsSync(full)) {
  console.error(`Caption file not found: ${full} (run transcribe first)`);
  process.exit(1);
}

const rawCaptions = JSON.parse(readFileSync(full, "utf8"));
const rawWords = rawCaptions.map((c) => ({ text: c.text, startMs: c.startMs, endMs: c.endMs }));
console.log(
  `Enriching ${path.basename(full)} — ${rawWords.length} words via ${MODEL} — meaning-based caption breaks, layout for ${Object.keys(TEMPLATES).length} templates …`,
);

const { parsed, usage } = await enrichWithClaude(rawWords, undefined);
const captions = buildCaptions(rawWords, parsed);
const doc = buildDocument(captions, parsed);

const outPath = full.replace(/\.json$/i, OVERWRITE ? ".enriched.json" : ".enriched.new.json");
writeFileSync(outPath, JSON.stringify(doc, null, 2));

// --- readable before/after ---
console.log(`\n===== RAW (ASR) =====`);
console.log(rawWords.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim());
console.log(`\n===== CORRECTED (Claude) =====`);
console.log(captions.flat().map((w) => w.text).join(" ").replace(/\s+/g, " ").trim());

console.log(`\n===== CAPTION BREAKS (${captions.length}) — shared by every template =====`);
captions.forEach((ws, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${ws.map((w) => w.text).join(" ")}`);
});

for (const name of Object.keys(TEMPLATES)) {
  console.log(`\n===== ${name.toUpperCase()} (${TEMPLATES[name].maxLines} line max) =====`);
  console.log(showSegments(doc.variants[name]));
}

if (doc.translation) {
  console.log(`\n===== TRANSLATION =====\n${doc.translation}`);
}
console.log(
  `\nWrote ${path.basename(outPath)}  (in ${usage.input_tokens} / out ${usage.output_tokens} tokens)`,
);
if (!OVERWRITE) {
  console.log(`Nothing was overwritten. Re-run with --overwrite to replace the live .enriched.json.`);
}
