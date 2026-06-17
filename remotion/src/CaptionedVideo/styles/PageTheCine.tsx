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
// right panel). The TheCine composition uses `theCineSchema`; Classic keeps
// the plain `captionedVideoSchema`.
// ---------------------------------------------------------------------------
// Every numeric prop has .min()/.max() (so Studio renders a slider, not a plain
// number field) plus .step() for sensible granularity.
export const theCineSchema = captionedVideoSchema.extend({
  glowStrength: z.number().min(0).max(100).step(1), // glow radius -> slider
  slideDistance: z.number().min(0).max(300).step(5), // px a word travels -> slider
  slideDurationFrames: z.number().min(1).max(30).step(1), // slide-in/out length -> slider
  emphasisScale: z.number().min(1).max(2).step(0.05), // spoken-word grow -> slider
  glowColor: zColor(), // color picker

  // --- Vertical text gradient (180deg, top -> bottom) ---
  // Two required stops (top + bottom) plus an OPTIONAL middle stop. Each stop
  // has a color picker and a 0–100 position controlling WHERE that color sits in
  // the text height, so the user can make one color dominate (e.g. top at 0,
  // bottom at 70). The CSS is built dynamically from the enabled stops below.
  gradientTopColor: zColor(),
  gradientTopPosition: z.number().min(0).max(100).step(1), // where the top color sits
  gradientBottomColor: zColor(),
  gradientBottomPosition: z.number().min(0).max(100).step(1), // where the bottom color sits
  gradientMidEnabled: z.boolean(), // toggle the optional 3rd stop (default OFF)
  gradientMidColor: zColor(),
  gradientMidPosition: z.number().min(0).max(100).step(1), // where the middle color sits

  ...textEffectsSchema, // shared shadow + stroke
  ...fontFamilySchema, // shared font dropdown
});

export type TheCineStyle = {
  glowStrength: number;
  slideDistance: number;
  slideDurationFrames: number;
  emphasisScale: number;
  glowColor: string;
  gradientTopColor: string;
  gradientTopPosition: number;
  gradientBottomColor: string;
  gradientBottomPosition: number;
  gradientMidEnabled: boolean;
  gradientMidColor: string;
  gradientMidPosition: number;
} & TextEffects &
  FontSelection;

// Defaults are also used as the context fallback if a TheCine page is ever
// rendered without a provider (e.g. in isolation / tests). Default = TWO stops
// (top at 0%, bottom at 100%); the middle stop is OFF until the user enables it.
export const THE_CINE_DEFAULTS: TheCineStyle = {
  glowStrength: 30,
  slideDistance: 80,
  slideDurationFrames: 8,
  emphasisScale: 1.2,
  glowColor: "#ff8a00",
  gradientTopColor: "#ffe14d",
  gradientTopPosition: 0,
  gradientBottomColor: "#ff3d00",
  gradientBottomPosition: 100,
  gradientMidEnabled: false,
  gradientMidColor: "#ff8a00",
  gradientMidPosition: 50,
  ...TEXT_EFFECTS_DEFAULTS,
  ...FONT_DEFAULTS,
};

/**
 * Builds the vertical text gradient CSS from the enabled stops + positions.
 * Always includes top + bottom; includes the middle stop only when toggled on.
 * Stops are ordered top -> middle -> bottom to match the 180deg direction.
 */
const buildGradientCss = (s: TheCineStyle): string => {
  const stops: { color: string; position: number }[] = [
    { color: s.gradientTopColor, position: s.gradientTopPosition },
    ...(s.gradientMidEnabled
      ? [{ color: s.gradientMidColor, position: s.gradientMidPosition }]
      : []),
    { color: s.gradientBottomColor, position: s.gradientBottomPosition },
  ];
  const list = stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
  return `linear-gradient(180deg, ${list})`;
};

// The seam that carries the schema props from Root down to the style without
// touching the shared engine (CaptionedVideo / SubtitlePage).
const TheCineStyleContext = createContext<TheCineStyle>(THE_CINE_DEFAULTS);
export const TheCineStyleProvider = TheCineStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — non-prop tuning. (Slide distance, slide duration and emphasis scale
// are now props; see theCineSchema.)
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
 * TheCine style: a warm gradient text fill with a strong glow. Each word slides
 * in from a direction, holds while spoken (growing + glowing brighter), then
 * slides back out the same way. Glow + gradient colors come from props via
 * TheCineStyleContext.
 */
export const PageTheCine: React.FC<CaptionStyleProps> = ({ page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const style = useContext(TheCineStyleContext);
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

  const easeMs = (slideDurationFrames / fps) * 1000;

  // Gradient text has a transparent fill, so text-shadow won't render — the
  // shadow is applied as a drop-shadow in each word's filter chain instead.
  // The stroke is an inherited property, so it's set once on the container.
  const stroke = textStrokeCss(style);
  const shadowFilter = dropShadowCss(style);

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

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                opacity,
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "center",
                backgroundImage: gradientCss,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                // drop-shadow (not text-shadow) so it shows through the
                // transparent gradient fill: two warm glows + the customizable
                // drop shadow (empty string when the user disables it).
                filter:
                  `drop-shadow(0 0 ${glow}px ${glowColor}) drop-shadow(0 0 ${glow * 2}px ${glowColor}) ${shadowFilter}`.trim(),
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
