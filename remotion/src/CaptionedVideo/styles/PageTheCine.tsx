import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { fontFamily } from "../load-font";

// NOTE: This starts life as an exact copy of PageClassic. It is the place to
// build out the bespoke "TheCine" cinematic look — tweak colors, fonts,
// per-word animation, positioning etc here without touching the Classic style.

const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;
const HIGHLIGHT_COLOR = "#39E508";
const TEXT_COLOR = "white";
const STROKE_COLOR = "black";

export const PageTheCine: React.FC<CaptionStyleProps> = ({ enterProgress, page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const fittedText = fitText({
    fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    textTransform: "uppercase",
    fontWeight: FONT_WEIGHT,
  });

  const fontSize = Math.min(DESIRED_FONT_SIZE, fittedText.fontSize);
  const strokeWidth = Math.max(2, Math.round(fontSize / 14));

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
                WebkitTextStroke: `${strokeWidth}px ${STROKE_COLOR}`,
                paintOrder: "stroke",
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
