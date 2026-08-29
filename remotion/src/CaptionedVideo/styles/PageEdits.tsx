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
import { censorWord } from "./censor";

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
// MATCHES THE REFERENCE EXACTLY (confirmed by overlaying our render on the
// reference footage and measuring both: identical glyph band [348..731]px, same top
// of caps at y=695, width 35.56%, centre 49.95%, baseline 66.11% at 1.5s). The
// values below are the reference as measured, with NO stylistic departures:
//
//   * MOTION is the reference's single-frame HARD CUT at 60fps, verified three
//     ways: a word appearing (121 -> 255 in one frame), a caption appearing
//     (108 -> 255), and a caption clearing (255 -> 148), with no intermediate
//     value anywhere. So wordFadeMs 0 and popFrom 1 — a word snaps on.
//   * SIZE is the reference's true em, 2.52% of frame width (cap height 1.85%).
//   * POSITION is the reference's own 65% of frame height, dead centre in X.
//   * SHADOW is the measured soft downward-only drop (no halo). GLOW is OFF —
//     the reference has none.
//
// The word BUILD is timed off the real transcription: each word appears at its
// own spoken onset (screen-relative), which is why the line grows one word at a
// time exactly as the reference does.
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
    // --- OPTIONAL FEATURES, all no-ops at their defaults ---------------------
    // SEMANTIC WORD COLOUR. Claude already tags EVERY word with what it MEANS
    // (`color` on the word: key / positive / negative / shock / base) in the
    // same enrich pass that Speed uses — video 1's transcript alone carries 22
    // negative, 17 key, 3 positive and 3 shock. This switch makes the template
    // paint those tags rather than flatten every marked word to one colour.
    // OFF by default so Edits is untouched.
    semanticColor: z.boolean(),
    // The palette those tags map to. Same values Speed uses, so a word means
    // the same thing whichever template renders it.
    wordColors: z.object({
      key: zColor(), // YELLOW — the thing being named: a noun, number, name, place
      positive: zColor(), // GREEN — good news, success, praise, a win
      negative: zColor(), // RED — refusal, failure, threat, insult, loss, danger
      shock: zColor(), // RED + outline — disbelief, a twist ("NO WAY")
      shockOutline: z.number().min(0).max(20).step(1),
    }),
    // Reference 4 masks strong language ("F*CK"). Render-time only — the caption
    // document always keeps the real word. OFF by default.
    censorProfanity: z.boolean(),
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
    // CHROMATIC ABERRATION — the RGB split in reference 4, where a cyan ghost
    // sits one side of the letters and a warm one the other. Two offset copies
    // of the word are drawn behind it and screened together. OFF by default.
    chromatic: z.object({
      enabled: z.boolean(),
      offsetPct: z.number().min(0).max(1).step(0.01), // % of frame width
      colorA: zColor(),
      colorB: zColor(),
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
  text: {
    font: FontSlot;
    weight: number;
    uppercase: boolean;
    color: string;
    semanticColor: boolean;
    wordColors: {
      key: string;
      positive: string;
      negative: string;
      shock: string;
      shockOutline: number;
    };
    censorProfanity: boolean;
  };
  motion: { wordFadeMs: number; popFrom: number; easing: EasingSlot };
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
    glow: { enabled: boolean; blur: number; opacity: number };
    chromatic: { enabled: boolean; offsetPct: number; colorA: string; colorB: string };
  };
};

export const EDITS_DEFAULTS: EditsStyle = {
  layout: {
    // The reference's true em, 2.52% of frame width (cap height 1.85%). Matched
    // exactly — not scaled up.
    fontSizePct: 2.52,
    captionScale: 1,
    // 0.68 measured advance minus The Bold Font's own ~0.52.
    letterSpacing: 0.16,
    wordSpacing: 0.26,
    lineSpacing: 1.1,
    positionX: 50, // the reference is dead centre (539-540 of 1080)
    positionY: 65, // the reference's own position (65% of frame height)
  },
  text: {
    // A single static weight, so the slot renders it at its natural weight and
    // effectiveWeight() drops the number below rather than let the browser
    // smear a faux bold out of it.
    font: { family: "Montserrat", custom: "THEBOLDFONT-FREEVERSION.otf" },
    weight: 700,
    uppercase: true, // the reference is ALL CAPS throughout
    color: "#ffffff", // measured pure white
    // OFF, so nothing about today's Edits render moves. Writer turns it on.
    semanticColor: false,
    wordColors: {
      key: "#ffe000",
      positive: "#22e34a",
      negative: "#ff1a1a",
      shock: "#ff1a1a",
      shockOutline: 6,
    },
    censorProfanity: false,
  },
  motion: {
    // The reference's HARD CUT: a word snaps 0->full in one 60fps frame, no
    // fade and no grow. Verified off the footage (121 -> 255 in a single frame).
    wordFadeMs: 0,
    popFrom: 1,
    // Unused while wordFadeMs is 0 (the window collapses to a single frame), but
    // kept so a user who dials in a fade gets a sane curve.
    easing: { type: "ease-out", strength: 2 },
  },
  effects: {
    // The measured soft, downward-only drop shadow (no halo).
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 4, offsetY: 2 },
    // OFF — the reference has a shadow and no glow.
    glow: { enabled: false, blur: 0, opacity: 0 },
    // OFF — only reference 4 has the RGB split.
    chromatic: { enabled: false, offsetPct: 0.12, colorA: "#39c7e8", colorB: "#e8563a" },
  },
};

// WRITER — the same word-at-a-time build, sized and placed from a DIFFERENT
// reference: public/References/Type Writer/1.mp4 (1920x1080).
//
// Measured off that clip, not guessed: cap height 80px on a 1920-wide frame
// (4.17% of the width) over The Bold Font's 0.735 cap/em = an em of 5.67% of the
// width, with the line centred at 50.0% of the frame height. Confirmed on two
// independent captions ("MY FIST AND A" at 14s, "BLOOD ON IT" at 29s) which
// agreed on both numbers exactly.
//
// That is more than DOUBLE the Edits reference's 2.52% em, and 15 points higher
// up the frame — the two references genuinely differ, which is why this is its
// own defaults object rather than a copy.
//
// Everything else is inherited: the same hard-cut word build, the same soft
// downward shadow, and every optional feature (coloured keyword, glow,
// chromatic split, censoring) left OFF — reference 1 is plain white throughout.
// That was checked, not assumed: 79 timestamps were sampled across all 60
// seconds and every caption found is pure white. The colour hits the pixel scan
// reported all turned out to be the orange prison jumpsuit in the same band.
export const EDITS_MATCH_DEFAULTS: EditsStyle = {
  ...EDITS_DEFAULTS,
  text: {
    ...EDITS_DEFAULTS.text,
    // ON for Writer: paint what Claude decided each word MEANS.
    //   RED   for bad — refusal, threat, failure, danger
    //   YELLOW for the normal highlight — the thing being named
    //   GREEN for good — success, praise, a win
    // Reference 1's own transcript already carries all four tags, so this is
    // reading a decision that was made, not inventing one. Edits keeps it off.
    semanticColor: true,
  },
  layout: {
    ...EDITS_DEFAULTS.layout,
    fontSizePct: 5.67, // 80px cap / 0.735 cap-per-em / 1920 frame width
    positionY: 50, // measured 50.0% of frame height (Edits own reference sits at 65%)
    // NO extra tracking. The 0.16em Edits inherits was measured off ITS OWN
    // reference (edits.mp4); reference 1 is visibly tighter, and carrying 0.16
    // over made our line far wider than the reference we are matching.
    letterSpacing: 0,
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
  const { weight, uppercase, color, semanticColor, wordColors, censorProfanity } =
    style.text;
  const { wordFadeMs, popFrom, easing } = style.motion;
  const { shadow, glow, chromatic } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  // The RGB-split ghosts sit this far either side of the word.
  const chromaOffset = (width * chromatic.offsetPct) / 100;
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
              // Claude's own semantic tag decides the colour. `shock` is the
              // only one that carries an outline — that is what makes it read as
              // the surprise beat rather than just another red word.
              const tag = semanticColor ? token.color : undefined;
              const tagColor =
                tag === "key"
                  ? wordColors.key
                  : tag === "positive"
                    ? wordColors.positive
                    : tag === "negative"
                      ? wordColors.negative
                      : tag === "shock"
                        ? wordColors.shock
                        : undefined;
              const tagStroke =
                tag === "shock" && wordColors.shockOutline > 0
                  ? `${wordColors.shockOutline}px ${color}`
                  : undefined;
              const shown = censorWord(token.text, censorProfanity);
              const label = uppercase ? shown.toUpperCase() : shown;
              return (
                <span
                  key={wi}
                  style={{
                    // position:relative ONLY so the chromatic ghosts can be
                    // absolutely placed against this word; layout is unchanged.
                    position: chromatic.enabled ? "relative" : undefined,
                    display: "inline-block",
                    whiteSpace: "pre",
                    opacity: p,
                    color: tagColor,
                    WebkitTextStroke: tagStroke,
                    paintOrder: tagStroke ? "stroke fill" : undefined,
                    transform: popFrom < 1 ? `scale(${scale.toFixed(4)})` : undefined,
                    transformOrigin: "center center",
                  }}
                >
                  {chromatic.enabled ? (
                    <>
                      {/* Two offset copies screened behind the word: cyan one
                          side, warm the other. aria-hidden — they are the same
                          word repeated and must not reach a screen reader. */}
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: -chromaOffset,
                          top: 0,
                          color: chromatic.colorA,
                          mixBlendMode: "screen",
                          pointerEvents: "none",
                        }}
                      >
                        {label}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: chromaOffset,
                          top: 0,
                          color: chromatic.colorB,
                          mixBlendMode: "screen",
                          pointerEvents: "none",
                        }}
                      >
                        {label}
                      </span>
                    </>
                  ) : null}
                  {/* The real word sits above the ghosts. */}
                  <span style={{ position: "relative" }}>{label}</span>
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
        // Every screen starts at the spoken onset of its first word — INCLUDING
        // the first one. Anchoring screen 0 to frame 0 instead shifted its whole
        // word build ~0.8s early (all words showing at once by 1.0s where the
        // reference still reads "I DON'T"); the caption must arrive when the
        // words are actually said, exactly as the reference does.
        const startFrame = msToFrame(block.startMs);
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
