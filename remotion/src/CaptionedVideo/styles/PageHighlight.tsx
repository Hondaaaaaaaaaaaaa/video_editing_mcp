import React, { createContext, useContext } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { fontFamily } from "../load-font";
import { captionedVideoSchema } from "../index";

// ---------------------------------------------------------------------------
// User-customizable props (rendered as a dropdown + color pickers + slider in
// the Studio right panel). Highlight has its own schema; Classic / TheCine /
// Typewriter are unaffected.
// ---------------------------------------------------------------------------
export const highlightSchema = captionedVideoSchema.extend({
  highlightMode: z.enum(["text", "box", "both"]), // how the spoken word is marked -> dropdown
  baseTextColor: zColor(), // color of words not currently spoken
  highlightTextColor: zColor(), // spoken-word text color (text / both modes)
  boxColor: zColor(), // spoken-word background box (box / both modes)
  boxPaddingPx: z.number().min(0).max(60).step(1), // box size around the word -> slider
});

export type HighlightMode = "text" | "box" | "both";

export type HighlightStyle = {
  highlightMode: HighlightMode;
  baseTextColor: string;
  highlightTextColor: string;
  boxColor: string;
  boxPaddingPx: number;
};

// Defaults are also the context fallback if a Highlight page is ever rendered
// without a provider (e.g. in isolation / tests).
export const HIGHLIGHT_DEFAULTS: HighlightStyle = {
  highlightMode: "text",
  baseTextColor: "white",
  highlightTextColor: "#39E508",
  boxColor: "#39E508",
  boxPaddingPx: 12,
};

// Carries the schema props from Root down to the style without touching the
// shared engine (CaptionedVideo / SubtitlePage).
const HighlightStyleContext = createContext<HighlightStyle>(HIGHLIGHT_DEFAULTS);
export const HighlightStyleProvider = HighlightStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — motion tuning (not exposed as props).
// ---------------------------------------------------------------------------
const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;
const STROKE_COLOR = "black";
const POP_SCALE = 1.12; // how much the spoken word pops

/**
 * Highlight style: big uppercase text where the currently-spoken word is marked
 * word-by-word. `highlightMode` switches between recoloring the TEXT, drawing a
 * background BOX behind it, or BOTH. Each spoken word also pops (scale) on enter.
 * Colors + box padding come from props via HighlightStyleContext.
 */
export const PageHighlight: React.FC<CaptionStyleProps> = ({ enterProgress, page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const { highlightMode, baseTextColor, highlightTextColor, boxColor, boxPaddingPx } =
    useContext(HighlightStyleContext);

  const showText = highlightMode === "text" || highlightMode === "both";
  const showBox = highlightMode === "box" || highlightMode === "both";

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
          // Whole-page pop-in (scale + slide up) on enter.
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

          const textColor = active && showText ? highlightTextColor : baseTextColor;

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                color: textColor,
                WebkitTextStroke: `${strokeWidth}px ${STROKE_COLOR}`,
                paintOrder: "stroke",
                // Constant padding so adding/removing the box never shifts the
                // layout; the background just appears for the spoken word.
                padding: `0 ${boxPaddingPx}px`,
                borderRadius: Math.round(fontSize * 0.18),
                backgroundColor: active && showBox ? boxColor : "transparent",
                // Per-word pop on enter.
                transform: `scale(${active ? POP_SCALE : 1})`,
                transformOrigin: "center",
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
