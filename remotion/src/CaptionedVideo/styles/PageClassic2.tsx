import React, { createContext, useContext, useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema, frameSizeSchema, type FrameSizeName } from "../index";
import {
  fontSlotSchema,
  useFontSlot,
  effectiveWeight,
  type FontSlot,
  type ResolvedFont,
} from "./font-slot";
// The SHARED easing control, so this template offers the same curve choices as
// Speed, Edits and Classic rather than hard-coding its own.
import { easingSlotSchema, makeEasing, makeOpacityEasing, type EasingSlot } from "./easing-slot";
import { censorWord } from "./censor";
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// CLASSIC 2 — the cinematic movie-clip caption: ONE short centred line of white
// Bebas Neue caps whose words appear one at a time IN PLACE.
//
// Reverse-engineered from remotion/public/Classic 2.mp4 (1280x720, 30fps). What
// the reference actually does, measured:
//
//   * THE SIGNATURE — REVEAL IN PLACE. The line is laid out in advance for its
//     FULL text and centred as a whole; each word then appears at its final
//     position as it is spoken. The line does NOT re-centre as it grows. Proved
//     by tracking one caption's left edge across frames:
//         7.57s "THAT"                left 374, centre 427
//         7.70s "THAT F*CKING"        left 374, centre 529
//         8.00s "THAT F*CKING NOBODY?" left 374, centre 639.5  (frame centre 640)
//     The left edge never moves; only the FINISHED line is centred. This is the
//     exact opposite of Edits, which pins the centre and grows outward.
//   * ONE LINE, ALL CAPS, pure white (255,255,255). Never two lines: a caption
//     too long is played across consecutive SCREENS (see layout.mjs `classic2`).
//   * DEAD CENTRE of the frame — horizontal centre 639.5 of 1280, vertical
//     centre 359.5 of 720 = 49.93%.
//   * THE FACE IS BEBAS NEUE, identified rather than guessed: three words were
//     fingerprinted by ink-width / cap-height (size-independent) and fitted
//     against 18 condensed candidates. Bebas at 0.03em tracking matched to 0.31%
//     mean error — 5x closer than the runner-up — and then predicted the line
//     widths to 0.2% (531px vs 532 measured, 578px vs 577).
//     Cap height 48px / 0.70 cap-per-em = 68.6px em = 5.36% of frame width.
//   * The reference's widest line is 45% of the frame (23 characters), so this
//     is a SHORT centred line by design, not a full-width one.
//   * NO MOTION. A word goes from absent to full opacity inside a single frame —
//     sampled either side of an appearance at 1/30s and there is no intermediate
//     value. Captions also clear entirely between phrases.
//
// ONE DELIBERATE ADDITION: the fade / easing / pop controls the other templates
// carry are exposed here too, so the entrance can be softened. They DEFAULT TO
// OFF (wordFadeMs 0, popFrom 1), which reproduces the reference's hard cut
// exactly — turn them up only if a softer build is wanted.
// ---------------------------------------------------------------------------

export const classic2Schema = captionedVideoSchema.extend({
  // EXPORT SHAPE. Every ratio is offered from this one composition —
  // calculateMetadata resolves it to a real width/height (see
  // captionedVideoMetadataWithFrame). 9:16 is the default; the look holds at any
  // of them because every size below is measured as a % of frame WIDTH.
  frame: frameSizeSchema,

  layout: z.object({
    // Glyph height as a % of FRAME WIDTH, so the look holds at any export
    // resolution. layout.mjs derives `charsPerLine` from THIS number — change
    // one and the other must follow.
    fontSizePct: z.number().min(1).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    // The reference tracks out slightly: its advance is 0.369em against Bebas
    // Neue's own ~0.339.
    letterSpacing: z.number().min(-0.05).max(0.4).step(0.01),
    wordSpacing: z.number().min(0).max(1).step(0.01),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
  }),

  text: z.object({
    font: fontSlotSchema, // Bebas Neue — the measured face
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
    // The reference masks strong language with a single asterisk on the word's
    // first vowel ("F*CKING", "K*LL"). Render-time only — the caption document
    // always keeps the real word.
    censorProfanity: z.boolean(),
  }),

  // === MOTION — the per-word entrance. The reference has NONE; these default to
  // off so the default IS the reference, and are here to soften it on demand. ===
  motion: z.object({
    wordFadeMs: z.number().min(0).max(600).step(1), // 0 = the reference's hard cut
    popFrom: z.number().min(0.5).max(1.5).step(0.005), // 1 = no scale
    easing: easingSlotSchema,
  }),

  effects: z.object({
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
    // NOT in the reference — an addition, off by default. Takes the text's own
    // colour, so a recoloured caption glows in its own hue.
    glow: z.object({
      enabled: z.boolean(),
      blur: z.number().min(0).max(60).step(1),
      opacity: z.number().min(0).max(1).step(0.05),
    }),
  }),
});

export type Classic2Style = {
  frame: FrameSizeName;
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    wordSpacing: number;
    positionX: number;
    positionY: number;
  };
  text: {
    font: FontSlot;
    weight: number;
    uppercase: boolean;
    color: string;
    censorProfanity: boolean;
  };
  motion: { wordFadeMs: number; popFrom: number; easing: EasingSlot };
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
    glow: { enabled: boolean; blur: number; opacity: number };
  };
};

// Defaults ARE the measurements taken off the reference clip.
//
// `showPunctuation` is ON, unlike most templates here: the reference keeps every
// mark — "THAT F*CKING NOBODY?", "WHO?", "you did, son," — and it is measurable,
// not a matter of taste. Stripping the "?" made our line 21px narrower than the
// reference's 532px, which was the ONLY geometry difference left once the face
// and size were matched.
export const CLASSIC2_DEFAULTS: Classic2Style & { showPunctuation: boolean } = {
  showPunctuation: true,
  frame: "9:16", // reels by default; switch it per render
  layout: {
    fontSizePct: 5.36, // 48px cap / 0.70 cap-per-em / 1280 frame width
    captionScale: 1,
    letterSpacing: 0.03, // 0.369 measured advance minus Bebas Neue's own ~0.339
    wordSpacing: 0.22,
    positionX: 50, // centre 639.5 of 1280
    positionY: 50, // centre 359.5 of 720 = 49.93%
  },
  text: {
    // Bebas Neue is a built-in Google font here, so the slot uses `family` and
    // leaves `custom` empty. It is caps-only by design, which is why the
    // reference look is all caps.
    font: { family: "Bebas Neue", custom: "" },
    weight: 400, // Bebas ships a single weight
    uppercase: true,
    color: "#ffffff", // measured pure white
    censorProfanity: true, // the reference masks: F*CKING, K*LL
  },
  motion: {
    // THE REFERENCE HAS NO ENTRANCE — words snap on in a single frame. These
    // stay off so the default reproduces it exactly; raise them for a softer
    // build.
    wordFadeMs: 0,
    popFrom: 1,
    easing: { type: "ease-out", strength: 2 },
  },
  effects: {
    // The footage is dark throughout, so the shadow could not be measured
    // precisely — this is a soft downward shadow for legibility over brighter
    // clips, in the same register as the reference's.
    shadow: { enabled: true, color: "rgba(0,0,0,0.55)", blur: 8, offsetY: 3 },
    glow: { enabled: false, blur: 18, opacity: 0.35 },
  },
};

const Classic2StyleContext = createContext<Classic2Style>(CLASSIC2_DEFAULTS);
export const Classic2StyleProvider = Classic2StyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one.
const FALLBACK_WORDS_PER_LINE = 4;
const FALLBACK_LINES = 1;

/**
 * Renders ONE screen: the whole line is laid out and centred up front, and each
 * word is revealed at its own position as it is spoken.
 */
const Classic2Segment: React.FC<{
  lines: KineticWord[][];
  startMs: number;
  font: ResolvedFont;
}> = ({ lines, startMs, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(Classic2StyleContext);

  const { fontSizePct, captionScale, letterSpacing, wordSpacing, positionX, positionY } =
    style.layout;
  const { weight, uppercase, color, censorProfanity } = style.text;
  const { wordFadeMs, popFrom, easing } = style.motion;
  const { shadow, glow } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  const timeInMs = (frame / fps) * 1000;
  // Opacity must stay inside 0..1, so `bouncy` is flattened for the fade while
  // the SCALE still gets to overshoot.
  const fadeEase = useMemo(() => makeOpacityEasing(easing), [easing]);
  const scaleEase = useMemo(() => makeEasing(easing), [easing]);

  const shadowCss = shadow.enabled
    ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
    : "";
  // Two stacked shadows — one tight, one wide — build a glow with some density
  // rather than a flat blur. Same construction Speed and Edits use.
  const glowCss =
    glow.enabled && glow.opacity > 0
      ? `0 0 ${Math.round(glow.blur * 0.4)}px ${color}, 0 0 ${glow.blur}px ${color}`
      : "";
  const textShadow = [shadowCss, glowCss].filter(Boolean).join(", ");

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: "94%",
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) scale(${captionScale})`,
          fontSize,
          fontFamily: font.fontFamily,
          fontWeight: effectiveWeight(font, weight),
          letterSpacing: `${letterSpacing}em`,
          color,
          textShadow,
        }}
      >
        {lines.map((line, li) => (
          // dir="auto" so an Arabic caption lays out RTL and mixed text follows
          // the Unicode bidi algorithm.
          <div
            key={li}
            dir="auto"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "baseline",
              columnGap: `${fontSize * wordSpacing}px`,
              whiteSpace: "pre",
              // CSS letter-spacing is added AFTER every character, including the
              // last, so a tracked line carries a trailing gap that pushes the
              // visual centre half a tracking-unit off. Cancelling it here put
              // our centre within 0.5px of the reference's instead of 1.5px.
              marginRight: `${-letterSpacing}em`,
            }}
          >
            {line.map((token, wi) => {
              const appearMs = Math.max(0, token.fromMs - startMs);
              const p = interpolate(
                timeInMs,
                [appearMs, appearMs + Math.max(1, wordFadeMs)],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: fadeEase },
              );
              // REVEAL IN PLACE: a word that has not been spoken yet is still
              // RENDERED (just transparent), so it keeps occupying its width and
              // the line stays laid out — and centred — for its FULL text from
              // the first frame. Removing it here (as Edits does) is what makes a
              // line re-centre as it grows, which is exactly what this reference
              // does NOT do.
              const s =
                popFrom === 1
                  ? 1
                  : popFrom +
                    (1 - popFrom) *
                      interpolate(timeInMs, [appearMs, appearMs + Math.max(1, wordFadeMs)], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: scaleEase,
                      });
              const shown = censorWord(token.text, censorProfanity);
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    opacity: p,
                    // A transform never reflows, so the pop cannot move the word
                    // off its reserved place.
                    transform: popFrom !== 1 ? `scale(${s.toFixed(4)})` : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  {uppercase ? shown.toUpperCase() : shown}
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
 * Classic 2: one <Sequence> per screen from the caption document, each holding a
 * single centred line whose words are revealed in place, one at a time.
 */
export const PageClassic2: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(Classic2StyleContext);

  // Resolved ONCE here rather than per screen, so the face is registered a
  // single time and delayRender keeps a frame from painting before it is ready.
  const font = useFontSlot(style.text.font);

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
            <Classic2Segment lines={block.lines} startMs={block.startMs} font={font} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
