// Phase 2 — the caption EDITOR's data operations.
//
// Every function here is PURE: it takes a CaptionDoc and returns a NEW CaptionDoc
// (never mutates), so React state updates are clean and undo is trivial later.
// Word TIMESTAMPS always travel with the word objects, so any regrouping keeps
// timing correct. Any caption the user touches is marked `edited: true` so a
// later Claude re-run can preserve it (the "pin" from the Phase 1 data model).
//
// Address model: a word is addressed by (segIdx, lineIdx, wordIdx); a caption by
// segIdx. The editor UI selects with these indices.

import type {
  CaptionDoc,
  EnrichedLine,
  EnrichedSegment,
  EnrichedWord,
} from "../src/CaptionedVideo/styles/types";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const flattenSeg = (seg: EnrichedSegment): EnrichedWord[] =>
  seg.lines.flatMap((l) => l.words);

/** Split a flat word list into EXACTLY `n` balanced lines (front-loaded). */
const reflowIntoLines = (words: EnrichedWord[], n: number): EnrichedLine[] => {
  const count = Math.max(1, Math.min(n, Math.max(1, words.length)));
  const base = Math.floor(words.length / count);
  const extra = words.length % count;
  const lines: EnrichedLine[] = [];
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const take = base + (i < extra ? 1 : 0);
    lines.push({ align: "center", words: words.slice(idx, idx + take) });
    idx += take;
  }
  return lines;
};

/** Mark a caption as user-edited (pinned) so re-runs won't clobber it. */
const markEdited = (seg: EnrichedSegment): EnrichedSegment => ({
  ...seg,
  edited: true,
});

/** Drop empty lines; drop empty captions. Keeps the doc well-formed after edits. */
const clean = (segments: EnrichedSegment[]): EnrichedSegment[] =>
  segments
    .map((s) => ({ ...s, lines: s.lines.filter((l) => l.words.length > 0) }))
    .filter((s) => s.lines.length > 0);

const replaceSeg = (
  doc: CaptionDoc,
  segIdx: number,
  next: EnrichedSegment | EnrichedSegment[],
): CaptionDoc => {
  const segments = [...doc.segments];
  segments.splice(segIdx, 1, ...(Array.isArray(next) ? next : [next]));
  return { ...doc, segments: clean(segments) };
};

// ---------------------------------------------------------------------------
// WORD-level edits
// ---------------------------------------------------------------------------

/** Toggle a single word's emphasis (the highlighted/accent word). */
export const toggleEmphasis = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg) return doc;
  const lines = seg.lines.map((line, li) =>
    li !== l
      ? line
      : {
          ...line,
          words: line.words.map((word, wi) =>
            wi !== w ? word : { ...word, emphasis: !word.emphasis },
          ),
        },
  );
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

/**
 * BREAK LINE: start a new line at word (l, w) — words from w onward drop to a
 * fresh line inserted right after line l. No-op when w is already the line's
 * first word (nothing to break before).
 */
export const breakLineBefore = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg || w <= 0) return doc;
  const line = seg.lines[l];
  if (!line) return doc;
  const head = { ...line, words: line.words.slice(0, w) };
  const tail: EnrichedLine = { align: line.align ?? "center", words: line.words.slice(w) };
  const lines = [...seg.lines];
  lines.splice(l, 1, head, tail);
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

/** MERGE LINE UP: fold line l into line l-1 (undo a line break). */
export const mergeLineUp = (doc: CaptionDoc, s: number, l: number): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg || l <= 0 || !seg.lines[l]) return doc;
  const lines = [...seg.lines];
  const prev = lines[l - 1];
  lines[l - 1] = { ...prev, words: [...prev.words, ...lines[l].words] };
  lines.splice(l, 1);
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

// ---------------------------------------------------------------------------
// CAPTION-level edits (the "move words between sentences" core)
// ---------------------------------------------------------------------------

/**
 * NEW CAPTION HERE: split caption s at word (l, w). Everything from that word
 * onward becomes a brand-new caption inserted right after s. This is how a user
 * pushes trailing words (e.g. "you can") into the next caption.
 */
export const splitCaptionBefore = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg) return doc;
  const flat = flattenSeg(seg);
  // Global index of the target word within the caption.
  let g = 0;
  for (let i = 0; i < l; i++) g += seg.lines[i].words.length;
  g += w;
  if (g <= 0 || g >= flat.length) return doc; // nothing to split off
  // Both halves re-derive their lines from their own flat words at up to 2 lines
  // (the Hormozi default); the user can re-tune each caption's line count after.
  const first = markEdited({ ...seg, lines: reflowIntoLines(flat.slice(0, g), 2) });
  const second = markEdited({ id: undefined, edited: true, lines: reflowIntoLines(flat.slice(g), 2) });
  return replaceSeg(doc, s, [first, second]);
};

/** MERGE WITH NEXT: absorb caption s+1 into caption s (undo a split). */
export const mergeCaptionWithNext = (doc: CaptionDoc, s: number): CaptionDoc => {
  const seg = doc.segments[s];
  const nextSeg = doc.segments[s + 1];
  if (!seg || !nextSeg) return doc;
  const flat = [...flattenSeg(seg), ...flattenSeg(nextSeg)];
  const merged = markEdited({ ...seg, lines: reflowIntoLines(flat, 2) });
  const segments = [...doc.segments];
  segments.splice(s, 2, merged);
  return { ...doc, segments: clean(segments) };
};

/** SET LINE COUNT: reflow a caption's words into exactly `n` balanced lines. */
export const setLineCount = (doc: CaptionDoc, s: number, n: number): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg) return doc;
  const flat = flattenSeg(seg);
  return replaceSeg(doc, s, markEdited({ ...seg, lines: reflowIntoLines(flat, n) }));
};

// ---------------------------------------------------------------------------
// Assign stable ids on load so the editor can track captions across edits.
// ---------------------------------------------------------------------------
export const withIds = (doc: CaptionDoc): CaptionDoc => ({
  ...doc,
  segments: doc.segments.map((s, i) => ({ ...s, id: s.id ?? `seg-${i}` })),
});
