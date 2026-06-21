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
  type FontSelection,
} from "./fonts";

// ---------------------------------------------------------------------------
// User-customizable props (rendered as sliders / color pickers in the Studio
// right panel). The Shiny composition uses `shinySchema`; Classic keeps
// the plain `captionedVideoSchema`.
// ---------------------------------------------------------------------------
// Every numeric prop has .min()/.max() (so Studio renders a slider, not a plain
// number field) plus .step() for sensible granularity.
export const shinySchema = captionedVideoSchema.extend({
  glowStrength: z.number().min(0).max(100).step(1), // glow radius -> slider
  slideDistance: z.number().min(0).max(300).step(5), // px a word travels -> slider
  slideDurationFrames: z.number().min(1).max(30).step(1), // slide-in/out length -> slider
  emphasisScale: z.number().min(1).max(2).step(0.05), // spoken-word grow -> slider
  glowColor: zColor(), // color picker

  // --- Per-word emphasis color (additive to emphasisScale) ---
  // When enabled, the word currently being spoken fades to this solid color
  // (over the gradient) as it's emphasized, then back as it finishes.
  emphasisColorEnabled: z.boolean(), // OFF by default
  emphasisColor: zColor(), // color the spoken word takes

  // --- Text gradient (multi-stop; direction set by gradientAngle) ---
  // gradientAngle sets the direction (180 = top->bottom, 90 = left->right, ...).
  // Two required stops (top + bottom) plus an OPTIONAL middle stop. Each stop
  // has a color picker and a 0–100 position controlling WHERE that color sits
  // along the gradient axis, so the user can make one color dominate (e.g. top
  // at 0, bottom at 70). The CSS is built dynamically from the enabled stops.
  gradientAngle: z.number().min(0).max(360).step(1), // gradient direction -> slider
  gradientTopColor: zColor(),
  gradientTopPosition: z.number().min(0).max(100).step(1), // where the top color sits
  gradientBottomColor: zColor(),
  gradientBottomPosition: z.number().min(0).max(100).step(1), // where the bottom color sits
  gradientMidEnabled: z.boolean(), // toggle the optional 3rd stop (default OFF)
  gradientMidColor: zColor(),
  gradientMidPosition: z.number().min(0).max(100).step(1), // where the middle color sits

  // --- Light sweeps (up to THREE glossy shine bands clipped to the text) ---
  // Each slot is a bright gradient band layered ON TOP of the fill gradient,
  // independently toggled / angled / positioned. All enabled slots render
  // layered. Purely additive — the glow + gradient stay intact. sweep1 is on by
  // default (the original sweep); sweep2 + sweep3 default off.
  sweep1Enabled: z.boolean(),
  sweep1Color: zColor(),
  sweep1Angle: z.number().min(0).max(360).step(1),
  sweep1Width: z.number().min(1).max(100).step(1),
  sweep1Intensity: z.number().min(0).max(100).step(1),
  sweep1PositionX: z.number().min(0).max(100).step(1),
  sweep1PositionY: z.number().min(0).max(100).step(1),
  sweep2Enabled: z.boolean(),
  sweep2Color: zColor(),
  sweep2Angle: z.number().min(0).max(360).step(1),
  sweep2Width: z.number().min(1).max(100).step(1),
  sweep2Intensity: z.number().min(0).max(100).step(1),
  sweep2PositionX: z.number().min(0).max(100).step(1),
  sweep2PositionY: z.number().min(0).max(100).step(1),
  sweep3Enabled: z.boolean(),
  sweep3Color: zColor(),
  sweep3Angle: z.number().min(0).max(360).step(1),
  sweep3Width: z.number().min(1).max(100).step(1),
  sweep3Intensity: z.number().min(0).max(100).step(1),
  sweep3PositionX: z.number().min(0).max(100).step(1),
  sweep3PositionY: z.number().min(0).max(100).step(1),

  // --- Deep Glow (After Effects "Deep Glow" plugin look) ---
  // A separate, physically-inspired bloom built from MANY layered drop-shadows
  // at increasing radii with inverse-square-falloff opacity (soft multi-radius
  // bloom, not a flat halo). Inner stops use the inner color, outer stops fade
  // to the outer color. Independent of the existing glow above — additive.
  deepGlowEnabled: z.boolean(), // OFF by default; extra glow option
  deepGlowRadius: z.number().min(0).max(150).step(1), // overall bloom reach -> slider
  deepGlowBrightness: z.number().min(0).max(100).step(1), // bloom intensity -> slider
  deepGlowInnerColor: zColor(), // color near the text (hot core)
  deepGlowOuterColor: zColor(), // color of the outer falloff
  deepGlowChromatic: z.number().min(0).max(20).step(1), // chromatic aberration px -> slider

  ...textEffectsSchema, // shared shadow + stroke
  ...fontFamilySchema, // shared font dropdown
});

export type ShinyStyle = {
  glowStrength: number;
  slideDistance: number;
  slideDurationFrames: number;
  emphasisScale: number;
  glowColor: string;
  emphasisColorEnabled: boolean;
  emphasisColor: string;
  gradientAngle: number;
  gradientTopColor: string;
  gradientTopPosition: number;
  gradientBottomColor: string;
  gradientBottomPosition: number;
  gradientMidEnabled: boolean;
  gradientMidColor: string;
  gradientMidPosition: number;
  sweep1Enabled: boolean;
  sweep1Color: string;
  sweep1Angle: number;
  sweep1Width: number;
  sweep1Intensity: number;
  sweep1PositionX: number;
  sweep1PositionY: number;
  sweep2Enabled: boolean;
  sweep2Color: string;
  sweep2Angle: number;
  sweep2Width: number;
  sweep2Intensity: number;
  sweep2PositionX: number;
  sweep2PositionY: number;
  sweep3Enabled: boolean;
  sweep3Color: string;
  sweep3Angle: number;
  sweep3Width: number;
  sweep3Intensity: number;
  sweep3PositionX: number;
  sweep3PositionY: number;
  deepGlowEnabled: boolean;
  deepGlowRadius: number;
  deepGlowBrightness: number;
  deepGlowInnerColor: string;
  deepGlowOuterColor: string;
  deepGlowChromatic: number;
} & TextEffects &
  FontSelection;

// Defaults are also used as the context fallback if a Shiny page is ever
// rendered without a provider (e.g. in isolation / tests). Default = TWO stops
// (top at 0%, bottom at 100%); the middle stop is OFF until the user enables it.
export const SHINY_DEFAULTS: ShinyStyle = {
  glowStrength: 30,
  slideDistance: 80,
  slideDurationFrames: 8,
  emphasisScale: 1.2,
  glowColor: "#ff8a00",
  emphasisColorEnabled: false,
  emphasisColor: "#ffffff",
  gradientAngle: 180,
  gradientTopColor: "#ffe14d",
  gradientTopPosition: 0,
  gradientBottomColor: "#ff3d00",
  gradientBottomPosition: 100,
  gradientMidEnabled: false,
  gradientMidColor: "#ff8a00",
  gradientMidPosition: 50,
  sweep1Enabled: true,
  sweep1Color: "#ffffff",
  sweep1Angle: 20,
  sweep1Width: 30,
  sweep1Intensity: 70,
  sweep1PositionX: 50,
  sweep1PositionY: 50,
  sweep2Enabled: false,
  sweep2Color: "#ffffff",
  sweep2Angle: 160,
  sweep2Width: 20,
  sweep2Intensity: 50,
  sweep2PositionX: 50,
  sweep2PositionY: 50,
  sweep3Enabled: false,
  sweep3Color: "#ffffff",
  sweep3Angle: 90,
  sweep3Width: 15,
  sweep3Intensity: 40,
  sweep3PositionX: 50,
  sweep3PositionY: 50,
  deepGlowEnabled: false,
  deepGlowRadius: 60,
  deepGlowBrightness: 70,
  deepGlowInnerColor: "#fff5e6",
  deepGlowOuterColor: "#ff8a00",
  deepGlowChromatic: 0,
  ...TEXT_EFFECTS_DEFAULTS,
  ...FONT_DEFAULTS,
};

/**
 * Builds the text gradient CSS from the enabled stops + positions, in the
 * direction set by `gradientAngle` (180 = top->bottom, 90 = left->right, ...).
 * Always includes top + bottom; includes the middle stop only when toggled on.
 * Stops are ordered top -> middle -> bottom along the gradient axis.
 */
const buildGradientCss = (s: ShinyStyle): string => {
  const stops: { color: string; position: number }[] = [
    { color: s.gradientTopColor, position: s.gradientTopPosition },
    ...(s.gradientMidEnabled
      ? [{ color: s.gradientMidColor, position: s.gradientMidPosition }]
      : []),
    { color: s.gradientBottomColor, position: s.gradientBottomPosition },
  ];
  const list = stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
  return `linear-gradient(${s.gradientAngle}deg, ${list})`;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// One light-sweep slot's settings (extracted from the flat sweepN* props).
type SweepSlot = {
  enabled: boolean;
  color: string;
  angle: number;
  width: number;
  intensity: number;
  positionX: number;
  positionY: number;
};

// Pulls the three sweep slots out of the flat style props, in render order.
const getSweepSlots = (s: ShinyStyle): SweepSlot[] => [
  {
    enabled: s.sweep1Enabled,
    color: s.sweep1Color,
    angle: s.sweep1Angle,
    width: s.sweep1Width,
    intensity: s.sweep1Intensity,
    positionX: s.sweep1PositionX,
    positionY: s.sweep1PositionY,
  },
  {
    enabled: s.sweep2Enabled,
    color: s.sweep2Color,
    angle: s.sweep2Angle,
    width: s.sweep2Width,
    intensity: s.sweep2Intensity,
    positionX: s.sweep2PositionX,
    positionY: s.sweep2PositionY,
  },
  {
    enabled: s.sweep3Enabled,
    color: s.sweep3Color,
    angle: s.sweep3Angle,
    width: s.sweep3Width,
    intensity: s.sweep3Intensity,
    positionX: s.sweep3PositionX,
    positionY: s.sweep3PositionY,
  },
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
  if (!s.deepGlowEnabled || s.deepGlowRadius <= 0) return "";
  const intensity = s.deepGlowBrightness / 100;
  const parts: string[] = [];

  for (let i = 0; i < DEEP_GLOW_LAYERS; i++) {
    const t = i / (DEEP_GLOW_LAYERS - 1); // 0 (core) -> 1 (outer edge)
    const radius = s.deepGlowRadius * (0.12 + 0.88 * t);
    // Inverse-square-style falloff: bright core, soft trailing bloom.
    const falloff = 1 / (1 + Math.pow(t * 3, 2));
    const alpha = clamp(intensity * falloff, 0, 1);
    if (alpha <= 0) continue;
    const blended = `color-mix(in srgb, ${s.deepGlowInnerColor} ${Math.round((1 - t) * 100)}%, ${s.deepGlowOuterColor})`;
    const color = `color-mix(in srgb, ${blended} ${Math.round(alpha * 100)}%, transparent)`;
    parts.push(`drop-shadow(0 0 ${radius.toFixed(1)}px ${color})`);
  }

  // Chromatic aberration: split a mid-radius bloom into red/blue fringes that
  // are offset in opposite directions along x, mimicking lens dispersion.
  const c = s.deepGlowChromatic;
  if (c > 0) {
    const r = (s.deepGlowRadius * 0.35).toFixed(1);
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
// CONFIG — non-prop tuning. (Slide distance, slide duration and emphasis scale
// are now props; see shinySchema.)
// ---------------------------------------------------------------------------
const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;

// ---------------------------------------------------------------------------
// Per-word slide settings.
// ---------------------------------------------------------------------------
type SlideDirection = "left" | "right" | "up" | "down";

type WordSlide = {
  /** When false, the word just fades in/out with no travel. */
  slide: boolean;
  direction: SlideDirection;
};

const DIRECTION_CYCLE: SlideDirection[] = ["left", "right", "up", "down"];

/**
 * Decides how a given word slides. Placeholder for now: cycles
 * left → right → up → down by word index, and always slides.
 *
 * This is the single seam to drive motion from real per-word data later.
 * Keep the signature (token, index) so external data can be looked up by either.
 */
const getWordSlide = (
  _token: { text: string; fromMs: number; toMs: number },
  index: number,
): WordSlide => ({
  slide: true,
  direction: DIRECTION_CYCLE[index % DIRECTION_CYCLE.length],
});

// Maps a direction to which axis it travels on and in which sign.
const DIRECTION_VECTOR: Record<SlideDirection, { axis: "x" | "y"; sign: number }> = {
  left: { axis: "x", sign: -1 },
  right: { axis: "x", sign: 1 },
  up: { axis: "y", sign: -1 },
  down: { axis: "y", sign: 1 },
};

/**
 * Shiny style: a warm gradient text fill with a strong glow. Each word slides
 * in from a direction, holds while spoken (growing + glowing brighter), then
 * slides back out the same way. Glow + gradient colors come from props via
 * ShinyStyleContext.
 */
export const PageShiny: React.FC<CaptionStyleProps> = ({ page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const style = useContext(ShinyStyleContext);
  const {
    glowStrength,
    slideDistance,
    slideDurationFrames,
    emphasisScale,
    glowColor,
  } = style;

  const fontFamily = resolveFontFamily(style.fontFamily);
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

  const easeMs = (slideDurationFrames / fps) * 1000;

  // Gradient text has a transparent fill, so text-shadow won't render — the
  // shadow is applied as a drop-shadow in each word's filter chain instead.
  // The stroke is an inherited property, so it's set once on the container.
  const stroke = textStrokeCss(style);
  const shadowFilter = dropShadowCss(style);

  // Deep Glow bloom — constant per word (it's a property of the text, like the
  // AE plugin), so build it once here rather than per token. Empty when disabled.
  const deepGlowFilter = buildDeepGlowCss(style);

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
          // Stroke is inherited by the gradient word spans below.
          WebkitTextStroke: stroke,
          paintOrder: stroke ? "stroke" : undefined,
        }}
      >
        {page.tokens.map((token, index) => {
          const relStart = token.fromMs - page.startMs;
          // Guarantee a non-zero window so every inputRange below is valid even
          // for zero-duration tokens.
          const relEnd = Math.max(token.toMs - page.startMs, relStart + 1);

          // Never let the ease cross the middle of a short word: cap it at half
          // the word's duration so all inputRanges stay strictly increasing.
          const safeEase = Math.min(easeMs, (relEnd - relStart) / 2);

          // Smooth, gentle slide-in then slide-out (no spring bounce).
          const slideIn = interpolate(timeInMs, [relStart, relStart + safeEase], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const slideOut = interpolate(timeInMs, [relEnd, relEnd + safeEase], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.in(Easing.cubic),
          });

          // Visible only while between its in- and out-animations.
          const opacity = slideIn * (1 - slideOut);

          // Emphasis ramps up while the word is being spoken, down at the edges.
          // With a plateau when the word is long enough, otherwise a triangle
          // (peaks at the midpoint) so the inputRange never collides.
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
          const scale = 1 + (emphasisScale - 1) * emphasis;

          // Travel: starts offset (in its direction), reaches 0 while spoken,
          // then returns offset the SAME direction on the way out.
          const { slide, direction } = getWordSlide(token, index);
          const offset = slide ? slideDistance * (1 - slideIn + slideOut) : 0;
          const { axis, sign } = DIRECTION_VECTOR[direction];
          const tx = axis === "x" ? sign * offset : 0;
          const ty = axis === "y" ? sign * offset : 0;

          // Glow strengthens with emphasis; dark shadow keeps text legible.
          const glow = glowStrength * (1 + emphasis);

          // Compose this word's background: sweeps on top, then (optionally) the
          // emphasis color fading in with emphasis OVER the gradient, then the
          // gradient at the bottom. All layers are clipped to the text.
          const bgLayers = [...sweepLayers];
          const bgSizes = [...sweepSizes];
          const bgPositions = [...sweepPositions];
          if (style.emphasisColorEnabled && emphasis > 0) {
            const ec = `color-mix(in srgb, ${style.emphasisColor} ${Math.round(emphasis * 100)}%, transparent)`;
            bgLayers.push(`linear-gradient(0deg, ${ec}, ${ec})`);
            bgSizes.push("100% 100%");
            bgPositions.push("0% 0%");
          }
          bgLayers.push(gradientCss);
          bgSizes.push("100% 100%");
          bgPositions.push("0% 0%");

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                opacity,
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "center",
                backgroundImage: bgLayers.join(", "),
                backgroundSize: bgSizes.join(", "),
                backgroundPosition: bgPositions.join(", "),
                backgroundRepeat: "no-repeat",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                // drop-shadow (not text-shadow) so it shows through the
                // transparent gradient fill: the two warm "glow" shadows, then
                // the optional Deep Glow bloom, then the customizable drop
                // shadow. Each optional piece is "" when disabled, so we filter
                // out empties and join with spaces.
                filter: [
                  `drop-shadow(0 0 ${glow}px ${glowColor})`,
                  `drop-shadow(0 0 ${glow * 2}px ${glowColor})`,
                  deepGlowFilter,
                  shadowFilter,
                ]
                  .filter(Boolean)
                  .join(" "),
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
