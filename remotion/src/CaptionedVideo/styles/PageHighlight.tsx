import React, { createContext, useContext } from "react";
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { measureText } from "@remotion/layout-utils";
import { noise2D } from "@remotion/noise";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import {
  textEffectsSchema,
  textShadowCss,
  textStrokeCss,
  dropShadowCss,
  type TextEffects,
} from "./text-effects";
import { fontFamilySchema, resolveFontFamily } from "./fonts";
// Reuse Shiny's EXACT kinetic layout engine + gradient builder (don't reinvent).
import {
  gradientSchema,
  buildGradientCss,
  groupWordsIntoBlocks,
  enrichedToBlocks,
  type KineticWord,
  type KineticBlock,
} from "./PageShiny";
import {
  captionStartFrames,
  captionEndFrame,
  CAPTION_LEAD_MS,
} from "./caption-timing";

// ---------------------------------------------------------------------------
// Highlight = Shiny's kinetic multi-line LAYOUT (count-based grouping:
// wordsPerLine x linesPerSegment, even X/Y spacing, auto-fit font) WITHOUT
// Shiny's per-word "emphasis" system (which made some words randomly bigger).
// Here EVERY word renders at the SAME base size + base color; only the
// currently-spoken (active) word changes — it takes the highlight color (or the
// gradient fill), an optional glow, and — when POP is on — a spring bounce.
//
// Two independent animation toggles sit on top of that static base:
//   • POP    — only the active word springs up (overshoot) as it's spoken.
//   • WIGGLE — the whole caption block drifts like an After Effects wiggle():
//              organic, non-repeating noise-driven X/Y + rotation, all at once.
// Both OFF == still mode (base highlight only, no movement).
//
// Every numeric prop has .min()/.max() so Studio renders sliders; nested groups
// give Studio collapsible headers (layout / text / gradient / glow / pop /
// wiggle / shadow / stroke). Defaults mirror Shiny's where they overlap.
// ---------------------------------------------------------------------------
export const highlightSchema = captionedVideoSchema.extend({
  // --- Kinetic layout (same count-based engine as Shiny) ---
  layout: z.object({
    wordsPerLine: z.number().min(1).max(8).step(1), // words per line -> slider
    linesPerSegment: z.number().min(1).max(6).step(1), // lines per page -> slider
    fontSize: z.number().min(20).max(200).step(1), // base size (auto-shrinks to fit) -> slider
    captionScale: z.number().min(0.5).max(2).step(0.05), // overall caption size multiplier -> slider
    wordSpacing: z.number().min(0).max(1.5).step(0.05), // horizontal gap between words (em) -> slider
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line height between lines -> slider
    positionX: z.number().min(0).max(100).step(1), // block horizontal center (0 left, 50 center, 100 right)
    positionY: z.number().min(0).max(100).step(1), // block vertical center (0 top, 100 bottom)
    alignment: z.enum(["center", "left", "right", "alternate"]), // per-line horizontal alignment
  }),

  // --- Text (font + colors) ---
  text: z.object({
    fontFamily: fontFamilySchema.fontFamily, // font dropdown (all words)
    baseTextColor: zColor(), // color of words not currently spoken
    highlightColor: zColor(), // active (currently spoken) word color
  }),

  // --- Gradient text fill on the active word (Shiny's gradient, reused) ---
  gradient: gradientSchema.extend({
    enabled: z.boolean(), // toggle the gradient fill (default OFF)
  }),

  // --- Glow on the active word (Shiny's drop-shadow glow, reused) ---
  glow: z.object({
    enabled: z.boolean(), // master toggle (default OFF)
    color: zColor(), // glow color
    size: z.number().min(0).max(100).step(1), // glow blur/spread in px -> slider
  }),

  // --- POP: per-word spring bounce on the active word ---
  pop: z.object({
    enabled: z.boolean(), // master toggle
    speed: z.number().min(50).max(400).step(5), // spring stiffness -> how fast the pop+settle is
    intensity: z.number().min(1.0).max(1.6).step(0.05), // how much the word scales up
  }),

  // --- WIGGLE: After Effects-style wiggle() on the WHOLE block. Smooth,
  // organic, non-repeating drift in X + Y + rotation, driven by simplex noise. ---
  wiggle: z.object({
    enabled: z.boolean(), // master toggle (default OFF)
    strength: z.number().min(0).max(100).step(1), // drift amplitude: max px offset (X/Y) + rotation range -> slider
    speed: z.number().min(0.1).max(5).step(0.1), // how fast it wanders / changes direction -> slider
  }),

  // --- Shared shadow + stroke (nested, same field defs as textEffectsSchema) ---
  shadow: z.object({
    enabled: textEffectsSchema.shadowEnabled,
    color: textEffectsSchema.shadowColor,
    blur: textEffectsSchema.shadowBlur,
  }),
  stroke: z.object({
    enabled: textEffectsSchema.strokeEnabled,
    color: textEffectsSchema.strokeColor,
    width: textEffectsSchema.strokeWidth,
  }),
});

// The style props (everything the schema carries except `src`, which stays at
// the composition level and is consumed by the engine, not the style).
export type HighlightStyle = Omit<z.infer<typeof highlightSchema>, "src">;

// Defaults double as the context fallback if a Highlight page is ever rendered
// without a provider. These are kept IN SYNC with the Highlight composition's
// defaultProps in Root.tsx (the values saved from Studio) so the template opens
// with the same look whether or not a provider supplies props.
export const HIGHLIGHT_DEFAULTS: HighlightStyle = {
  layout: {
    wordsPerLine: 3, // short, readable lines (auto-fit) — adjustable
    linesPerSegment: 1, // one line per segment by default
    fontSize: 120,
    captionScale: 1, // no extra scaling by default
    wordSpacing: 0.28, // clean, tight word gap (em), ~matches Shiny's spacing
    lineSpacing: 1.25,
    positionX: 50, // horizontally centered
    positionY: 79, // lower-center
    alignment: "center",
  },
  text: {
    fontFamily: "Inter",
    baseTextColor: "#FFFFFF",
    highlightColor: "#56ff00",
  },
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
  glow: {
    enabled: true,
    color: "rgba(0, 255, 43, 0.38)",
    size: 30,
  },
  pop: {
    enabled: true,
    speed: 130,
    intensity: 1.2,
  },
  wiggle: {
    enabled: false,
    strength: 15, // subtle drift (~15px / ~2.25deg) by default
    speed: 1, // gentle, slow wander by default
  },
  shadow: {
    enabled: true,
    color: "rgba(0, 0, 0, 0.6)",
    blur: 8,
  },
  stroke: {
    enabled: true,
    color: "#000000",
    width: 1,
  },
};

// Carries the schema props from Root down to the style without touching the
// shared engine (CaptionedVideo).
const HighlightStyleContext = createContext<HighlightStyle>(HIGHLIGHT_DEFAULTS);
export const HighlightStyleProvider = HighlightStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — fixed motion tuning (not exposed as props).
// ---------------------------------------------------------------------------
const FONT_WEIGHT = 800;
// Reference size used to measure each line before scaling it down to fit width.
const REF_SIZE = 100;
// Low damping keeps the pop spring underdamped so it overshoots past the target
// scale and bounces back. Stiffness comes from the `pop.speed` prop.
const POP_DAMPING = 9;
const POP_MASS = 1;
// Headroom over the settled `pop.intensity` to cover the spring's overshoot when
// reserving layout width for the popping word (so its peak never clips).
const POP_PEAK_HEADROOM = 1.4;

// ---- WIGGLE (After Effects wiggle()) tuning ----
// Distinct noise seeds make X, Y and rotation drift INDEPENDENTLY — that
// decorrelation is what gives AE wiggle its organic, non-repeating feel (a
// shared seed would make the block move along a straight diagonal).
const WIGGLE_SEED_X = 12.3;
const WIGGLE_SEED_Y = 71.9;
const WIGGLE_SEED_ROT = 134.7;
// Rotation reads as much stronger than translation, so scale the same `strength`
// down for the angle: at strength 100 the block rotates up to ±15°, at the
// subtle default (15) about ±2.25°.
const WIGGLE_ROT_FACTOR = 0.15;

// Per-line horizontal alignment -> flex justify-content. "alternate" staggers
// left/right by line index (Shiny's Hormozi stagger); the rest are fixed.
const justifyFor = (
  alignment: HighlightStyle["layout"]["alignment"],
  lineIndex: number,
): "center" | "flex-start" | "flex-end" => {
  switch (alignment) {
    case "left":
      return "flex-start";
    case "right":
      return "flex-end";
    case "alternate":
      return lineIndex % 2 === 0 ? "flex-start" : "flex-end";
    case "center":
    default:
      return "center";
  }
};

/**
 * Renders ONE caption SEGMENT (a kinetic block: wordsPerLine x linesPerSegment).
 * Mounted INSIDE its own <Sequence> by PageHighlight, so `useCurrentFrame()` here
 * is LOCAL to the segment — frame 0 is the moment the segment appears on the
 * timeline. The active-word + pop timing is therefore measured relative to the
 * block's own start (`block.startMs`).
 *
 * Every word renders at the SAME base size + color; only the currently-spoken
 * word takes the highlight color (or gradient fill) + optional glow, and — when
 * POP is on — grows via its real font size (Shiny's approach), so flexbox keeps
 * the even gap and never overlaps neighbors. WIGGLE drifts the whole block
 * (noise-driven X/Y + rotation, AE wiggle() style).
 */
const HighlightSegment: React.FC<{ block: KineticBlock }> = ({ block }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  // Local segment clock: time elapsed since this segment appeared.
  const localTimeMs = (frame / fps) * 1000;
  const blockStartMs = block.startMs;

  const style = useContext(HighlightStyleContext);
  const { layout, text, gradient, glow, pop, wiggle } = style;
  const fontFamily = resolveFontFamily(text.fontFamily);

  // Adapt the nested shadow/stroke groups to the flat TextEffects shape the
  // shared helpers expect.
  const textEffects: TextEffects = {
    shadowEnabled: style.shadow.enabled,
    shadowColor: style.shadow.color,
    shadowBlur: style.shadow.blur,
    strokeEnabled: style.stroke.enabled,
    strokeColor: style.stroke.color,
    strokeWidth: style.stroke.width,
  };
  const stroke = textStrokeCss(textEffects);

  const lines = block.lines;
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // ---- SIZE + EVEN SPACING ----
  // Like PageShiny: measure every word at a reference size, then shrink the base
  // font so the WIDEST line fits 90% of the width. EVERY word renders at the SAME
  // constant `fontSize` (the POP is a visual-only `transform: scale()` on the
  // active word — see below — never a font change), so flexbox never reflows:
  // sibling words and the line itself stay perfectly still while one word pops.
  //
  // The inter-word GAP (a marginLeft on each word but the first) is a uniform
  // value across the whole block. It is the `wordSpacing` slider PLUS — when pop
  // is on — HALF the widest word's peak growth. A word pops by scaling around its
  // own CENTER, so it grows sideways by (peakScale-1)/2 x its width on each side;
  // folding exactly that into the gap means the popping word grows INTO the gap
  // without eating the visible space (the gap looks ~constant whether or not a
  // word pops) and never collides with a neighbor.
  const peakScale = pop.enabled ? 1 + (pop.intensity - 1) * POP_PEAK_HEADROOM : 1;
  const availWidth = width * 0.9;

  // Measure each word once at REF_SIZE: per-line word-width sums + the GLOBAL
  // widest word (drives the uniform pop padding above).
  let widestWordAtRef = 0;
  const lineWordsWidthAtRef = lines.map((line) => {
    let sum = 0;
    for (const tk of line) {
      const w = measureText({
        text: tk.text,
        fontFamily,
        fontSize: REF_SIZE,
        fontWeight: FONT_WEIGHT,
      }).width;
      sum += w;
      if (w > widestWordAtRef) widestWordAtRef = w;
    }
    return sum;
  });

  const popPadAtRef = pop.enabled ? ((peakScale - 1) / 2) * widestWordAtRef : 0;
  const gapAtRef = layout.wordSpacing * REF_SIZE + popPadAtRef;

  // Largest base size at which each line (words + gaps) still fits availWidth.
  const lineMaxSizes = lines.map((line, i) => {
    const gapsWidthAtRef = Math.max(0, line.length - 1) * gapAtRef;
    const totalAtRef = lineWordsWidthAtRef[i] + gapsWidthAtRef;
    return totalAtRef > 0 ? (REF_SIZE * availWidth) / totalAtRef : layout.fontSize;
  });
  // Also guarantee the widest word AT ITS POP PEAK fits availWidth — covers
  // single-word lines, where the popped word grows with no gap to absorb it.
  const peakWordFitSize =
    widestWordAtRef > 0
      ? (REF_SIZE * availWidth) / (widestWordAtRef * peakScale)
      : layout.fontSize;
  const fontSize = Math.min(layout.fontSize, peakWordFitSize, ...lineMaxSizes);

  // The even gap in px at the resolved base font size (scales gapAtRef from REF).
  const wordGapPx = gapAtRef * (fontSize / REF_SIZE);

  // ---- WIGGLE: After Effects-style wiggle() on the WHOLE block ----
  // Smooth, organic, NON-repeating drift driven by simplex noise (deterministic
  // -> renders identically every pass, unlike Math.random() which would flicker).
  // We sample noise2D along a time axis (frame -> seconds * speed) with three
  // SEPARATE seeds, so X position, Y position and rotation each wander on their
  // own — the block floats to random nearby spots in all directions at once, the
  // hallmark of the AE wiggle expression. noise2D returns [-1, 1]; `strength`
  // scales it to px (X/Y) and (scaled down) to degrees (rotation).
  const wiggleT = (frame / fps) * wiggle.speed;
  const wiggleX = wiggle.enabled
    ? noise2D(WIGGLE_SEED_X, wiggleT, 0) * wiggle.strength
    : 0;
  const wiggleY = wiggle.enabled
    ? noise2D(WIGGLE_SEED_Y, wiggleT, 0) * wiggle.strength
    : 0;
  const wiggleDeg = wiggle.enabled
    ? noise2D(WIGGLE_SEED_ROT, wiggleT, 0) * wiggle.strength * WIGGLE_ROT_FACTOR
    : 0;

  const gradientCss = buildGradientCss(gradient);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          // 90%-wide block whose CENTER sits at (positionX%, positionY%) of the
          // frame (translate(-50%,-50%) re-centers it on that point). captionScale
          // sizes the whole block; the whole block drifts (X/Y px) and rotates as
          // ONE unit for WIGGLE; words keep their relative positions.
          left: `${layout.positionX}%`,
          width: "90%",
          top: `${layout.positionY}%`,
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) translate(${wiggleX}px, ${wiggleY}px) scale(${layout.captionScale}) rotate(${wiggleDeg}deg)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          fontFamily,
          fontWeight: FONT_WEIGHT,
          // Stroke is inherited by the word spans; each also sets paint-order so
          // the stroke sits BEHIND its fill.
          WebkitTextStroke: stroke,
          paintOrder: stroke ? "stroke fill" : undefined,
        }}
      >
        {lines.map((line, li) => (
          <div
            key={li}
            style={{
              display: "flex",
              justifyContent: justifyFor(layout.alignment, li),
              alignItems: "center",
              // EVEN spacing: every word except the first carries a `marginLeft`
              // gap (see `common` below) + line height (Y). We use margin rather
              // than flex `columnGap` (which rendered no gap here) — margin is
              // rock-solid and, like Shiny's leading-space-per-word approach,
              // bakes the gap into each word's OWN box, so the pop's transform
              // scale never shifts neighbors.
              lineHeight: layout.lineSpacing,
              whiteSpace: "pre",
            }}
          >
            {line.map((token, wi) => {
              // Word timing relative to THIS segment's start (Sequence-local).
              const startRel = token.fromMs - blockStartMs;
              const endRel = token.toMs - blockStartMs;
              // Active = this word is currently being spoken.
              const active = startRel <= localTimeMs && endRel > localTimeMs;

              // POP: spring delayed to THIS word's (local) start frame; only the
              // active word pops. It scales via a VISUAL-ONLY `transform: scale()`
              // around its own center (applied to the word span below), so it does
              // NOT change its layout box — flexbox never reflows and every other
              // word stays perfectly still. Settles 1 -> overshoot -> peak.
              const popProgress =
                pop.enabled && active
                  ? spring({
                      frame,
                      fps,
                      delay: Math.max(0, msToFrame(startRel)),
                      config: {
                        damping: POP_DAMPING,
                        mass: POP_MASS,
                        stiffness: pop.speed,
                        overshootClamping: false,
                      },
                    })
                  : 0;
              const popScale = 1 + (pop.intensity - 1) * popProgress;

              // GLOW on the active word (drop-shadow so it survives a transparent
              // gradient fill too).
              const glowFilter =
                glow.enabled && active
                  ? `drop-shadow(0 0 ${glow.size}px ${glow.color}) drop-shadow(0 0 ${glow.size * 2}px ${glow.color})`
                  : "";

              const common: React.CSSProperties = {
                display: "inline-block",
                whiteSpace: "pre",
                // Constant base size for EVERY word — the pop never touches it.
                fontSize,
                // Even horizontal gap BEFORE every word except the first on the
                // line — controlled by the wordSpacing slider (wordSpacing x
                // fontSize). Baked into the word's own box so the pop's transform
                // scale never moves neighbors. The fit reserves this gap (and the
                // pop growth), so words never touch even at the pop's peak.
                marginLeft: wi === 0 ? undefined : wordGapPx,
                // POP = visual-only scale around the word's own center. Transform
                // is applied AFTER layout, so the word grows in place without
                // pushing siblings or shifting the line (zero reflow). Only the
                // active word has popScale !== 1.
                transform: popScale !== 1 ? `scale(${popScale})` : undefined,
                transformOrigin: "center center",
              };

              // GRADIENT fill on the active word (transparent text fill, so the
              // shadow + glow must ride the drop-shadow filter chain).
              if (gradient.enabled && active) {
                const filter = [glowFilter, dropShadowCss(textEffects)]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <span
                    key={wi}
                    style={{
                      ...common,
                      backgroundImage: gradientCss,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                      WebkitTextStroke: stroke,
                      paintOrder: stroke ? "stroke fill" : undefined,
                      filter: filter || undefined,
                    }}
                  >
                    {token.text}
                  </span>
                );
              }

              // SOLID fill — base color, or highlight color when active. Shadow
              // via text-shadow; glow is an additive drop-shadow.
              const color = active ? text.highlightColor : text.baseTextColor;
              return (
                <span
                  key={wi}
                  style={{
                    ...common,
                    color,
                    WebkitTextFillColor: color,
                    textShadow: textShadowCss(textEffects),
                    filter: glowFilter || undefined,
                  }}
                >
                  {token.text}
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
 * Highlight style: Shiny's kinetic multi-line layout (count-based grouping into
 * blocks of wordsPerLine x linesPerSegment) where EVERY word is the same base
 * size + color, the currently-spoken word is highlighted (color / gradient +
 * glow), and POP / WIGGLE are independent toggles.
 *
 * The flat caption stream is grouped BY COUNT into blocks, and EACH block is
 * wrapped in its OWN <Sequence> (from = the block's start frame, durationInFrames
 * = until the next block begins; the last runs to the composition end). This
 * makes every segment a SEPARATE block on the Studio timeline — the same
 * structure the per-page styles (Typewriter) and PageShiny use — instead of one
 * continuous surface. Each <HighlightSegment> renders with its OWN Sequence-local
 * clock. Root passes `singleSurface`, so the style receives the whole stream via
 * `captions` and does its own count-based grouping.
 */
export const PageHighlight: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(HighlightStyleContext);
  const { wordsPerLine, linesPerSegment } = style.layout;

  // Caption tokens carry a LEADING SPACE (Whisper output: " word"); trim it so
  // the inter-word spacing is provided cleanly by the even `columnGap` instead
  // of doubling up with the baked-in space.
  const words: KineticWord[] = captions.map((c) => ({
    text: c.text.trim(),
    fromMs: c.startMs,
    toMs: c.endMs,
  }));
  // Prefer Claude's semantic segments when an enriched file exists.
  const blocks =
    segments && segments.length
      ? enrichedToBlocks(segments)
      : groupWordsIntoBlocks(words, wordsPerLine, linesPerSegment);

  // A block appears at its first word's start and holds until the NEXT block
  // begins; the last runs to the composition end. The first block is pulled back
  // to frame 0 so the screen is never blank before the first spoken word.
  // durationInFrames is forced >= 1 so a Sequence is never zero/negative length.

  // Every caption starts LEAD ms early — the ASR pads each word to swallow
  // the pause after it, so a raw startMs lands after the word is spoken.
  // Deriving the end from the same array makes gaps/overlaps impossible.
  const captionStarts = captionStartFrames(
    blocks.map((b) => b.startMs),
    fps,
    CAPTION_LEAD_MS,
  );

  return (
    // Explicit z-index keeps the caption layer above the video AbsoluteFill.
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = captionStarts[i];
        const endFrame = captionEndFrame(captionStarts, i, durationInFrames);
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            // Shows as the block's label on the Studio timeline.
            name={`Segment ${i + 1}`}
          >
            <HighlightSegment block={block} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
