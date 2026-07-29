// The Claude "enrich" pass — the quality moat of the caption pipeline.
//
// Takes raw ASR caption words (from transcribe.mjs / Scribe) and, in ONE Claude
// call, produces a corrected + structured result:
//   - fixes spelling/orthography (Arabic hamza, ة/ه, ى/ي, the "الـ-word" seams)
//   - applies correct punctuation (Arabic ، ؟ ؛ where appropriate)
//   - groups words into on-screen SEGMENTS and LINES by MEANING (not by count)
//   - marks the emphasis word(s) per segment (the payload word, not function words)
//   - provides a natural translation
// Word TIMESTAMPS are preserved: Claude only regroups/edits text and references
// each original word by its index, so nothing ever desyncs.
//
// This is the swappable LLM seam — Claude today, swap the provider later.
//
// Usage:
//   node enrich.mjs "public/clip.json"     # enrich one caption file
//   node enrich.mjs "public/clip.mp4"      # (resolves to clip.json)
//
// Writes `<name>.enriched.json` and prints a raw-vs-corrected comparison.

import path from "path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config. MODEL is the one knob to trade quality for cost:
//   claude-opus-5    — best quality (default)
//   claude-sonnet-5  — near-best, cheaper
//   claude-haiku-4-5 — cheapest, for high-volume bulk correction
// ---------------------------------------------------------------------------
const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---------------------------------------------------------------------------
// TEMPLATE SHAPES — per-template segmentation targets (the "per-template" choice).
// Each template lays captions out differently, so Claude segments to fit the
// target shape: how many lines a caption may span and a soft cap on words/line.
// Selected with `--shape=<name>` (default hormozi). `minLines` lets short,
// complete ideas use fewer lines instead of being padded.
// ---------------------------------------------------------------------------
const SHAPES = {
  hormozi: { maxLines: 2, maxWordsPerLine: 4, note: "two stacked lines; the accent color moves top -> bottom, so 2 lines is ideal" },
  shiny: { maxLines: 3, maxWordsPerLine: 3, note: "small / BIG / small stagger, up to three short rows" },
  minimal: { maxLines: 1, maxWordsPerLine: 6, note: "a single row of a few words" },
};
const shapeArg = process.argv.find((a) => a.startsWith("--shape="));
const SHAPE_NAME = (shapeArg ? shapeArg.split("=")[1] : "hormozi").toLowerCase();
const SHAPE = SHAPES[SHAPE_NAME] || SHAPES.hormozi;

// JSON Schema for structured outputs — the API constrains the model to this
// shape, so the response is ALWAYS valid JSON (fixes cheap models emitting
// malformed JSON). additionalProperties:false + required are mandatory for
// structured outputs. Supported on Haiku 4.5 / Sonnet 5 / Opus 5 / etc.
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
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                align: { type: "string", enum: ["center", "left", "right"] },
                words: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      i: { type: "integer" },
                      text: { type: "string" },
                      emphasis: { type: "boolean" },
                    },
                    required: ["i", "text", "emphasis"],
                  },
                },
              },
              required: ["align", "words"],
            },
          },
        },
        required: ["lines"],
      },
    },
    translation: { type: "string" },
  },
  required: ["language", "segments", "translation"],
};

// --- .env loader (same as transcribe.mjs) ---
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
// The instructions Claude follows. This is the seam where all the caption
// "content decisions" live — spelling, segmentation, emphasis, translation.
// ---------------------------------------------------------------------------
const buildSystemPrompt = (shape) => `You are an expert multilingual subtitle editor for short-form social video captions (TikTok/Reels), with deep Arabic expertise including Egyptian and Gulf dialects.

You receive an ordered ASR word list from speech-to-text, each word with an index. The transcription has errors. Produce ONE JSON object that corrects and structures it for on-screen captions.

RULES:
1. SPELLING/ORTHOGRAPHY: Fix errors. Arabic: correct hamza seats (أ إ آ ء ؤ ئ), taa marbuta ة vs haa ه, yaa ي vs alef maqsura ى, and fix ASR artifacts like an article glued to a word with a dash (e.g. "الـ-digital" -> keep the article on the Arabic word and the English word separate: "الديجيتال" is wrong here — keep English words in Latin, so write it as the Arabic article + the Latin word naturally). Fix obvious mis-hearings only when context makes the intended word unambiguous; otherwise keep the ASR word.
2. DIALECT: Keep the words AS SPOKEN. Do NOT convert Egyptian/Gulf dialect to Modern Standard Arabic. "عايز/عاوز", "الحين", "بختار", "مو", "بس" stay as-is (spelled correctly).
3. CODE-SWITCHING: Keep English (or other Latin-script) words that the speaker actually said in Latin script. Never transliterate a spoken English word into Arabic letters.
4. PUNCTUATION: Add natural punctuation. For Arabic use Arabic marks: comma ، question mark ؟ semicolon ؛. Do NOT add tashkeel/diacritics.
5. SEGMENTATION — THE MOST IMPORTANT RULE. Target layout: each caption (a "segment") spans UP TO ${shape.maxLines} line(s), with a soft cap of ~${shape.maxWordsPerLine} words per line (${shape.note}).
   a. A caption = ONE complete, self-contained idea that reads well on its own. Group by MEANING, never by a fixed word count.
   b. Split a caption into its lines by READABILITY — the number of words on the upper vs lower line is whatever reads best (2+2, 1+3, 3+2, ...), NOT a fixed count. Balance the lines so neither is awkwardly long.
   c. OVERFLOW → NEXT CAPTION: when a phrase forms a complete idea and the following words begin a NEW idea, END the caption there and move those following words into the NEXT caption. NEVER pad a caption with the beginning of the next thought just to fill a line.
      WORKED EXAMPLE (English): for the words "Using Remotion's TikTok template you can build videos", the first caption is TWO lines — upper "Using Remotion's", lower "TikTok template" — because "Using Remotion's TikTok template" is one complete idea. "you can build videos" starts a NEW idea, so it becomes the next caption. Do NOT produce "TikTok / template, you can".
   d. A genuinely short complete idea may use fewer than ${shape.maxLines} lines. Do not stretch it.
   e. Keep meaning units intact: never split an Arabic article ال from its noun, an idafa (إضافة), a preposition from its object, or a number from its unit.
6. EMPHASIS: Mark the single most important "payload" word per segment as emphasis:true — a number/money figure, a superlative, a contrast word, the hook. NEVER emphasize function words (في، من، و، على، the، a، of). Most words are emphasis:false. Some segments may have zero emphasis.
7. ALIGNMENT: Give each line an "align" of "center" (default), "left", or "right".
8. TRANSLATION: Provide a natural, fluent English translation of the whole transcript (colloquial where the source is colloquial). If the source is already English, translate to Arabic instead.
9. WORD INDICES: Reference every original word exactly once by its index "i", in order, across all segments/lines. Do not add, drop, or reorder words. "text" is the CORRECTED form of that word.

OUTPUT: Return ONLY a JSON object, no prose, no markdown fences:
{
  "language": "<ISO code, e.g. ar or en>",
  "segments": [
    { "lines": [ { "align": "center", "words": [ { "i": 0, "text": "...", "emphasis": false } ] } ] }
  ],
  "translation": "..."
}`;

// ---------------------------------------------------------------------------
// Call Claude with the raw words, return the parsed enrichment.
// ---------------------------------------------------------------------------
const enrichWithClaude = async (words, languageHint) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing — add it to remotion/.env");

  const wordList = words.map((w, i) => ({ i, text: w.text }));
  const userContent =
    `Detected language: ${languageHint || "unknown"}\n` +
    `Words (index -> text):\n${JSON.stringify(wordList)}`;

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
      system: buildSystemPrompt(SHAPE),
      messages: [{ role: "user", content: userContent }],
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
  return { parsed, usage: data.usage };
};

// ---------------------------------------------------------------------------
// Reconstruct: attach original timestamps to corrected words (by index).
// ---------------------------------------------------------------------------
const buildEnriched = (rawWords, parsed) => {
  const segments = (parsed.segments || []).map((seg) => ({
    lines: (seg.lines || []).map((line) => ({
      align: line.align || "center",
      words: (line.words || []).map((w) => {
        const orig = rawWords[w.i] || {};
        return {
          text: w.text,
          emphasis: !!w.emphasis,
          startMs: orig.startMs ?? 0,
          endMs: orig.endMs ?? 0,
        };
      }),
    })),
  }));
  return { language: parsed.language || null, segments, translation: parsed.translation || "" };
};

const flatten = (enriched) =>
  enriched.segments.flatMap((s) => s.lines.flatMap((l) => l.words));

// --- CLI ---
const target = process.argv[2];
if (!target) {
  console.error('Usage: node enrich.mjs "public/clip.json"');
  process.exit(1);
}
const jsonPath = target.replace(/\.(mp4|webm|mkv|mov|m4a|mp3|wav)$/i, ".json");
const full = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
if (!existsSync(full)) {
  console.error(`Caption file not found: ${full} (run transcribe first)`);
  process.exit(1);
}

const rawCaptions = JSON.parse(readFileSync(full, "utf8"));
const rawWords = rawCaptions.map((c) => ({ text: c.text, startMs: c.startMs, endMs: c.endMs }));
console.log(`Enriching ${path.basename(full)} — ${rawWords.length} words via ${MODEL} — shape="${SHAPE_NAME}" (<=${SHAPE.maxLines} lines, ~${SHAPE.maxWordsPerLine} words/line) …`);

const { parsed, usage } = await enrichWithClaude(rawWords, undefined);
const enriched = buildEnriched(rawWords, parsed);

const outPath = full.replace(/\.json$/i, ".enriched.json");
writeFileSync(outPath, JSON.stringify(enriched, null, 2));

// --- readable before/after ---
console.log(`\n===== RAW (ASR) =====`);
console.log(rawWords.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim());
console.log(`\n===== CORRECTED (Claude) =====`);
console.log(flatten(enriched).map((w) => w.text).join(" ").replace(/\s+/g, " ").trim());
console.log(`\n===== SEGMENTS (${enriched.segments.length}) =====`);
enriched.segments.forEach((s, i) => {
  const lines = s.lines
    .map((l) => l.words.map((w) => (w.emphasis ? `*${w.text}*` : w.text)).join(" "))
    .join("  /  ");
  console.log(`  ${i + 1}. ${lines}`);
});
console.log(`\n===== TRANSLATION =====`);
console.log(enriched.translation);
console.log(`\n(lang: ${enriched.language} | tokens in/out: ${usage?.input_tokens}/${usage?.output_tokens} | wrote ${path.relative(process.cwd(), outPath)})`);
process.exit(0);
