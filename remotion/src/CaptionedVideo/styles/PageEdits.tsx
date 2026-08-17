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
import { captionedVideoSchema } from "../index";
import {
  fontSlotSchema,
  useFontSlot,
  effectiveWeight,
  type FontSlot,
  type ResolvedFont,
} from "./font-slot";
// The SHARED easing control, so this template offers the same curve choices as
// Speed and Classic rather than hard-coding its own.
import { easingSlotSchema, makeOpacityEasing, type EasingSlot } from "./easing-slot";
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// EDITS — the cinematic "edit" caption: one small line of heavy white caps that
// GROWS A WORD AT A TIME while staying centred.
//
// Reverse-engineered from remotion/public/edits.mp4 (1080x1080, 60fps, HEVC).
// What the reference actually does, measured:
//
//   * ONE LINE, ALL CAPS, pure white (255,255,255). Never two lines.
//   * WORDS ACCUMULATE one at a time, and the line is CENTRE-ANCHORED — so
//     every word already on screen slides outward as the next one lands. Caught
//     mid-caption: "SHE SMELLED LIKE COAL TAR SOAP AND" -> the same line plus
//     "LAVENDER", with the centre pinned at 539-540 while the left edge went
//     230->141 and the right 850->937. That is Speed's word build carried on
//     Typewriter's centre anchor.
//   * Cap height 19-20px on a 1080-wide frame = 1.85% of the width, so the em
//     is ~2.52%. Mean advance 0.68em ("SHE SMELLED LIKE COAL TAR SOAP AND
//     LAVENDER" = 43 characters in 796px), which is The Bold Font's own ~0.52
//     plus ~0.16em of tracking.
//   * A soft dark drop shadow, DOWNWARD ONLY: luminance under the glyphs sits
//     ~14 units below the surrounding footage 1-2px beneath the baseline, and
//     is FLAT above them (delta 1.1 one row up). No halo in the reference.
//   * Captions are SPARSE — a 1.27s stretch of the reference carries no caption
//     at all.
//
// THREE DELIBERATE DEPARTURES FROM THE REFERENCE, all chosen on purpose:
//
//   1. MOTION. The reference has NONE — every transition is a single-frame hard
//      cut at 60fps, verified three ways: a word appearing (121 -> 255 in one
//      frame), a caption appearing (108 -> 255), and a caption clearing
//      (255 -> 148), with no intermediate value anywhere. We instead use the
//      entrance MEASURED OFF THE SPEED REELS — a 133ms ease-out fade with a ~2%
//      grow on the same curve and window — because a polished entrance was
//      wanted over literal fidelity here.
//   2. SIZE. The reference's 2.52% em is about half of Classic's, the smallest
//      template in the project, and reads as a small cinematic subtitle. Scaled
//      to 5.5% so it carries the same presence as the rest of the set on a 9:16
//      reel.
//   3. POSITION. The reference sits at 65% of frame height, but it is a SQUARE
//      1:1 video; that framing does not transfer to a tall frame. 78% is the
//      house safe zone (Hormozi / Typewriter / Ali / Classic all use it).
//
// The GLOW is a feature of this template, not of the reference: the reference
// has a shadow and no halo. It is on but gentle by default.
// ---------------------------------------------------------------------------

export const editsSchema = captionedVideoSchema.extend({
  layout: z.object({
    // Glyph height as a % of FRAME WIDTH, so the look holds at any export
    // resolution. layout.mjs derives `charsPerLine` from THIS number — change
    // one and the other must follow.
    fontSizePct: z.number().min(1).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    // The reference tracks out: its mean advance is 0.68em against The Bold
    // Font's own ~0.52.
    letterSpacing: z.number().min(-0.05).max(0.4).step(0.01),
    wordSpacing: z.number().min(0).max(1).step(0.01),
    lineSpacing: z.number().min(0.8).max(2).step(0.05),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
  }),

  text: z.object({
    font: fontSlotSchema, // The Bold Font, shipped in public/fonts
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
  }),

  // === MOTION — the per-word entrance. NOT from this reference (which has no
  // animation at all); these are the values measured off the Speed reels. ===
  motion: z.object({
    wordFadeMs: z.number().min(0).max(600).step(1),
    // The word also grows very slightly as it fades, on the same curve and over
    // the same window. 1 = no grow.
    popFrom: z.number().min(0.5).max(1).step(0.005),
    easing: easingSlotSchema,
  }),

  effects: z.object({
    // Measured off the reference: downward only, and soft.
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
    // NOT in the reference — an addition. Takes the text's own colour, so a
    // recoloured caption glows in its own hue.
    glow: z.object({
      enabled: z.boolean(),
      blur: z.number().min(0).max(60).step(1),
      opacity: z.number().min(0).max(1).step(0.05),
    }),
  }),
});

export type EditsStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
  };
  text: { font: FontSlot; weight: number; uppercase: boolean; color: string };
  motion: { wordFadeMs: number; popFrom: number; easing: EasingSlot };
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
    glow: { enabled: boolean; blur: number; opacity: number };
  };
};

export const EDITS_DEFAULTS: EditsStyle = {
  layout: {
    // The reference measures 2.52%; scaled up so this reads with the same
    // weight as the other templates on a tall frame. See departure (2) above.
    fontSizePct: 5.5,
    captionScale: 1,
    // 0.68 measured advance minus The Bold Font's own ~0.52.
    letterSpacing: 0.16,
    wordSpacing: 0.26,
    lineSpacing: 1.1,
    positionX: 50, // the reference is dead centre (539-540 of 1080)
    positionY: 78, // house safe zone, not the reference's square-frame 65%
  },
  text: {
    // A single static weight, so the slot renders it at its natural weight and
    // effectiveWeight() drops the number below rather than let the browser
    // smear a faux bold out of it.
    font: { family: "Montserrat", custom: "THEBOLDFONT-FREEVERSION.otf" },
    weight: 700,
    uppercase: true, // the reference is ALL CAPS throughout
    color: "#ffffff", // measured pure white
  },
  motion: {
    // Measured off the SPEED reels, not this one — see departure (1).
    wordFadeMs: 133,
    popFrom: 0.98, // ~2% grow
    // `smooth` is wrong for this entrance (it reaches 0.66 one frame in where
    // the measured curve is at 0.36), so the curve is set explicitly.
    easing: { type: "ease-out", strength: 2 },
  },
  effects: {
    // Downward-only and soft, as measured. Scaled for the larger type: the
    // reference's shadow reaches 1-3px under a 20px cap height, so it is ~2-7px
    // under ours.
    shadow: { enabled: true, color: "rgba(0,0,0,0.55)", blur: 8, offsetY: 3 },
    // "A little glow" — present but gentle. Speed runs 26/0.55; this is softer.
    glow: { enabled: true, blur: 18, opacity: 0.35 },
  },
};

// Reference-EXACT match of public/edits.mp4 on a SQUARE 1080 frame (the "Edits
// Match" composition). Differs from EDITS_DEFAULTS, which is the ADAPTED tall-reel
// look. Here everything is the reference as measured off the footage:
//   - animation is the reference's HARD CUT: words snap 0->full opacity AND full
//     size in ONE 60fps frame (measured: peak 140->255, white 0->80->881 with no
//     intermediate frame). So NO fade (wordFadeMs 0) and NO pop (popFrom 1).
//   - size is the reference's true em, 2.52% of frame width (not the scaled 5.5%).
//   - position is the reference's 65% (its own square framing, not the 78% safe
//     zone the tall reels use).
//   - GLOW OFF — the reference has a soft downward shadow and no halo.
export const EDITS_MATCH_DEFAULTS: EditsStyle = {
  ...EDITS_DEFAULTS,
  layout: { ...EDITS_DEFAULTS.layout, fontSizePct: 2.52, positionY: 65 },
  motion: { ...EDITS_DEFAULTS.motion, wordFadeMs: 0, popFrom: 1 },
  effects: {
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 4, offsetY: 2 },
    glow: { enabled: false, blur: 0, opacity: 0 },
  },
};

const EditsStyleContext = createContext<EditsStyle>(EDITS_DEFAULTS);
export const EditsStyleProvider = EditsStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one.
const FALLBACK_WORDS_PER_LINE = 4;
const FALLBACK_LINES = 1;

/** Renders ONE screen: its words appear one at a time, the line staying centred. */
const EditsSegment: React.FC<{
  lines: KineticWord[][];
  startMs: number;
  font: ResolvedFont;
}> = ({ lines, startMs, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(EditsStyleContext);

  const {
    fontSizePct,
    captionScale,
    letterSpacing,
    wordSpacing,
    lineSpacing,
    positionX,
    positionY,
  } = style.layout;
  const { weight, uppercase, color } = style.text;
  const { wordFadeMs, popFrom, easing } = style.motion;
  const { shadow, glow } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  const timeInMs = (frame / fps) * 1000;
  const ease = useMemo(() => makeOpacityEasing(easing), [easing]);

  const shadowCss = shadow.enabled
    ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
    : "";
  // Two stacked shadows — one tight, one wide — build a glow with some density
  // rather than a flat blur. Same construction Speed uses.
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
          lineHeight: lineSpacing,
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
              // CENTRE-ANCHORED: with un-appeared words taking no width (below),
              // the row re-centres on every new word, so everything already on
              // screen slides outward. That is the reference's behaviour.
              justifyContent: "center",
              alignItems: "baseline",
              columnGap: `${fontSize * wordSpacing}px`,
              whiteSpace: "pre",
            }}
          >
            {line.map((token, wi) => {
              const appearMs = Math.max(0, token.fromMs - startMs);
              const p = interpolate(
                timeInMs,
                [appearMs, appearMs + Math.max(1, wordFadeMs)],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease },
              );
              // A word that has not started yet must occupy NO width, or the row
              // would be pre-spaced to its final size and the centre could not
              // travel.
              if (p <= 0) return null;
              const scale = popFrom + (1 - popFrom) * p;
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    opacity: p,
                    transform: popFrom < 1 ? `scale(${scale.toFixed(4)})` : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  {uppercase ? token.text.toUpperCase() : token.text}
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
 * Edits: one <Sequence> per screen from the caption document, each growing its
 * single centred line a word at a time.
 */
export const PageEdits: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(EditsStyleContext);

  // Resolved ONCE here rather than per screen, so the file is fetched and
  // registered a single time and delayRender keeps a frame from painting before
  // the face is ready.
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
            <EditsSegment lines={block.lines} startMs={block.startMs} font={font} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
