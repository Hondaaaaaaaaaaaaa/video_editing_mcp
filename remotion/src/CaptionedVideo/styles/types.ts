import type { TikTokPage } from "@remotion/captions";

/**
 * The contract every caption style must implement.
 *
 * A "style" is just a React component that knows how to paint a single
 * TikTok-style page of words. It is handed:
 *   - `enterProgress`: a spring value 0 -> 1 describing the page's enter
 *     animation (use it for pop-in / slide-up etc).
 *   - `page`: the grouped words (`page.tokens`) plus timing metadata, as
 *     produced by `createTikTokStyleCaptions`.
 *
 * Swapping the look of the captions == swapping which component implements
 * this contract. See PageClassic.tsx / PageShiny.tsx.
 */
export type CaptionStyleProps = {
  enterProgress: number;
  page: TikTokPage;
};

export type CaptionStyle = React.FC<CaptionStyleProps>;
