import type React from "react";
import type { z } from "zod";
import type { CaptionStyle } from "../src/CaptionedVideo/styles/types";

import {
  PageClassic,
  classicSchema,
  CLASSIC_DEFAULTS,
  ClassicStyleProvider,
} from "../src/CaptionedVideo/styles/PageClassic";
import {
  PageTypewriter,
  typewriterSchema,
  TYPEWRITER_DEFAULTS,
  TypewriterStyleProvider,
} from "../src/CaptionedVideo/styles/PageTypewriter";
import {
  PageHighlight,
  highlightSchema,
  HIGHLIGHT_DEFAULTS,
  HighlightStyleProvider,
} from "../src/CaptionedVideo/styles/PageHighlight";

// Props bag = everything in a style's schema EXCEPT `src` (the shared base).
export type StyleProps = Record<string, unknown>;

export type StyleEntry = {
  id: string;
  // The exact zod object wired to this style's <Composition> in Root.tsx —
  // controls are generated from it, so the playground stays in sync.
  schema: z.ZodTypeAny;
  defaults: StyleProps;
  // Context provider that feeds the props to the page component.
  Provider: React.Provider<never>;
  Page: CaptionStyle;
};

// `src` lives on the shared base schema and is fixed to the sample video here,
// so it is never shown as a control.
const stripSrc = (defaults: Record<string, unknown>): StyleProps => {
  const { src: _src, ...rest } = defaults;
  return rest;
};

export const STYLES: StyleEntry[] = [
  {
    id: "Classic",
    schema: classicSchema,
    defaults: stripSrc(CLASSIC_DEFAULTS),
    Provider: ClassicStyleProvider as unknown as React.Provider<never>,
    Page: PageClassic,
  },
  {
    id: "Typewriter",
    schema: typewriterSchema,
    defaults: stripSrc(TYPEWRITER_DEFAULTS),
    Provider: TypewriterStyleProvider as unknown as React.Provider<never>,
    Page: PageTypewriter,
  },
  {
    id: "Highlight",
    schema: highlightSchema,
    defaults: stripSrc(HIGHLIGHT_DEFAULTS),
    Provider: HighlightStyleProvider as unknown as React.Provider<never>,
    Page: PageHighlight,
  },
];

export const STYLE_BY_ID: Record<string, StyleEntry> = Object.fromEntries(
  STYLES.map((s) => [s.id, s]),
);
