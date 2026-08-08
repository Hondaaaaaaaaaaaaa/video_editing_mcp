import React, { createContext, useContext } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { measureText } from "@remotion/layout-utils";
import type { CaptionStyleProps, EnrichedSegment } from "./types";
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

// --- Text gradient (multi-stop; direction set by angle) ---
// Extracted to its own exported schema so OTHER templates (e.g. Highlight) can
// reuse the EXACT same gradient controls + buildGradientCss implementation
// instead of reinventing it. angle sets the direction (180 = top->bottom,
// 90 = left->right, ...). Two required stops (top + bottom) plus an OPTIONAL
// middle stop. Each stop has a color picker and a 0–100 position controlling
// WHERE that color sits along the gradient axis.
export const gradientSchema = z.object({
  angle: z.number().min(0).max(360).step(1), // gradient direction -> slider
  topColor: zColor(),
  topPosition: z.number().min(0).max(100).step(1), // where the top color sits
  midEnabled: z.boolean(), // toggle the optional 3rd stop (default OFF)
  midColor: zColor(),
  midPosition: z.number().min(0).max(100).step(1), // where the middle color sits
  bottomColor: zColor(),
  bottomPosition: z.number().min(0).max(100).step(1), // where the bottom color sits
});

export type GradientConfig = z.infer<typeof gradientSchema>;

// One light-sweep slot's schema, reused for sweep1 / sweep2 / sweep3.
// Exported so OTHER templates (e.g. Hormozi) can offer the EXACT same sweep
// controls + buildSweepCss implementation instead of reinventing them.
export const sweepSchema = z.object({
  enabled: z.boolean(),
  color: zColor(),
  angle: z.number().min(0).max(360).step(1),
  width: z.number().min(1).max(100).step(1),
  intensity: z.number().min(0).max(100).step(1),
  positionX: z.number().min(0).max(100).step(1),
  positionY: z.number().min(0).max(100).step(1),
  // MOTION — a moving light sweep. When `animate` is on, the band travels
  // across the whole caption instead of sitting at `positionX`; `speed` sets how
  // fast (1 slow … 10 fast); `bounce` makes it go right then back left (the
  // reference look) vs looping one direction. OPTIONAL so existing docs /
  // defaults that omit these still parse (runtime falls back to off / 5 / bounce).
  animate: z.boolean().optional(),
  speed: z.number().min(1).max(10).step(1).optional(),
  bounce: z.boolean().optional(),
});

// Shared enums for the entrance/easing groups (used by both the NORMAL entrance
// under `animation` and the EMPHASIS entrance under `emphasis`). Exported so
// other templates reuse the identical direction/easing dropdowns.
export const directionEnum = z.enum(["up", "down", "left", "right"]);
export const easingTypeEnum = z.enum(["smooth", "sharp", "bouncy"]);

// --- Warm glow halo + AE "Deep Glow" bloom, extracted to standalone exported
// schemas so other templates (e.g. Hormozi) expose the identical controls and
// feed the SAME buildDeepGlowCss implementation. ---
export const glowSchema = z.object({
  strength: z.number().min(0).max(100).step(1),
  color: zColor(),
});

export const deepGlowSchema = z.object({
  enabled: z.boolean(),
  radius: z.number().min(0).max(150).step(1),
  brightness: z.number().min(0).max(100).step(1),
  innerColor: zColor(),
  outerColor: zColor(),
  chromatic: z.number().min(0).max(20).step(1),
});

export type DeepGlowConfig = z.infer<typeof deepGlowSchema>;

// ---------------------------------------------------------------------------
// SHINY SCHEMA — organized into nested SECTIONS so Studio groups the controls:
//   layout    — how words are grouped & where the caption block sits
//   text      — base font + the color of NORMAL words
//   emphasis  — styling of the rule-emphasized big/shiny words + their entrance
//   effects   — every visual treatment (gradient/glow/deepGlow/sweeps/stroke/shadow)
//   animation — the NORMAL-word entrance + easing
// Every field & behaviour is preserved; only the SHAPE changed for grouped
// display. (True click-to-expand panels are a future web-UI feature.)
// ---------------------------------------------------------------------------
export const shinySchema = captionedVideoSchema.extend({
  // === LAYOUT — count-based grouping + placement of the caption block ===
  layout: z.object({
    wordsPerLine: z.number().min(1).max(8).step(1), // normal words per offset line
    linesPerSegment: z.number().min(1).max(6).step(1), // words per segment block
    captionScale: z.number().min(0.5).max(2).step(0.05), // overall caption size multiplier
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line spacing
    positionX: z.number().min(0).max(100).step(1), // block horizontal center (0 left, 50 center, 100 right)
    positionY: z.number().min(0).max(100).step(1), // block vertical center (0 top, 100 bottom)
    // Per-LINE horizontal alignment (the Hormozi stagger). A line holding an
    // emphasized word uses `emphasisAlignment`; others use `normalAlignment`
    // ("alternate" = left/right by line index). See decideLineAlignment.
    emphasisAlignment: z.enum(["center", "left", "right"]),
    normalAlignment: z.enum(["alternate", "left", "right", "center"]),
  }),

  // === TEXT — base font + the color of NORMAL (non-emphasized) words ===
  text: z.object({
    fontFamily: fontFamilySchema.fontFamily, // base font (normal words)
    baseColor: zColor(), // color of normal words
  }),

  // === EMPHASIS — GROUP-level styling for every rule-emphasized word ===
  // (see decideEmphasis). They render bigger (`scale`) in their own `fontFamily`,
  // wear the gradient + glow (see effects), get the shared X/Y nudge, and have
  // their OWN directional entrance. `colorEnabled`/`color` optionally fade the
  // spoken word to a solid color over the gradient.
  emphasis: z.object({
    scale: z.number().min(1).max(2.5).step(0.05), // emphasized-word size
    fontFamily: fontFamilySchema.fontFamily, // font for emphasized words
    offsetX: z.number().min(-200).max(200).step(1), // nudge emphasized words (px)
    offsetY: z.number().min(-200).max(200).step(1), // nudge emphasized words (px)
    colorEnabled: z.boolean(), // OFF by default
    color: zColor(), // color the spoken word takes
    entrance: z.object({
      direction: directionEnum, // where the word comes FROM
      distance: z.number().min(5).max(300).step(1), // px traveled
      easing: easingTypeEnum, // curve type
      easingSpeed: z.number().min(1).max(6).step(0.1), // curve intensity
    }),
  }),

  // === EFFECTS — all the visual treatments layered on the (emphasized) text ===
  effects: z.object({
    // Multi-stop text gradient (shared gradientSchema). 180 = top->bottom.
    gradient: gradientSchema,
    // Warm glow halo.
    glow: glowSchema,
    // After Effects "Deep Glow" plugin look — a soft multi-radius bloom.
    deepGlow: deepGlowSchema,
    // Up to THREE glossy shine bands clipped to the text (additive).
    sweep1: sweepSchema,
    sweep2: sweepSchema,
    sweep3: sweepSchema,
    // Outline + drop shadow (same field defs as textEffectsSchema, nested).
    stroke: z.object({
      enabled: textEffectsSchema.strokeEnabled,
      color: textEffectsSchema.strokeColor,
      width: textEffectsSchema.strokeWidth,
    }),
    shadow: z.object({
      enabled: textEffectsSchema.shadowEnabled,
      color: textEffectsSchema.shadowColor,
      blur: textEffectsSchema.shadowBlur,
    }),
  }),

  // === ANIMATION — the NORMAL-word directional entrance + its easing ===
  // (Emphasized words have their OWN entrance under `emphasis`.) `duration` is
  // the entrance window in frames and is SHARED by both entrances.
  animation: z.object({
    entrance: z.object({
      direction: directionEnum, // where normal words come FROM
      distance: z.number().min(5).max(300).step(1), // px traveled
      duration: z.number().min(5).max(30).step(1), // entrance length (frames) — shared
    }),
    easing: z.object({
      type: easingTypeEnum, // curve type for normal words
      speed: z.number().min(1).max(6).step(0.1), // curve intensity
    }),
  }),
});

// The direction a word comes FROM as it enters, and the easing curve shape.
export type EntranceDirection = "up" | "down" | "left" | "right";
export type EntranceEasing = "smooth" | "sharp" | "bouncy";

// Per-line kinetic alignment. A resolved line aligns left/center/right; the
// emphasis/normal props pick which, with normal supporting "alternate".
export type LineAlignment = "left" | "center" | "right";
export type EmphasisAlignment = "center" | "left" | "right";
export type NormalAlignment = "alternate" | "left" | "right" | "center";

type EntranceGroup = {
  direction: EntranceDirection;
  distance: number;
  easing: EntranceEasing;
  easingSpeed: number;
};

export type ShinyStyle = {
  layout: {
    wordsPerLine: number;
    linesPerSegment: number;
    captionScale: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    emphasisAlignment: EmphasisAlignment;
    normalAlignment: NormalAlignment;
  };
  text: {
    fontFamily: FontFamilyName;
    baseColor: string;
  };
  emphasis: {
    scale: number;
    fontFamily: FontFamilyName;
    offsetX: number;
    offsetY: number;
    colorEnabled: boolean;
    color: string;
    entrance: EntranceGroup;
  };
  effects: {
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
    stroke: {
      enabled: boolean;
      color: string;
      width: number;
    };
    shadow: {
      enabled: boolean;
      color: string;
      blur: number;
    };
  };
  animation: {
    entrance: {
      direction: EntranceDirection;
      distance: number;
      duration: number;
    };
    easing: {
      type: EntranceEasing;
      speed: number;
    };
  };
};

// Defaults are also used as the context fallback if a Shiny page is ever
// rendered without a provider (e.g. in isolation / tests). Default = TWO stops
// (top at 0%, bottom at 100%); the middle stop is OFF until the user enables it.
export const SHINY_DEFAULTS: ShinyStyle = {
  layout: {
    // Hormozi stagger: short 2-word lines keep their words grouped, normal lines
    // alternate left/right, and any line with the big/shiny (emphasized) word is
    // centered & prominent.
    wordsPerLine: 2,
    linesPerSegment: 3,
    captionScale: 1, // no extra scaling by default
    lineSpacing: 1.2,
    positionX: 50, // horizontally centered
    positionY: 70, // lower-center (leaves room below for the stacked lines)
    emphasisAlignment: "center",
    normalAlignment: "alternate",
  },
  text: {
    fontFamily: FONT_DEFAULTS.fontFamily,
    baseColor: "#ffffff",
  },
  emphasis: {
    scale: 1.4,
    fontFamily: FONT_DEFAULTS.fontFamily,
    offsetX: 0,
    offsetY: 0,
    colorEnabled: false,
    color: "#ffffff",
    entrance: {
      direction: "up",
      distance: 50,
      easing: "smooth",
      easingSpeed: 3,
    },
  },
  effects: {
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
    stroke: {
      enabled: TEXT_EFFECTS_DEFAULTS.strokeEnabled,
      color: TEXT_EFFECTS_DEFAULTS.strokeColor,
      width: TEXT_EFFECTS_DEFAULTS.strokeWidth,
    },
    shadow: {
      enabled: TEXT_EFFECTS_DEFAULTS.shadowEnabled,
      color: TEXT_EFFECTS_DEFAULTS.shadowColor,
      blur: TEXT_EFFECTS_DEFAULTS.shadowBlur,
    },
  },
  animation: {
    entrance: {
      direction: "up",
      distance: 30,
      duration: 12,
    },
    easing: {
      type: "smooth",
      speed: 3,
    },
  },
};

/**
 * Builds the text gradient CSS from the enabled stops + positions, in the
 * direction set by `gradientAngle` (180 = top->bottom, 90 = left->right, ...).
 * Always includes top + bottom; includes the middle stop only when toggled on.
 * Stops are ordered top -> middle -> bottom along the gradient axis.
 */
export const buildGradientCss = (g: GradientConfig): string => {
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
export type SweepSlot = {
  enabled: boolean;
  color: string;
  angle: number;
  width: number;
  intensity: number;
  positionX: number;
  positionY: number;
  // Optional motion (see sweepSchema). Absent = static sweep at positionX.
  animate?: boolean;
  speed?: number;
  bounce?: boolean;
};

/**
 * The horizontal position (0–100%) of a sweep band at a given frame. A STATIC
 * sweep just returns its `positionX`. An ANIMATED sweep travels across the
 * caption: `bounce` ping-pongs 0→100→0 (right then back left, the reference
 * look); otherwise it loops 0→100. `speed` 1–10 maps to the cycle length.
 */
export const sweepTravelX = (slot: SweepSlot, frame: number, fps: number): number => {
  if (!slot.animate) return slot.positionX;
  const speed = slot.speed ?? 5;
  // frames for ONE 0→100 pass: speed 1 ≈ 3s, speed 10 ≈ 0.5s.
  const cycle = Math.max(1, Math.round(fps * (3.3 - speed * 0.28)));
  if (slot.bounce ?? true) {
    const p = frame % (2 * cycle);
    const t = p < cycle ? p / cycle : 2 - p / cycle; // 0→1→0
    return t * 100;
  }
  return ((frame % cycle) / cycle) * 100;
};

/**
 * A single TRAVELING gloss band whose bright core sits at `xPercent` (0–100)
 * across the element. Unlike buildSweepCss (a fixed 50%-centered band you slide
 * with an oversized background-position, which triples the on-screen width),
 * this bakes the position into the stops and uses background-size 100%, so
 * `slot.width` is a true on-screen band width and the streak stays crisp as it
 * moves. `slot.angle` tilts the streak (perpendicular to the gradient axis).
 */
export const buildTravelSweepCss = (slot: SweepSlot, xPercent: number): string => {
  const half = clamp(slot.width / 2, 2, 45);
  const x = clamp(xPercent, 0, 100);
  const a = clamp(x - half, 0, 100);
  const b = clamp(x + half, 0, 100);
  const ia = clamp(x - half / 2, 0, 100);
  const ib = clamp(x + half / 2, 0, 100);
  const bright = `color-mix(in srgb, ${slot.color} ${slot.intensity}%, transparent)`;
  const soft = `color-mix(in srgb, ${slot.color} ${slot.intensity * 0.35}%, transparent)`;
  return (
    `linear-gradient(${slot.angle}deg, ` +
    `transparent ${a}%, ${soft} ${ia}%, ${bright} ${x}%, ${soft} ${ib}%, transparent ${b}%)`
  );
};

// The three sweep slots, in render order. Each group already has SweepSlot shape.
const getSweepSlots = (s: ShinyStyle): SweepSlot[] => [
  s.effects.sweep1,
  s.effects.sweep2,
  s.effects.sweep3,
];

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
export const buildSweepCss = (slot: SweepSlot): string => {
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
 * Takes the deepGlow config directly (not the whole style) so any template can
 * reuse it.
 */
export const buildDeepGlowCss = (d: DeepGlowConfig): string => {
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
export const ENTRANCE_VECTOR: Record<EntranceDirection, { axis: "x" | "y"; sign: number }> = {
  up: { axis: "y", sign: 1 },
  down: { axis: "y", sign: -1 },
  left: { axis: "x", sign: 1 },
  right: { axis: "x", sign: -1 },
};

// A resolved entrance: which easing curve, which axis/sign the word enters from,
// and how far it travels. Normal and emphasized words each get their own.
export type EntranceConfig = {
  easingFn: (input: number) => number;
  axis: "x" | "y";
  sign: number;
  distance: number;
};

/**
 * Builds the entrance easing function from the `entranceEasing` TYPE (dropdown)
 * and the `entranceEasingSpeed` SLIDER (curve intensity, 1–6). `easingSpeed` is
 * normalised to s∈[0,1] and meaningfully reshapes each curve:
 *
 *   - smooth -> a proper EASE-OUT that GLIDES. A cubic-bezier whose BOTH control
 *     points sit at y=1, so the curve lands with ZERO end velocity (a soft stop,
 *     never an abrupt halt). The motion stays visible across the whole window
 *     instead of finishing in the first few frames — the old `poly(6)` ease-out
 *     put 98% of the travel in the first half, which read as "move then STOP".
 *     easingSpeed blends easeOutQuad (gentle, s=0) -> easeOutCubic (snappier,
 *     s=1); both decelerate smoothly.
 *   - sharp  -> snappy/quick: an easeOut-Expo-style bezier (most travel up front)
 *     that is still soft-landing (no hard linear stop). easingSpeed makes it
 *     snappier.
 *   - bouncy -> ease-out with a slight OVERSHOOT past the target, then settles
 *     back. easingSpeed scales the overshoot amount (1 = subtle, 6 = lively).
 */
export const makeEntranceEasing = (
  type: EntranceEasing,
  easingSpeed: number,
): ((input: number) => number) => {
  const s = clamp((easingSpeed - 1) / 5, 0, 1); // slider 1..6 -> 0..1
  switch (type) {
    case "smooth": {
      // Blend easeOutQuad (0.5,1,0.89,1) -> easeOutCubic (0.33,1,0.68,1). Both
      // control-point y's are 1, so end velocity is 0 (soft landing); motion
      // stays perceptible through the whole entrance (no abrupt stop).
      const x1 = 0.5 - 0.17 * s; // 0.50 -> 0.33
      const x2 = 0.89 - 0.21 * s; // 0.89 -> 0.68
      return Easing.bezier(x1, 1, x2, 1);
    }
    case "bouncy": {
      // Overshoot past the target then settle. `back` overshoot grows with speed.
      const overshoot = 1 + s * 2; // 1.0 -> 3.0
      return Easing.out(Easing.back(overshoot));
    }
    case "sharp":
    default: {
      // Snappy: easeOut-Expo-style (front-loaded) but still y=1 controls, so it
      // decelerates into place rather than halting linearly. Snappier with speed.
      const x1 = 0.16 - 0.06 * s; // 0.16 -> 0.10
      const x2 = 0.3 - 0.1 * s; // 0.30 -> 0.20
      return Easing.bezier(x1, 1, x2, 1);
    }
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

/**
 * Whether a word is emphasized: prefer Claude's explicit `emphasis` flag (from
 * enriched segments — the ONLY thing that works for Arabic, where the regex
 * above is dead), else fall back to the rule-based `decideEmphasis`.
 */
export const wordIsEmphasized = (w: { text: string; emphasis?: boolean }): boolean =>
  w.emphasis ?? wordIsEmphasized(w);

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
  if (lineWords.some((w) => wordIsEmphasized(w))) {
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
export type KineticWord = {
  text: string;
  fromMs: number;
  toMs: number;
  // Claude's emphasis flag when the block came from enriched segments; falls
  // back to the regex `decideEmphasis` when undefined.
  emphasis?: boolean;
  // Per-word light-sweep target (from EnrichedWord.sweep). Templates render the
  // moving gloss on words where this is true. Undefined = no sweep.
  sweep?: boolean;
};
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
// Coerce a count prop to a SAFE integer >= 1. Plain `Math.max(1, Math.floor(v))`
// is NOT enough: Math.floor(NaN) is NaN and Math.max(1, NaN) is NaN — so a
// NaN/undefined value (which the Studio produces transiently while you edit a
// number field) yields wordsPerBlock = NaN, the chunking loop `i += NaN` never
// runs, ZERO blocks are produced, and the captions DISAPPEAR. Guarding for
// finiteness fixes that; it also clamps 0 / negative / fractional values to 1.
const safeCount = (v: number): number => {
  const n = Math.floor(v);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

export const groupWordsIntoBlocks = (
  words: KineticWord[],
  wordsPerLine: number,
  linesPerSegment: number,
): KineticBlock[] => {
  const perLine = safeCount(wordsPerLine);
  const linesPerBlock = safeCount(linesPerSegment);
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
 * Builds kinetic BLOCKS from Claude's enriched SEGMENTS — the meaning-based
 * alternative to the count-based `groupWordsIntoBlocks`. Each segment becomes
 * one block; Claude's lines are kept as-is; each word carries its emphasis flag
 * and original timing. This is what makes every kinetic template group by
 * meaning (and emphasize the right words) once an `.enriched.json` exists.
 */
export const enrichedToBlocks = (segments: EnrichedSegment[]): KineticBlock[] =>
  segments
    .map((seg) => {
      const lines: KineticWord[][] = (seg.lines ?? []).map((line) =>
        (line.words ?? []).map((w) => ({
          text: w.text,
          fromMs: w.startMs,
          toMs: w.endMs,
          emphasis: w.emphasis,
          sweep: w.sweep,
        })),
      );
      const flat = lines.flat();
      return {
        lines,
        startMs: flat[0]?.fromMs ?? 0,
        endMs: flat[flat.length - 1]?.toMs ?? 0,
      };
    })
    .filter((b) => b.lines.some((l) => l.length > 0));

/**
 * Flattens Claude's enriched segments into a single, in-order stream of CORRECTED
 * words (spelling/punctuation fixed) carrying their emphasis flag + timing —
 * DROPPING Claude's line boundaries. Use this when a template wants Claude's
 * *content* (words + emphasis) but insists on doing its OWN visual line layout
 * (e.g. Hormozi's fixed two-line split). Layout stays the template's job; only
 * the words come from Claude.
 */
export const enrichedToWords = (segments: EnrichedSegment[]): KineticWord[] =>
  segments.flatMap((seg) =>
    (seg.lines ?? []).flatMap((line) =>
      (line.words ?? []).map((w) => ({
        text: w.text,
        fromMs: w.startMs,
        toMs: w.endMs,
        emphasis: w.emphasis,
        sweep: w.sweep,
      })),
    ),
  );

/**
 * Re-chops a block's FLAT word list into VISUAL lines for the reference layout
 * (small / BIG / small, stacked):
 *   - every EMPHASIZED word (decideEmphasis) gets its OWN line, so it sits
 *     CENTERED and large, isolated from the smaller normal words;
 *   - consecutive NORMAL words pack into a line of up to `maxNormalPerLine`, so a
 *     short normal phrase ("Do not", "them by") stays grouped on one line and is
 *     offset left/right around the emphasized word.
 * So a block reads: small phrase (left) / BIG WORD (center) / small phrase
 * (right), stacked — like "Do not / judge / them by" in the references.
 */
export const splitIntoEmphasisLines = (
  words: KineticWord[],
  maxNormalPerLine: number,
): KineticWord[][] => {
  const perLine = safeCount(maxNormalPerLine);
  const lines: KineticWord[][] = [];
  let normalRun: KineticWord[] = [];
  const flushNormal = () => {
    if (normalRun.length) {
      lines.push(normalRun);
      normalRun = [];
    }
  };
  for (const w of words) {
    if (wordIsEmphasized(w)) {
      flushNormal(); // end any pending normal phrase first
      lines.push([w]); // the emphasized word alone on its own line
    } else {
      normalRun.push(w);
      if (normalRun.length >= perLine) flushNormal();
    }
  }
  flushNormal();
  return lines;
};

/**
 * Renders ONE kinetic segment (block) — a multi-line stacked block
 * (Hormozi / viral-caption style). This component is mounted INSIDE its own
 * <Sequence> by PageShiny, so `useCurrentFrame()` here is LOCAL to the segment:
 * frame 0 is the moment the segment appears on the timeline. Each word then
 * builds up word-by-word from the block's start, and emphasized words wear the
 * Shiny gradient + glow. Glow / gradient / etc. come from ShinyStyleContext.
 */
const ShinySegment: React.FC<{ block: KineticBlock }> = ({ block }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();

  const style = useContext(ShinyStyleContext);
  const { strength: glowStrength, color: glowColor } = style.effects.glow;
  // NORMAL-word entrance lives under `animation` (entrance + easing); the
  // EMPHASIS entrance lives under `emphasis.entrance`. The window length
  // (`entranceDuration`) is shared and comes from animation.entrance.
  const { entrance: normalEntranceProps, easing: normalEasing } = style.animation;
  const emphasisEntranceProps = style.emphasis.entrance;
  const entranceDuration = normalEntranceProps.duration;

  // Entrance config (easing curve + which axis/sign the word enters from +
  // travel distance). NORMAL words use `normalEntrance`; EMPHASIZED words use
  // `emphasisEntrance` instead, so the two animate independently.
  const normalEntrance: EntranceConfig = {
    easingFn: makeEntranceEasing(normalEasing.type, normalEasing.speed),
    ...ENTRANCE_VECTOR[normalEntranceProps.direction],
    distance: normalEntranceProps.distance,
  };
  const emphasisEntrance: EntranceConfig = {
    easingFn: makeEntranceEasing(emphasisEntranceProps.easing, emphasisEntranceProps.easingSpeed),
    ...ENTRANCE_VECTOR[emphasisEntranceProps.direction],
    distance: emphasisEntranceProps.distance,
  };

  const fontFamily = resolveFontFamily(style.text.fontFamily);
  // GROUP-level emphasis controls — shared by every emphasized word (not per
  // individual word): a different font, a uniform size multiplier, and an X/Y
  // nudge. Normal words use the base font at scale 1 and no offset.
  const emphasisFontFamily = resolveFontFamily(style.emphasis.fontFamily);
  const emphasisScale = style.emphasis.scale;
  const { offsetX: emphasisOffsetX, offsetY: emphasisOffsetY } = style.emphasis;
  // Vertical text gradient, built from the enabled stops + their positions.
  const gradientCss = buildGradientCss(style.effects.gradient);

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

  // Gradient text has a transparent fill, so text-shadow won't render — the
  // shadow is applied as a drop-shadow in each word's filter chain instead.
  // The stroke is an inherited property, so it's set once on the container.
  // The shared shadow/stroke helpers take the flat TextEffects shape, so adapt
  // the nested shadow/stroke groups into it.
  const textEffects: TextEffects = {
    shadowEnabled: style.effects.shadow.enabled,
    shadowColor: style.effects.shadow.color,
    shadowBlur: style.effects.shadow.blur,
    strokeEnabled: style.effects.stroke.enabled,
    strokeColor: style.effects.stroke.color,
    strokeWidth: style.effects.stroke.width,
  };
  const stroke = textStrokeCss(textEffects);
  const shadowFilter = dropShadowCss(textEffects);

  // Deep Glow bloom — constant per word (it's a property of the text, like the
  // AE plugin), so build it once here rather than per token. Empty when disabled.
  const deepGlowFilter = buildDeepGlowCss(style.effects.deepGlow);

  // -------------------------------------------------------------------------
  // Shared per-word painters — the "reuse the existing Shiny effects" seam that
  // gives an emphasized kinetic word its gradient + glow look.
  // -------------------------------------------------------------------------
  // Composes a Shiny word's clipped background layers (sweeps on top, optional
  // emphasis color over the gradient, then the gradient) for a given emphasis.
  const buildShinyBg = (emphasis: number) => {
    const bgLayers = [...sweepLayers];
    const bgSizes = [...sweepSizes];
    const bgPositions = [...sweepPositions];
    if (style.emphasis.colorEnabled && emphasis > 0) {
      const ec = `color-mix(in srgb, ${style.emphasis.color} ${Math.round(emphasis * 100)}%, transparent)`;
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

  // This segment's layout controls + content. The grouping into blocks happens
  // in PageShiny; this component just paints the ONE block it was handed.
  const {
    wordsPerLine,
    captionScale,
    lineSpacing,
    positionX,
    positionY,
    emphasisAlignment,
    normalAlignment,
  } = style.layout;
  // Fixed horizontal gap between words (fraction of font size), applied as a real
  // flex gap so space-less ASR word spans never jam together ("youcan") and never
  // spread apart. Replaces the old tunable CSS word-spacing (which did nothing on
  // space-less spans). Line spacing stays user-tunable via `lineSpacing`.
  const WORD_GAP = 0.16;
  const baseColor = style.text.baseColor;
  // Re-chop the block's flat words so each EMPHASIZED word is isolated on its own
  // (centered, large) line and normal words pack into short offset lines around
  // it — the small / BIG / small reference layout.
  const lines = splitIntoEmphasisLines(block.lines.flat(), wordsPerLine);
  // Per-line alignment: a line with the emphasized word -> emphasisAlignment
  // (centered & prominent); each NORMAL line alternates left/right by its OWN
  // running index, so the normal phrases sit left, right, left … AROUND the
  // emphasized lines regardless of how many emphasized lines fall between them.
  let normalLineIdx = 0;
  const lineAligns: LineAlignment[] = lines.map((line) =>
    line.some((w) => wordIsEmphasized(w))
      ? emphasisAlignment
      : decideLineAlignment(line, normalLineIdx++, emphasisAlignment, normalAlignment),
  );
  // First word's startMs — words reveal RELATIVE to this (frame 0 == segment
  // start, since we're inside the segment's own <Sequence>), so the build-up is
  // bounded to the segment's window and a word can never be stuck transparent.
  const blockStartMs = block.startMs;
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // ---- SIZE / CONTAINMENT: auto-shrink so the WIDEST line fits 90% width ---
  // Emphasized words render at `emphasisScale` in `emphasisFontFamily` — often a
  // wider/heavier face (e.g. Anton) than the base font — so measuring the line
  // in the base font (as before) UNDER-counts their width and they overflow.
  // Instead, measure EVERY word in its ACTUAL font at a reference size, scale
  // the emphasized ones by emphasisScale, and bind the base font size to the
  // tightest line. This contains emphasized words no matter how big the scale.
  const REF_SIZE = 100;
  // Tighter band (was 0.9) so the alternating left/right stagger stays near the
  // center instead of flinging words to the frame edges.
  const BLOCK_WIDTH_FRAC = 0.78;
  const availWidth = width * BLOCK_WIDTH_FRAC;
  const lineMaxSizes = lines.map((ln) => {
    const lineWidthAtRef = ln.reduce((sum, tk) => {
      const emph = wordIsEmphasized(tk);
      const w =
        measureText({
          text: tk.text,
          fontFamily: emph ? emphasisFontFamily : fontFamily,
          fontSize: REF_SIZE,
          fontWeight: FONT_WEIGHT,
        }).width * (emph ? emphasisScale : 1);
      return sum + w;
    }, 0);
    // Reserve the fixed inter-word gap (flex columnGap ≈ once between each pair)
    // so adding it never pushes the line past availWidth.
    const wordSpacingAtRef = Math.max(0, ln.length - 1) * WORD_GAP * REF_SIZE;
    const totalAtRef = lineWidthAtRef + wordSpacingAtRef;
    // Largest base font size at which this whole line still fits availWidth.
    return totalAtRef > 0 ? (REF_SIZE * availWidth) / totalAtRef : DESIRED_FONT_SIZE;
  });
  const kFontSize = lineMaxSizes.length
    ? Math.min(DESIRED_FONT_SIZE, ...lineMaxSizes)
    : DESIRED_FONT_SIZE;

  // ---- ENTRANCE: reveal each word RELATIVE to its block's start frame ------
  // The block builds up WORD BY WORD: a word fades + rises in over
  // `entranceDuration` starting at `startFrame`, then settles at opacity 1 and
  // STAYS there (interpolate clamps), so it is fully visible for the rest of the
  // segment. `startFrame` is computed per word from the BLOCK's frame range (see
  // call site) — NOT each word's absolute startMs — so the entrance window is
  // always inside the block's own time on screen. That guarantees every word
  // reaches opacity 1 while its segment is showing; a word can never be stuck
  // transparent (which is what hid the captions before).
  const enter = (cfg: EntranceConfig, startFrame: number) => {
    const progress = interpolate(
      frame,
      [startFrame, startFrame + entranceDuration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: cfg.easingFn },
    );
    const p = Math.min(1, Math.max(0, progress));
    const offset = cfg.distance * (1 - progress);
    return {
      opacity: p,
      tx: cfg.axis === "x" ? cfg.sign * offset : 0,
      ty: cfg.axis === "y" ? cfg.sign * offset : 0,
    };
  };

  // Per-word LIGHT SWEEP: sweep1 is the sweep STYLE (color/width/angle + motion);
  // a word flagged `sweep` gets the traveling gloss overlaid on its own glyphs.
  const sweepStyle = getSweepSlots(style)[0];
  const sweepGloss = sweepStyle
    ? buildTravelSweepCss(sweepStyle, sweepTravelX(sweepStyle, frame, fps))
    : "";
  const sweepOverlayStyle = (fs: number, ff: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    display: "inline-block",
    whiteSpace: "pre",
    fontSize: fs,
    fontFamily: ff,
    pointerEvents: "none",
    backgroundImage: sweepGloss,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          // 90%-wide block whose CENTER sits at (positionX%, positionY%) of the
          // frame (translate(-50%,-50%) re-centers it there). captionScale sizes
          // the whole block. Lines STRETCH to the block width so per-line
          // justify-content can offset them left/right (the Hormozi stagger).
          left: `${positionX}%`,
          width: `${BLOCK_WIDTH_FRAC * 100}%`,
          top: `${positionY}%`,
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) scale(${captionScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
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
              // Per-line alignment (emphasized -> centered; normal -> alternating
              // left/right by normal-line index; see lineAligns above).
              justifyContent: ALIGN_TO_JUSTIFY[lineAligns[li]],
              // Real flex gap between word spans (ASR words have no spaces), so
              // words never touch ("youcan") — replaces the broken CSS word-spacing.
              columnGap: `${kFontSize * WORD_GAP}px`,
              // Center the words on the row so a big (emphasized) word and the
              // small (normal) words share a common vertical CENTER instead of a
              // shared baseline (baseline made big words ride up into the line
              // above). The row's height tracks its TALLEST word, because each
              // span's line box = its own fontSize x lineSpacing — emphasized
              // words are bigger, so the row grows to fit them and adjacent
              // lines never collide. This is the "line height adapts to the
              // biggest word" rule.
              alignItems: "center",
              lineHeight: lineSpacing,
              whiteSpace: "pre",
            }}
          >
            {line.map((token, wi) => {
              // THE rule-based decision (swap decideEmphasis for an API later).
              const emphasized = wordIsEmphasized(token);
              // Reveal this word offset by how far INTO the segment it is spoken
              // (token.fromMs - blockStartMs). Since we're inside this segment's
              // <Sequence>, local frame 0 is the segment's start, so the first
              // word reveals immediately and later words build up word-by-word —
              // always reaching opacity 1 within the segment (never stuck hidden).
              // EMPHASIZED words use emphasisEntrance; NORMAL words the standard one.
              const wordStartFrame = Math.max(0, msToFrame(token.fromMs - blockStartMs));
              const { opacity, tx, ty } = enter(
                emphasized ? emphasisEntrance : normalEntrance,
                wordStartFrame,
              );
              const transform = `translate(${tx}px, ${ty}px)`;
              // EMPHASIZED words: shiny gradient + glow, BIGGER via a real
              // fontSize (kFontSize x emphasisScale) — NOT transform: scale, so
              // the word takes real layout space and its line box grows with it
              // (no overlap). Rendered in emphasisFontFamily, with the shared
              // group-level X/Y nudge applied ON TOP of the entrance travel.
              const emphasisTransform = `translate(${tx + emphasisOffsetX}px, ${ty + emphasisOffsetY}px)`;
              const wordFontSize = emphasized ? kFontSize * emphasisScale : kFontSize;
              const wordFontFamily = emphasized ? emphasisFontFamily : fontFamily;
              const wordSpan = emphasized ? (
                // EMPHASIZED words: shiny gradient + glow, BIGGER via a real
                // fontSize (kFontSize x emphasisScale) so they take real layout space.
                <span
                  style={{
                    ...shinyWordStyle(1, opacity, emphasisTransform),
                    fontSize: wordFontSize,
                    fontFamily: emphasisFontFamily,
                  }}
                >
                  {token.text}
                </span>
              ) : (
                // NORMAL words: baseColor fill, base font, base (small) size.
                <span
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    fontSize: kFontSize,
                    opacity,
                    transform,
                    color: baseColor,
                    WebkitTextFillColor: baseColor,
                    WebkitTextStroke: stroke,
                    paintOrder: stroke ? "stroke fill" : undefined,
                    filter: shadowFilter || undefined,
                  }}
                >
                  {token.text}
                </span>
              );
              // Wrap so a swept word can host the traveling gloss overlay on top.
              return (
                <span key={wi} style={{ position: "relative", display: "inline-block" }}>
                  {wordSpan}
                  {token.sweep && sweepGloss ? (
                    <span aria-hidden style={sweepOverlayStyle(wordFontSize, wordFontFamily)}>
                      {token.text}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Shiny style: a warm gradient text fill with a strong glow.
 *
 * A single KINETIC layout — a multi-line stacked block (Hormozi / viral-caption
 * style). The flat caption stream is grouped BY COUNT (wordsPerLine x
 * linesPerSegment) into blocks, and EACH block is wrapped in its OWN <Sequence>
 * (from = the block's start frame, durationInFrames = until the next block, last
 * runs to the composition end). This makes every segment a SEPARATE block on the
 * Studio timeline — the same structure the engine uses for the per-page styles
 * (Typewriter etc.) — instead of one continuous element. Each <ShinySegment>
 * then renders with its OWN Sequence-local clock.
 *
 * Glow + gradient colors come from props via ShinyStyleContext.
 */
export const PageShiny: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(ShinyStyleContext);
  const { wordsPerLine, linesPerSegment } = style.layout;

  // Prefer Claude's semantic segments (with real emphasis) when an enriched
  // file exists; otherwise chop the flat stream BY COUNT.
  const words: KineticWord[] = captions.map((c) => ({
    text: c.text,
    fromMs: c.startMs,
    toMs: c.endMs,
  }));
  const blocks =
    segments && segments.length
      ? enrichedToBlocks(segments)
      : groupWordsIntoBlocks(words, wordsPerLine, linesPerSegment);

  // A block appears at its first word's start (startMs) and holds until the NEXT
  // block begins; the last block runs to the composition end. The first block is
  // pulled back to frame 0 so the screen is never blank before the first word.
  // durationInFrames is forced >= 1 so a Sequence is never zero/negative length.
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  return (
    // zIndex guarantees the whole caption layer sits ABOVE the video AbsoluteFill
    // (it's a sibling rendered after the video, but an explicit z-index makes the
    // stacking unambiguous across renderers).
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            // Shows as the block's label on the Studio timeline.
            name={`Segment ${i + 1}`}
          >
            <ShinySegment block={block} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
