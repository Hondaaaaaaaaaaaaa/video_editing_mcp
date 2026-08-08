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
import {
  PageHormozi,
  hormoziSchema,
  HORMOZI_DEFAULTS,
  HormoziStyleProvider,
} from "../src/CaptionedVideo/styles/PageHormozi";
import {
  PageShiny,
  shinySchema,
  SHINY_DEFAULTS,
  ShinyStyleProvider,
} from "../src/CaptionedVideo/styles/PageShiny";
import {
  PageGadzhi,
  gadzhiSchema,
  GADZHI_DEFAULTS,
  GadzhiStyleProvider,
} from "../src/CaptionedVideo/styles/PageGadzhi";
import {
  PageKinetic,
  kineticSchema,
  KINETIC_DEFAULTS,
  KineticStyleProvider,
} from "../src/CaptionedVideo/styles/PageKinetic";

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
  // TRUE for templates that render the whole timeline themselves from the
  // caption DOCUMENT (`segments`) — the kinetic ones. FALSE for the per-page
  // styles, which only paint one pre-grouped TikTokPage handed to them by the
  // engine. The caption editor can only drive the document-driven templates,
  // since its whole job is editing that document; the Style Tuner shows all.
  documentDriven?: boolean;
  // Which per-template segmentation variant this style reads from the caption
  // document (CaptionDoc.variants[shape]); falls back to the default segments.
  shape?: string;
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
  {
    id: "Hormozi",
    schema: hormoziSchema,
    defaults: stripSrc(HORMOZI_DEFAULTS),
    Provider: HormoziStyleProvider as unknown as React.Provider<never>,
    Page: PageHormozi,
    documentDriven: true,
    shape: "hormozi",
  },
  {
    id: "Shiny",
    schema: shinySchema,
    defaults: stripSrc(SHINY_DEFAULTS),
    Provider: ShinyStyleProvider as unknown as React.Provider<never>,
    Page: PageShiny,
    documentDriven: true,
    shape: "shiny",
  },
  {
    id: "Gadzhi",
    schema: gadzhiSchema,
    defaults: stripSrc(GADZHI_DEFAULTS),
    Provider: GadzhiStyleProvider as unknown as React.Provider<never>,
    Page: PageGadzhi,
    documentDriven: true,
    shape: "gadzhi",
  },
  {
    id: "Kinetic",
    schema: kineticSchema,
    defaults: stripSrc(KINETIC_DEFAULTS),
    Provider: KineticStyleProvider as unknown as React.Provider<never>,
    Page: PageKinetic,
    documentDriven: true,
    shape: "kinetic",
  },
];

/** The templates the caption editor can preview (they read `segments`). */
export const EDITOR_STYLES: StyleEntry[] = STYLES.filter((s) => s.documentDriven);

export const STYLE_BY_ID: Record<string, StyleEntry> = Object.fromEntries(
  STYLES.map((s) => [s.id, s]),
);
