import React, { createContext, useContext } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
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
// fixed). These shared props show up as a dropdown / sliders / pickers / toggles.
export const classicSchema = captionedVideoSchema.extend({
  ...textEffectsSchema,
  ...fontFamilySchema,
});

export type ClassicStyle = TextEffects & FontSelection;

export const CLASSIC_DEFAULTS: ClassicStyle = {
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
          textTransform: "uppercase",
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
    </AbsoluteFill>
  );
};
