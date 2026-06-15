import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { fontFamily } from "../load-font";

// ---------------------------------------------------------------------------
// CONFIG — tweak the look & motion of "TheCine" here.
// ---------------------------------------------------------------------------
const SLIDE_DISTANCE = 80; // px a word travels as it slides in / out
const EASE_DURATION_FRAMES = 8; // length of each slide-in and slide-out, in frames
const EMPHASIS_SCALE = 1.2; // how much the currently-spoken word grows
const GRADIENT_TOP = "#ffe14d"; // yellow (top of the text fill)
const GRADIENT_MID = "#ff8a00"; // orange (middle)
const GRADIENT_BOTTOM = "#ff3d00"; // red (bottom)
const GLOW_COLOR = "rgba(255, 138, 0, 0.9)"; // warm orange glow
const GLOW_STRENGTH = 12; // base glow blur radius in px (grows on the active word)

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
 * This is the single seam to drive motion from real per-word data later —
 * see the note at the bottom of this file. Keep the signature (token, index)
 * so external data can be looked up by either.
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
 * TheCine style: a warm yellow→orange→red gradient text fill with a strong
 * orange glow. Each word slides in from a direction, holds while spoken
 * (growing + glowing brighter), then slides back out the same way.
 */
export const PageTheCine: React.FC<CaptionStyleProps> = ({ page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;
  const easeMs = (EASE_DURATION_FRAMES / fps) * 1000;

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
          const scale = 1 + (EMPHASIS_SCALE - 1) * emphasis;

          // Travel: starts offset (in its direction), reaches 0 while spoken,
          // then returns offset the SAME direction on the way out.
          const { slide, direction } = getWordSlide(token, index);
          const offset = slide ? SLIDE_DISTANCE * (1 - slideIn + slideOut) : 0;
          const { axis, sign } = DIRECTION_VECTOR[direction];
          const tx = axis === "x" ? sign * offset : 0;
          const ty = axis === "y" ? sign * offset : 0;

          // Glow strengthens with emphasis; dark shadow keeps text legible.
          const glow = GLOW_STRENGTH * (1 + emphasis);

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                opacity,
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "center",
                backgroundImage: `linear-gradient(180deg, ${GRADIENT_TOP} 0%, ${GRADIENT_MID} 50%, ${GRADIENT_BOTTOM} 100%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                // drop-shadow (not text-shadow) so it shows through the
                // transparent gradient fill: two warm glows + a dark shadow.
                filter: `drop-shadow(0 0 ${glow}px ${GLOW_COLOR}) drop-shadow(0 0 ${glow * 2}px ${GLOW_COLOR}) drop-shadow(0 4px 6px rgba(0,0,0,0.6))`,
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
