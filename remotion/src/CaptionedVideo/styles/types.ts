import type { Caption, TikTokPage } from "@remotion/captions";

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
};

export type CaptionStyle = React.FC<CaptionStyleProps>;
