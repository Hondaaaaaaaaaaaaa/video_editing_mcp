import type { Caption, TikTokPage } from "@remotion/captions";

// ---------------------------------------------------------------------------
// The Claude-enriched caption structure (written by enrich.mjs as
// `<name>.enriched.json`). Semantic SEGMENTS -> LINES -> WORDS, where each word
// carries corrected text, its original timing, and Claude's emphasis flag. When
// present, templates group by THIS (meaning) instead of the count-based
// grouping, and use `emphasis` instead of the regex `decideEmphasis`.
// ---------------------------------------------------------------------------
// A word's SEMANTIC ROLE for kinetic-typography templates. Claude assigns it in
// the enrich pass; each template maps a role to a font / size
// / entrance. Optional so every other template and all existing documents are
// unaffected (they simply never read it). `emphasis` still carries COLOR (accent
// vs base); `variant` carries the TYPE TREATMENT, so the two are independent —
// a red italic word is variant:"elegant" + emphasis:true.
//   base    — connective text (regular sans)
//   punch   — the shouted keyword (heavy condensed uppercase, usually big)
//   elegant — a stylistic word (italic serif)
export type WordVariant = "base" | "punch" | "elegant";

export type EnrichedWord = {
  text: string;
  startMs: number;
  endMs: number;
  emphasis: boolean;
  variant?: WordVariant;
  // Per-word LIGHT SWEEP toggle (like `emphasis`, but for the moving gloss).
  // Off/undefined by default; the editor turns it on for any word or all words,
  // and every template renders the traveling shine on the flagged words using
  // the template's shared sweep look + motion (animate/speed/bounce).
  sweep?: boolean;
};
export type EnrichedLine = {
  align?: "center" | "left" | "right";
  words: EnrichedWord[];
};
// A SEGMENT is one on-screen SCREEN. `id` is a stable handle the editor uses to
// select a caption and pin user edits to it (so a Claude re-run won't clobber
// them). `edited` marks a caption the user has hand-tuned (vs Claude's auto
// output) — the editor shows these differently and preserves them. A caption may
// hold ANY number of lines (default 2 for Hormozi; the user can set 1 or 3).
//
// One of Claude's meaning-based captions is USUALLY one segment, but a template
// whose text is too big to fit it (Hormozi 2) shows that same caption across
// consecutive screens, giving several segments. `ideaIndex` is the caption they
// all came from — the identity that stays stable across templates — and
// `part`/`parts` say which screen this is (0-based) and how many there are.
// Absent on documents written before per-template screen splitting.
export type EnrichedSegment = {
  id?: string;
  edited?: boolean;
  ideaIndex?: number;
  part?: number;
  parts?: number;
  lines: EnrichedLine[];
};

// The editable caption DOCUMENT — the source of truth once created by the
// transcribe -> enrich pass. The web editor mutates THIS; templates render it.
export type CaptionDoc = {
  language: string | null;
  // Default segmentation (back-compat / fallback). When `variants` exists, each
  // template reads its OWN shape from there instead of this.
  segments: EnrichedSegment[];
  // PER-TEMPLATE segmentation: Claude segments the same clip once per template
  // shape (hormozi / shiny / gadzhi / kinetic / …), so every template gets the
  // grouping designed for its layout. Keyed by shape name. Optional so older
  // single-shape documents still work.
  variants?: Record<string, EnrichedSegment[]>;
  translation: string;
};

/**
 * The contract every caption style must implement.
 *
 * A "style" is just a React component that knows how to paint a single
 * TikTok-style page of words. It is handed:
 *   - `enterProgress`: a spring value 0 -> 1 describing the page's enter
 *     animation (use it for pop-in / slide-up etc).
 *   - `page`: the grouped words (`page.tokens`) plus timing metadata, as
 *     produced by `createTikTokStyleCaptions`.
 *   - `captions`: the full FLAT caption stream (every word + start/end ms),
 *     passed ONLY when the engine renders the style as a single full-timeline
 *     surface so it can do its own grouping (e.g. Shiny's kinetic layout).
 *     Undefined for the default per-page rendering.
 *
 * Swapping the look of the captions == swapping which component implements
 * this contract. See PageClassic.tsx / PageShiny.tsx.
 */
export type CaptionStyleProps = {
  enterProgress: number;
  page: TikTokPage;
  captions?: Caption[];
  // Claude's semantic segments (when an `.enriched.json` exists). Kinetic
  // templates prefer these over count-based grouping. Undefined = fall back.
  segments?: EnrichedSegment[];
};

export type CaptionStyle = React.FC<CaptionStyleProps>;
