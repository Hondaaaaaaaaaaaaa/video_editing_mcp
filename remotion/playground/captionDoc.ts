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

// ---------------------------------------------------------------------------
// MOVE ONE WORD ACROSS THE CAPTION BOUNDARY (the one-click → / ← ops)
//
// Only a BOUNDARY word can move: the caption's last word can go forward, its
// first word can come back. That restriction is what keeps the document's words
// in speaking order — captions are time-ordered, so pulling a word out of the
// middle would interleave timestamps across captions. Non-boundary regrouping
// stays the job of splitCaptionBefore / mergeCaptionWithNext.
//
// Both ops return the moved word's NEW address alongside the document, so the
// editor keeps it selected and the user can press → → → to walk it along.
// ---------------------------------------------------------------------------

export type WordAddr = { s: number; l: number; w: number };
export type MoveResult = { doc: CaptionDoc; sel: WordAddr };

const isLastWord = (seg: EnrichedSegment, l: number, w: number): boolean =>
  l === seg.lines.length - 1 && w === seg.lines[l].words.length - 1;

const isFirstWord = (l: number, w: number): boolean => l === 0 && w === 0;

/** Can the word at (s, l, w) be pushed into the following caption? */
export const canMoveWordNext = (doc: CaptionDoc, s: number, l: number, w: number): boolean => {
  const seg = doc.segments[s];
  return Boolean(seg && doc.segments[s + 1] && seg.lines[l] && isLastWord(seg, l, w));
};

/** Can the word at (s, l, w) be pulled back into the preceding caption? */
export const canMoveWordPrev = (doc: CaptionDoc, s: number, l: number, w: number): boolean => {
  const seg = doc.segments[s];
  return Boolean(seg && doc.segments[s - 1] && seg.lines[l]?.words[w] && isFirstWord(l, w));
};

/** Remove word (l, w) from a caption, dropping any line it leaves empty. */
const withoutWord = (seg: EnrichedSegment, l: number, w: number): EnrichedSegment => ({
  ...seg,
  lines: seg.lines
    .map((line, li) =>
      li !== l ? line : { ...line, words: line.words.filter((_, wi) => wi !== w) },
    )
    .filter((line) => line.words.length > 0),
});

/**
 * MOVE WORD →: the caption's LAST word becomes the FIRST word of the next
 * caption. Returns null when the move isn't legal (not a boundary word, or
 * there is no next caption).
 */
export const moveWordToNextCaption = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): MoveResult | null => {
  if (!canMoveWordNext(doc, s, l, w)) return null;
  const seg = doc.segments[s];
  const next = doc.segments[s + 1];
  const word = seg.lines[l].words[w];

  const trimmed = markEdited(withoutWord(seg, l, w));
  const nextLines = [...next.lines];
  nextLines[0] = { ...nextLines[0], words: [word, ...nextLines[0].words] };
  const grown = markEdited({ ...next, lines: nextLines });

  // Handing over the caption's ONLY word empties it — it disappears, so the
  // receiving caption slides down into index `s`.
  const emptied = trimmed.lines.length === 0;
  const segments = [...doc.segments];
  segments.splice(s, 2, ...(emptied ? [grown] : [trimmed, grown]));
  return { doc: { ...doc, segments }, sel: { s: emptied ? s : s + 1, l: 0, w: 0 } };
};

/**
 * MOVE WORD ←: the caption's FIRST word becomes the LAST word of the previous
 * caption. Returns null when the move isn't legal.
 */
export const moveWordToPrevCaption = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): MoveResult | null => {
  if (!canMoveWordPrev(doc, s, l, w)) return null;
  const seg = doc.segments[s];
  const prev = doc.segments[s - 1];
  const word = seg.lines[l].words[w];

  const trimmed = markEdited(withoutWord(seg, l, w));
  const prevLines = [...prev.lines];
  const last = prevLines.length - 1;
  prevLines[last] = { ...prevLines[last], words: [...prevLines[last].words, word] };
  const grown = markEdited({ ...prev, lines: prevLines });

  const emptied = trimmed.lines.length === 0;
  const segments = [...doc.segments];
  segments.splice(s - 1, 2, ...(emptied ? [grown] : [grown, trimmed]));
  return {
    doc: { ...doc, segments },
    sel: { s: s - 1, l: last, w: prevLines[last].words.length - 1 },
  };
};

// ---------------------------------------------------------------------------
// MOVE A RANGE OF WORDS TO THE ADJACENT SENTENCE — the primary editing action.
//
// "→ next sentence": the selected word AND everything AFTER it in this caption
// leave and join the FRONT of the next caption (merged in; a new caption is made
// if there is none). "← previous sentence": the selected word AND everything
// BEFORE it join the END of the previous caption. Word order — and therefore
// timing order — is preserved, so captions stay in speaking order. Returns the
// moved selection's new address so the editor keeps the caret on it.
// ---------------------------------------------------------------------------

const globalIndex = (seg: EnrichedSegment, l: number, w: number): number => {
  let g = 0;
  for (let i = 0; i < l; i++) g += seg.lines[i].words.length;
  return g + w;
};

/** Map a flat word index within a segment back to a (line, word) address. */
const flatIndexToAddr = (seg: EnrichedSegment, flatIdx: number): { l: number; w: number } => {
  let idx = flatIdx;
  for (let l = 0; l < seg.lines.length; l++) {
    if (idx < seg.lines[l].words.length) return { l, w: idx };
    idx -= seg.lines[l].words.length;
  }
  const l = Math.max(0, seg.lines.length - 1);
  return { l, w: Math.max(0, (seg.lines[l]?.words.length ?? 1) - 1) };
};

export const moveWordsToNextSentence = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): MoveResult | null => {
  const seg = doc.segments[s];
  if (!seg) return null;
  const flat = flattenSeg(seg);
  const g = globalIndex(seg, l, w);
  const move = flat.slice(g); // selected word + everything after
  const stay = flat.slice(0, g); // everything before
  if (move.length === 0) return null;
  const nextSeg = doc.segments[s + 1];
  const nextFlat = nextSeg ? flattenSeg(nextSeg) : [];
  const grown = markEdited({ id: nextSeg?.id, edited: true, lines: reflowIntoLines([...move, ...nextFlat], 2) });
  const segments = [...doc.segments];
  if (stay.length > 0) {
    const trimmed = markEdited({ ...seg, lines: reflowIntoLines(stay, 2) });
    segments.splice(s, nextSeg ? 2 : 1, trimmed, grown);
    return { doc: { ...doc, segments: clean(segments) }, sel: { s: s + 1, l: 0, w: 0 } };
  }
  // The whole caption moved → it merges into the next one (or is re-made at s).
  segments.splice(s, nextSeg ? 2 : 1, grown);
  return { doc: { ...doc, segments: clean(segments) }, sel: { s, l: 0, w: 0 } };
};

export const moveWordsToPrevSentence = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
): MoveResult | null => {
  const seg = doc.segments[s];
  if (!seg) return null;
  const flat = flattenSeg(seg);
  const g = globalIndex(seg, l, w);
  const move = flat.slice(0, g + 1); // everything up to + including the selected word
  const stay = flat.slice(g + 1); // everything after
  if (move.length === 0) return null;
  const prevSeg = doc.segments[s - 1];
  const prevFlat = prevSeg ? flattenSeg(prevSeg) : [];
  const mergedFlat = [...prevFlat, ...move];
  const grown = markEdited({ id: prevSeg?.id, edited: true, lines: reflowIntoLines(mergedFlat, 2) });
  // The selected word is the LAST of `move` → its new address inside `grown`.
  const selAddr = flatIndexToAddr(grown, mergedFlat.length - 1);
  const gs = prevSeg ? s - 1 : s; // index the grown caption lands at
  const segments = [...doc.segments];
  if (stay.length > 0) {
    const trimmed = markEdited({ ...seg, lines: reflowIntoLines(stay, 2) });
    if (prevSeg) segments.splice(s - 1, 2, grown, trimmed);
    else segments.splice(s, 1, grown, trimmed);
  } else if (prevSeg) {
    segments.splice(s - 1, 2, grown);
  } else {
    segments.splice(s, 1, grown);
  }
  return { doc: { ...doc, segments: clean(segments) }, sel: { s: gs, ...selAddr } };
};

// ---------------------------------------------------------------------------
// WORD CONTENT edits — add / edit text / remove / retime a word, and add a whole
// caption block. These are the "escape hatches" so the user is never stuck with
// what the ASR produced: a missed word, a mishear, a wrong time, or a whole line
// that needs to be typed in. New words/blocks get timing interpolated from their
// neighbours (the timing editor can fine-tune it after).
// ---------------------------------------------------------------------------

const DEFAULT_WORD_MS = 400;

/** REMOVE the word at (s, l, w); empty lines/captions are cleaned up. */
export const removeWord = (doc: CaptionDoc, s: number, l: number, w: number): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg?.lines[l]?.words[w]) return doc;
  const lines = seg.lines.map((line, li) =>
    li !== l ? line : { ...line, words: line.words.filter((_, wi) => wi !== w) },
  );
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

/** EDIT a word's text (fix a mishear / spelling). Blank text deletes the word. */
export const editWordText = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
  text: string,
): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg?.lines[l]?.words[w]) return doc;
  const t = text.trim();
  if (!t) return removeWord(doc, s, l, w);
  const lines = seg.lines.map((line, li) =>
    li !== l
      ? line
      : { ...line, words: line.words.map((word, wi) => (wi !== w ? word : { ...word, text: t })) },
  );
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

/** EDIT a word's start/end time (ms), kept ordered (start < end). */
export const setWordTime = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
  startMs: number,
  endMs: number,
): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg?.lines[l]?.words[w]) return doc;
  const start = Math.max(0, Math.round(startMs));
  const end = Math.max(start + 1, Math.round(endMs));
  const lines = seg.lines.map((line, li) =>
    li !== l
      ? line
      : { ...line, words: line.words.map((wd, wi) => (wi !== w ? wd : { ...wd, startMs: start, endMs: end })) },
  );
  return replaceSeg(doc, s, markEdited({ ...seg, lines }));
};

/**
 * INSERT a new word next to (s, l, w) on the SAME line (keeps the line layout).
 * Its timing fills the gap to the neighbour on that side, or a default slice
 * when there is none. Returns the new word's address so the editor selects it.
 */
export const insertWord = (
  doc: CaptionDoc,
  s: number,
  l: number,
  w: number,
  where: "before" | "after",
  text = "word",
): MoveResult | null => {
  const seg = doc.segments[s];
  const line = seg?.lines[l];
  if (!line) return null;
  const at = where === "after" ? w + 1 : w;
  const flat = flattenSeg(seg);
  const g = globalIndex(seg, l, w) + (where === "after" ? 1 : 0);
  const prev = flat[g - 1];
  const next = flat[g];
  const leftMs = prev ? prev.endMs : next ? Math.max(0, next.startMs - DEFAULT_WORD_MS) : 0;
  const rightMs = next ? next.startMs : leftMs + DEFAULT_WORD_MS;
  const newWord: EnrichedWord = {
    text: text.trim() || "word",
    startMs: leftMs,
    endMs: rightMs > leftMs ? rightMs : leftMs + DEFAULT_WORD_MS,
    emphasis: false,
  };
  const words = [...line.words.slice(0, at), newWord, ...line.words.slice(at)];
  const lines = seg.lines.map((ln, li) => (li === l ? { ...ln, words } : ln));
  return { doc: replaceSeg(doc, s, markEdited({ ...seg, lines })), sel: { s, l, w: at } };
};

/**
 * ADD a new caption block right AFTER segment s (s = -1 inserts at the very
 * start), built from `text` (space-split into words). Words spread across the
 * time gap to the next caption; when captions are contiguous it borrows a slice
 * from the end of the previous caption so the new block never overlaps.
 */
export const addCaptionAfter = (
  doc: CaptionDoc,
  s: number,
  text = "New caption",
): MoveResult | null => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const segments = [...doc.segments];
  const prevSeg = segments[s];
  const nextSeg = segments[s + 1];
  const prevFlat = prevSeg ? flattenSeg(prevSeg) : [];
  const nextFlat = nextSeg ? flattenSeg(nextSeg) : [];
  let leftMs = prevFlat.length ? prevFlat[prevFlat.length - 1].endMs : 0;
  const rightMs = nextFlat.length ? nextFlat[0].startMs : leftMs + words.length * DEFAULT_WORD_MS;

  if (rightMs - leftMs < 120 && prevSeg && prevFlat.length) {
    const lastWord = prevFlat[prevFlat.length - 1];
    const borrow = Math.min(600, Math.max(120, lastWord.endMs - lastWord.startMs - 40));
    const newPrevEnd = Math.max(lastWord.startMs + 40, leftMs - borrow);
    const lastLine = prevSeg.lines.length - 1;
    const pLines = prevSeg.lines.map((ln, li) =>
      li !== lastLine
        ? ln
        : { ...ln, words: ln.words.map((wd, wi) => (wi !== ln.words.length - 1 ? wd : { ...wd, endMs: newPrevEnd })) },
    );
    segments[s] = markEdited({ ...prevSeg, lines: pLines });
    leftMs = newPrevEnd;
  }

  const span = Math.max(words.length * 80, (rightMs > leftMs ? rightMs : leftMs + words.length * DEFAULT_WORD_MS) - leftMs);
  const per = span / words.length;
  const newWords: EnrichedWord[] = words.map((t, i) => ({
    text: t,
    startMs: Math.round(leftMs + i * per),
    endMs: Math.round(leftMs + (i + 1) * per),
    emphasis: false,
  }));
  segments.splice(s + 1, 0, markEdited({ lines: reflowIntoLines(newWords, 2) }));
  return { doc: { ...doc, segments: clean(segments) }, sel: { s: s + 1, l: 0, w: 0 } };
};

/** SET LINE COUNT: reflow a caption's words into exactly `n` balanced lines. */
export const setLineCount = (doc: CaptionDoc, s: number, n: number): CaptionDoc => {
  const seg = doc.segments[s];
  if (!seg) return doc;
  const flat = flattenSeg(seg);
  return replaceSeg(doc, s, markEdited({ ...seg, lines: reflowIntoLines(flat, n) }));
};

// ---------------------------------------------------------------------------
// Selection navigation — every word address in speaking order, so the editor's
// Alt+←/→ can walk the caret across lines and captions without special cases.
// ---------------------------------------------------------------------------
export const wordAddresses = (doc: CaptionDoc): WordAddr[] =>
  doc.segments.flatMap((seg, s) =>
    seg.lines.flatMap((line, l) => line.words.map((_, w) => ({ s, l, w }))),
  );

/** The address `delta` steps away from `from` (clamped to the document). */
export const stepAddress = (
  doc: CaptionDoc,
  from: WordAddr,
  delta: number,
): WordAddr | null => {
  const all = wordAddresses(doc);
  const i = all.findIndex((a) => a.s === from.s && a.l === from.l && a.w === from.w);
  if (i < 0) return all[0] ?? null;
  return all[Math.max(0, Math.min(all.length - 1, i + delta))] ?? null;
};

// ---------------------------------------------------------------------------
// Assign stable ids on load so the editor can track captions across edits.
// ---------------------------------------------------------------------------
export const withIds = (doc: CaptionDoc): CaptionDoc => ({
  ...doc,
  segments: doc.segments.map((s, i) => ({ ...s, id: s.id ?? `seg-${i}` })),
});
