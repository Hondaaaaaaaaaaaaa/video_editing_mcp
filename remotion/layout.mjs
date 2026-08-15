// CAPTION LAYOUT — pure code, no model, no API call.
//
// Claude decides WHERE CAPTIONS BREAK, by meaning, once for the whole video.
// Everything in this file is the other half of the job: taking those same
// captions and fitting them into one template's shape. It never moves a caption
// boundary, so it is safe to re-run on an already-enriched document whenever a
// template is restyled — see relayout.mjs, which does exactly that for free.
//
// Split out of enrich.mjs so the layout half can run (and be tested) on its own.
// ---------------------------------------------------------------------------
// TEMPLATE LAYOUTS — how much text each template can physically hold.
//
// This is LAYOUT ONLY. It has no say in where captions break; that is Claude's
// single meaning-based answer, shared by every template. `charsPerLine` is a
// WIDTH budget (characters are a far better width proxy than words —
// "extraordinary" is wider than "I go to the top") used for two decisions:
// how many LINES a caption needs, and — when even the full line budget is not
// enough — how many SCREENS it has to be shown across.
//
//   exact: true  — the look REQUIRES that many lines (Gadzhi's thin-over-bold
//                  swap and Hormozi 2's top->bottom colour step both need two
//                  lines to step between), so even a 2-word caption is split.
//
// `charsPerLine` is DERIVED, not guessed, so it stays honest when a template is
// restyled. A line can occupy `fitFraction` of the frame width; its glyphs are
// `fontSizePct`% of the frame width tall; an average glyph advances `advance` of
// the font size. So:  chars = fitFraction / (fontSizePct/100 * advance).
//
// The `advance` ratios are anchored on Gadzhi, the template we know renders
// correctly: 26 chars at fontSizePct 6.63 / fitFraction 0.9 implies 0.52 for a
// normal-width face. Avenir Next Condensed Heavy (Hormozi 2) is a CONDENSED
// face, so its glyphs advance less per unit of height.
//
// The renderer stays the final authority — every template measures true pixel
// width in the DOM and shrinks to fit — so this only has to land in the right
// zone, not be exact. It is a rougher approximation for Arabic than for Latin.
// ---------------------------------------------------------------------------
const ADVANCE_NORMAL = 0.52;
const ADVANCE_CONDENSED = 0.45;

// How far a caption may run PAST one screen's budget before it is worth showing
// across two screens. Every template shrinks a line that overruns, and a ~10%
// shrink is invisible, so absorbing a small overflow beats handing the viewer an
// extra screen. Without this a caption one character over budget would split.
const OVERFLOW_TOLERANCE = 1.1;

/** Characters that fit on ONE line of a template, from how it actually renders. */
const charsPerLine = (fontSizePct, fitFraction, advance) =>
  Math.round(fitFraction / ((fontSizePct / 100) * advance));

const TEMPLATES = {
  hormozi: { minLines: 1, maxLines: 2, exact: false, charsPerLine: 26 },
  // CLASSIC is the one template whose capacity is a STYLE choice, not a fitting
  // one. Its text is small (4.03% cap height), so the formula above would allow
  // ~43 characters a line — but the reference look shows ONE OR TWO WORDS per
  // screen and never three (measured: the widest of ten sampled captions was
  // "RESPECTS YOU" at 12 characters). So this is set from the reference, and
  // deliberately NOT derived. Do not "correct" it to the fitting number.
  // One line, ~12 chars: an idea plays across several one-or-two-word screens
  // while Claude's caption breaks stay exactly where they were.
  classic: { minLines: 1, maxLines: 1, exact: false, charsPerLine: 12 },
  // 13.5% glyph height is DOUBLE Gadzhi's, so it holds roughly half the text
  // per line — it was inheriting Gadzhi's 26 and cramming ~2x what fits, which
  // is what forced the shrink-to-fit down to its floor on the longer line.
  hormozi2: {
    minLines: 2,
    maxLines: 2,
    exact: true,
    charsPerLine: charsPerLine(13.5, 0.94, ADVANCE_CONDENSED),
  },
  gadzhi: {
    minLines: 2,
    maxLines: 2,
    exact: true,
    charsPerLine: charsPerLine(6.63, 0.9, ADVANCE_NORMAL),
  },
  // ALI — ONE line, always, inside a rounded sticker that hugs the text.
  // Measured off remotion/public/Ali (1080x1920): Poppins 700 at 5.4% of the
  // frame width, and the sticker never runs past ~88% of the frame, which after
  // its own padding leaves 0.8 of the width for text. The formula lands on 28,
  // and the reference's own longest captions are 27-28 characters ("that makes
  // way better coffee", "Get out your Clever Dripper") — so this is derived AND
  // independently confirmed against the look it came from. Keep in step with
  // FIT_WIDTH_FRACTION / fontSizePct in PageAli.tsx.
  ali: {
    minLines: 1,
    maxLines: 1,
    exact: false,
    charsPerLine: charsPerLine(5.4, 0.8, ADVANCE_NORMAL),
  },
  // SPEED — heavy all-caps display type, 1-2 lines, words fading in one at a
  // time. Measured off remotion/public/speed (1080x1440 @60fps): cap height
  // 48px on a 1080-wide frame over The Bold Font's 0.735 cap/em = 6.28% of the
  // frame width, lines running to ~87% of it.
  //
  // The advance here is NOT ADVANCE_NORMAL: this look sets ~0.18em of TRACKING,
  // which widens every glyph's advance on top of the face's own. 0.52 + 0.18 =
  // 0.70. That lands on 20 characters, and the reference's longest lines are
  // exactly that ("I'M FASTER THAN HENRY" 21, "THE GUY WILL DESTROY" 20) — so
  // it is derived AND confirmed. Keep in step with fontSizePct / letterSpacing
  // in PageSpeed.tsx.
  speed: {
    minLines: 1,
    maxLines: 2,
    exact: false,
    charsPerLine: charsPerLine(6.28, 0.87, ADVANCE_NORMAL + 0.18),
  },
  shiny: { minLines: 1, maxLines: 3, exact: false, charsPerLine: 18 },
  kinetic: { minLines: 1, maxLines: 3, exact: false, charsPerLine: 18 },
  minimal: { minLines: 1, maxLines: 1, exact: false, charsPerLine: 40 },
};
// The document's default `segments` (what a template with no variant falls back
// to). Two lines is the safe middle ground.
const DEFAULT_TEMPLATE = "hormozi";

// ---------------------------------------------------------------------------
// LINE WRAPPING — pure code, no model. Picks where to break a caption's words
// into N lines by scoring every possible split and taking the cheapest.
// ---------------------------------------------------------------------------

// Words that GRAB the word after them. A line must NEVER end on one of these —
// this is what stops "your / captions" and "the / hook". Latin + Arabic.
const BINDS_NEXT = new Set([
  // determiners + possessives
  "a", "an", "the", "my", "your", "his", "her", "its", "our", "their",
  "this", "that", "these", "those", "no", "every", "each", "all", "some", "any",
  // prepositions
  "of", "to", "in", "on", "for", "with", "from", "by", "at", "into", "onto",
  "about", "over", "under", "after", "before", "between", "through", "across",
  "around", "against", "during", "without", "within", "than",
  // auxiliaries + modals
  "is", "are", "was", "were", "be", "been", "being", "am", "can", "could",
  "will", "would", "shall", "should", "may", "might", "must", "do", "does",
  "did", "have", "has", "had", "not",
  // conjunctions — fine to break BEFORE, never AFTER
  "and", "but", "or", "so", "because", "if", "when", "while", "although", "as",
  // intensifiers
  "very", "more", "most", "less",
  // Arabic particles / prepositions / relatives
  "في", "من", "على", "إلى", "عن", "مع", "عند", "بعد", "قبل", "بين", "حتى",
  "لما", "لو", "إذا", "عشان", "علشان", "لأن", "لكن", "و", "أو", "ما", "لا",
  "كل", "هذا", "هذه", "ذلك", "تلك", "اللي", "الذي", "التي", "يا", "قد", "كان",
]);

// Words that START a phrase — a good place to BEGIN a line.
const STARTS_PHRASE = new Set([
  "and", "but", "or", "so", "because", "if", "when", "while", "that", "which", "who",
  "to", "of", "in", "on", "for", "with", "from", "by", "at", "into", "about",
  "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
  "you", "i", "we", "they", "he", "she", "it",
  "و", "لكن", "أو", "لأن", "إذا", "لما", "عشان", "علشان", "اللي", "الذي", "التي",
  "في", "من", "على", "إلى", "عن", "مع", "أنا", "إنت", "احنا", "هو", "هي",
]);

// Endings that usually mark a MODIFIER leaning on the noun after it ("engaging
// reels"). Only applied when the next word does not itself start a phrase, so
// a real verb + object ("animating / your captions") is left alone.
const MODIFIER_SUFFIX = /(ing|ed|ive|ous|ful|able|ible|ic)$/i;

const norm = (w) => (w || "").toLowerCase().replace(/[.,،؛:!?؟"'()[\]]/g, "");
const endsClause = (w) => /[,،؛:]["')\]]?$/.test(w || "");

// Rendered width of a run of words, approximated by characters + the spaces
// between them. Deliberately NOT a word count.
const widthOf = (words) =>
  words.reduce((s, w) => s + (w.text?.length ?? 0), 0) + Math.max(0, words.length - 1);

// What it costs to end a line after word `k`. Lower is better; negative is good.
const splitCost = (words, k) => {
  const cur = words[k]?.text ?? "";
  const nxt = words[k + 1]?.text ?? "";
  const c = norm(cur);
  const n = norm(nxt);
  let cost = 0;
  if (BINDS_NEXT.has(c)) cost += 100; // never strand a word from what it governs
  if (MODIFIER_SUFFIX.test(c) && !STARTS_PHRASE.has(n)) cost += 40; // adjective + noun
  if (endsClause(cur)) cost -= 25; // a comma is the most natural break there is
  if (STARTS_PHRASE.has(n)) cost -= 3; // the next word opens a new phrase
  return cost;
};

/**
 * Split a run of words into exactly `n` parts, cheapest total cost wins.
 *
 * Used at BOTH levels: to cut a caption into screens, and to cut a screen into
 * lines. Same scoring either way — a word is never stranded from what it
 * governs, a comma is preferred, and the parts come out balanced.
 *
 * `minPer` rejects any split that leaves a part shorter than that many words,
 * which is what stops an orphan screen holding a single stray word.
 */
const splitInto = (words, n, minPer = 1) => {
  if (n <= 1 || words.length <= 1) return [words];
  const lines = Math.min(n, words.length);
  let best = null;
  let bestCost = Infinity;

  const evaluate = (cuts) => {
    const out = [];
    let prev = 0;
    for (const k of cuts) {
      out.push(words.slice(prev, k + 1));
      prev = k + 1;
    }
    out.push(words.slice(prev));
    if (minPer > 1 && out.some((part) => part.length < minPer)) return;
    const widths = out.map(widthOf);
    // Total = how awkward each break is + how lopsided the lines end up.
    const spread = Math.max(...widths) - Math.min(...widths);
    const cost = cuts.reduce((s, k) => s + splitCost(words, k), 0) + spread;
    if (cost < bestCost) {
      bestCost = cost;
      best = out;
    }
  };

  // Captions are short, so brute-forcing every combination of break points is
  // both exact and instant.
  const walk = (start, need, acc) => {
    if (need === 0) return evaluate(acc);
    for (let k = start; k <= words.length - 1 - need; k++) walk(k + 1, need - 1, [...acc, k]);
  };
  walk(0, lines - 1, []);
  return best ?? [words];
};

/** How many lines this template should use for this caption. */
const lineCountFor = (words, tpl) => {
  if (tpl.exact) return Math.min(tpl.maxLines, Math.max(1, words.length));
  const w = widthOf(words);
  for (let n = tpl.minLines; n < tpl.maxLines; n++) {
    if (w / n <= tpl.charsPerLine) return Math.min(n, words.length);
  }
  return Math.min(tpl.maxLines, words.length);
};

/**
 * How many SCREENS this template needs to show this caption.
 *
 * One screen holds `maxLines * charsPerLine` characters. A caption wider than
 * that does NOT get a different caption break — Claude's break is untouchable —
 * it gets shown across consecutive screens instead, the way a long paragraph
 * needs two pages. Almost always 1; a big template like Hormozi 2 needs 2, and
 * unusually long speech can need 3, so this is derived rather than capped at 2.
 */
const screenCountFor = (words, tpl) => {
  const needed = Math.ceil(widthOf(words) / (tpl.maxLines * tpl.charsPerLine * OVERFLOW_TOLERANCE));
  // A screen still has to fill the lines the look requires, so a template that
  // insists on N lines can never have more screens than it has words to spare.
  const minWordsPerScreen = tpl.exact ? tpl.maxLines : 1;
  const maxScreens = Math.max(1, Math.floor(words.length / minWordsPerScreen));
  return Math.max(1, Math.min(needed, maxScreens));
};

/**
 * Lay the SAME captions out in one template's shape.
 *
 * A caption becomes one segment per SCREEN. `ideaIndex` is the caption it came
 * from — the stable identity that survives the split, so a block means the same
 * thing in every template even when one template shows it across two screens.
 * Splits happen strictly INSIDE a caption; no word ever crosses into a
 * neighbouring one.
 */
const layoutFor = (captions, tpl) =>
  captions.flatMap((words, ideaIndex) => {
    const screens = splitInto(
      words,
      screenCountFor(words, tpl),
      tpl.exact ? tpl.maxLines : 1,
    );
    return screens.map((screenWords, part) => ({
      ideaIndex,
      part,
      parts: screens.length,
      lines: splitInto(screenWords, lineCountFor(screenWords, tpl)).map((ws) => ({
        align: "center",
        words: ws,
      })),
    }));
  });

export {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  OVERFLOW_TOLERANCE,
  widthOf,
  splitInto,
  lineCountFor,
  screenCountFor,
  layoutFor,
};
