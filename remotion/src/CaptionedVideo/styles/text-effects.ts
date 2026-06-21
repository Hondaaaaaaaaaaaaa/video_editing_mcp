import type React from "react";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";

// ---------------------------------------------------------------------------
// Shared, customizable text SHADOW + STROKE for every caption style.
//
// One source of truth so Classic / Shiny / Typewriter / Highlight all expose
// the same controls and behave identically. Each template spreads
// `textEffectsSchema` into its own schema, includes `TextEffects` in its style
// type + defaults, and renders with the helpers below.
//
// Defaults are intentionally SUBTLE (legibility, not the old heavy look): a
// short soft drop shadow + a thin black outline. Users can disable or push
// either via the Studio sliders / color pickers / toggles.
// ---------------------------------------------------------------------------

// Spread into a `captionedVideoSchema.extend({ ... })` call.
export const textEffectsSchema = {
  shadowEnabled: z.boolean(),
  shadowColor: zColor(),
  shadowBlur: z.number().min(0).max(40).step(1), // px blur radius -> slider
  strokeEnabled: z.boolean(),
  strokeColor: zColor(),
  strokeWidth: z.number().min(0).max(20).step(0.5), // px outline -> slider
};

export type TextEffects = {
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
};

export const TEXT_EFFECTS_DEFAULTS: TextEffects = {
  shadowEnabled: true,
  shadowColor: "rgba(0, 0, 0, 0.6)",
  shadowBlur: 8,
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 2,
};

// A small constant downward offset keeps the shadow reading as a clean "drop"
// rather than a symmetrical blur halo. Only the blur radius is user-tunable.
const SHADOW_OFFSET_Y = 2;

/** `text-shadow` value, or undefined when disabled (so the style key is dropped). */
export const textShadowCss = (e: TextEffects): string | undefined =>
  e.shadowEnabled ? `0 ${SHADOW_OFFSET_Y}px ${e.shadowBlur}px ${e.shadowColor}` : undefined;

/** `-webkit-text-stroke` value, or undefined when disabled / zero width. */
export const textStrokeCss = (e: TextEffects): string | undefined =>
  e.strokeEnabled && e.strokeWidth > 0 ? `${e.strokeWidth}px ${e.strokeColor}` : undefined;

/**
 * Equivalent of the shadow as a `drop-shadow(...)` filter token. Needed for
 * gradient/transparent-fill text (e.g. Shiny) where `text-shadow` doesn't
 * render. Append to an existing `filter` chain. Empty string when disabled.
 */
export const dropShadowCss = (e: TextEffects): string =>
  e.shadowEnabled ? `drop-shadow(0 ${SHADOW_OFFSET_Y}px ${e.shadowBlur}px ${e.shadowColor})` : "";

/**
 * Ready-to-spread style fragment for SOLID-fill text. `-webkit-text-stroke` and
 * `paint-order` are inherited properties, so applying this on a container also
 * styles the word/letter spans inside it. Stroke is painted behind the fill so
 * it stays a clean outline instead of eating into the glyphs.
 */
export const textEffectStyle = (e: TextEffects): React.CSSProperties => {
  const stroke = textStrokeCss(e);
  return {
    textShadow: textShadowCss(e),
    WebkitTextStroke: stroke,
    paintOrder: stroke ? "stroke" : undefined,
  };
};
