import React, { createContext, useContext } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
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
// it: the gradient / sweep / deepGlow controls and their CSS builders plus the
// count-based block grouping all come straight from PageShiny. This template
// adds the NEW behaviour — a two-line block where the accent (highlight) color
// FOLLOWS THE SPOKEN LINE, moving top -> bottom as the words are said.
import {
  gradientSchema,
  sweepSchema,
  glowSchema,
  deepGlowSchema,
  buildGradientCss,
  buildDeepGlowCss,
  buildTravelSweepCss,
  sweepTravelX,
  groupWordsIntoBlocks,
  enrichedToBlocks,
  type GradientConfig,
  type SweepSlot,
  type KineticWord,
} from "./PageShiny";

// ---------------------------------------------------------------------------
// HORMOZI — the "Alex Hormozi" viral caption style.
//
// A block shows TWO stacked phrases (two related "sentences"). Both lines are on
// screen together, STILL (they appear when the block starts and hold — no
// per-word build-up). The accent color (yellow by default) HIGHLIGHTS THE LINE
// THAT IS CURRENTLY BEING SPOKEN: the top line is highlighted while its words
// are said, then the highlight switches to the bottom line the moment the second
// phrase begins. So the color "changes from the upper sentence to the lower
// sentence" in sync with the audio. The non-highlighted line is the base color
// (white). The switch is quick (instant on the frame the 2nd phrase starts).
//
// Splitting the caption stream into the two related phrases is done by
// `decideSentenceSplit` (currently a rule-based count split). Swap ONLY that
// function's body for a Claude API call later — the call site never changes.
//
// Only the color changes by default, but the FULL Shiny effect stack
// (gradient / glow / deepGlow / sweep×3 / stroke / shadow) is exposed so users
// can layer any of it onto the highlighted line as they like.
// ---------------------------------------------------------------------------

export const hormoziSchema = captionedVideoSchema.extend({
  // === LAYOUT — block placement + sizing. Line GROUPING is NOT here: it comes
  // from the caption document (Claude's auto output, or the user's per-caption
  // edits). No global words-per-line / lines-per-segment knobs by design. ===
  layout: z.object({
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
    baseColor: zColor(), // the NON-spoken line (white in the reference)
    accentColor: zColor(), // the line currently spoken (yellow in the reference)
  }),

  // === EFFECTS — all OPT-IN, applied to the highlighted line (reused from Shiny) ==
  effects: z.object({
    // Gradient FILL for the highlighted line (overrides the flat accent when on).
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

export type HormoziAlignment = "center" | "left" | "right";

export type HormoziStyle = {
  layout: {
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
    captionScale: 1,
    wordSpacing: 0.12,
    lineSpacing: 1.15,
    positionX: 50,
    positionY: 78, // lower-center like the reference
    alignment: "center",
  },
  text: {
    fontFamily: "Montserrat", // bold rounded face matching the reference clip
    baseColor: "#ffffff", // white (non-spoken) line
    accentColor: "#ffd400", // yellow highlight on the spoken line
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
    // Outline + drop shadow for legibility over the video.
    stroke: { enabled: true, color: "#000000", width: 6 },
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
// Grouping used ONLY as a fallback when there is no caption document (raw ASR
// with no Claude enrichment). The real product always has a document, so this
// is just a safety net: pack a plain 3 × 2 grid so something legible shows.
const FALLBACK_WORDS_PER_LINE = 3;

// The accent color hands off to the next line this many ms BEFORE the timestamp
// boundary. ASR (Scribe) stretches the last word of a line to swallow the short
// pause before the next line, so the raw boundary sits AFTER the speaker has
// actually finished the line — which reads as the highlight "lingering" on the
// top line. Leading the switch by ~a beat makes the color move the instant the
// line is effectively done. Tune to taste; 0 = switch exactly on the boundary.
const SWITCH_LEAD_MS = 130;

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
 * Renders ONE Hormozi caption — N stacked lines — inside its own <Sequence>.
 * The text is STILL (all lines appear together and hold), but the HIGHLIGHT
 * (accent color) follows the spoken line: it steps line-by-line (top -> bottom).
 * `lineSwitchFrames[i]` is the local frame at which the accent LANDS on line i
 * (line 0 = 0; later lines = when the previous line finishes being spoken); the
 * active line is the LAST one whose switch frame has been reached. `fontSize` is
 * computed ONCE for the whole document by the parent so every caption is the
 * same size. Works for 1, 2, or 3+ lines — default captions are 2 lines.
 */
const HormoziSegment: React.FC<{
  lines: KineticWord[][];
  lineSwitchFrames: number[];
  fontSize: number;
}> = ({ lines, lineSwitchFrames, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useContext(HormoziStyleContext);

  const {
    captionScale,
    wordSpacing,
    lineSpacing,
    positionX,
    positionY,
    alignment,
  } = style.layout;
  const fontFamily = resolveFontFamily(style.text.fontFamily);
  const { baseColor, accentColor } = style.text;

  // Which line is currently spoken -> highlighted. Step through the lines in
  // order: the active line is the LAST one whose switch frame has been reached
  // (quick, instant switches). Generalizes the old top->bottom 2-line swap to
  // any number of lines.
  let activeLine = 0;
  for (let i = 0; i < lineSwitchFrames.length; i++) {
    if (frame >= lineSwitchFrames[i]) activeLine = i;
  }

  // ---- Effects (highlighted line only) --------------------------------------
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

  // LIGHT SWEEP is PER-WORD (word.sweep). The look + motion come from the first
  // sweep slot used as the "sweep style" (color / width / angle / intensity +
  // animate / speed / bounce). A swept word shows a traveling gloss over its
  // text; nothing is swept by default. Computed once per frame here; the gloss's
  // band position comes from sweepTravelX (static X when not animated).
  const sweepStyle = style.effects.sweep1;
  const sweepGloss = buildTravelSweepCss(sweepStyle, sweepTravelX(sweepStyle, frame, fps));
  // Accent words only need the background-clip technique when a gradient fill is
  // on; the sweep is now painted per-word in an overlay, not in the fill.
  const accentUsesClip = gradient.enabled;

  // The highlight glow + optional deep-glow + drop shadow, as a filter chain.
  const accentFilter = [
    glow.strength > 0 ? `drop-shadow(0 0 ${glow.strength}px ${glow.color})` : "",
    glow.strength > 0 ? `drop-shadow(0 0 ${glow.strength * 2}px ${glow.color})` : "",
    deepGlowFilter,
    shadowFilter,
  ]
    .filter(Boolean)
    .join(" ");

  // NOTE: `fontSize` is computed ONCE for the whole document by PageHormozi and
  // passed in, so every caption renders at the SAME size (see the uniform
  // auto-fit in the parent). Nothing per-caption to measure here.

  // The style for a HIGHLIGHTED (spoken-line) word — still, no opacity/transform.
  const accentWordStyle = (): React.CSSProperties => {
    if (!accentUsesClip) {
      // Simple solid accent color (the default "only the color changes" look).
      return {
        display: "inline-block",
        whiteSpace: "pre",
        fontSize,
        color: accentColor,
        WebkitTextFillColor: accentColor,
        WebkitTextStroke: stroke,
        paintOrder: stroke ? "stroke fill" : undefined,
        textShadow: shadowText,
        filter: accentFilter || undefined,
      };
    }
    return {
      display: "inline-block",
      whiteSpace: "pre",
      fontSize,
      backgroundImage: buildGradientCss(gradient),
      backgroundSize: "100% 100%",
      backgroundPosition: "0% 0%",
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

  // Overlay style for ONE swept word: the traveling gloss clipped to its text,
  // layered above the word so the shine rides over its base color.
  const sweepWordStyle = (): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    display: "inline-block",
    whiteSpace: "pre",
    fontSize,
    pointerEvents: "none",
    backgroundImage: sweepGloss,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  });

  // The style for a BASE (non-spoken) line word — plain solid color + stroke/shadow.
  const baseWordStyle = (): React.CSSProperties => ({
    display: "inline-block",
    whiteSpace: "pre",
    fontSize,
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
          wordSpacing: `${wordSpacing}em`,
        }}
      >
        {lines.map((line, li) => {
          const isAccent = li === activeLine;
          return (
            <div
              key={li}
              // dir="auto" makes each line follow its own content's direction:
              // Arabic lines lay out RTL, English lines LTR, and mixed
              // Arabic+English (code-switching) is ordered by the Unicode bidi
              // algorithm — so English words inside Arabic stay readable.
              dir="auto"
              style={{
                position: "relative",
                display: "flex",
                justifyContent: ALIGN_TO_JUSTIFY[alignment],
                alignItems: "center",
                lineHeight: lineSpacing,
                whiteSpace: "pre",
                // Gap BETWEEN word spans. CSS `word-spacing` only affects literal
                // space characters, and Scribe returns clean space-less words, so
                // the words touched. A real flex gap (scaled to font size) spaces
                // them regardless of script — and works for RTL/Arabic too.
                columnGap: `${fontSize * wordSpacing}px`,
              }}
            >
              {line.map((token, wi) => (
                // Wrapper is position:relative so a swept word can host the
                // moving-gloss overlay directly on top of its own glyphs.
                <span key={wi} style={{ position: "relative", display: "inline-block" }}>
                  <span style={isAccent ? accentWordStyle() : baseWordStyle()}>
                    {token.text}
                  </span>
                  {token.sweep ? (
                    <span aria-hidden style={sweepWordStyle()}>
                      {token.text}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Hormozi style: the flat caption stream is grouped BY COUNT into two-line
 * blocks (wordsPerLine × 2), each wrapped in its OWN <Sequence>. Text is STILL;
 * within a block the highlight (accent color) follows the spoken line, switching
 * from the top line to the bottom line when the 2nd phrase's first word is said.
 */
export const PageHormozi: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(HormoziStyleContext);
  const fontFamily = resolveFontFamily(style.text.fontFamily);
  const { wordSpacing } = style.layout;

  const hasDoc = Boolean(segments && segments.length);
  // PER-CAPTION model: when a caption DOCUMENT exists (Claude's auto output or
  // the user's per-caption edits), render its lines EXACTLY as authored — any
  // number of lines per caption. The count-grid is only a fallback for raw ASR
  // with no document.
  const blocks = hasDoc
    ? enrichedToBlocks(segments!)
    : groupWordsIntoBlocks(
        captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs })),
        FALLBACK_WORDS_PER_LINE,
        2,
      );
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // ---- UNIFORM AUTO-FIT: ONE font size for the WHOLE document ----------------
  // Every caption renders at the SAME size so the scale never jumps between
  // captions. Pick the LARGEST size (capped at DESIRED_FONT_SIZE) at which the
  // widest line ANYWHERE in the document still fits 90% of the frame width.
  const availWidth = width * 0.9;
  let fontSize = DESIRED_FONT_SIZE;
  for (const block of blocks) {
    for (const ln of block.lines) {
      const lineWidthAtRef = ln.reduce(
        (sum, tk) =>
          sum +
          measureText({ text: tk.text, fontFamily, fontSize: REF_SIZE, fontWeight: FONT_WEIGHT })
            .width,
        0,
      );
      const wordSpacingAtRef = ln.length * wordSpacing * REF_SIZE;
      const totalAtRef = lineWidthAtRef + wordSpacingAtRef;
      const fit = totalAtRef > 0 ? (REF_SIZE * availWidth) / totalAtRef : DESIRED_FONT_SIZE;
      if (fit < fontSize) fontSize = fit;
    }
  }

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        // Local frame at which the accent LANDS on each line. Line 0 = caption
        // start. Later lines switch the moment the PREVIOUS line finishes being
        // spoken (its last word's end) — not when this line's first word starts
        // — so the highlight never lingers on the top line through the pause.
        // Guarded with min() so it's never LATER than the old first-word timing.
        const lineSwitchFrames = block.lines.map((ln, li) => {
          if (li === 0) return 0;
          const prev = block.lines[li - 1];
          const prevEndMs = prev.length ? prev[prev.length - 1].toMs : 0;
          const thisStartMs = ln.length ? ln[0].fromMs : prevEndMs;
          // Boundary = earlier of {prev line ends, this line starts}, led by
          // SWITCH_LEAD_MS so the color hands off the instant the line is
          // effectively done (not after ASR's stretched last word).
          const boundaryMs = Math.min(prevEndMs, thisStartMs) - SWITCH_LEAD_MS;
          return Math.max(0, msToFrame(boundaryMs) - startFrame);
        });
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Sentence ${i + 1}`}
          >
            <HormoziSegment
              lines={block.lines}
              lineSwitchFrames={lineSwitchFrames}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
