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
import { measureText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import {
  textEffectsSchema,
  textStrokeCss,
  textShadowCss,
  dropShadowCss,
  type TextEffects,
} from "./text-effects";
import {
  fontSlotSchema,
  fontSlot,
  useFontSlot,
  effectiveWeight,
  type FontSlot,
  type ResolvedFont,
} from "./font-slot";
// The caption-document -> blocks conversion is shared with the other kinetic
// templates; only the painting differs here.
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// GADZHI — the "Iman Gadzhi" / clean-podcast caption style.
//
// Reverse-engineered frame by frame from the reference clip (480x854, 29.97fps):
//
//   * Every caption is TWO stacked lines, both on screen together, dead centre,
//     with the block's centre at ~69% of the frame height.
//   * The line CURRENTLY BEING SPOKEN is BOLD and fully opaque; the other line
//     is the SAME colour in a THIN weight at reduced opacity. There is no accent
//     colour anywhere in the reference — the only signal is weight + opacity.
//   * The swap is INSTANT (a single frame, no crossfade) and nothing moves: the
//     lines never slide, scale, or re-flow.
//   * In the reference a new caption fades in over ~5 frames (~0.15s), but we
//     default that OFF (motion.fadeInMs = 0): captions cut straight in, one
//     after another, with NO animation anywhere in the template.
//   * The font size is FIXED for the whole video — long captions are not shrunk
//     to fit, they are split into more captions upstream (see the "gadzhi"
//     shape in enrich.mjs).
//
// Measured against the reference: fontSize 31.8px on a 480px-wide frame
// (= 72px at 1080), baseline gap 38px (line-height 1.19), block centre y=68.97%.
// Fitting a single size across four different bold lines identified the face as
// Montserrat Bold to within 0.5% (Montserrat Alternates was consistently ~2%
// wide), with the thin line's implied size agreeing best at ExtraLight 200.
//
// Per-word `emphasis` is deliberately IGNORED: the reference marks nothing, and
// the caption document stays reusable by the templates that do use it.
// ---------------------------------------------------------------------------

export const gadzhiSchema = captionedVideoSchema.extend({
  // === LAYOUT — placement + sizing. Line GROUPING is not here: it comes from
  // the caption document (Claude's `--shape=gadzhi` output, or the user's
  // per-caption edits in the editor). ===
  layout: z.object({
    // Size as a PERCENTAGE OF FRAME WIDTH, not absolute pixels: the same
    // template has to look identical on the 480-wide source clip and a 1080
    // export, and an absolute size would silently trip the auto-fit on the
    // smaller one. The reference measures 31.8px on a 480px frame = 6.63%.
    fontSizePct: z.number().min(2).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    wordSpacing: z.number().min(0).max(1.5).step(0.05), // gap between words (em)
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line spacing
    positionX: z.number().min(0).max(100).step(1), // block centre X
    positionY: z.number().min(0).max(100).step(1), // block centre Y
    alignment: z.enum(["center", "left", "right"]),
  }),

  // === TEXT — one colour, two weights. That IS the template. ===
  text: z.object({
    // Two INDEPENDENT font slots, because the two lines are on screen together:
    // a client can keep Montserrat for both, or upload their own bold face and
    // their own thin face. A slot holding an uploaded file ignores the weight
    // below unless that file is a variable font — see effectiveWeight().
    activeFont: fontSlotSchema, // spoken line
    inactiveFont: fontSlotSchema, // unspoken line
    color: zColor(), // both lines share it; only weight + opacity differ
    activeWeight: z.number().min(100).max(900).step(100), // spoken line
    inactiveWeight: z.number().min(100).max(900).step(100), // unspoken line
    inactiveOpacity: z.number().min(0.1).max(1).step(0.05),
    capitalizeFirstWord: z.boolean(), // capitalise each caption's opening word
  }),

  // === MOTION — the only animation in the template ===
  motion: z.object({
    fadeInMs: z.number().min(0).max(600).step(10), // 0 = hard cut in
  }),

  // === EFFECTS — legibility helpers, both off/subtle by default ===
  effects: z.object({
    stroke: z.object({
      enabled: textEffectsSchema.strokeEnabled,
      color: textEffectsSchema.strokeColor,
      width: textEffectsSchema.strokeWidth,
    }),
    shadow: z.object({
      enabled: textEffectsSchema.shadowEnabled,
      color: textEffectsSchema.shadowColor,
      blur: textEffectsSchema.shadowBlur,
    }),
  }),
});

export type GadzhiAlignment = "center" | "left" | "right";

export type GadzhiStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    alignment: GadzhiAlignment;
  };
  text: {
    activeFont: FontSlot;
    inactiveFont: FontSlot;
    color: string;
    activeWeight: number;
    inactiveWeight: number;
    inactiveOpacity: number;
    capitalizeFirstWord: boolean;
  };
  motion: { fadeInMs: number };
  effects: {
    stroke: { enabled: boolean; color: string; width: number };
    shadow: { enabled: boolean; color: string; blur: number };
  };
};

// Defaults ARE the measurements taken off the reference clip, expressed as
// fractions of the frame so they hold at any export resolution.
export const GADZHI_DEFAULTS: GadzhiStyle = {
  layout: {
    fontSizePct: 6.63, // 31.8px on the 480-wide reference frame
    captionScale: 1,
    // Solved from the reference's line widths minus the glyph ink: 0.267em over
    // the 4-gap line, 0.278em over the 3-word line — i.e. the face's own space
    // advance (0.283em bold / 0.253em light), so the reference just uses spaces.
    wordSpacing: 0.27,
    lineSpacing: 1.19, // 38px baseline gap / 31.8px size
    positionX: 50, // centreX measured at 240.0 of 480 — dead centre
    positionY: 69, // block centre y=589 of 854
    alignment: "center",
  },
  text: {
    // Both default to built-in Montserrat; either can be swapped for an
    // uploaded file without touching the other.
    activeFont: fontSlot("Montserrat"),
    inactiveFont: fontSlot("Montserrat"),
    color: "#ffffff",
    activeWeight: 700, // Montserrat Bold — matched the reference to 0.5%
    inactiveWeight: 200, // ExtraLight — the weight whose size agreed with Bold
    // Matched by rendering 0.70 / 0.85 / 1.00 against the reference crop: 0.70
    // is visibly too faint and 1.00 slightly too solid.
    inactiveOpacity: 0.85,
    capitalizeFirstWord: true,
  },
  // No entrance animation: captions cut straight in, one after another. The
  // reference clip does fade over ~5 frames, but a hard cut is the look we
  // want here — raise fadeInMs to bring the fade back.
  motion: { fadeInMs: 0 },
  effects: {
    // The reference shows no outline and at most a whisper of shadow; both are
    // here for legibility over bright footage rather than to match the clip.
    stroke: { enabled: false, color: "#000000", width: 4 },
    shadow: { enabled: true, color: "rgba(0, 0, 0, 0.35)", blur: 12 },
  },
};

const GadzhiStyleContext = createContext<GadzhiStyle>(GADZHI_DEFAULTS);
export const GadzhiStyleProvider = GadzhiStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one; this just keeps something legible
// on screen instead of nothing.
const FALLBACK_WORDS_PER_LINE = 3;
const FALLBACK_LINES = 2;
// The auto-fit floor. The reference never rescales text, so this is a safety
// net for a caption that was never segmented for this template, not a feature:
// it shrinks the WHOLE document at once so every caption still shares one size.
const MIN_FIT_SCALE = 0.5;
const FIT_WIDTH_FRACTION = 0.9;

const ALIGN_TO_JUSTIFY: Record<GadzhiAlignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/** Capitalise the first character, leaving the rest of the word untouched. */
const capitalise = (word: string): string =>
  word ? word[0].toUpperCase() + word.slice(1) : word;

/**
 * Renders ONE Gadzhi caption. All lines are painted at once and hold still; the
 * only per-frame decisions are which line is bold (`lineSwitchFrames`) and the
 * block's entrance opacity.
 *
 * `fontSize` is handed down rather than computed here so every caption in the
 * video shares one size — matching the reference, where text never resizes.
 */
const GadzhiSegment: React.FC<{
  lines: KineticWord[][];
  lineSwitchFrames: number[];
  fontSize: number;
  fadeInFrames: number;
  activeFont: ResolvedFont;
  inactiveFont: ResolvedFont;
}> = ({ lines, lineSwitchFrames, fontSize, fadeInFrames, activeFont, inactiveFont }) => {
  const frame = useCurrentFrame();
  const style = useContext(GadzhiStyleContext);

  const { captionScale, wordSpacing, lineSpacing, positionX, positionY, alignment } =
    style.layout;
  const { color, activeWeight, inactiveWeight, inactiveOpacity, capitalizeFirstWord } =
    style.text;

  // The spoken line is the LAST one whose switch frame has been reached — an
  // instant step, exactly as in the reference (no interpolation).
  let activeLine = 0;
  for (let i = 0; i < lineSwitchFrames.length; i++) {
    if (frame >= lineSwitchFrames[i]) activeLine = i;
  }

  // Entrance: the whole block fades in. Nothing moves or scales.
  const enter =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const { stroke: strokeCfg, shadow: shadowCfg } = style.effects;
  const textEffects: TextEffects = {
    shadowEnabled: shadowCfg.enabled,
    shadowColor: shadowCfg.color,
    shadowBlur: shadowCfg.blur,
    strokeEnabled: strokeCfg.enabled,
    strokeColor: strokeCfg.color,
    strokeWidth: strokeCfg.width,
  };
  const stroke = textStrokeCss(textEffects);
  const shadowText = textShadowCss(textEffects);
  const shadowFilter = dropShadowCss(textEffects);

  // Each line carries its OWN family + weight: the two slots are independent,
  // and effectiveWeight() drops the weight number for an uploaded static file
  // so the browser can't synthesise a fake bold from it.
  const lineStyle = (isActive: boolean): React.CSSProperties => {
    const slot = isActive ? activeFont : inactiveFont;
    return {
      display: "flex",
      justifyContent: ALIGN_TO_JUSTIFY[alignment],
      alignItems: "center",
      lineHeight: lineSpacing,
      whiteSpace: "pre",
      // A real flex gap rather than CSS `word-spacing`: the ASR returns words
      // with no literal space between them, and a gap also behaves correctly in
      // RTL.
      columnGap: `${fontSize * wordSpacing}px`,
      color,
      fontFamily: slot.fontFamily,
      fontWeight: effectiveWeight(slot, isActive ? activeWeight : inactiveWeight),
      opacity: isActive ? 1 : inactiveOpacity,
      WebkitTextStroke: stroke,
      paintOrder: stroke ? "stroke fill" : undefined,
      textShadow: shadowText,
      filter: shadowFilter || undefined,
    };
  };

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: "90%",
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) scale(${captionScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          fontSize,
          opacity: enter,
        }}
      >
        {lines.map((line, li) => (
          // dir="auto" lets each line follow its own content: Arabic lays out
          // RTL, Latin LTR, and mixed text is ordered by the Unicode bidi
          // algorithm — so this template works for Arabic captions too.
          <div key={li} dir="auto" style={lineStyle(li === activeLine)}>
            {line.map((token, wi) => (
              <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
                {capitalizeFirstWord && li === 0 && wi === 0
                  ? capitalise(token.text)
                  : token.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Gadzhi style: one <Sequence> per caption from the caption document, each
 * holding a still two-line block whose bold weight steps top -> bottom in time
 * with the speech.
 */
export const PageGadzhi: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(GadzhiStyleContext);

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

  // Resolve both slots here, once, rather than per caption: an uploaded font is
  // fetched and registered a single time, and the delayRender inside the hook
  // keeps a render from painting before it is ready.
  const activeFont = useFontSlot(style.text.activeFont);
  const inactiveFont = useFontSlot(style.text.inactiveFont);

  // ONE font size for the entire video. Start from the configured size and only
  // shrink — by a single factor derived from the widest line anywhere in the
  // document — if something would otherwise run off the frame.
  const { fontSizePct, wordSpacing } = style.layout;
  const configuredSize = (width * fontSizePct) / 100;
  const measureFamily = activeFont.fontFamily;
  const measureWeight = effectiveWeight(activeFont, style.text.activeWeight);
  const fontSize = useMemo(() => {
    const avail = width * FIT_WIDTH_FRACTION;
    let widest = 0;
    for (const block of blocks) {
      for (const line of block.lines) {
        // Measured at the ACTIVE font/weight, which is the wider of the two.
        const textWidth = line.reduce(
          (sum, tk) =>
            sum +
            measureText({
              text: tk.text,
              fontFamily: measureFamily,
              fontSize: configuredSize,
              fontWeight: measureWeight,
            }).width,
          0,
        );
        const gaps = Math.max(0, line.length - 1) * wordSpacing * configuredSize;
        widest = Math.max(widest, textWidth + gaps);
      }
    }
    if (widest <= avail || widest === 0) return configuredSize;
    return configuredSize * Math.max(MIN_FIT_SCALE, avail / widest);
  }, [blocks, width, measureFamily, measureWeight, configuredSize, wordSpacing]);

  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);
  const fadeInFrames = Math.round((style.motion.fadeInMs / 1000) * fps);

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        // Local frame at which each line's first spoken word begins; the bold
        // weight steps through them in order.
        const lineSwitchFrames = block.lines.map((ln) =>
          ln[0] ? Math.max(0, msToFrame(ln[0].fromMs) - startFrame) : 0,
        );
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Caption ${i + 1}`}
          >
            <GadzhiSegment
              lines={block.lines}
              lineSwitchFrames={lineSwitchFrames}
              fontSize={fontSize}
              fadeInFrames={fadeInFrames}
              activeFont={activeFont}
              inactiveFont={inactiveFont}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
