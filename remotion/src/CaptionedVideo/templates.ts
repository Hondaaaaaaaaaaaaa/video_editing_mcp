// ---------------------------------------------------------------------------
// TEMPLATE REGISTRY — the one list of caption templates.
//
// Lives in src/ rather than playground/ because BOTH surfaces need it: the
// Remotion Studio compositions and the playground editor. It previously lived
// only in playground/styles.ts, so the Studio kept a second, hand-maintained
// copy of the same facts and the two could disagree.
//
// Each entry is everything that is true about a template regardless of where
// it is rendered: its schema, its tuned defaults, its context provider, its
// page component, and which segmentation variant it reads.
// ---------------------------------------------------------------------------
import type React from "react";
import type { z } from "zod";
import type { CaptionStyle } from "./styles/types";

import {
  PageClassic,
  classicSchema,
  CLASSIC_DEFAULTS,
  ClassicStyleProvider,
} from "./styles/PageClassic";
import {
  PageTypewriter,
  typewriterSchema,
  TYPEWRITER_DEFAULTS,
  TypewriterStyleProvider,
} from "./styles/PageTypewriter";
import {
  PageHighlight,
  highlightSchema,
  HIGHLIGHT_DEFAULTS,
  HighlightStyleProvider,
} from "./styles/PageHighlight";
import {
  PageHormozi,
  hormoziSchema,
  HORMOZI_DEFAULTS,
  HormoziStyleProvider,
} from "./styles/PageHormozi";
import {
  PageShiny,
  shinySchema,
  SHINY_DEFAULTS,
  ShinyStyleProvider,
} from "./styles/PageShiny";
import {
  PageGadzhi,
  gadzhiSchema,
  GADZHI_DEFAULTS,
  GadzhiStyleProvider,
} from "./styles/PageGadzhi";
import {
  PageKinetic,
  kineticSchema,
  KINETIC_DEFAULTS,
  KineticStyleProvider,
} from "./styles/PageKinetic";
import {
  PageHormozi2,
  hormozi2Schema,
  HORMOZI2_DEFAULTS,
  Hormozi2StyleProvider,
} from "./styles/PageHormozi2";
import {
  PageAli,
  aliSchema,
  ALI_DEFAULTS,
  AliStyleProvider,
} from "./styles/PageAli";
import {
  PageSpeed,
  speedSchema,
  SPEED_DEFAULTS,
  SpeedStyleProvider,
} from "./styles/PageSpeed";
import {
  PageAnimator,
  animatorSchema,
  ANIMATOR_DEFAULTS,
  AnimatorStyleProvider,
} from "./styles/PageAnimator";
import {
  PageClassic2,
  classic2Schema,
  CLASSIC2_DEFAULTS,
  Classic2StyleProvider,
} from "./styles/PageClassic2";
import {
  PageEdits,
  editsSchema,
  EDITS_DEFAULTS,
  EditsStyleProvider,
} from "./styles/PageEdits";

// Props bag = everything in a style's schema EXCEPT `src` (the shared base).
export type TemplateProps = Record<string, unknown>;

export type TemplateDef = {
  id: string;
  // The exact zod object wired to this style's <Composition> in Root.tsx —
  // controls are generated from it, so the playground stays in sync.
  schema: z.ZodTypeAny;
  defaults: TemplateProps;
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
const stripSrc = (defaults: Record<string, unknown>): TemplateProps => {
  const { src: _src, ...rest } = defaults;
  return rest;
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: "Classic",
    schema: classicSchema,
    defaults: stripSrc(CLASSIC_DEFAULTS),
    Provider: ClassicStyleProvider as unknown as React.Provider<never>,
    Page: PageClassic,
    documentDriven: true,
  },
  {
    id: "Edits",
    schema: editsSchema,
    defaults: stripSrc(EDITS_DEFAULTS),
    Provider: EditsStyleProvider as unknown as React.Provider<never>,
    Page: PageEdits,
    documentDriven: true,
    shape: "edits",
  },
  {
    id: "Typewriter",
    schema: typewriterSchema,
    defaults: stripSrc(TYPEWRITER_DEFAULTS),
    Provider: TypewriterStyleProvider as unknown as React.Provider<never>,
    Page: PageTypewriter,
    documentDriven: true,
    shape: "typewriter",
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
  {
    id: "Hormozi 2",
    schema: hormozi2Schema,
    defaults: stripSrc(HORMOZI2_DEFAULTS),
    Provider: Hormozi2StyleProvider as unknown as React.Provider<never>,
    Page: PageHormozi2,
    documentDriven: true,
    shape: "hormozi2",
  },
  {
    id: "Ali",
    schema: aliSchema,
    defaults: stripSrc(ALI_DEFAULTS),
    Provider: AliStyleProvider as unknown as React.Provider<never>,
    Page: PageAli,
    documentDriven: true,
    shape: "ali",
  },
  {
    id: "Speed",
    schema: speedSchema,
    defaults: stripSrc(SPEED_DEFAULTS),
    Provider: SpeedStyleProvider as unknown as React.Provider<never>,
    Page: PageSpeed,
    documentDriven: true,
    shape: "speed",
  },
  {
    id: "Animator",
    schema: animatorSchema,
    defaults: stripSrc(ANIMATOR_DEFAULTS),
    Provider: AnimatorStyleProvider as unknown as React.Provider<never>,
    Page: PageAnimator,
    documentDriven: true,
    shape: "animator",
  },
  {
    id: "Classic 2",
    schema: classic2Schema,
    defaults: stripSrc(CLASSIC2_DEFAULTS),
    Provider: Classic2StyleProvider as unknown as React.Provider<never>,
    Page: PageClassic2,
    documentDriven: true,
    shape: "classic2",
  },
];

/** The templates the caption editor can preview (they read `segments`). */
export const DOCUMENT_DRIVEN: TemplateDef[] = TEMPLATES.filter((t) => t.documentDriven);

export const TEMPLATE_BY_ID: Record<string, TemplateDef> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);
