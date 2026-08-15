// Timing audit for caption documents — catches lag, gaps, overlaps and
// unreadably-short screens across EVERY template, on every video.
//
// The bug this exists to prevent: the ASR returns CONTIGUOUS word boundaries
// (a word's startMs is exactly the previous word's endMs), so every pause is
// padded into the preceding word and a raw startMs lands AFTER the word is
// spoken. Templates compensate with a lead (see caption-timing.ts). This script
// verifies the document those templates are fed is sane in the first place, and
// reports where a template's screens are too short for the lead to be safe.
//
// Usage:
//   node audit-timing.mjs "public/clip.enriched.json"
//   node audit-timing.mjs "public/*.enriched.json"

import path from "path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { TEMPLATES } from "./layout.mjs";

const FPS = 30;
// Below this a screen is on-screen for less time than it takes to read.
const MIN_SCREEN_FRAMES = 4;
// The lead every template applies (keep in step with CAPTION_LEAD_MS).
const LEAD_MS = 130;

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error('Usage: node audit-timing.mjs "public/clip.enriched.json"');
  process.exit(1);
}

const expand = (t) => {
  const dir = path.dirname(t), base = path.basename(t);
  if (!base.includes("*")) return [t];
  const re = new RegExp(
    "^" + base.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
  );
  return readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f));
};

let problems = 0;
const note = (msg) => { problems++; console.log("    " + msg); };

for (const file of expand(target)) {
  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(full)) { console.error(`Not found: ${full}`); continue; }
  const doc = JSON.parse(readFileSync(full, "utf8"));
  console.log(`\n=== ${path.basename(full)} ===`);

  // --- the WORD STREAM itself (shared by every template) ---
  const anyVariant = Object.values(doc.variants ?? {})[0] ?? doc.segments ?? [];
  const words = anyVariant.flatMap((s) => (s.lines ?? []).flatMap((l) => l.words ?? []));
  let contiguous = 0, backwards = 0, zero = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].endMs <= words[i].startMs) zero++;
    if (i && words[i].startMs === words[i - 1].endMs) contiguous++;
    if (i && words[i].startMs < words[i - 1].endMs) backwards++;
  }
  console.log(`  words: ${words.length}`);
  if (zero) note(`${zero} word(s) with zero or negative duration`);
  if (backwards) note(`${backwards} word(s) starting before the previous one ended`);
  const pct = words.length > 1 ? (contiguous / (words.length - 1)) * 100 : 0;
  console.log(
    `  boundaries: ${pct.toFixed(0)}% contiguous` +
      (pct > 80
        ? `  — pauses are padded into words, so the ${LEAD_MS}ms lead IS needed`
        : "  — this ASR leaves real gaps; the lead may overshoot"),
  );

  // --- per template ---
  for (const name of Object.keys(TEMPLATES)) {
    const segs = doc.variants?.[name];
    if (!segs?.length) { console.log(`  ${name.padEnd(9)} (no variant)`); continue; }

    const spans = segs.map((s) => {
      const ws = s.lines.flatMap((l) => l.words);
      return { start: ws[0].startMs, end: ws[ws.length - 1].endMs, n: ws.length, seg: s };
    });

    const short = [];
    let gaps = 0, overlaps = 0, outOfOrder = 0;
    for (let i = 0; i < spans.length; i++) {
      const cur = spans[i], next = spans[i + 1];
      const onScreenMs = next ? next.start - cur.start : cur.end - cur.start;
      if (onScreenMs / 1000 * FPS < MIN_SCREEN_FRAMES) {
        short.push(`#${i + 1} "${cur.seg.lines.flatMap((l) => l.words.map((w) => w.text)).join(" ")}" ${onScreenMs}ms`);
      }
      if (next) {
        if (next.start < cur.start) outOfOrder++;
        else if (next.start > cur.end) gaps++;
        else if (next.start < cur.end) overlaps++;
      }
      // A lead longer than the screen itself would reorder captions.
      if (onScreenMs < LEAD_MS) {
        // reported via `short` above; kept separate so the reason is explicit
      }
    }

    const flags = [];
    if (outOfOrder) flags.push(`${outOfOrder} OUT OF ORDER`);
    if (overlaps) flags.push(`${overlaps} overlapping`);
    if (gaps) flags.push(`${gaps} gap(s) in the word stream`);
    if (short.length) flags.push(`${short.length} under ${MIN_SCREEN_FRAMES} frames`);

    console.log(
      `  ${name.padEnd(9)} ${String(segs.length).padStart(3)} screens  ` +
        (flags.length ? "!! " + flags.join(", ") : "ok"),
    );
    if (outOfOrder || overlaps) problems++;
    for (const s of short.slice(0, 4)) note(s);
  }
}

console.log(
  problems ? `\n${problems} problem(s) found.` : "\nNo timing problems found.",
);
process.exit(problems ? 1 : 0);
