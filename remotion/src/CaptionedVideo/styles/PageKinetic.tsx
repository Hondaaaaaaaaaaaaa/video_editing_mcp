import React, { createContext, useContext, useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { measureText } from "@remotion/layout-utils";
import type { CaptionStyleProps, EnrichedSegment, WordVariant } from "./types";
import { captionedVideoSchema } from "../index";
import {
  textEffectsSchema,
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
// Reuse Shiny's PROVEN entrance machinery — the direction→offset vector and the
// easing-curve builder. This template's entrance IS Shiny's: a single directional
// slide + fade with easing, applied to every word (no pop, no wipe).
import {
  directionEnum,
  easingTypeEnum,
  makeEntranceEasing,
  ENTRANCE_VECTOR,
  groupWordsIntoBlocks,
  type EntranceDirection,
  type EntranceEasing,
} from "./PageShiny";
import {
  captionStartFrames,
  captionEndFrame,
  CAPTION_LEAD_MS,
} from "./caption-timing";

// ---------------------------------------------------------------------------
// KINETIC ("kinetic 1") — flowing kinetic-typography captions, modelled exactly
// on the reference "sample 1".
//
// Words ACCUMULATE one by one into a centred block (~upper-middle), then the
// block clears for the next phrase. Every word slides + fades into place with
// easing (Shiny-style) — no pop, no wipe. Each word carries a semantic ROLE
// (`variant`, assigned by Claude in the enrich pass):
//
//   base    — ordinary connective text: clean sans, white.
//   punch   — an emphasised keyword: the SAME sans but BOLD and a bit bigger,
//             and (via `emphasis`) usually the accent RED. NOT a condensed face,
//             NOT uppercase — just heavier + bigger + coloured, as in sample 1
//             ("f*ck", "write hooks", "good people", "the triple", "correctly").
//   elegant — a stylistic word in an italic serif ("comment", "hook").
//
// COLOUR rides on `emphasis` (accent vs white), independent of role — so a bold
// red word is punch+emphasis, and a bold white word (like "correctly,") is
// punch without emphasis.
//
// Fonts are FONT SLOTS (built-in family OR a client upload), one per role.
// ---------------------------------------------------------------------------

// One role's look: which font, how big (as % of frame width), weight, casing.
const roleSchema = z.object({
  font: fontSlotSchema,
  sizePct: z.number().min(2).max(24).step(0.1), // cap height as % of frame width
  weight: z.number().min(100).max(900).step(100),
  uppercase: z.boolean(), // off for sample 1; kept tunable
  italic: z.boolean(),
  letterSpacing: z.number().min(-0.1).max(0.4).step(0.01), // em
});

export const kineticSchema = captionedVideoSchema.extend({
  layout: z.object({
    positionX: z.number().min(0).max(100).step(1), // block centre X
    positionY: z.number().min(0).max(100).step(1), // block TOP anchor Y
    blockWidthPct: z.number().min(40).max(100).step(1),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    wordSpacing: z.number().min(0).max(1).step(0.01), // gap between words (em)
    lineSpacing: z.number().min(0.8).max(2).step(0.01),
    alignment: z.enum(["center", "left", "right"]),
  }),
  colors: z.object({
    baseColor: zColor(), // non-accent words
    accentColor: zColor(), // emphasis words
  }),
  roles: z.object({
    base: roleSchema,
    punch: roleSchema,
    elegant: roleSchema,
  }),
  // ONE entrance for every word (Shiny-style slide + fade with easing). Words
  // reveal one at a time on their spoken frame, so the block builds up.
  motion: z.object({
    direction: directionEnum, // where each word slides FROM
    distancePct: z.number().min(0).max(30).step(0.5), // slide distance, % of width
    durationFrames: z.number().min(1).max(30).step(1),
    easing: easingTypeEnum,
    easingSpeed: z.number().min(1).max(6).step(0.1),
  }),
  effects: z.object({
    shadow: z.object({
      enabled: textEffectsSchema.shadowEnabled,
      color: textEffectsSchema.shadowColor,
      blur: textEffectsSchema.shadowBlur,
    }),
  }),
});

export type KineticAlignment = "center" | "left" | "right";
export type RoleStyle = {
  font: FontSlot;
  sizePct: number;
  weight: number;
  uppercase: boolean;
  italic: boolean;
  letterSpacing: number;
};

export type KineticStyle = {
  layout: {
    positionX: number;
    positionY: number;
    blockWidthPct: number;
    captionScale: number;
    wordSpacing: number;
    lineSpacing: number;
    alignment: KineticAlignment;
  };
  colors: { baseColor: string; accentColor: string };
  roles: { base: RoleStyle; punch: RoleStyle; elegant: RoleStyle };
  motion: {
    direction: EntranceDirection;
    distancePct: number;
    durationFrames: number;
    easing: EntranceEasing;
    easingSpeed: number;
  };
  effects: { shadow: { enabled: boolean; color: string; blur: number } };
};

// Defaults ARE the sample-1 measurements (720-wide source), expressed as
// fractions of frame width so they hold at any export size.
export const KINETIC_DEFAULTS: KineticStyle = {
  layout: {
    positionX: 50,
    // Measured off sample 1: the text block TOP sits at ~27% (block centre ~37%).
    positionY: 26,
    blockWidthPct: 84,
    captionScale: 1,
    wordSpacing: 0.24,
    lineSpacing: 1.1,
    alignment: "center",
  },
  colors: {
    baseColor: "#ffffff",
    accentColor: "#b81f1c", // the signature red, measured off sample 1 (~#b02020)
  },
  roles: {
    // Ordinary text — clean sans, white. Base cap-height ≈ 6% of width (sample 1).
    base: {
      font: fontSlot("Montserrat"),
      sizePct: 6,
      weight: 600,
      uppercase: false,
      italic: false,
      letterSpacing: 0,
    },
    // Emphasised keyword — SAME sans, heavy and SUPERSIZED (~2x base, ~13% of
    // width in sample 1); red via emphasis. This is the word the eye lands on.
    punch: {
      font: fontSlot("Montserrat"),
      sizePct: 12.5,
      weight: 800,
      uppercase: false,
      italic: false,
      letterSpacing: -0.01,
    },
    // Stylistic word — italic serif, between base and punch in size.
    elegant: {
      font: fontSlot("Playfair Display"),
      sizePct: 8.5,
      weight: 500,
      uppercase: false,
      italic: true,
      letterSpacing: 0,
    },
  },
  motion: {
    direction: "up", // rises into place
    distancePct: 5,
    durationFrames: 11,
    easing: "smooth",
    easingSpeed: 3,
  },
  effects: {
    // A soft shadow keeps text legible over bright footage; subtle by default.
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 16 },
  },
};

const KineticStyleContext = createContext<KineticStyle>(KINETIC_DEFAULTS);
export const KineticStyleProvider = KineticStyleContext.Provider;

// ---------------------------------------------------------------------------
// Blocks — kinetic words that CARRY the variant (Shiny's enrichedToBlocks drops
// it, so we build our own). Falls back to count-grouping raw ASR with no doc.
// ---------------------------------------------------------------------------
type KWord = { text: string; fromMs: number; toMs: number; emphasis: boolean; variant: WordVariant };
type KBlock = { lines: KWord[][]; startMs: number };

const FALLBACK_WORDS_PER_LINE = 3;
const FALLBACK_LINES = 2;
const FIT_WIDTH_FRACTION = 0.98;
const MIN_FIT_SCALE = 0.4;

const segmentsToBlocks = (segments: EnrichedSegment[]): KBlock[] =>
  segments
    .map((seg) => {
      const lines: KWord[][] = (seg.lines ?? []).map((line) =>
        (line.words ?? []).map((w) => ({
          text: w.text,
          fromMs: w.startMs,
          toMs: w.endMs,
          emphasis: !!w.emphasis,
          variant: w.variant ?? "base",
        })),
      );
      const flat = lines.flat();
      return { lines, startMs: flat[0]?.fromMs ?? 0 };
    })
    .filter((b) => b.lines.some((l) => l.length > 0));

const ALIGN_TO_JUSTIFY: Record<KineticAlignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

type ResolvedRole = { font: ResolvedFont; style: RoleStyle };

// ---------------------------------------------------------------------------
// One caption block. Words are painted at once; each reveals on its own frame
// (word-by-word build) with the SHARED slide+fade entrance.
// ---------------------------------------------------------------------------
const KineticSegment: React.FC<{
  lines: KWord[][];
  blockStartMs: number;
  resolved: Record<WordVariant, ResolvedRole>;
  frameWidth: number;
}> = ({ lines, blockStartMs, resolved, frameWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useContext(KineticStyleContext);
  const {
    positionX,
    positionY,
    blockWidthPct,
    captionScale,
    wordSpacing,
    lineSpacing,
    alignment,
  } = style.layout;
  const { baseColor, accentColor } = style.colors;
  const motion = style.motion;
  const easingFn = useMemo(
    () => makeEntranceEasing(motion.easing, motion.easingSpeed),
    [motion.easing, motion.easingSpeed],
  );

  const shadowCfg = style.effects.shadow;
  const textEffects: TextEffects = {
    shadowEnabled: shadowCfg.enabled,
    shadowColor: shadowCfg.color,
    shadowBlur: shadowCfg.blur,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 0,
  };
  const shadowText = textShadowCss(textEffects);
  const shadowFilter = dropShadowCss(textEffects);

  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);
  const px = (pct: number) => (frameWidth * pct) / 100;

  // The single shared entrance: fade + slide from `direction`, timed to this
  // word's own spoken start relative to the block (word-by-word build).
  const wordEnter = (startMs: number) => {
    const startFrame = Math.max(0, msToFrame(startMs - blockStartMs));
    const p = interpolate(frame, [startFrame, startFrame + motion.durationFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easingFn,
    });
    const off = px(motion.distancePct) * (1 - p);
    const v = ENTRANCE_VECTOR[motion.direction];
    return {
      opacity: p,
      tx: v.axis === "x" ? v.sign * off : 0,
      ty: v.axis === "y" ? v.sign * off : 0,
    };
  };

  // ---- AUTO-FIT: scale each line down if its natural width overruns the block.
  // Widths use each word's OWN role font/size/weight, since sizes are mixed.
  const avail = px(blockWidthPct) * FIT_WIDTH_FRACTION;
  const lineScale = (line: KWord[]): number => {
    let w = 0;
    for (const tk of line) {
      const r = resolved[tk.variant];
      w +=
        measureText({
          text: tk.text,
          fontFamily: r.font.fontFamily,
          fontSize: px(r.style.sizePct),
          fontWeight: effectiveWeight(r.font, r.style.weight),
          letterSpacing: `${r.style.letterSpacing}em`,
          textTransform: r.style.uppercase ? "uppercase" : "none",
        }).width;
    }
    w += Math.max(0, line.length - 1) * wordSpacing * px(6);
    if (w <= avail || w === 0) return 1;
    return Math.max(MIN_FIT_SCALE, avail / w);
  };

  const wordStyle = (tk: KWord): React.CSSProperties => {
    const r = resolved[tk.variant];
    const anim = wordEnter(tk.fromMs);
    return {
      display: "inline-block",
      whiteSpace: "pre",
      fontFamily: r.font.fontFamily,
      fontSize: px(r.style.sizePct),
      fontWeight: effectiveWeight(r.font, r.style.weight),
      fontStyle: r.style.italic ? "italic" : "normal",
      letterSpacing: `${r.style.letterSpacing}em`,
      textTransform: r.style.uppercase ? "uppercase" : "none",
      color: tk.emphasis ? accentColor : baseColor,
      lineHeight: lineSpacing,
      opacity: anim.opacity,
      transform: `translate(${anim.tx}px, ${anim.ty}px)`,
      textShadow: shadowText || undefined,
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
          width: `${blockWidthPct}%`,
          transformOrigin: "top center",
          // Top-anchored: the block hangs from positionY and grows downward as
          // words accumulate (translateX(-50%) centres it on positionX).
          transform: `translateX(-50%) scale(${captionScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        {lines.map((line, li) => (
          <div
            key={li}
            dir="auto"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              justifyContent: ALIGN_TO_JUSTIFY[alignment],
              alignItems: "baseline",
              columnGap: `${px(6) * wordSpacing}px`,
              transform: `scale(${lineScale(line)})`,
              transformOrigin:
                alignment === "left"
                  ? "left center"
                  : alignment === "right"
                    ? "right center"
                    : "center",
            }}
          >
            {line.map((tk, wi) => (
              <span key={wi} style={wordStyle(tk)}>
                {tk.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Kinetic style: one <Sequence> per caption block. Each block is shown from its
 * first word until the next block starts, and inside it words reveal one by one.
 */
export const PageKinetic: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(KineticStyleContext);

  // Resolve each role's font slot ONCE (uploaded fonts fetched a single time).
  const baseFont = useFontSlot(style.roles.base.font);
  const punchFont = useFontSlot(style.roles.punch.font);
  const elegantFont = useFontSlot(style.roles.elegant.font);
  const resolved = useMemo<Record<WordVariant, ResolvedRole>>(
    () => ({
      base: { font: baseFont, style: style.roles.base },
      punch: { font: punchFont, style: style.roles.punch },
      elegant: { font: elegantFont, style: style.roles.elegant },
    }),
    [baseFont, punchFont, elegantFont, style.roles],
  );

  const hasDoc = Boolean(segments && segments.length);
  const blocks = useMemo<KBlock[]>(() => {
    if (hasDoc) return segmentsToBlocks(segments!);
    return groupWordsIntoBlocks(
      captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs })),
      FALLBACK_WORDS_PER_LINE,
      FALLBACK_LINES,
    ).map((b) => ({
      startMs: b.startMs,
      lines: b.lines.map((ln) =>
        ln.map((w) => ({
          text: w.text,
          fromMs: w.fromMs,
          toMs: w.toMs,
          emphasis: !!w.emphasis,
          variant: "base" as WordVariant,
        })),
      ),
    }));
  }, [hasDoc, segments, captions]);


  // Every caption starts LEAD ms early — the ASR pads each word to swallow
  // the pause after it, so a raw startMs lands after the word is spoken.
  // Deriving the end from the same array makes gaps/overlaps impossible.
  const captionStarts = captionStartFrames(
    blocks.map((b) => b.startMs),
    fps,
    CAPTION_LEAD_MS,
  );

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = captionStarts[i];
        const endFrame = captionEndFrame(captionStarts, i, durationInFrames);
        const segDuration = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={segDuration} name={`Caption ${i + 1}`}>
            <KineticSegment
              lines={block.lines}
              blockStartMs={block.startMs}
              resolved={resolved}
              frameWidth={width}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
