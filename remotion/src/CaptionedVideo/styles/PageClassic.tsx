import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { fontSlotSchema, useFontSlot, effectiveWeight, type FontSlot, type ResolvedFont } from "./font-slot";
import {
  easingSlotSchema,
  makeEasing,
  makeOpacityEasing,
  type EasingSlot,
} from "./easing-slot";
// Same caption-document -> blocks conversion every document-driven template
// uses; only the painting differs here.
import {
  groupWordsIntoBlocks,
  enrichedToBlocks,
  buildDeepGlowCss,
  deepGlowSchema,
  type DeepGlowConfig,
  type KineticWord,
} from "./PageShiny";
import {
  captionStartFrames,
  captionEndFrame,
  CAPTION_LEAD_MS,
} from "./caption-timing";

// ---------------------------------------------------------------------------
// CLASSIC — the "one word at a time" viral caption look.
//
// Reverse-engineered from remotion/public/Classic.mp4 (720x900, 30fps) by
// measuring raw pixels, not by eye:
//
//   * ONE OR TWO WORDS per screen, never three. Ten sampled captions ran
//     SWEETHEART / MEANS / WHO POSTS / NOTHING / GENUINELY / TO GROW /
//     MY FRIENDS / OF SOCIAL / MEDIA / RESPECTS YOU. This is the STYLE, not a
//     fitting limit — the text is small enough that far more would fit. It is
//     expressed as a deliberately small screen capacity in layout.mjs, so
//     Claude's meaning-based caption breaks are untouched and each idea simply
//     plays across several one-or-two-word screens.
//   * A SINGLE centred line, all-caps, in a heavy geometric sans (THE BOLD FONT,
//     shipped in public/fonts). Cap height measured at 29px on a 720-wide frame
//     = 4.03% of frame width — the SMALLEST of our templates (Gadzhi 6.63%,
//     Hormozi 2 13.5%). Block centre x 50%, y 54.2% of frame height.
//   * WHITE base (#ffffff, sampled pure). Selected words instead render in one
//     of three accents, measured off the footage: cyan #00ffff, yellow #ffff00,
//     orange #fbac0b.
//   * The accent covers a WHOLE WORD and is FIXED for that screen's life — it is
//     emphasis, NOT karaoke. GENUINELY stayed entirely orange across all 13
//     frames it was on screen, so nothing tracks the voice within a word.
//     Which words light up comes from Claude's per-word `emphasis` flag; the
//     colour cycles so consecutive accents always differ (see accentForIndex).
//   * POP + FADE on enter: scale ~0.8 -> 1.0 with an opacity ramp over 8 frames
//     (~265ms at 30fps), ease-out, NO overshoot. Measured by tracking the orange
//     caption's bounding box frame by frame: 212 -> 236 -> 240 -> 246 -> 250 ->
//     255 -> 256 -> 261px wide, settling there.
//   * A soft dark drop shadow sits under the glyphs, offset slightly down/right.
//     There is no glow — what reads as one around accent words is the shadow
//     plus video compression.
// ---------------------------------------------------------------------------

const accentSchema = z.object({ fill: zColor() });

export const classicSchema = captionedVideoSchema.extend({
  layout: z.object({
    // Em size as a % of FRAME WIDTH, so the look holds at any export size.
    fontSizePct: z.number().min(1).max(15).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    wordSpacing: z.number().min(0).max(1).step(0.01),
    letterSpacing: z.number().min(0).max(0.5).step(0.005),
    positionX: z.number().min(0).max(100).step(0.1),
    positionY: z.number().min(0).max(100).step(0.1),
  }),
  text: z.object({
    font: fontSlotSchema,
    uppercase: z.boolean(),
    baseColor: zColor(),
    // Three accents, cycled per emphasised word. Set all three the same for a
    // single-colour look.
    accents: z.object({ one: accentSchema, two: accentSchema, three: accentSchema }),
  }),
  motion: z.object({
    // The pop: how far below full size a screen starts, and how long it takes.
    popFrom: z.number().min(0.3).max(1).step(0.01),
    popFrames: z.number().min(1).max(30).step(1),
    fadeFrames: z.number().min(0).max(20).step(1),
    // Curve + how pronounced it is. See easing-slot.ts for what each does.
    easing: easingSlotSchema,
  }),
  effects: z.object({
    shadow: z.object({
      enabled: z.boolean(),
      color: z.string(),
      blurEm: z.number().min(0).max(0.5).step(0.005),
      offsetYEm: z.number().min(0).max(0.3).step(0.005),
    }),
    // The SAME After Effects "Deep Glow" the other templates use
    // (buildDeepGlowCss in PageShiny) — a multi-radius bloom with
    // inverse-square falloff, not a flat halo.
    glow: deepGlowSchema,
    // Tint the bloom with each WORD's own colour, so an accent word haloes in
    // its accent and a white word haloes white (this is what the reference
    // does: yellow BABE carries a yellow bloom). When false, the glow's own
    // inner/outer colours are used instead.
    glowTintsWithWord: z.boolean(),
  }),
  // At most ONE accent per ORIGINAL caption. Claude marks the keywords for the
  // whole video at a density suited to a two-line template; splitting a caption
  // into several one-word screens would otherwise spread those across most
  // screens (measured: 64% of screens vs the reference's 24% of captions).
  accentPerCaption: z.boolean(),
});

export type ClassicStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    wordSpacing: number;
    letterSpacing: number;
    positionX: number;
    positionY: number;
  };
  text: {
    font: FontSlot;
    uppercase: boolean;
    baseColor: string;
    accents: { one: { fill: string }; two: { fill: string }; three: { fill: string } };
  };
  motion: {
    popFrom: number;
    popFrames: number;
    fadeFrames: number;
    easing: EasingSlot;
  };
  effects: {
    shadow: { enabled: boolean; color: string; blurEm: number; offsetYEm: number };
    glow: DeepGlowConfig;
    glowTintsWithWord: boolean;
  };
  accentPerCaption: boolean;
};

// Defaults ARE the measurements taken off the reference clip.
export const CLASSIC_DEFAULTS: ClassicStyle = {
  layout: {
    // The reference's CAP HEIGHT is 29px on a 720-wide frame = 4.03% of width.
    // CSS fontSize is the EM size, and this face measures cap height = 0.74 em
    // (measured in the browser off the loaded font), so the em must be
    // 4.03 / 0.74 = 5.45% to land the cap height where the reference has it.
    fontSizePct: 5.45,
    captionScale: 1,
    // The VISIBLE gap between words. Each word's trailing letter-space is
    // cancelled below, so this is the whole gap. Measured off three two-word
    // reference captions (MY FRIENDS / TO GROW / WHO POSTS) at 20 / 19 / 18px
    // against a 29px cap height => 0.69 / 0.66 / 0.62 cap heights => ~0.485em.
    wordSpacing: 0.485,
    // The reference is TRACKED OUT. Its words are consistently wider than this
    // face sets them, and the excess scales with the number of letter GAPS, not
    // with word width — the signature of letter-spacing rather than a different
    // font. Measured across SWEETHEART / GENUINELY / NOTHING / MEANS at
    // 0.33 / 0.27 / 0.31 / 0.28 cap heights per gap => ~0.30 cap heights
    // = 0.30 * 0.74 = 0.22em.
    letterSpacing: 0.22,
    positionX: 50,
    // The reference sits at 54.2% ONLY because its speaker is framed high; on a
    // normal close-up that lands squarely on the face. 78% is the house safe
    // zone (Hormozi / Typewriter / Highlight / Ali all use it) — under the chin,
    // clear of the mouth, above the platform UI. Fidelity to a reference's
    // framing is not worth captions across every user's face.
    positionY: 78,
  },
  text: {
    font: { family: "Montserrat", custom: "THEBOLDFONT-FREEVERSION.otf" },
    uppercase: true,
    baseColor: "#ffffff",
    accents: {
      one: { fill: "#00ffff" },
      two: { fill: "#ffff00" },
      three: { fill: "#fbac0b" },
    },
  },
  // The reference itself has NO entrance — a caption hard-cuts in at full size
  // and full opacity (frame 145 is NOTHING, frame 146 is A WOMAN already
  // settled; the smear at the cut is H.264, not animation). This pop + fade is
  // a DELIBERATE departure, chosen for polish. Captions hold only ~8 frames, so
  // it has to be over almost immediately: 0.90 -> 1.0 in 3 frames, eased out.
  motion: {
    // These are the Studio-tuned values, folded back here from Root.tsx per the
    // flow this file asks for. They had drifted: Root.tsx carried a LITERAL copy
    // of the whole prop object rather than spreading this constant, so tuning in
    // Studio updated one and left the other behind. Root.tsx now spreads.
    //
    // A deeper pop than the 0.58 this was written with, and NO fade. The fade
    // was 20 frames, which a Classic screen never survives: a screen lives ~8
    // frames, so the text topped out near 60% opacity and every caption read as
    // semi-transparent. 0 removes it outright; 3-5 is the range that would
    // actually complete inside a screen's life if a fade is wanted back.
    popFrom: 0.3,
    popFrames: 4,
    fadeFrames: 0,
    // Tuned off "smooth" (the curve this shipped with) to a stronger
    // ease-in-out. Try "bouncy" for an overshoot, "ease-out" for a plainer
    // decelerate, "linear" to hear what no easing does.
    easing: { type: "ease-in-out", strength: 6 },
  },
  accentPerCaption: true,
  effects: {
    // Measured by profiling luminance straight up and down from the glyphs
    // across a 14s run: BELOW the baseline it drops ~13 units at 1-3px and does
    // not recover until ~18px; ABOVE it is flat. So the shadow is downward only
    // and soft — 18px against the reference's 39px em is ~0.46em of total
    // reach, split into offset + blur. There is NO glow: saturation beside the
    // glyphs is flat (20) from 1px to 26px, and a coloured glow would leave the
    // text's own hue decaying outward.
    shadow: { enabled: true, color: "rgba(0,0,0,0.45)", blurEm: 0.27, offsetYEm: 0.09 },
    // The bloom around each word, clearly visible on the reference's accent
    // words. Radius is tuned to the 1080-wide composition's ~59px em.
    glow: {
      enabled: true,
      radius: 42,
      // 33, not the 60 this started at — tuned down by hand in Studio, which is
      // the value that actually looks right against the reference.
      brightness: 33,
      innerColor: "#ffffff",
      outerColor: "#ffffff",
      chromatic: 0,
    },
    glowTintsWithWord: true,
  },
};

const ClassicStyleContext = createContext<ClassicStyle>(CLASSIC_DEFAULTS);
export const ClassicStyleProvider = ClassicStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR). The real
// pipeline always has one; this keeps something legible on screen otherwise.
const FALLBACK_WORDS_PER_LINE = 2;
const FALLBACK_LINES = 1;
// A screen this style cannot fit is shrunk rather than clipped. Generous,
// because the layout capacity already keeps screens to one or two words.
const FIT_WIDTH_FRACTION = 0.92;
const MIN_FIT_SCALE = 0.5;

// How visible a screen is on its very first frame. Never 0 — see the note at
// the opacity ramp.
const OPACITY_FLOOR = 0.35;

const hashText = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * One screen of the caption document: a single centred line that pops and fades
 * in, with emphasised words carrying an accent colour.
 */
const ClassicSegment: React.FC<{
  words: KineticWord[];
  accentAt: number | null;
  accentColor: string;
  fontSize: number;
  font: ResolvedFont;
  style: ClassicStyle;
}> = ({ words, accentAt, accentColor, fontSize, font, style }) => {
  const frame = useCurrentFrame();
  const { layout, text, motion, effects } = style;
  const { width } = useVideoConfig();

  // POP + FADE share one curve so they settle together. A caption only lives
  // ~8 frames, so the whole entrance is over in 3-4.
  const pop = interpolate(frame, [0, motion.popFrames], [motion.popFrom, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: makeEasing(motion.easing),
  });
  // Starts at OPACITY_FLOOR, not 0. A screen lives ~8 frames, so a ramp from
  // zero renders the first frame fully invisible and the word reads as arriving
  // late — the very lag this template was reported for. The floor keeps it
  // legible the instant it appears while the fade still does its job.
  // makeOpacityEasing, not makeEasing: "bouncy" overshoots past 1, which is not
  // a valid alpha. The SCALE still gets to overshoot; the fade does not.
  const opacity = interpolate(frame, [0, Math.max(1, motion.fadeFrames)], [OPACITY_FLOOR, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: makeOpacityEasing(motion.easing),
  });

  // Shrink only a screen that would run past the frame. Measured in the DOM,
  // which is reliable even for an uploaded face that measureText mis-sizes.
  const inner = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState(1);
  const avail = width * FIT_WIDTH_FRACTION;
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const w = el.offsetWidth;
    setFit(w > avail ? Math.max(MIN_FIT_SCALE, avail / w) : 1);
  }, [words, avail, fontSize, font.fontFamily]);

  const drop = effects.shadow.enabled
    ? `0 ${effects.shadow.offsetYEm * fontSize}px ${effects.shadow.blurEm * fontSize}px ${effects.shadow.color}`
    : undefined;
  // Deep Glow, per word, so the bloom takes that word's own colour.
  const glowFor = (color: string) =>
    buildDeepGlowCss(
      effects.glowTintsWithWord
        ? { ...effects.glow, innerColor: color, outerColor: color }
        : effects.glow,
    ) || undefined;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${layout.positionX}%`,
          top: `${layout.positionY}%`,
          width: "100%",
          transform: `translate(-50%, -50%) scale(${layout.captionScale * pop * fit})`,
          transformOrigin: "center center",
          opacity,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span
          ref={inner}
          dir="auto"
          style={{
            display: "flex",
            columnGap: `${fontSize * layout.wordSpacing}px`,
            whiteSpace: "pre",
            fontFamily: font.fontFamily,
            // THE BOLD FONT is a single static heavy weight, so this resolves to
            // "normal" and the browser never synthesises a faux bold over it.
            fontWeight: effectiveWeight(font, 700),
            fontSize,
            lineHeight: 1.1,
            // Tracking. The trailing gap CSS adds after the last glyph of each
            // word is cancelled below so it does not skew the centring.
            letterSpacing: `${layout.letterSpacing}em`,
            textTransform: text.uppercase ? "uppercase" : "none",
          }}
        >
          {words.map((w, i) => {
            const color = i === accentAt ? accentColor : text.baseColor;
            return (
              <span
                key={i}
                style={{
                  color,
                  textShadow: drop,
                  filter: glowFor(color),
                  marginRight: `-${layout.letterSpacing}em`,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Classic style: one <Sequence> per screen from the caption document, each a
 * single centred line of one or two words that pops and fades in.
 */
export const PageClassic: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(ClassicStyleContext);

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

  // WHICH word on each screen gets the accent, and in which colour.
  //
  // Claude marks keywords for the whole video at a density that suits a
  // two-line template. Classic shows one or two words a screen, so those same
  // marks would land on most screens (measured: 64% of screens, against 24% of
  // captions in the reference). With `accentPerCaption` on, only ONE of
  // Claude's emphasised words lights up per ORIGINAL caption — the longest,
  // which is reliably the content word rather than a preposition.
  //
  // The colour advances once per lit word so consecutive accents always differ,
  // and only the starting colour is seeded from the document text, so different
  // videos don't all open on cyan while any one render stays stable.
  const accents = useMemo(() => {
    const perCaption = style.accentPerCaption;
    const best = new Map<number, { block: number; word: number; len: number }>();
    blocks.forEach((b, bi) => {
      const idea = segments?.[bi]?.ideaIndex ?? bi;
      b.lines.flat().forEach((w, wi) => {
        if (!w.emphasis) return;
        const cur = best.get(idea);
        const len = w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
        if (!perCaption) {
          best.set(idea * 1000 + bi * 10 + wi, { block: bi, word: wi, len });
        } else if (!cur || len > cur.len) {
          best.set(idea, { block: bi, word: wi, len });
        }
      });
    });

    const seed = blocks.flatMap((b) => b.lines.flat()).map((w) => w.text).join(" ").slice(0, 80);
    let k = hashText(seed) % 3;
    const palette = [
      style.text.accents.one.fill,
      style.text.accents.two.fill,
      style.text.accents.three.fill,
    ];
    const out: { at: number | null; color: string }[] = blocks.map(() => ({ at: null, color: "" }));
    [...best.values()]
      .sort((a, b) => a.block - b.block || a.word - b.word)
      .forEach(({ block, word }) => {
        out[block] = { at: word, color: palette[k % palette.length] };
        k++;
      });
    return out;
  }, [blocks, segments, style.accentPerCaption, style.text.accents]);

  const font = useFontSlot(style.text.font);
  const fontSize = (width * style.layout.fontSizePct) / 100;

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
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={Math.max(1, endFrame - startFrame)}
            name={`Caption ${i + 1}`}
          >
            <ClassicSegment
              words={block.lines.flat()}
              accentAt={accents[i]?.at ?? null}
              accentColor={accents[i]?.color ?? style.text.baseColor}
              fontSize={fontSize}
              font={font}
              style={style}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
