// Re-lays an ALREADY-ENRICHED caption document out for every template — without
// calling Claude, and without spending a token.
//
// Claude's caption breaks are the expensive part and they do not change here:
// this script reads the captions already in the document and only redoes the
// LAYOUT half (how each template stacks those same words into lines, and across
// screens when a template's text is too big to hold a caption in one). Run it
// whenever a template is restyled or its capacity is recalibrated, so an existing
// library picks up the new look for free.
//
// Usage:
//   node relayout.mjs "public/clip.enriched.json"             # writes .relaid.json
//   node relayout.mjs "public/clip.enriched.json" --overwrite # replaces in place
//   node relayout.mjs "public/*.enriched.json" --overwrite    # a whole library

import path from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { TEMPLATES, DEFAULT_TEMPLATE, layoutFor } from "./layout.mjs";

const args = process.argv.slice(2);
const OVERWRITE = args.includes("--overwrite");
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error('Usage: node relayout.mjs "public/clip.enriched.json" [--overwrite]');
  process.exit(1);
}

// Expand a trailing glob (`public/*.enriched.json`) so a whole library can be
// relaid in one go. Anything else is treated as a literal path.
const expand = (t) => {
  const dir = path.dirname(t);
  const base = path.basename(t);
  if (!base.includes("*")) return [t];
  const re = new RegExp("^" + base.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => path.join(dir, f));
};

/**
 * Recover the captions Claude decided from a document that has already been laid
 * out. Prefers a variant whose segments carry `ideaIndex` (written by the current
 * layout), since that survives a template splitting one caption across screens.
 * Falls back to the default `segments`, where one segment was one caption.
 */
const captionsFrom = (doc) => {
  const pools = [...Object.values(doc.variants ?? {}), doc.segments].filter(
    (s) => Array.isArray(s) && s.length,
  );
  const tagged = pools.find((segs) => segs.every((s) => typeof s.ideaIndex === "number"));
  const wordsOf = (seg) => (seg.lines ?? []).flatMap((l) => l.words ?? []);

  if (tagged) {
    const out = [];
    for (const seg of tagged) (out[seg.ideaIndex] ??= []).push(...wordsOf(seg));
    return out;
  }
  // Untagged document: any variant's segments ARE the captions, one to one. Use
  // the one with the FEWEST segments so a pre-split variant cannot be mistaken
  // for the caption list.
  const flattest = pools.reduce((a, b) => (b.length < a.length ? b : a));
  return flattest.map(wordsOf);
};

const files = expand(target);
if (!files.length) {
  console.error(`No files matched: ${target}`);
  process.exit(1);
}

for (const file of files) {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(full)) {
    console.error(`Not found, skipping: ${full}`);
    continue;
  }

  const doc = JSON.parse(readFileSync(full, "utf8"));
  const captions = captionsFrom(doc);
  if (!captions.length || captions.some((c) => !c?.length)) {
    console.error(`No captions recovered, skipping: ${path.basename(full)}`);
    continue;
  }

  const before = Object.fromEntries(
    Object.keys(TEMPLATES).map((n) => [n, doc.variants?.[n]?.length ?? 0]),
  );

  doc.segments = layoutFor(captions, TEMPLATES[DEFAULT_TEMPLATE]);
  doc.variants = Object.fromEntries(
    Object.entries(TEMPLATES).map(([name, tpl]) => [name, layoutFor(captions, tpl)]),
  );

  const outPath = OVERWRITE ? full : full.replace(/\.json$/i, ".relaid.json");
  writeFileSync(outPath, JSON.stringify(doc, null, 2));

  const moved = Object.entries(TEMPLATES)
    .map(([name]) => {
      const now = doc.variants[name].length;
      return before[name] && before[name] !== now ? `${name} ${before[name]}->${now}` : null;
    })
    .filter(Boolean);

  console.log(
    `${path.basename(full)} — ${captions.length} captions, ${Object.keys(TEMPLATES).length} templates` +
      (moved.length ? `  [${moved.join(", ")}]` : "  [no change]"),
  );
  console.log(`  wrote ${path.basename(outPath)}`);
}

if (!OVERWRITE) {
  console.log(`\nNothing was overwritten. Re-run with --overwrite to replace the live files.`);
}
