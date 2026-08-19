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
// Shared profanity mask (masks the first vowel: fuck -> f*ck), the same
// render-time convention Classic 2 uses, so the whole product censors
// identically. The caption document always keeps the real word; this only
// changes what is drawn, so it is reversible via the censorProfanity toggle.
import { censorWord } from "./censor";

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
  // Per-word entrance, revealed on each word's spoken frame so the block builds
  // up. SLIDE and FADE are INDEPENDENT so either can be dialled in or off:
  //   • FADE = opacity ramp. fadeFrames 0 = the word snaps to full opacity.
  //   • SLIDE = positional travel. slideDistancePct 0 = no travel; otherwise the
  //     word moves in from `direction` over slideFrames.
  // The reference SNAPS (both off): a word is fully opaque and in place on its
  // first frame. These four are the sliders for tuning that.
  motion: z.object({
    direction: directionEnum, // where a sliding word travels FROM
    slideDistancePct: z.number().min(0).max(30).step(0.5), // slide travel, % of width (0 = no slide)
    slideFrames: z.number().min(0).max(30).step(1), // how long the slide takes
    fadeFrames: z.number().min(0).max(30).step(1), // opacity-ramp length (0 = snap on)
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
  // Mask strong language at render time (fuck -> f*ck), as the reference does.
  // The document keeps the real word, so this is reversible.
  censorProfanity: z.boolean(),
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
    slideDistancePct: number;
    slideFrames: number;
    fadeFrames: number;
    easing: EntranceEasing;
    easingSpeed: number;
  };
  effects: { shadow: { enabled: boolean; color: string; blur: number } };
  censorProfanity: boolean;
};

// Defaults ARE the sample-1 measurements (720-wide source), expressed as
// fractions of frame width so they hold at any export size.
export const KINETIC_DEFAULTS: KineticStyle = {
  layout: {
    positionX: 50,
    // Re-measured off sample 1 frame-by-frame: the block is TOP-ANCHORED and the
    // first line's cap-top sits at ~39% of frame height regardless of how many
    // lines have accumulated (s_1.0 top≈500px, s_2.2 top≈496px on a 1280 frame,
    // i.e. ~38.8%). positionY 38 lands our first-line cap-top there (measured
    // 38.9% on our own render, vs the reference's 38.7%).
    positionY: 38,
    blockWidthPct: 84,
    captionScale: 1,
    wordSpacing: 0.24,
    lineSpacing: 1.1,
    alignment: "center",
  },
  colors: {
    baseColor: "#ffffff",
    accentColor: "#b2201a", // signature red, re-measured off sample 1 core pixels (178,32,26)
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
    // Emphasised keyword — SAME sans, heavy and bigger; red via emphasis. This is
    // the word the eye lands on. Re-measured off sample 1: punch cap ≈ 45px vs
    // base ≈ 32px on a 720-wide frame — a 1.4x step, NOT 2x. em ≈ 8.5% of width.
    punch: {
      font: fontSlot("Montserrat"),
      sizePct: 8.5,
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
    // Re-measured off sample 1: words SNAP in — a base word goes from absent to
    // fully opaque and in final position within a single 24fps frame (b_40 empty
    // -> e_55 full), with no slide and no resolvable fade. The visible "kinetic"
    // motion is the block RE-CENTERING as each word piles in, not a per-word
    // entrance. So both are OFF by default: fadeFrames 0 (snap on) and
    // slideDistancePct 0 (no travel). slideFrames only matters once a slide
    // distance is dialled in.
    direction: "up",
    slideDistancePct: 0,
    slideFrames: 3,
    fadeFrames: 0,
    easing: "smooth",
    easingSpeed: 3,
  },
  effects: {
    // A soft shadow keeps text legible over bright footage; subtle by default.
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 16 },
  },
  // The reference masks profanity (f*ck), so on by default.
  censorProfanity: true,
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
  const { censorProfanity } = style;
  // What is actually DRAWN for a word — profanity-masked if the toggle is on.
  // Used for both painting and width measurement so the layout matches the pixels.
  const shown = (tk: KWord) => censorWord(tk.text, censorProfanity);
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

  // Entrance timed to this word's own spoken start (relative to the block). FADE
  // and SLIDE run on their OWN durations so they are independent: a 0-frame ramp
  // means that channel snaps (fully on / fully in place from the first frame).
  const wordEnter = (startMs: number) => {
    const startFrame = Math.max(0, msToFrame(startMs - blockStartMs));
    const ramp = (durFrames: number) =>
      durFrames <= 0
        ? frame >= startFrame
          ? 1
          : 0
        : interpolate(frame, [startFrame, startFrame + durFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easingFn,
          });
    const pFade = ramp(motion.fadeFrames);
    const pSlide = ramp(motion.slideFrames);
    const off = px(motion.slideDistancePct) * (1 - pSlide);
    const v = ENTRANCE_VECTOR[motion.direction];
    return {
      opacity: pFade,
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
          text: shown(tk),
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
                {shown(tk)}
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
