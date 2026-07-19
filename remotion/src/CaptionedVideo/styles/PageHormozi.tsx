import React, { createContext, useContext } from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
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
  fontFamilySchema,
  resolveFontFamily,
  type FontFamilyName,
} from "./fonts";
// Reuse Shiny's PROVEN effect engine + kinetic grouping instead of reinventing
// it: the gradient / sweep / deepGlow controls and their CSS builders, the
// entrance easing + direction vector, and the count-based block grouping all
// come straight from PageShiny. This template only adds the NEW behaviour — a
// two-line block whose ACCENT color alternates line-to-line, block by block.
import {
  gradientSchema,
  sweepSchema,
  glowSchema,
  deepGlowSchema,
  directionEnum,
  easingTypeEnum,
  buildGradientCss,
  buildSweepCss,
  buildDeepGlowCss,
  makeEntranceEasing,
  ENTRANCE_VECTOR,
  groupWordsIntoBlocks,
  type GradientConfig,
  type SweepSlot,
  type EntranceConfig,
  type EntranceDirection,
  type EntranceEasing,
  type KineticWord,
  type KineticBlock,
} from "./PageShiny";

// ---------------------------------------------------------------------------
// HORMOZI — the "Alex Hormozi" viral caption style.
//
// A block shows TWO stacked phrases (two related "sentences"). ONE line wears
// the accent color (yellow by default), the OTHER stays the base color (white).
// WHICH line is the accent ALTERNATES block by block — it flows top -> bottom
// -> top … — so the color appears to "change from sentence to sentence".
//
// Splitting the caption stream into the two related phrases is done by
// `decideSentenceSplit` (currently a rule-based count split). Swap ONLY that
// function's body for a Claude API call later — the call site never changes.
//
// Only the color changes by default, but the FULL Shiny effect stack
// (gradient / glow / deepGlow / sweep×3 / stroke / shadow) is exposed so users
// can layer any of it onto the accent line as they like. Effects target the
// accent (colored) line; the base (white) line stays clean, matching the
// references.
// ---------------------------------------------------------------------------

// Which line the accent color starts on, and whether it flips each block.
const accentStartEnum = z.enum(["top", "bottom"]);

export const hormoziSchema = captionedVideoSchema.extend({
  // === LAYOUT — how words are grouped into the two lines + block placement ===
  layout: z.object({
    wordsPerLine: z.number().min(1).max(8).step(1), // max words on ONE line
    captionScale: z.number().min(0.5).max(2).step(0.05), // overall size multiplier
    wordSpacing: z.number().min(0).max(1.5).step(0.05), // gap between words (em)
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line spacing
    positionX: z.number().min(0).max(100).step(1), // block center X (0 left … 100 right)
    positionY: z.number().min(0).max(100).step(1), // block center Y (0 top … 100 bottom)
    alignment: z.enum(["center", "left", "right"]), // horizontal alignment of both lines
  }),

  // === TEXT — the two colors + the font ===
  text: z.object({
    fontFamily: fontFamilySchema.fontFamily,
    baseColor: zColor(), // the NON-accent line (white in the references)
    accentColor: zColor(), // the accent line (yellow in the references)
  }),

  // === COLOR FLOW — the signature "color moves sentence to sentence" control ==
  colorFlow: z.object({
    accentStart: accentStartEnum, // which line is accent on the FIRST block
    alternate: z.boolean(), // flip the accent line every block (the top->bottom flow)
  }),

  // === ANIMATION — word entrance (shared by both lines) ===
  animation: z.object({
    entrance: z.object({
      direction: directionEnum,
      distance: z.number().min(5).max(300).step(1),
      duration: z.number().min(5).max(30).step(1),
    }),
    easing: z.object({
      type: easingTypeEnum,
      speed: z.number().min(1).max(6).step(0.1),
    }),
  }),

  // === EFFECTS — all OPT-IN, applied to the accent line (reused from Shiny) ===
  effects: z.object({
    // Gradient FILL for the accent line (overrides the flat accent color when on).
    gradient: gradientSchema.extend({ enabled: z.boolean() }),
    glow: glowSchema, // warm halo (strength 0 = off)
    deepGlow: deepGlowSchema, // AE "Deep Glow" bloom
    sweep1: sweepSchema, // glossy shine bands
    sweep2: sweepSchema,
    sweep3: sweepSchema,
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

export type AccentStart = "top" | "bottom";
export type HormoziAlignment = "center" | "left" | "right";

export type HormoziStyle = {
  layout: {
    wordsPerLine: number;
    captionScale: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    alignment: HormoziAlignment;
  };
  text: {
    fontFamily: FontFamilyName;
    baseColor: string;
    accentColor: string;
  };
  colorFlow: {
    accentStart: AccentStart;
    alternate: boolean;
  };
  animation: {
    entrance: {
      direction: EntranceDirection;
      distance: number;
      duration: number;
    };
    easing: {
      type: EntranceEasing;
      speed: number;
    };
  };
  effects: {
    gradient: GradientConfig & { enabled: boolean };
    glow: { strength: number; color: string };
    deepGlow: {
      enabled: boolean;
      radius: number;
      brightness: number;
      innerColor: string;
      outerColor: string;
      chromatic: number;
    };
    sweep1: SweepSlot;
    sweep2: SweepSlot;
    sweep3: SweepSlot;
    stroke: { enabled: boolean; color: string; width: number };
    shadow: { enabled: boolean; color: string; blur: number };
  };
};

export const HORMOZI_DEFAULTS: HormoziStyle = {
  layout: {
    wordsPerLine: 3,
    captionScale: 1,
    wordSpacing: 0.12,
    lineSpacing: 1.15,
    positionX: 50,
    positionY: 78, // lower-center like the references
    alignment: "center",
  },
  text: {
    fontFamily: "Anton", // closest bundled face to the reference's bold condensed font
    baseColor: "#ffffff", // white line
    accentColor: "#ffd400", // yellow accent
  },
  colorFlow: {
    accentStart: "top", // accent starts on the TOP line, then flows down
    alternate: true,
  },
  animation: {
    entrance: {
      direction: "up",
      distance: 28,
      duration: 10,
    },
    easing: {
      type: "smooth",
      speed: 3,
    },
  },
  effects: {
    gradient: {
      enabled: false,
      angle: 180,
      topColor: "#ffe14d",
      topPosition: 0,
      midEnabled: false,
      midColor: "#ff8a00",
      midPosition: 50,
      bottomColor: "#ff3d00",
      bottomPosition: 100,
    },
    glow: { strength: 0, color: "#ffd400" },
    deepGlow: {
      enabled: false,
      radius: 60,
      brightness: 70,
      innerColor: "#fff5e6",
      outerColor: "#ffd400",
      chromatic: 0,
    },
    sweep1: {
      enabled: false,
      color: "#ffffff",
      angle: 20,
      width: 30,
      intensity: 70,
      positionX: 50,
      positionY: 50,
    },
    sweep2: {
      enabled: false,
      color: "#ffffff",
      angle: 160,
      width: 20,
      intensity: 50,
      positionX: 50,
      positionY: 50,
    },
    sweep3: {
      enabled: false,
      color: "#ffffff",
      angle: 90,
      width: 15,
      intensity: 40,
      positionX: 50,
      positionY: 50,
    },
    // Thick black outline + drop shadow = the legibility treatment in every
    // reference image. On by default; the shiny effects above are off.
    stroke: { enabled: true, color: "#000000", width: 8 },
    shadow: { enabled: true, color: "rgba(0, 0, 0, 0.65)", blur: 8 },
  },
};

// The seam that carries schema props from Root down to the style.
const HormoziStyleContext = createContext<HormoziStyle>(HORMOZI_DEFAULTS);
export const HormoziStyleProvider = HormoziStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — non-prop tuning.
// ---------------------------------------------------------------------------
const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;
const REF_SIZE = 100; // reference size used for width measuring / auto-fit

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// Maps an alignment to the flex justify-content that positions the line's words.
const ALIGN_TO_JUSTIFY: Record<HormoziAlignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// ---------------------------------------------------------------------------
// SENTENCE SPLIT (the two-line grouping) — RULE-BASED, separated for an AI swap.
// ---------------------------------------------------------------------------
/**
 * THE single seam that splits ONE block's flat words into (at most) TWO lines —
 * the two "sentences" shown together. The CURRENT rule is a pure COUNT split:
 * the first `wordsPerLine` words are line 1, the rest are line 2.
 *
 * Later this is where the Claude API decides whether two consecutive phrases are
 * "relatable and understandable" together and where to break them. Replace ONLY
 * this function's body — keep the `(KineticWord[], number) => KineticWord[][]`
 * signature so the call site never changes.
 */
export const decideSentenceSplit = (
  words: KineticWord[],
  wordsPerLine: number,
): KineticWord[][] => {
  const perLine = Math.max(1, Math.floor(wordsPerLine) || 1);
  if (words.length <= perLine) return [words];
  return [words.slice(0, perLine), words.slice(perLine)];
};

/**
 * Which line index (0 = top) is the ACCENT line for block `blockIndex`, given
 * how many lines the block has. With `alternate` on, the accent flows top ->
 * bottom -> top … one block at a time (this is the "color changes from sentence
 * to sentence" behaviour). With it off, the accent stays on `accentStart`.
 * A single-line block always accents its only line.
 */
export const accentLineForBlock = (
  blockIndex: number,
  lineCount: number,
  accentStart: AccentStart,
  alternate: boolean,
): number => {
  if (lineCount <= 1) return 0;
  const bottom = lineCount - 1;
  const startIsTop = accentStart === "top";
  // With alternate off, the accent sits on the start line every block.
  if (!alternate) return startIsTop ? 0 : bottom;
  // Alternating: even blocks use the start line, odd blocks use the other.
  const onStart = blockIndex % 2 === 0;
  const useTop = startIsTop ? onStart : !onStart;
  return useTop ? 0 : bottom;
};

/**
 * Renders ONE Hormozi block — two stacked lines, one accent-colored and one
 * base-colored — inside its own <Sequence> (so `useCurrentFrame` is LOCAL to the
 * block). Words build up as they are spoken; the accent line optionally wears
 * the gradient / glow / sweeps.
 */
const HormoziSegment: React.FC<{ block: KineticBlock; accentLine: number }> = ({
  block,
  accentLine,
}) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const style = useContext(HormoziStyleContext);

  const {
    wordsPerLine,
    captionScale,
    wordSpacing,
    lineSpacing,
    positionX,
    positionY,
    alignment,
  } = style.layout;
  const fontFamily = resolveFontFamily(style.text.fontFamily);
  const { baseColor, accentColor } = style.text;

  // Split this block's words into the two lines (the swappable sentence seam).
  const lines = decideSentenceSplit(block.lines.flat(), wordsPerLine);

  // ---- Effects (accent line only) --------------------------------------------
  const { gradient, glow, deepGlow, stroke: strokeCfg, shadow: shadowCfg } =
    style.effects;
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
  const deepGlowFilter = buildDeepGlowCss(deepGlow);

  const activeSweeps = [style.effects.sweep1, style.effects.sweep2, style.effects.sweep3].filter(
    (s) => s.enabled,
  );
  const sweepLayers = activeSweeps.map(buildSweepCss);
  const sweepSizes = activeSweeps.map(() => "300% 300%");
  const sweepPositions = activeSweeps.map((s) => `${s.positionX}% ${s.positionY}%`);
  // The accent line uses the background-clip technique only when it needs to —
  // a gradient fill and/or glossy sweeps require it. Otherwise a plain solid
  // color fill is enough (and cheaper).
  const accentUsesClip = gradient.enabled || activeSweeps.length > 0;

  // The accent-line glow + optional deep-glow + drop shadow, as a filter chain.
  const accentFilter = [
    glow.strength > 0 ? `drop-shadow(0 0 ${glow.strength}px ${glow.color})` : "",
    glow.strength > 0 ? `drop-shadow(0 0 ${glow.strength * 2}px ${glow.color})` : "",
    deepGlowFilter,
    shadowFilter,
  ]
    .filter(Boolean)
    .join(" ");

  // ---- AUTO-FIT: shrink so the widest line fits 90% of the frame width -------
  const availWidth = width * 0.9;
  const lineMaxSizes = lines.map((ln) => {
    const lineWidthAtRef = ln.reduce(
      (sum, tk) =>
        sum +
        measureText({
          text: tk.text,
          fontFamily,
          fontSize: REF_SIZE,
          fontWeight: FONT_WEIGHT,
        }).width,
      0,
    );
    const wordSpacingAtRef = ln.length * wordSpacing * REF_SIZE;
    const totalAtRef = lineWidthAtRef + wordSpacingAtRef;
    return totalAtRef > 0 ? (REF_SIZE * availWidth) / totalAtRef : DESIRED_FONT_SIZE;
  });
  const fontSize = lineMaxSizes.length
    ? Math.min(DESIRED_FONT_SIZE, ...lineMaxSizes)
    : DESIRED_FONT_SIZE;

  // ---- ENTRANCE: reveal each word relative to the block's start frame --------
  const entranceProps = style.animation.entrance;
  const easingProps = style.animation.easing;
  const entrance: EntranceConfig = {
    easingFn: makeEntranceEasing(easingProps.type, easingProps.speed),
    ...ENTRANCE_VECTOR[entranceProps.direction],
    distance: entranceProps.distance,
  };
  const entranceDuration = entranceProps.duration;
  const blockStartMs = block.startMs;
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  const enter = (startFrame: number) => {
    const progress = interpolate(
      frame,
      [startFrame, startFrame + entranceDuration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: entrance.easingFn },
    );
    const p = clamp(progress, 0, 1);
    const offset = entrance.distance * (1 - p);
    return {
      opacity: p,
      tx: entrance.axis === "x" ? entrance.sign * offset : 0,
      ty: entrance.axis === "y" ? entrance.sign * offset : 0,
    };
  };

  // Builds the clipped background layers for a gradient/sweep accent word.
  const buildAccentBg = () => {
    const bgLayers = [...sweepLayers];
    const bgSizes = [...sweepSizes];
    const bgPositions = [...sweepPositions];
    // Base fill under the sweeps: the gradient if enabled, else the flat accent.
    bgLayers.push(gradient.enabled ? buildGradientCss(gradient) : accentColor);
    bgSizes.push("100% 100%");
    bgPositions.push("0% 0%");
    return { bgLayers, bgSizes, bgPositions };
  };

  // The per-word style for an ACCENT-line word.
  const accentWordStyle = (opacity: number, transform: string): React.CSSProperties => {
    if (!accentUsesClip) {
      // Simple solid accent color (the default "only the color changes" look).
      return {
        display: "inline-block",
        whiteSpace: "pre",
        fontSize,
        opacity,
        transform,
        color: accentColor,
        WebkitTextFillColor: accentColor,
        WebkitTextStroke: stroke,
        paintOrder: stroke ? "stroke fill" : undefined,
        textShadow: shadowText,
        filter: accentFilter || undefined,
      };
    }
    const { bgLayers, bgSizes, bgPositions } = buildAccentBg();
    return {
      display: "inline-block",
      whiteSpace: "pre",
      fontSize,
      opacity,
      transform,
      transformOrigin: "center",
      backgroundImage: bgLayers.join(", "),
      backgroundSize: bgSizes.join(", "),
      backgroundPosition: bgPositions.join(", "),
      backgroundRepeat: "no-repeat",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      WebkitTextStroke: stroke,
      paintOrder: stroke ? "stroke fill" : undefined,
      // drop-shadow (not text-shadow) so it shows through the transparent fill.
      filter: accentFilter || undefined,
    };
  };

  // The per-word style for a BASE-line word (plain solid color + stroke/shadow).
  const baseWordStyle = (opacity: number, transform: string): React.CSSProperties => ({
    display: "inline-block",
    whiteSpace: "pre",
    fontSize,
    opacity,
    transform,
    color: baseColor,
    WebkitTextFillColor: baseColor,
    WebkitTextStroke: stroke,
    paintOrder: stroke ? "stroke fill" : undefined,
    textShadow: shadowText,
    filter: shadowFilter || undefined,
  });

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
          fontFamily,
          fontWeight: FONT_WEIGHT,
          textTransform: "uppercase",
          wordSpacing: `${wordSpacing}em`,
        }}
      >
        {lines.map((line, li) => {
          const isAccent = li === accentLine;
          return (
            <div
              key={li}
              style={{
                display: "flex",
                justifyContent: ALIGN_TO_JUSTIFY[alignment],
                alignItems: "center",
                lineHeight: lineSpacing,
                whiteSpace: "pre",
              }}
            >
              {line.map((token, wi) => {
                // Reveal each word offset by when it is spoken inside the block.
                const wordStartFrame = Math.max(0, msToFrame(token.fromMs - blockStartMs));
                const { opacity, tx, ty } = enter(wordStartFrame);
                const transform = `translate(${tx}px, ${ty}px)`;
                return (
                  <span
                    key={wi}
                    style={
                      isAccent
                        ? accentWordStyle(opacity, transform)
                        : baseWordStyle(opacity, transform)
                    }
                  >
                    {token.text}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Hormozi style: the flat caption stream is grouped BY COUNT into two-line
 * blocks (wordsPerLine × 2), each wrapped in its OWN <Sequence>. Every block
 * accents ONE of its two lines; the accent line alternates block by block so the
 * color appears to move from sentence to sentence.
 */
export const PageHormozi: React.FC<CaptionStyleProps> = ({ captions = [] }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(HormoziStyleContext);
  const { wordsPerLine } = style.layout;
  const { accentStart, alternate } = style.colorFlow;

  const words: KineticWord[] = captions.map((c) => ({
    text: c.text,
    fromMs: c.startMs,
    toMs: c.endMs,
  }));
  // Two lines per block: reuse Shiny's count grouping with linesPerSegment = 2.
  const blocks = groupWordsIntoBlocks(words, wordsPerLine, 2);
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        const accentLine = accentLineForBlock(i, block.lines.length, accentStart, alternate);
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Sentence ${i + 1}`}
          >
            <HormoziSegment block={block} accentLine={accentLine} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
