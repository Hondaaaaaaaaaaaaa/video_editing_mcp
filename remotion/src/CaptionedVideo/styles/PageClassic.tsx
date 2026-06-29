import React, { createContext, useContext } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import {
  textEffectsSchema,
  textEffectStyle,
  TEXT_EFFECTS_DEFAULTS,
  type TextEffects,
} from "./text-effects";
import {
  fontFamilySchema,
  FONT_DEFAULTS,
  resolveFontFamily,
  type FontSelection,
} from "./fonts";

// Classic customizes the shared font + shadow + stroke (its colors / pop are
// fixed) PLUS the common layout controls (position / size / spacing). These show
// up as sliders / dropdown / pickers / toggles.
export const classicSchema = captionedVideoSchema.extend({
  // --- Layout (position / size / spacing) — shared across all templates ---
  positionX: z.number().min(0).max(100).step(1), // 0 left, 50 center, 100 right
  positionY: z.number().min(0).max(100).step(1), // 0 top, 100 bottom
  captionScale: z.number().min(0.5).max(2).step(0.05), // overall caption size multiplier
  wordSpacing: z.number().min(0).max(1.5).step(0.05), // extra horizontal gap between words (em)
  lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // line height (vertical gap)
  ...textEffectsSchema,
  ...fontFamilySchema,
});

export type ClassicLayout = {
  positionX: number;
  positionY: number;
  captionScale: number;
  wordSpacing: number;
  lineSpacing: number;
};

export type ClassicStyle = ClassicLayout & TextEffects & FontSelection;

export const CLASSIC_DEFAULTS: ClassicStyle = {
  positionX: 50, // horizontally centered
  positionY: 78, // lower-center
  captionScale: 1, // no extra scaling
  wordSpacing: 0.12, // a touch of breathing room between words (em)
  lineSpacing: 1.2,
  ...TEXT_EFFECTS_DEFAULTS,
  ...FONT_DEFAULTS,
};

// Carries the schema props from Root down to the style (engine stays untouched).
const ClassicStyleContext = createContext<ClassicStyle>(CLASSIC_DEFAULTS);
export const ClassicStyleProvider = ClassicStyleContext.Provider;

const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;
const HIGHLIGHT_COLOR = "#39E508";
const TEXT_COLOR = "white";

/**
 * Classic style: big white uppercase text, the currently-spoken word turns
 * green, and the whole page pops in (scale + slide up) on enter. Shadow +
 * stroke come from props via ClassicStyleContext.
 */
export const PageClassic: React.FC<CaptionStyleProps> = ({ enterProgress, page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const effects = useContext(ClassicStyleContext);
  const { positionX, positionY, captionScale, wordSpacing, lineSpacing } = effects;
  const fontFamily = resolveFontFamily(effects.fontFamily);

  const fittedText = fitText({
    fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    textTransform: "uppercase",
    fontWeight: FONT_WEIGHT,
  });

  const fontSize = Math.min(DESIRED_FONT_SIZE, fittedText.fontSize);

  return (
    <AbsoluteFill>
      {/* Position wrapper: the caption's CENTER sits at (positionX%, positionY%)
          of the frame; captionScale sizes the whole block. */}
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: "90%",
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) scale(${captionScale})`,
        }}
      >
        <div
          style={{
            fontSize,
            width: "100%",
            textAlign: "center",
            fontFamily,
            fontWeight: FONT_WEIGHT,
            textTransform: "uppercase",
            lineHeight: lineSpacing,
            // Extra horizontal gap added at each space between words.
            wordSpacing: `${wordSpacing}em`,
            // Shadow + stroke are inherited by the word spans below.
            ...textEffectStyle(effects),
            transform: makeTransform([
              scale(interpolate(enterProgress, [0, 1], [0.7, 1])),
              translateY(interpolate(enterProgress, [0, 1], [50, 0])),
            ]),
          }}
        >
        {page.tokens.map((token, index) => {
          const startRelativeToSequence = token.fromMs - page.startMs;
          const endRelativeToSequence = token.toMs - page.startMs;

          const active =
            startRelativeToSequence <= timeInMs && endRelativeToSequence > timeInMs;

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                color: active ? HIGHLIGHT_COLOR : TEXT_COLOR,
                transform: `scale(${active ? 1.08 : 1})`,
              }}
            >
              {token.text}
            </span>
          );
        })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
