import type { Caption, TikTokPage } from "@remotion/captions";

// ---------------------------------------------------------------------------
// The Claude-enriched caption structure (written by enrich.mjs as
// `<name>.enriched.json`). Semantic SEGMENTS -> LINES -> WORDS, where each word
// carries corrected text, its original timing, and Claude's emphasis flag. When
// present, templates group by THIS (meaning) instead of the count-based
// grouping, and use `emphasis` instead of the regex `decideEmphasis`.
// ---------------------------------------------------------------------------
export type EnrichedWord = {
  text: string;
  startMs: number;
  endMs: number;
  emphasis: boolean;
};
export type EnrichedLine = {
  align?: "center" | "left" | "right";
  words: EnrichedWord[];
};
// A SEGMENT is one on-screen caption. `id` is a stable handle the editor uses to
// select a caption and pin user edits to it (so a Claude re-run won't clobber
// them). `edited` marks a caption the user has hand-tuned (vs Claude's auto
// output) — the editor shows these differently and preserves them. A caption may
// hold ANY number of lines (default 2 for Hormozi; the user can set 1 or 3).
export type EnrichedSegment = {
  id?: string;
  edited?: boolean;
  lines: EnrichedLine[];
};

// The editable caption DOCUMENT — the source of truth once created by the
// transcribe -> enrich pass. The web editor mutates THIS; templates render it.
export type CaptionDoc = {
  language: string | null;
  segments: EnrichedSegment[];
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
