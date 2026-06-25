import React, { createContext, useContext } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import {
  textEffectsSchema,
  textStrokeCss,
  dropShadowCss,
  TEXT_EFFECTS_DEFAULTS,
  type TextEffects,
} from "./text-effects";
import {
  fontFamilySchema,
  FONT_DEFAULTS,
  resolveFontFamily,
  type FontFamilyName,
} from "./fonts";

// ---------------------------------------------------------------------------
// User-customizable props (rendered as sliders / color pickers in the Studio
// right panel). The Shiny composition uses `shinySchema`; Classic keeps
// the plain `captionedVideoSchema`.
//
// Props are organized into NESTED zod objects so Remotion Studio groups them
// under collapsible headers (text / animation / gradient / glow / deepGlow /
// sweep1-3 / shadow / stroke) instead of one flat list. `src` stays at the top
// level. The grouping is purely structural — every prop, value and behavior is
// identical to the old flat schema.
// ---------------------------------------------------------------------------
// Every numeric prop has .min()/.max() (so Studio renders a slider, not a plain
// number field) plus .step() for sensible granularity.

// One light-sweep slot's schema, reused for sweep1 / sweep2 / sweep3.
const sweepSchema = z.object({
  enabled: z.boolean(),
  color: zColor(),
  angle: z.number().min(0).max(360).step(1),
  width: z.number().min(1).max(100).step(1),
  intensity: z.number().min(0).max(100).step(1),
  positionX: z.number().min(0).max(100).step(1),
  positionY: z.number().min(0).max(100).step(1),
});

export const shinySchema = captionedVideoSchema.extend({
  // --- Layout mode (safe additive toggle) ---
  // "single" = the ORIGINAL Shiny look (one line of words, unchanged).
  // "kinetic" = NEW multi-line stacked layout (Hormozi / viral-caption style):
  // words grouped into lines, lines into segments, normal words plain WHITE and
  // rule-emphasized words wearing Shiny's existing gradient + glow treatment.
  layoutMode: z.enum(["single", "kinetic"]),

  // --- Kinetic layout controls (only used when layoutMode === "kinetic") ---
  kinetic: z.object({
    wordsPerLine: z.number().min(1).max(8).step(1), // words stacked per line -> slider
    linesPerSegment: z.number().min(1).max(6).step(1), // lines shown at once -> slider
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line spacing -> slider
    positionY: z.number().min(0).max(100).step(1), // block vertical center (0 top, 100 bottom)
    // Per-LINE horizontal alignment (the Hormozi stagger). A line that contains
    // an emphasized word uses `emphasisAlignment`; other lines use
    // `normalAlignment` ("alternate" = left/right by line index). See
    // decideLineAlignment.
    emphasisAlignment: z.enum(["center", "left", "right"]), // emphasized lines -> dropdown
    normalAlignment: z.enum(["alternate", "left", "right", "center"]), // normal lines -> dropdown
  }),

  // --- Text (font + per-word emphasis) ---
  // `fontFamily` is the BASE font (normal words). In kinetic mode, emphasized
  // words (see decideEmphasis) instead use `emphasisFontFamily`, render at
  // `emphasisScale` (bigger), and wear the shiny gradient + glow. The optional
  // emphasis color fades the spoken word to a solid color over the gradient.
  text: z.object({
    fontFamily: fontFamilySchema.fontFamily, // base font dropdown (normal words)
    emphasisFontFamily: fontFamilySchema.fontFamily, // font for EMPHASIZED words (kinetic)
    emphasisScale: z.number().min(1).max(2).step(0.05), // emphasized-word size -> slider
    emphasisColorEnabled: z.boolean(), // OFF by default
    emphasisColor: zColor(), // color the spoken word takes
  }),

  // --- Per-word directional ENTRANCE ---
  // One flexible system covers both subtle "rises" and dramatic "slides": each
  // word animates IN from `entranceDirection` while fading in, then settles in
  // place. `entranceDistance` (small = subtle rise, large = big slide) sets how
  // far it travels; `entranceDuration` its speed; `entranceEasing` /
  // `entranceEasingSpeed` the curve (reused from the Typewriter template).
  //
  // The `entrance*` props drive NORMAL words. In kinetic mode, EMPHASIZED words
  // get their OWN entrance via the `emphasisEntrance*` props (same controls), so
  // the two can move differently (e.g. normal words rise gently while emphasized
  // words slide in bigger from the left). `entranceDuration` (speed) is shared.
  animation: z.object({
    entranceDirection: z.enum(["up", "down", "left", "right"]), // where the word comes FROM
    entranceDistance: z.number().min(5).max(300).step(1), // px traveled -> slider
    entranceDuration: z.number().min(5).max(30).step(1), // entrance length (frames) -> slider
    entranceEasing: z.enum(["smooth", "sharp", "bouncy"]), // curve type -> dropdown
    entranceEasingSpeed: z.number().min(1).max(6).step(0.1), // curve intensity -> slider
    // EMPHASIZED-word entrance (kinetic mode only). Mirrors the props above.
    emphasisEntranceDirection: z.enum(["up", "down", "left", "right"]),
    emphasisEntranceDistance: z.number().min(5).max(300).step(1), // px traveled -> slider
    emphasisEntranceEasing: z.enum(["smooth", "sharp", "bouncy"]), // curve type -> dropdown
    emphasisEntranceEasingSpeed: z.number().min(1).max(6).step(0.1), // curve intensity -> slider
  }),

  // --- Text gradient (multi-stop; direction set by angle) ---
  // angle sets the direction (180 = top->bottom, 90 = left->right, ...).
  // Two required stops (top + bottom) plus an OPTIONAL middle stop. Each stop
  // has a color picker and a 0–100 position controlling WHERE that color sits
  // along the gradient axis, so the user can make one color dominate (e.g. top
  // at 0, bottom at 70). The CSS is built dynamically from the enabled stops.
  gradient: z.object({
    angle: z.number().min(0).max(360).step(1), // gradient direction -> slider
    topColor: zColor(),
    topPosition: z.number().min(0).max(100).step(1), // where the top color sits
    midEnabled: z.boolean(), // toggle the optional 3rd stop (default OFF)
    midColor: zColor(),
    midPosition: z.number().min(0).max(100).step(1), // where the middle color sits
    bottomColor: zColor(),
    bottomPosition: z.number().min(0).max(100).step(1), // where the bottom color sits
  }),

  // --- Glow ---
  glow: z.object({
    strength: z.number().min(0).max(100).step(1), // glow radius -> slider
    color: zColor(), // color picker
  }),

  // --- Deep Glow (After Effects "Deep Glow" plugin look) ---
  // A separate, physically-inspired bloom built from MANY layered drop-shadows
  // at increasing radii with inverse-square-falloff opacity (soft multi-radius
  // bloom, not a flat halo). Inner stops use the inner color, outer stops fade
  // to the outer color. Independent of the existing glow above — additive.
  deepGlow: z.object({
    enabled: z.boolean(), // OFF by default; extra glow option
    radius: z.number().min(0).max(150).step(1), // overall bloom reach -> slider
    brightness: z.number().min(0).max(100).step(1), // bloom intensity -> slider
    innerColor: zColor(), // color near the text (hot core)
    outerColor: zColor(), // color of the outer falloff
    chromatic: z.number().min(0).max(20).step(1), // chromatic aberration px -> slider
  }),

  // --- Light sweeps (up to THREE glossy shine bands clipped to the text) ---
  // Each slot is a bright gradient band layered ON TOP of the fill gradient,
  // independently toggled / angled / positioned. All enabled slots render
  // layered. Purely additive — the glow + gradient stay intact. sweep1 is on by
  // default (the original sweep); sweep2 + sweep3 default off.
  sweep1: sweepSchema,
  sweep2: sweepSchema,
  sweep3: sweepSchema,

  // --- Shared shadow + stroke (same field defs as textEffectsSchema, nested) ---
  shadow: z.object({
    enabled: textEffectsSchema.shadowEnabled,
    color: textEffectsSchema.shadowColor,
    blur: textEffectsSchema.shadowBlur,
  }),
  stroke: z.object({
    enabled: textEffectsSchema.strokeEnabled,
    color: textEffectsSchema.strokeColor,
    width: textEffectsSchema.strokeWidth,
  }),
});

// The direction a word comes FROM as it enters, and the easing curve shape.
export type EntranceDirection = "up" | "down" | "left" | "right";
export type EntranceEasing = "smooth" | "sharp" | "bouncy";
export type LayoutMode = "single" | "kinetic";

// Per-line kinetic alignment. A resolved line aligns left/center/right; the
// emphasis/normal props pick which, with normal supporting "alternate".
export type LineAlignment = "left" | "center" | "right";
export type EmphasisAlignment = "center" | "left" | "right";
export type NormalAlignment = "alternate" | "left" | "right" | "center";

export type ShinyStyle = {
  layoutMode: LayoutMode;
  kinetic: {
    wordsPerLine: number;
    linesPerSegment: number;
    lineSpacing: number;
    positionY: number;
    emphasisAlignment: EmphasisAlignment;
    normalAlignment: NormalAlignment;
  };
  text: {
    fontFamily: FontFamilyName;
    emphasisFontFamily: FontFamilyName;
    emphasisScale: number;
    emphasisColorEnabled: boolean;
    emphasisColor: string;
  };
  animation: {
    entranceDirection: EntranceDirection;
    entranceDistance: number;
    entranceDuration: number;
    entranceEasing: EntranceEasing;
    entranceEasingSpeed: number;
    emphasisEntranceDirection: EntranceDirection;
    emphasisEntranceDistance: number;
    emphasisEntranceEasing: EntranceEasing;
    emphasisEntranceEasingSpeed: number;
  };
  gradient: {
    angle: number;
    topColor: string;
    topPosition: number;
    midEnabled: boolean;
    midColor: string;
    midPosition: number;
    bottomColor: string;
    bottomPosition: number;
  };
  glow: {
    strength: number;
    color: string;
  };
  deepGlow: {
    enabled: boolean;
    radius: number;
    brightness: number;
    innerColor: string;
    outerColor: string;
    chromatic: number;
  };
  sweep1: SweepSlot;
  sweep2: SweepSlot;
  sweep3: SweepSlot;
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
  };
  stroke: {
    enabled: boolean;
    color: string;
    width: number;
  };
};

// Defaults are also used as the context fallback if a Shiny page is ever
// rendered without a provider (e.g. in isolation / tests). Default = TWO stops
// (top at 0%, bottom at 100%); the middle stop is OFF until the user enables it.
export const SHINY_DEFAULTS: ShinyStyle = {
  layoutMode: "single",
  kinetic: {
    wordsPerLine: 3,
    linesPerSegment: 4,
    lineSpacing: 1.1,
    positionY: 65,
    emphasisAlignment: "center",
    normalAlignment: "alternate",
  },
  text: {
    fontFamily: FONT_DEFAULTS.fontFamily,
    emphasisFontFamily: FONT_DEFAULTS.fontFamily,
    emphasisScale: 1.4,
    emphasisColorEnabled: false,
    emphasisColor: "#ffffff",
  },
  animation: {
    entranceDirection: "up",
    entranceDistance: 30,
    entranceDuration: 12,
    entranceEasing: "smooth",
    entranceEasingSpeed: 3,
    emphasisEntranceDirection: "up",
    emphasisEntranceDistance: 50,
    emphasisEntranceEasing: "smooth",
    emphasisEntranceEasingSpeed: 3,
  },
  gradient: {
    angle: 180,
    topColor: "#ffe14d",
    topPosition: 0,
    midEnabled: false,
    midColor: "#ff8a00",
    midPosition: 50,
    bottomColor: "#ff3d00",
    bottomPosition: 100,
  },
  glow: {
    strength: 30,
    color: "#ff8a00",
  },
  deepGlow: {
    enabled: false,
    radius: 60,
    brightness: 70,
    innerColor: "#fff5e6",
    outerColor: "#ff8a00",
    chromatic: 0,
  },
  sweep1: {
    enabled: true,
    color: "#ffffff",
    angle: 20,
    width: 30,
    intensity: 70,
    positionX: 50,
    positionY: 50,
  },
  sweep2: {
    enabled: false,
    color: "#ffffff",
    angle: 160,
    width: 20,
    intensity: 50,
    positionX: 50,
    positionY: 50,
  },
  sweep3: {
    enabled: false,
    color: "#ffffff",
    angle: 90,
    width: 15,
    intensity: 40,
    positionX: 50,
    positionY: 50,
  },
  shadow: {
    enabled: TEXT_EFFECTS_DEFAULTS.shadowEnabled,
    color: TEXT_EFFECTS_DEFAULTS.shadowColor,
    blur: TEXT_EFFECTS_DEFAULTS.shadowBlur,
  },
  stroke: {
    enabled: TEXT_EFFECTS_DEFAULTS.strokeEnabled,
    color: TEXT_EFFECTS_DEFAULTS.strokeColor,
    width: TEXT_EFFECTS_DEFAULTS.strokeWidth,
  },
};

/**
 * Builds the text gradient CSS from the enabled stops + positions, in the
 * direction set by `gradientAngle` (180 = top->bottom, 90 = left->right, ...).
 * Always includes top + bottom; includes the middle stop only when toggled on.
 * Stops are ordered top -> middle -> bottom along the gradient axis.
 */
const buildGradientCss = (s: ShinyStyle): string => {
  const g = s.gradient;
  const stops: { color: string; position: number }[] = [
    { color: g.topColor, position: g.topPosition },
    ...(g.midEnabled
      ? [{ color: g.midColor, position: g.midPosition }]
      : []),
    { color: g.bottomColor, position: g.bottomPosition },
  ];
  const list = stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
  return `linear-gradient(${g.angle}deg, ${list})`;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// One light-sweep slot's settings (matches the nested sweep group shape).
type SweepSlot = {
  enabled: boolean;
  color: string;
  angle: number;
  width: number;
  intensity: number;
  positionX: number;
  positionY: number;
};

// The three sweep slots, in render order. Each group already has SweepSlot shape.
const getSweepSlots = (s: ShinyStyle): SweepSlot[] => [s.sweep1, s.sweep2, s.sweep3];

/**
 * Builds one glossy light-sweep band as a linear-gradient. The band is a bright
 * stripe (soft edges -> bright core -> soft edges) centered on the gradient
 * axis, tilted by `slot.angle`. `slot.width` controls its thickness and
 * `slot.intensity` its brightness/opacity (applied via color-mix so any color
 * format works). This is layered ABOVE the fill gradient and clipped to text,
 * so where it's transparent the gradient shows through and where it's bright it
 * reads as a metallic shine. Horizontal/vertical placement is done with
 * background-position over an oversized background-size (see component).
 */
const buildSweepCss = (slot: SweepSlot): string => {
  const half = Math.max(1, slot.width / 2);
  const core = 50;
  const a = clamp(core - half, 0, 100); // outer transparent edge
  const b = clamp(core + half, 0, 100);
  const innerA = clamp(core - half / 2, 0, 100); // soft falloff toward core
  const innerB = clamp(core + half / 2, 0, 100);
  const bright = `color-mix(in srgb, ${slot.color} ${slot.intensity}%, transparent)`;
  const soft = `color-mix(in srgb, ${slot.color} ${slot.intensity * 0.35}%, transparent)`;
  return (
    `linear-gradient(${slot.angle}deg, ` +
    `transparent ${a}%, ${soft} ${innerA}%, ${bright} ${core}%, ${soft} ${innerB}%, transparent ${b}%)`
  );
};

// Number of concentric bloom layers. More layers = smoother falloff; this is a
// good quality/perf balance (each layer is a drop-shadow the GPU must composite).
const DEEP_GLOW_LAYERS = 7;

/**
 * Recreates the After Effects "Deep Glow" plugin look as a chain of `drop-shadow`
 * filters. Real Deep Glow does a thresholded, gaussian-pyramid bloom with a
 * near-physical (inverse-square) falloff. We approximate that by stacking many
 * concentric shadows:
 *   - radius grows from a hot core out to `deepGlowRadius`
 *   - per-layer opacity decays ~1/(1+(k·t)^2) — inverse-square-style falloff, so
 *     the core is bright and the bloom trails off softly (not a flat halo)
 *   - color is interpolated from `deepGlowInnerColor` (core) to
 *     `deepGlowOuterColor` (edge) via color-mix
 *   - `deepGlowChromatic` > 0 adds offset red/blue fringe shadows (lens-style
 *     chromatic aberration on the bloom)
 * Returns "" when disabled so it contributes nothing to the filter chain.
 */
const buildDeepGlowCss = (s: ShinyStyle): string => {
  const d = s.deepGlow;
  if (!d.enabled || d.radius <= 0) return "";
  const intensity = d.brightness / 100;
  const parts: string[] = [];

  for (let i = 0; i < DEEP_GLOW_LAYERS; i++) {
    const t = i / (DEEP_GLOW_LAYERS - 1); // 0 (core) -> 1 (outer edge)
    const radius = d.radius * (0.12 + 0.88 * t);
    // Inverse-square-style falloff: bright core, soft trailing bloom.
    const falloff = 1 / (1 + Math.pow(t * 3, 2));
    const alpha = clamp(intensity * falloff, 0, 1);
    if (alpha <= 0) continue;
    const blended = `color-mix(in srgb, ${d.innerColor} ${Math.round((1 - t) * 100)}%, ${d.outerColor})`;
    const color = `color-mix(in srgb, ${blended} ${Math.round(alpha * 100)}%, transparent)`;
    parts.push(`drop-shadow(0 0 ${radius.toFixed(1)}px ${color})`);
  }

  // Chromatic aberration: split a mid-radius bloom into red/blue fringes that
  // are offset in opposite directions along x, mimicking lens dispersion.
  const c = d.chromatic;
  if (c > 0) {
    const r = (d.radius * 0.35).toFixed(1);
    const a = Math.round(clamp(intensity * 0.5, 0, 1) * 100);
    parts.push(`drop-shadow(${c}px 0 ${r}px color-mix(in srgb, #ff0000 ${a}%, transparent))`);
    parts.push(`drop-shadow(${-c}px 0 ${r}px color-mix(in srgb, #00a2ff ${a}%, transparent))`);
  }

  return parts.join(" ");
};

// The seam that carries the schema props from Root down to the style without
// touching the shared engine (CaptionedVideo / SubtitlePage).
const ShinyStyleContext = createContext<ShinyStyle>(SHINY_DEFAULTS);
export const ShinyStyleProvider = ShinyStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — non-prop tuning. (Entrance direction/distance/duration/easing are
// now props; see shinySchema.)
// ---------------------------------------------------------------------------
const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;

// ---------------------------------------------------------------------------
// Directional entrance settings.
// ---------------------------------------------------------------------------
// Maps the chosen direction to the word's STARTING offset (where it enters
// FROM): it begins at sign * entranceDistance along this axis and eases to 0.
//   up    -> starts BELOW  (y +)  rising up into place
//   down  -> starts ABOVE  (y -)  dropping down into place
//   left  -> starts RIGHT  (x +)  sliding left into place
//   right -> starts LEFT   (x -)  sliding right into place
const ENTRANCE_VECTOR: Record<EntranceDirection, { axis: "x" | "y"; sign: number }> = {
  up: { axis: "y", sign: 1 },
  down: { axis: "y", sign: -1 },
  left: { axis: "x", sign: 1 },
  right: { axis: "x", sign: -1 },
};

// A resolved entrance: which easing curve, which axis/sign the word enters from,
// and how far it travels. Normal and emphasized words each get their own.
type EntranceConfig = {
  easingFn: (input: number) => number;
  axis: "x" | "y";
  sign: number;
  distance: number;
};

/**
 * Builds the entrance easing function from the `entranceEasing` TYPE (dropdown)
 * and the `entranceEasingSpeed` SLIDER (curve intensity):
 *   - smooth -> a proper EASE-OUT: fast at the start, decelerating gently into
 *     the resting position (velocity reaches ~0 at the end, so NO abrupt stop).
 *     `Easing.out(Easing.cubic)` is the canonical curve; easingSpeed lets you
 *     dial it (2 = quadratic, 3 = cubic, higher = snappier) but it is FLOORED at
 *     2 so "smooth" can never collapse to linear (which caused the abrupt stop).
 *   - bouncy -> ease-out with a slight overshoot (easingSpeed = overshoot).
 *   - sharp  -> snappy/linear (easingSpeed ignored).
 */
const makeEntranceEasing = (
  type: EntranceEasing,
  easingSpeed: number,
): ((input: number) => number) => {
  switch (type) {
    case "smooth":
      // Ease-OUT (decelerates into place). Floored at 2 so it always curves —
      // Easing.out(Easing.poly(3)) === Easing.out(Easing.cubic).
      return Easing.out(Easing.poly(Math.max(2, easingSpeed)));
    case "bouncy":
      return Easing.out(Easing.back(easingSpeed));
    case "sharp":
    default:
      return Easing.linear;
  }
};

// ---------------------------------------------------------------------------
// EMPHASIS DECISION (kinetic mode) — RULE-BASED placeholder, NO API yet.
// ---------------------------------------------------------------------------
/**
 * THE single seam that decides whether a kinetic-mode word is emphasized.
 * Returns true/false. Emphasized words get the shiny gradient + glow, a larger
 * scale (emphasisScale) and a different font (emphasisFontFamily); normal words
 * stay plain white, base font, normal size.
 *
 * Current RULE: a word is emphasized if it CONTAINS A NUMBER, is ALL-CAPS
 * (2+ letters), or has MORE THAN 6 letters.
 *
 * To later swap for a Claude API call, replace ONLY this function body — keep
 * the `(word: string) => boolean` signature so the call site never changes.
 */
export const decideEmphasis = (rawWord: string): boolean => {
  const word = rawWord.trim();
  const letters = word.replace(/[^A-Za-z]/g, "");
  // 1) contains a digit (e.g. "5", "2024", "10x")
  if (/\d/.test(word)) return true;
  // 2) ALL-CAPS acronym / shout (need 2+ letters so "I"/"A" don't count)
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  // 3) long word (> 6 letters)
  if (letters.length > 6) return true;
  return false;
};

// ---------------------------------------------------------------------------
// PER-LINE ALIGNMENT (kinetic mode) — RULE-BASED, separated for an AI swap.
// ---------------------------------------------------------------------------
/**
 * THE single seam that decides ONE kinetic line's horizontal alignment (the
 * Hormozi stagger). A line that contains any emphasized word uses
 * `emphasisAlignment`; every other ("normal") line uses `normalAlignment`,
 * where "alternate" means left/right by line index. Returns a CONCRETE
 * "left" | "center" | "right".
 *
 * To later drive this from AI, replace ONLY this function body — keep the
 * signature so the call site never changes.
 */
export const decideLineAlignment = (
  lineWords: { text: string }[],
  lineIndex: number,
  emphasisAlignment: EmphasisAlignment,
  normalAlignment: NormalAlignment,
): LineAlignment => {
  // Emphasized line (any emphasized word) -> emphasisAlignment.
  if (lineWords.some((w) => decideEmphasis(w.text))) {
    return emphasisAlignment;
  }
  // Normal line -> normalAlignment ("alternate" staggers left/right by index).
  if (normalAlignment === "alternate") {
    return lineIndex % 2 === 0 ? "left" : "right";
  }
  return normalAlignment;
};

// Maps a resolved line alignment to the flex `justify-content` that positions
// the line's words within the full-width line row.
const ALIGN_TO_JUSTIFY: Record<LineAlignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// ---------------------------------------------------------------------------
// KINETIC GROUPING — dedicated COUNT-BASED chopping of the FLAT word stream.
// (This is the function that makes wordsPerLine / linesPerSegment matter. It
// does NOT use the time-based createTikTokStyleCaptions grouping at all.)
// ---------------------------------------------------------------------------
export type KineticWord = { text: string; fromMs: number; toMs: number };
export type KineticBlock = {
  /** The block's words, already chopped into lines of `wordsPerLine`. */
  lines: KineticWord[][];
  /** First word's start (block appears here). */
  startMs: number;
  /** Last word's end (block has finished being spoken here). */
  endMs: number;
};

/**
 * Chops a FLAT, in-order array of caption words into kinetic BLOCKS purely BY
 * COUNT (never by time):
 *   STEP 1 — every `wordsPerLine` words becomes one LINE.
 *   STEP 2 — every `linesPerSegment` lines becomes one BLOCK (so a block holds
 *            wordsPerLine × linesPerSegment words, stacked vertically).
 *   STEP 3 — each block is stamped with the start of its first word and the end
 *            of its last word, so it can be shown while those words are spoken.
 *
 * Example: wordsPerLine=2, linesPerSegment=3 -> blocks of 3 lines × 2 words.
 */
export const groupWordsIntoBlocks = (
  words: KineticWord[],
  wordsPerLine: number,
  linesPerSegment: number,
): KineticBlock[] => {
  const perLine = Math.max(1, Math.floor(wordsPerLine));
  const linesPerBlock = Math.max(1, Math.floor(linesPerSegment));
  const wordsPerBlock = perLine * linesPerBlock;

  const blocks: KineticBlock[] = [];
  // STEP 2: walk the flat stream one block (wordsPerBlock words) at a time.
  for (let i = 0; i < words.length; i += wordsPerBlock) {
    const blockWords = words.slice(i, i + wordsPerBlock);
    if (blockWords.length === 0) continue;

    // STEP 1: chop this block's words into lines of `wordsPerLine`.
    const lines: KineticWord[][] = [];
    for (let j = 0; j < blockWords.length; j += perLine) {
      lines.push(blockWords.slice(j, j + perLine));
    }

    // STEP 3: time window = first word start -> last word end.
    blocks.push({
      lines,
      startMs: blockWords[0].fromMs,
      endMs: blockWords[blockWords.length - 1].toMs,
    });
  }
  return blocks;
};

/**
 * Shiny style: a warm gradient text fill with a strong glow.
 *
 * Two layout modes (prop `layoutMode`):
 *   - "single" (default): the ORIGINAL look — one centered line of words, each
 *     animating IN from `entranceDirection` while fading in, with the per-word
 *     emphasis (glow + optional emphasis color) tracking the spoken timing.
 *   - "kinetic": a multi-line stacked block (Hormozi / viral-caption style).
 *     Normal words are plain WHITE; rule-emphasized words (see decideEmphasis)
 *     reuse the SAME gradient + glow treatment. Words still enter directionally.
 *
 * Glow + gradient colors come from props via ShinyStyleContext.
 */
export const PageShiny: React.FC<CaptionStyleProps> = ({ page, captions = [] }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const style = useContext(ShinyStyleContext);
  // `captions` (the flat word stream) is passed by the engine only in the
  // single-surface kinetic path; it drives kinetic's own count-based grouping.
  const { strength: glowStrength, color: glowColor } = style.glow;
  const {
    entranceDirection,
    entranceDistance,
    entranceDuration,
    entranceEasing,
    entranceEasingSpeed,
    emphasisEntranceDirection,
    emphasisEntranceDistance,
    emphasisEntranceEasing,
    emphasisEntranceEasingSpeed,
  } = style.animation;

  // Entrance config (easing curve + which axis/sign the word enters from +
  // travel distance). NORMAL words use `normalEntrance`; in kinetic mode the
  // EMPHASIZED words use `emphasisEntrance` instead, so the two animate
  // independently. `entranceDuration` (the window) is shared by both.
  const normalEntrance: EntranceConfig = {
    easingFn: makeEntranceEasing(entranceEasing, entranceEasingSpeed),
    ...ENTRANCE_VECTOR[entranceDirection],
    distance: entranceDistance,
  };
  const emphasisEntrance: EntranceConfig = {
    easingFn: makeEntranceEasing(emphasisEntranceEasing, emphasisEntranceEasingSpeed),
    ...ENTRANCE_VECTOR[emphasisEntranceDirection],
    distance: emphasisEntranceDistance,
  };

  const fontFamily = resolveFontFamily(style.text.fontFamily);
  // Font + scale used by EMPHASIZED words in kinetic mode (normal words use the
  // base font + scale 1).
  const emphasisFontFamily = resolveFontFamily(style.text.emphasisFontFamily);
  const emphasisScale = style.text.emphasisScale;
  // Vertical text gradient, built from the enabled stops + their positions.
  const gradientCss = buildGradientCss(style);

  // Glossy light sweeps layered ABOVE the gradient (all clipped to text). Each
  // enabled slot is its own background layer; the tile is oversized so
  // background-position can move the band anywhere via positionX/Y. The base
  // gradient stays full-size at origin as the bottom layer. The optional
  // per-word emphasis color is inserted just above the gradient, per token,
  // inside the map below (its opacity tracks each word's emphasis).
  const activeSweeps = getSweepSlots(style).filter((slot) => slot.enabled);
  const sweepLayers = activeSweeps.map(buildSweepCss);
  const sweepSizes = activeSweeps.map(() => "300% 300%");
  const sweepPositions = activeSweeps.map(
    (slot) => `${slot.positionX}% ${slot.positionY}%`,
  );

  const easeMs = (entranceDuration / fps) * 1000;

  // Gradient text has a transparent fill, so text-shadow won't render — the
  // shadow is applied as a drop-shadow in each word's filter chain instead.
  // The stroke is an inherited property, so it's set once on the container.
  // The shared shadow/stroke helpers take the flat TextEffects shape, so adapt
  // the nested shadow/stroke groups into it.
  const textEffects: TextEffects = {
    shadowEnabled: style.shadow.enabled,
    shadowColor: style.shadow.color,
    shadowBlur: style.shadow.blur,
    strokeEnabled: style.stroke.enabled,
    strokeColor: style.stroke.color,
    strokeWidth: style.stroke.width,
  };
  const stroke = textStrokeCss(textEffects);
  const shadowFilter = dropShadowCss(textEffects);

  // Deep Glow bloom — constant per word (it's a property of the text, like the
  // AE plugin), so build it once here rather than per token. Empty when disabled.
  const deepGlowFilter = buildDeepGlowCss(style);

  // -------------------------------------------------------------------------
  // Shared per-word painters (used by BOTH modes so an emphasized word looks
  // identical everywhere — this is the "reuse the existing Shiny effects" seam).
  // -------------------------------------------------------------------------
  type Token = (typeof page.tokens)[number];

  // Per-word directional entrance (fade-in + travel) from the word's own caption
  // timing, using the given `cfg` (direction/distance/easing). Returns the
  // entrance fade-in opacity (no fade-out) and the travel offset, plus the raw
  // window so single mode can add its spoken-emphasis ramp. Defaults to
  // `normalEntrance`, so single mode's call site is unchanged.
  const wordEntrance = (
    token: Token,
    fullWindow = false,
    cfg: EntranceConfig = normalEntrance,
  ) => {
    const relStart = token.fromMs - page.startMs;
    // Guarantee a non-zero window so every inputRange stays valid even for
    // zero-duration tokens.
    const relEnd = Math.max(token.toMs - page.startMs, relStart + 1);
    // SINGLE mode caps the ease at half the word's duration so the fade-out +
    // emphasis ranges that follow stay strictly increasing. KINETIC words don't
    // fade out, so they use the FULL entrance duration (`easeMs`) — this is what
    // lets the ease-out actually play out and settle GENTLY instead of snapping
    // when a word is short (a ~4-frame window hides the decelerating tail).
    const safeEase = Math.min(easeMs, (relEnd - relStart) / 2);
    const entranceWindow = fullWindow ? Math.max(1, easeMs) : safeEase;
    // 0 (just appearing, fully offset) -> 1 (settled). Eased with the chosen
    // curve (smooth / sharp / bouncy).
    const entranceProgress = interpolate(
      timeInMs,
      [relStart, relStart + entranceWindow],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: cfg.easingFn,
      },
    );
    // bouncy/back easing can overshoot, so clamp the fade-in to [0,1].
    const fadeInOpacity = Math.min(1, Math.max(0, entranceProgress));
    const offset = cfg.distance * (1 - entranceProgress);
    const tx = cfg.axis === "x" ? cfg.sign * offset : 0;
    const ty = cfg.axis === "y" ? cfg.sign * offset : 0;
    return { relStart, relEnd, safeEase, fadeInOpacity, tx, ty };
  };

  // Composes a Shiny word's clipped background layers (sweeps on top, optional
  // emphasis color over the gradient, then the gradient) for a given emphasis.
  const buildShinyBg = (emphasis: number) => {
    const bgLayers = [...sweepLayers];
    const bgSizes = [...sweepSizes];
    const bgPositions = [...sweepPositions];
    if (style.text.emphasisColorEnabled && emphasis > 0) {
      const ec = `color-mix(in srgb, ${style.text.emphasisColor} ${Math.round(emphasis * 100)}%, transparent)`;
      bgLayers.push(`linear-gradient(0deg, ${ec}, ${ec})`);
      bgSizes.push("100% 100%");
      bgPositions.push("0% 0%");
    }
    bgLayers.push(gradientCss);
    bgSizes.push("100% 100%");
    bgPositions.push("0% 0%");
    return { bgLayers, bgSizes, bgPositions };
  };

  // The two warm glow shadows (scaled by emphasis), then the optional Deep Glow
  // bloom, then the customizable drop shadow. Empty pieces are filtered out.
  const buildShinyFilter = (emphasis: number): string =>
    [
      `drop-shadow(0 0 ${glowStrength * (1 + emphasis)}px ${glowColor})`,
      `drop-shadow(0 0 ${glowStrength * (1 + emphasis) * 2}px ${glowColor})`,
      deepGlowFilter,
      shadowFilter,
    ]
      .filter(Boolean)
      .join(" ");

  // The full CSS for an emphasized (gradient + glow) word — identical look in
  // both single and kinetic modes.
  const shinyWordStyle = (
    emphasis: number,
    opacity: number,
    transform: string,
  ): React.CSSProperties => {
    const { bgLayers, bgSizes, bgPositions } = buildShinyBg(emphasis);
    return {
      display: "inline-block",
      whiteSpace: "pre",
      opacity,
      transform,
      transformOrigin: "center",
      backgroundImage: bgLayers.join(", "),
      backgroundSize: bgSizes.join(", "),
      backgroundPosition: bgPositions.join(", "),
      backgroundRepeat: "no-repeat",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      // Stroke + paint-order live on the SAME element as the (gradient) fill so
      // `paint-order: stroke` actually paints the stroke FIRST (behind) and the
      // background-clipped gradient fill ON TOP — a clean outline behind the
      // color instead of the stroke eating into the glyphs. (Setting these only
      // on the container and relying on inheritance does not work here.)
      WebkitTextStroke: stroke,
      paintOrder: stroke ? "stroke fill" : undefined,
      // drop-shadow (not text-shadow) so it shows through the transparent
      // gradient fill.
      filter: buildShinyFilter(emphasis),
    };
  };

  // =========================================================================
  // KINETIC mode: multi-line stacked block (Hormozi / viral-caption style).
  // =========================================================================
  if (style.layoutMode === "kinetic") {
    const {
      wordsPerLine,
      linesPerSegment,
      lineSpacing,
      positionY,
      emphasisAlignment,
      normalAlignment,
    } = style.kinetic;

    // Take the FLAT caption stream and chop it strictly BY COUNT into blocks
    // (STEP 1-3 live in groupWordsIntoBlocks). `timeInMs` here is the GLOBAL
    // composition time because kinetic renders as one full-timeline surface.
    const words: KineticWord[] = captions.map((c) => ({
      text: c.text,
      fromMs: c.startMs,
      toMs: c.endMs,
    }));
    const blocks = groupWordsIntoBlocks(words, wordsPerLine, linesPerSegment);

    // Active block: the most recent block that has started. It stays until the
    // next block's first word starts (blocks swap cleanly, no blank gap); the
    // last block holds to the end.
    let active: KineticBlock | null = null;
    for (const b of blocks) {
      if (timeInMs >= b.startMs) active = b;
    }
    const lines = active ? active.lines : [];

    // Size text to the widest line in the block (capped) so the block fits.
    const widest = lines.reduce((w, ln) => {
      const t = ln.map((tk) => tk.text).join("");
      return t.length > w.length ? t : w;
    }, "");
    const kFitted = fitText({
      fontFamily,
      text: widest || "M",
      withinWidth: width * 0.9,
      fontWeight: FONT_WEIGHT,
    });
    const kFontSize = Math.min(DESIRED_FONT_SIZE, kFitted.fontSize);

    return (
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            // 90%-wide block, centered, matching fitText's withinWidth so the
            // widest line just fits. Lines STRETCH to this width so per-line
            // justify-content can offset them left/right (the Hormozi stagger).
            left: "5%",
            right: "5%",
            top: `${positionY}%`,
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            fontSize: kFontSize,
            fontFamily,
            fontWeight: FONT_WEIGHT,
            // Stroke is inherited by the word spans below; each span also sets
            // paint-order so the stroke sits BEHIND its gradient/white fill.
            WebkitTextStroke: stroke,
            paintOrder: stroke ? "stroke fill" : undefined,
          }}
        >
          {lines.map((line, li) => (
            <div
              key={li}
              style={{
                display: "flex",
                // Per-line alignment (rule-based; swappable for AI).
                justifyContent:
                  ALIGN_TO_JUSTIFY[
                    decideLineAlignment(line, li, emphasisAlignment, normalAlignment)
                  ],
                alignItems: "baseline",
                lineHeight: lineSpacing,
                whiteSpace: "pre",
              }}
            >
              {line.map((token, wi) => {
                // THE rule-based decision (swap decideEmphasis for an API later).
                const emphasized = decideEmphasis(token.text);
                // EMPHASIZED words get their OWN entrance (emphasisEntrance);
                // NORMAL words use the standard one. Full window so the ease-out
                // plays out and settles gently (kinetic words persist).
                const { fadeInOpacity, tx, ty } = wordEntrance(
                  token,
                  true,
                  emphasized ? emphasisEntrance : normalEntrance,
                );
                // EMPHASIZED words: shiny gradient + glow, LARGER (emphasisScale)
                // and in `emphasisFontFamily`. NORMAL words: white, base font,
                // normal size.
                if (emphasized) {
                  const transform = `translate(${tx}px, ${ty}px) scale(${emphasisScale})`;
                  return (
                    <span
                      key={wi}
                      style={{
                        ...shinyWordStyle(1, fadeInOpacity, transform),
                        fontFamily: emphasisFontFamily,
                      }}
                    >
                      {token.text}
                    </span>
                  );
                }
                const transform = `translate(${tx}px, ${ty}px)`;
                return (
                  <span
                    key={wi}
                    style={{
                      display: "inline-block",
                      whiteSpace: "pre",
                      opacity: fadeInOpacity,
                      transform,
                      color: "#ffffff",
                      WebkitTextFillColor: "#ffffff",
                      // Stroke painted behind the white fill (clean outline).
                      WebkitTextStroke: stroke,
                      paintOrder: stroke ? "stroke fill" : undefined,
                      filter: shadowFilter || undefined,
                    }}
                  >
                    {token.text}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  // =========================================================================
  // SINGLE mode (default): the ORIGINAL one-line Shiny look — unchanged.
  // =========================================================================
  const fittedText = fitText({
    fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    fontWeight: FONT_WEIGHT,
  });

  const fontSize = Math.min(DESIRED_FONT_SIZE, fittedText.fontSize);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: undefined,
        bottom: 350,
        height: 200,
      }}
    >
      <div
        style={{
          fontSize,
          width: "100%",
          textAlign: "center",
          fontFamily,
          fontWeight: FONT_WEIGHT,
          // Stroke is inherited by the gradient word spans below; each span also
          // sets paint-order so the stroke sits BEHIND its gradient fill.
          WebkitTextStroke: stroke,
          paintOrder: stroke ? "stroke fill" : undefined,
        }}
      >
        {page.tokens.map((token, index) => {
          const { relStart, relEnd, safeEase, fadeInOpacity, tx, ty } = wordEntrance(token);

          // Fade out at the end so the word leaves cleanly (linear, no travel).
          const fadeOut = interpolate(timeInMs, [relEnd, relEnd + safeEase], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.in(Easing.cubic),
          });
          // Visible only between entrance and fade-out.
          const opacity = fadeInOpacity * (1 - fadeOut);

          // Emphasis ramps up while the word is being spoken, down at the edges.
          // With a plateau when the word is long enough, otherwise a triangle
          // (peaks at the midpoint) so the inputRange never collides. Emphasis
          // drives ONLY the glow + optional emphasis color — there is no
          // scale/grow on words (the entrance is purely directional + fade).
          const emphasisIn = relStart + safeEase;
          const emphasisOut = relEnd - safeEase;
          const emphasis =
            emphasisIn < emphasisOut
              ? interpolate(timeInMs, [relStart, emphasisIn, emphasisOut, relEnd], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : interpolate(
                  timeInMs,
                  [relStart, (relStart + relEnd) / 2, relEnd],
                  [0, 1, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

          return (
            <span
              key={index}
              style={shinyWordStyle(emphasis, opacity, `translate(${tx}px, ${ty}px)`)}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
