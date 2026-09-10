import React, { createContext, useContext, useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import { FONT_FAMILIES, resolveFontFamily, type FontFamilyName } from "./fonts";
import { textAnimationSchema, textAnimationAt, type TextAnimation } from "./text-animation-slot";
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// WORD BY WORD — the caption is laid out in full up front and its words then
// arrive one at a time, each in the slot it will keep. Nothing re-centres, no
// word ever moves.
//
// This is the template that carries the SHARED text-animation slot in full, so
// every motion in `text-animation-slot.ts` is a control here: fade in, pop in,
// track out and zoom continuous. Its DEFAULT is zoom continuous — the whole
// caption keeps scaling up about its centre for as long as it is on screen and
// never settles — chosen by the user 2026-09-06 out of a four-way comparison
// (the working demo of all four is `src/FadePopDemo.tsx`).
//
// Reverse-engineered from remotion/public/References/Fade + pop/fade  in .mp4
// (720x720, 30 fps). What the reference actually does, measured:
//
//   * WHITE BOLD OBLIQUE CAPS, a thin dark outline and a soft drop shadow.
//   * TWO LINES, centred, sitting at the vertical middle of the frame: line 1
//     caps span rows 331-352 and line 2 rows 367-388, so the block centre is
//     359.5 of 720 = 49.9 % of frame height.
//   * Cap height 22 px on a 720-wide frame = 3.06 % of the width. Over Inter's
//     0.727 cap-to-em that is an em of 4.21 %.
//   * Baseline pitch 36 px = 1.18 em.
//   * The line carries ~0.18 em of TRACKING at rest: its own advance measures
//     0.73 em/char against Inter 800's ~0.55.
//   * WORDS FADE IN one at a time on their spoken cue, ~333 ms (10 frames),
//     LINEAR, and each lands already in its final position — the line does not
//     re-centre as it fills. NO blur: over dark footage a word is crisp in its
//     first visible frame and simply brightens.
//   * The caption leaves as a whole-caption fade, ~430 ms (13 frames).
//
// ONE DELIBERATE DEPARTURE: the reference's own growth is a TRACK OUT — its
// letter gaps widen 9.6 % while cap height holds at 21.74 -> 21.98 px, so the
// glyphs never change size. The user compared that against a real zoom side by
// side and chose the zoom. Both ship; `trackOut` is the reference's own motion
// and is one switch away.
// ---------------------------------------------------------------------------

/** Keep in step with `wordbyword` in layout.mjs — it derives capacity from these. */
const FIT_WIDTH_FRACTION = 0.86;

export const wordByWordSchema = captionedVideoSchema.extend({
  layout: z.object({
    // Glyph height as a % of FRAME WIDTH, so the look holds at any export
    // resolution. layout.mjs derives `charsPerLine` from THIS number — change
    // one and the other must follow.
    fontSizePct: z.number().min(1).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    // The line's RESTING tracking. An enabled `animation.trackOut` overrides it
    // while it runs.
    letterSpacing: z.number().min(-0.05).max(0.5).step(0.005),
    lineSpacing: z.number().min(0.8).max(2).step(0.01),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
  }),

  text: z.object({
    fontFamily: z.enum(FONT_FAMILIES),
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
    // The reference is a bold OBLIQUE grotesque. A skew rather than a
    // synthesised italic, so the angle is an exact, tunable number.
    slantDeg: z.number().min(0).max(25).step(0.5),
  }),

  // EVERY text-animation option lives here, shared with every other template
  // that adopts the slot. Default is zoom continuous; the rest are off.
  animation: textAnimationSchema,

  exit: z.object({
    // The caption leaves as one — measured 430 ms on the reference.
    fadeOutMs: z.number().min(0).max(2000).step(1),
  }),

  effects: z.object({
    outline: z.object({
      enabled: z.boolean(),
      widthPx: z.number().min(0).max(6).step(0.1),
      color: zColor(),
    }),
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
  }),
});

export type WordByWordStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
  };
  text: {
    fontFamily: FontFamilyName;
    weight: number;
    uppercase: boolean;
    color: string;
    slantDeg: number;
  };
  animation: TextAnimation;
  exit: { fadeOutMs: number };
  effects: {
    outline: { enabled: boolean; widthPx: number; color: string };
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
  };
};

export const WORD_BY_WORD_DEFAULTS: WordByWordStyle = {
  layout: {
    // 3.06 % measured cap height over Inter's 0.727 cap-to-em.
    fontSizePct: 4.25,
    captionScale: 1,
    // The reference's own advance is 0.73 em/char against Inter 800's ~0.55.
    letterSpacing: 0.18,
    lineSpacing: 1.18, // 36 px baseline pitch over a 30.6 px em
    positionX: 50,
    positionY: 50, // block centre measured at 49.9 % of frame height
  },
  text: {
    fontFamily: "Inter",
    weight: 800,
    uppercase: true,
    color: "#ffffff",
    slantDeg: 12,
  },
  animation: {
    fadeInMs: 333, // 10 frames at 30 fps, measured
    fadeUnit: "word", // the whole point of this template
    popIn: { enabled: false },
    // The reference's OWN growth. Off by default because the user chose the
    // zoom instead; these numbers are the measurement, ready to switch on.
    trackOut: { enabled: false },
    // THE DEFAULT MOTION. Starts at 92 % and adds 6 % of nominal size every
    // second, for as long as the caption is up — so it is still growing when
    // the next caption takes over.
    zoomContinuous: { enabled: true, fromPct: 92, ratePctPerSec: 6 },
  },
  exit: { fadeOutMs: 430 }, // 13 frames at 30 fps, measured
  effects: {
    outline: { enabled: true, widthPx: 1, color: "rgba(0,0,0,0.85)" },
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 10, offsetY: 3 },
  },
};

const WordByWordStyleContext = createContext<WordByWordStyle>(WORD_BY_WORD_DEFAULTS);
export const WordByWordStyleProvider = WordByWordStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one.
const FALLBACK_WORDS_PER_LINE = 4;
const FALLBACK_LINES = 2;

/** Renders ONE caption: laid out in full, its words arriving on their own cues. */
const WordByWordSegment: React.FC<{
  lines: KineticWord[][];
  startMs: number;
  durationMs: number;
}> = ({ lines, startMs, durationMs }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(WordByWordStyleContext);

  const { fontSizePct, captionScale, letterSpacing, lineSpacing, positionX, positionY } =
    style.layout;
  const { fontFamily, weight, uppercase, color, slantDeg } = style.text;
  const { outline, shadow } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  const timeMs = (frame / fps) * 1000;
  const captionSecs = timeMs / 1000;

  // Pop / zoom / tracking are PER-CAPTION and read the caption clock. The fade
  // is per word and gets its own clock below, one word at a time.
  const caption = textAnimationAt(style.animation, captionSecs);
  const trackingEm = caption.trackingEm ?? letterSpacing;

  // The caption leaves as ONE, over the last fadeOutMs of its own slot.
  const exitOpacity =
    style.exit.fadeOutMs > 0
      ? Math.min(1, Math.max(0, (durationMs - timeMs) / style.exit.fadeOutMs))
      : 1;

  const shadowCss = shadow.enabled
    ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
    : "none";
  const outlineCss = outline.enabled
    ? {
        WebkitTextStroke: `${outline.widthPx}px ${outline.color}`,
        paintOrder: "stroke fill" as const,
      }
    : {};

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          // The same fraction layout.mjs derives `charsPerLine` from, so the
          // budget the engine plans to and the box it actually gets agree.
          width: `${FIT_WIDTH_FRACTION * 100}%`,
          textAlign: "center",
          transformOrigin: "center center",
          // The pop / zoom rides on the same transform as the centring, so the
          // block scales about its own middle and never drifts.
          transform: `translate(-50%, -50%) scale(${(captionScale * caption.scale).toFixed(4)})`,
          fontSize,
          fontFamily: resolveFontFamily(fontFamily),
          fontWeight: weight,
          lineHeight: lineSpacing,
          color,
          textShadow: shadowCss,
          opacity: exitOpacity,
        }}
      >
        {lines.map((line, li) => (
          // dir="auto" so an Arabic caption lays out RTL and mixed text follows
          // the Unicode bidi algorithm.
          <div
            key={li}
            dir="auto"
            style={{
              // CSS puts tracking AFTER every character, the last one included,
              // which would drift a centred line rightward by half the tracking
              // as it grows. Pulling that final gap back off keeps the CENTRE
              // fixed — which is what the reference does.
              marginRight: `${-trackingEm}em`,
              letterSpacing: `${trackingEm}em`,
              whiteSpace: "pre",
            }}
          >
            {line.map((token, wi) => {
              // WORD-LOCAL clock: 0 is the moment this word is spoken. A word
              // that has not arrived yet is transparent but STILL OCCUPIES ITS
              // SPACE — that is what stops the line re-centring as it fills,
              // and it is the difference between this template and Edits.
              const wordSecs = (timeMs - Math.max(0, token.fromMs - startMs)) / 1000;
              const { opacity } = textAnimationAt(style.animation, captionSecs, wordSecs);
              return (
                <span key={wi} style={{ opacity }}>
                  <span
                    style={{
                      display: "inline-block",
                      // The oblique. Skewing the WORD rather than the row leaves
                      // the tracking gaps upright, as a real oblique face does.
                      transform: `skewX(${-slantDeg}deg)`,
                      // The outline sits on the same element as the transform and
                      // paints UNDER the fill. On an ancestor it slashed diagonal
                      // cuts through the glyphs: -webkit-text-stroke paints over
                      // the fill by default, so half its width ate into them.
                      ...outlineCss,
                    }}
                  >
                    {uppercase ? token.text.toUpperCase() : token.text}
                  </span>
                  {wi < line.length - 1 ? " " : ""}
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
 * Word by Word: one <Sequence> per caption from the caption document, each laid
 * out in full and filled a word at a time.
 */
export const PageWordByWord: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();

  const hasDoc = Boolean(segments && segments.length);
  const blocks = useMemo(
    () =>
      hasDoc
        ? enrichedToBlocks(segments!)
        : groupWordsIntoBlocks(
            captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs })),
            FALLBACK_WORDS_PER_LINE,
            FALLBACK_LINES,
          ),
    [hasDoc, segments, captions],
  );

  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const dur = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} name={`Caption ${i + 1}`}>
            <WordByWordSegment
              lines={block.lines}
              startMs={block.startMs}
              durationMs={(dur / fps) * 1000}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
