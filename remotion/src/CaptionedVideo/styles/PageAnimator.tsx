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
import { easingSlotSchema, makeEasing, makeOpacityEasing, type EasingSlot } from "./easing-slot";
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// ANIMATOR — the slider-driven word animator.
//
// Every other template in this project has ONE baked-in motion. This one has a
// motion ENGINE, modelled on the "Text Animator Pro" MOGRT and calibrated
// against its own exported clips (public/easing sample .mp4, 720x1280 @23.98).
//
// THE MODEL — a WAVE, not per-word keyframes.
//
// The MOGRT's expressions (recovered from the .aep) drive an After Effects Range
// Selector whose offset sweeps across the text:
//     linear(time, 0, dur, -100, 100)
//     style = 1=Characters, 2=Words, 3=Lines ;  dir = 1=Reading, 2=Reverse
// So it is ONE selection window sliding along the sentence: words behind it have
// finished, words under it are mid-flight, words ahead have not started. That is
// why a single frame shows three different stages at once — caught exactly that
// in the reference at frame 14: "This" sharp and settled, "is" slightly soft and
// low, "Text" heavily blurred and lower still.
//
// Here the wave is expressed as a per-word START OFFSET (`staggerMs`); each word
// then runs the same transition. Same result, and far easier to reason about.
//
// WHAT THE REFERENCE ACTUALLY DOES, measured per channel (white text on flat
// red, so the green channel reads out alpha directly):
//
//   position  rises 25px, strong ease-out — half the distance in 2 frames, then
//             a long settle (25,18,13,11,8,7,6,5,4,3,2 px remaining per frame)
//   opacity   0 -> 1 in ~4 frames (165ms). Quick.
//   blur      glyph edges 5px -> 1px over ~13 frames (540ms). THE SLOWEST
//             CHANNEL — the word is readable early but keeps settling into
//             focus, and that is what reads as "smooth".
//   stagger   ~4.5 frames (188ms) between words, reading order through BOTH
//             lines, so a two-line caption is one continuous sweep.
//
// A second reference (easing sample 2, a real caption over footage) runs the
// same animation slower: ~20px rise, opacity ~5 frames, blur ~15 frames. Same
// family, different tuning — which is exactly why every channel below is a
// slider rather than a constant.
//
// WORDS ONLY, by design: per-character and per-line versions are separate
// templates. Entrance only — no exit; a caption simply gives way to the next.
// ---------------------------------------------------------------------------

export const animatorSchema = captionedVideoSchema.extend({
  frame: frameSizeSchema,

  // === TEXT ANIMATION — the wave. Set any channel to 0 to switch it off. ===
  animation: z.object({
    // WHICH WAY each word slides in from. All four are the SAME measured motion —
    // only the axis and sign of the travel change:
    //   up    — rises from below into place (the measured default)
    //   down  — drops from above into place
    //   left  — comes in from the right, moving left
    //   right — comes in from the left, moving right
    slideDirection: z.enum(["up", "down", "left", "right"]),
    // HOW FAR the word travels in, as a % of FRAME WIDTH (width on both axes so
    // the motion keeps its proportions at every export size). The range runs to
    // 50% of the width — on a 1080 frame that is 540px, so a word can fly in from
    // far off-screen, not just nudge in. 0 = no travel (fade/blur only).
    //   reference value: 3.47 = the measured 25px rise on a 720-wide frame.
    slideDistancePct: z.number().min(0).max(50).step(0.05),
    // FADE. `fadeFrom` is the opacity the word STARTS at: 0 = invisible and
    // fades all the way up, 0.5 = starts half-visible, 1 = no fade at all. It is
    // a slider rather than a switch so the strength of the fade is tunable, not
    // just its presence.
    fadeFrom: z.number().min(0).max(1).step(0.01),
    fadeMs: z.number().min(0).max(2000).step(5),
    // BLUR the word starts at, also as a % of frame width (0 = no blur). 1% of
    // a 1080 frame is ~11px. Its own duration, because the reference resolves
    // blur long AFTER the fade has finished — that lag is what reads as smooth.
    blurPct: z.number().min(0).max(5).step(0.01),
    blurMs: z.number().min(0).max(2000).step(5),
    // Scale/rotation are in the MOGRT too; off by default, as in the reference.
    scaleFrom: z.number().min(0.2).max(2).step(0.01),
    rotateFrom: z.number().min(-90).max(90).step(1),
    // How long ONE word's move takes, and how far apart consecutive words start.
    // `staggerMs` IS the wave speed: small = words overlap into a smooth sweep,
    // large = they arrive one at a time.
    durationMs: z.number().min(20).max(3000).step(5),
    staggerMs: z.number().min(0).max(1000).step(5),
    // Curve and speed are separate controls by request: the curve shapes the
    // motion, the durations above set how long it takes.
    easing: easingSlotSchema,
    direction: z.enum(["reading", "reverse", "random"]),
    seed: z.number().min(0).max(999).step(1),
  }),

  // === LAYOUT ===
  layout: z.object({
    fontSizePct: z.number().min(1).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    letterSpacing: z.number().min(-0.05).max(0.4).step(0.01),
    wordSpacing: z.number().min(0).max(1).step(0.01),
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
    alignment: z.enum(["left", "center", "right"]),
  }),

  // === TEXT ===
  text: z.object({
    font: fontSlotSchema,
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
    // Claude already marks the payload word per caption (`emphasis`); this is
    // the colour that word takes, like the red keyword in the second reference.
    accentColor: zColor(),
    accentOnEmphasis: z.boolean(),
  }),

  // === EFFECTS ===
  effects: z.object({
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
    glow: z.object({
      enabled: z.boolean(),
      blur: z.number().min(0).max(60).step(1),
      opacity: z.number().min(0).max(1).step(0.05),
    }),
  }),
});

export type AnimatorAlignment = "left" | "center" | "right";

export type AnimatorStyle = {
  frame: FrameSizeName;
  animation: {
    slideDirection: "up" | "down" | "left" | "right";
    slideDistancePct: number;
    fadeFrom: number;
    fadeMs: number;
    blurPct: number;
    blurMs: number;
    scaleFrom: number;
    rotateFrom: number;
    durationMs: number;
    staggerMs: number;
    easing: EasingSlot;
    direction: "reading" | "reverse" | "random";
    seed: number;
  };
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    alignment: AnimatorAlignment;
  };
  text: {
    font: FontSlot;
    weight: number;
    uppercase: boolean;
    color: string;
    accentColor: string;
    accentOnEmphasis: boolean;
  };
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
    glow: { enabled: boolean; blur: number; opacity: number };
  };
};

// Defaults ARE the measurements from `easing sample .mp4`. The second reference
// is the same look tuned slower — reach it by raising blurMs/durationMs.
export const ANIMATOR_DEFAULTS: AnimatorStyle & { showPunctuation: boolean } = {
          showPunctuation: false,
          frame: "9:16" as const,
          animation: {
            slideDirection: "up" as const,
            slideDistancePct: 3.47,
            fadeFrom: 0,
            fadeMs: 165,
            blurPct: 0.83,
            blurMs: 540,
            scaleFrom: 1,
            rotateFrom: 0,
            durationMs: 580,
            staggerMs: 188,
            easing: { type: "ease-out" as const, strength: 4 },
            direction: "reading" as const,
            seed: 0,
          },
          layout: {
            fontSizePct: 6.7,
            captionScale: 1,
            letterSpacing: 0,
            wordSpacing: 0.24,
            lineSpacing: 1.2,
            positionX: 50,
            positionY: 50,
            alignment: "left" as const,
          },
          text: {
            font: { family: "Playfair Display" as const, custom: "" },
            weight: 700,
            uppercase: false,
            color: "#ffffff",
            accentColor: "#e02020",
            accentOnEmphasis: true,
          },
          effects: {
            shadow: {
              enabled: true,
              color: "rgba(0,0,0,0.5)",
              blur: 10,
              offsetY: 3,
            },
            glow: { enabled: false, blur: 18, opacity: 0.3 },
          },
        };

const AnimatorStyleContext = createContext<AnimatorStyle>(ANIMATOR_DEFAULTS);
export const AnimatorStyleProvider = AnimatorStyleContext.Provider;

const FALLBACK_WORDS_PER_LINE = 4;
const FALLBACK_LINES = 2;
const FIT_WIDTH_FRACTION = 0.84;

const ALIGN_TO_JUSTIFY: Record<AnimatorAlignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/** Deterministic 0..1 from an integer — used to shuffle the wave order. */
const rand01 = (n: number, seed: number): number => {
  let h = (n + 1) * 374761393 + seed * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Renders ONE caption. Every word runs the same transition, offset in time by
 * the wave — so at any instant the caption shows several words at different
 * stages, which is what the reference does.
 */
const AnimatorSegment: React.FC<{
  lines: KineticWord[][];
  startMs: number;
  font: ResolvedFont;
}> = ({ lines, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(AnimatorStyleContext);

  const a = style.animation;
  const {
    fontSizePct,
    captionScale,
    letterSpacing,
    wordSpacing,
    lineSpacing,
    positionX,
    positionY,
    alignment,
  } = style.layout;
  const { weight, uppercase, color, accentColor, accentOnEmphasis } = style.text;
  const { shadow, glow } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  const timeInMs = (frame / fps) * 1000;
  const moveEase = useMemo(() => makeEasing(a.easing), [a.easing]);
  const fadeEase = useMemo(() => makeOpacityEasing(a.easing), [a.easing]);

  // The slide vector: ONE distance (% of frame width, so it scales with export
  // size) applied on the axis/sign the direction picks. Positive Y is DOWNWARD on
  // screen, so "up" starts the word BELOW its home (+dist) and it rises to 0;
  // "down" starts it above (-dist); "left" starts it to the RIGHT (+dist) and it
  // moves left; "right" starts it to the LEFT (-dist).
  const distPx = (width * a.slideDistancePct) / 100;
  const moveYpx =
    a.slideDirection === "up" ? distPx : a.slideDirection === "down" ? -distPx : 0;
  const moveXpx =
    a.slideDirection === "left" ? distPx : a.slideDirection === "right" ? -distPx : 0;
  const blurPx = (width * a.blurPct) / 100;

  const shadowCss = shadow.enabled
    ? `0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
    : "";
  const glowCss =
    glow.enabled && glow.opacity > 0
      ? `0 0 ${Math.round(glow.blur * 0.4)}px ${color}, 0 0 ${glow.blur}px ${color}`
      : "";
  const textShadow = [shadowCss, glowCss].filter(Boolean).join(", ");

  // THE WAVE. Words are numbered in reading order across BOTH lines, so a
  // two-line caption sweeps as one continuous motion rather than restarting.
  const flat = lines.flat();
  const n = flat.length;
  let k = 0;
  const orderOf: number[] = flat.map((_, i) =>
    a.direction === "reverse" ? n - 1 - i : i,
  );
  if (a.direction === "random") {
    // Sort a stable shuffle so every word still gets a distinct slot.
    const idx = flat.map((_, i) => i);
    idx.sort((p, q) => rand01(p, a.seed) - rand01(q, a.seed));
    idx.forEach((wordIndex, slot) => {
      orderOf[wordIndex] = slot;
    });
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: `${FIT_WIDTH_FRACTION * 100}%`,
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
          <div
            key={li}
            dir="auto"
            style={{
              display: "flex",
              justifyContent: ALIGN_TO_JUSTIFY[alignment],
              alignItems: "baseline",
              columnGap: `${fontSize * wordSpacing}px`,
              whiteSpace: "pre",
            }}
          >
            {line.map((token, wi) => {
              const globalIndex = k++;
              const slot = orderOf[globalIndex];
              // Each word starts when the wave reaches it. The caption's own
              // first word starts at its caption start, so a caption never waits
              // for the previous one to finish.
              const begin = slot * a.staggerMs;

              const at = (endMs: number, easing: (t: number) => number) =>
                interpolate(timeInMs, [begin, begin + Math.max(1, endMs)], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing,
                });

              const pMove = at(a.durationMs, moveEase);
              const pFade = at(a.fadeMs, fadeEase);
              const pBlur = at(a.blurMs, fadeEase);
              // fadeFrom 1 means "no fade": the word is solid the whole time.
              const opacity = a.fadeFrom + (1 - a.fadeFrom) * pFade;

              const ty = moveYpx * (1 - pMove);
              const tx = moveXpx * (1 - pMove);
              const sc = a.scaleFrom + (1 - a.scaleFrom) * pMove;
              const rot = a.rotateFrom * (1 - pMove);
              const bl = blurPx * (1 - pBlur);

              const t: string[] = [];
              if (ty || tx) t.push(`translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`);
              if (a.scaleFrom !== 1) t.push(`scale(${sc.toFixed(4)})`);
              if (a.rotateFrom !== 0) t.push(`rotate(${rot.toFixed(2)}deg)`);

              const isAccent = accentOnEmphasis && token.emphasis;
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    opacity,
                    color: isAccent ? accentColor : undefined,
                    transform: t.length ? t.join(" ") : undefined,
                    filter: bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : undefined,
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

/** Animator: one <Sequence> per caption, each running the wave across its words. */
export const PageAnimator: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(AnimatorStyleContext);
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
            <AnimatorSegment lines={block.lines} startMs={block.startMs} font={font} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
