import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import type { CaptionStyleProps } from "./types";
import { captionedVideoSchema } from "../index";
import { fontSlotSchema, useFontSlot, effectiveWeight, type FontSlot, type ResolvedFont } from "./font-slot";
// Same caption-document -> blocks conversion every document-driven template
// uses; only the painting differs here.
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";
import {
  captionStartFrames,
  captionEndFrame,
  CAPTION_LEAD_MS,
} from "./caption-timing";

// ---------------------------------------------------------------------------
// ALI — the "sticker" caption look: ONE line of text on a rounded pill that
// hugs it, karaoke by COLOUR alone.
//
// Reverse-engineered pixel by pixel from three reference reels
// (remotion/public/Ali/, the 1080x1920 one measured frame-accurately):
//
//   * ONE LINE, ALWAYS. Never two. A caption too wide for the line is shown
//     across consecutive screens instead (see the `ali` entry in layout.mjs).
//   * KARAOKE, WORD-LEVEL, COLOUR ONLY: words already spoken are BLACK, words
//     still to come are a pale warm grey. Nothing moves, nothing scales,
//     nothing pops — the colour is the entire signal.
//   * THE FADE IS A FADE, NOT A WIPE. Each word crosses from grey to black
//     over ~280ms. Measured every frame through one word: 211 -> 204 -> 178 ->
//     146 -> 110 -> 79 -> 47 -> 8 -> 0. A per-column scan at mid-transition
//     showed the WHOLE glyph run at the same intermediate value, so it is a
//     uniform colour interpolation and not a left-to-right fill.
//   * THE PILL HUGS THE TEXT. Its width changes with each caption; its height
//     never does. Hard cut between captions — no fade, no pop, no slide.
//
// Grouping (which words share a caption) is NOT decided here — it comes from
// the caption document (`variants.ali`: Claude's meaning-based caption breaks,
// laid out for this template's one-line shape by layout.mjs). Per-word
// `emphasis` is deliberately ignored: in the references every word gets the
// same treatment and the speech alone drives the colour.
// ---------------------------------------------------------------------------

export const aliSchema = captionedVideoSchema.extend({
  // === LAYOUT — size and placement of the whole sticker ======================
  layout: z.object({
    // Size as a PERCENTAGE OF FRAME WIDTH, never absolute px, so the look holds
    // on a 1080 export and on a smaller source clip alike.
    fontSizePct: z.number().min(2).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    // Gap between words, in em. The default reproduces the face's OWN space
    // advance (words are separate spans, so the real space is gone).
    wordSpacing: z.number().min(0).max(1).step(0.01),
    lineHeight: z.number().min(0.8).max(2).step(0.01),
    positionX: z.number().min(0).max(100).step(1), // sticker centre X
    positionY: z.number().min(0).max(100).step(1), // sticker centre Y
  }),

  // === TEXT — the face and the two karaoke colours ==========================
  text: z.object({
    font: fontSlotSchema, // Poppins 700 by default
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(), // the references are sentence case
    spokenColor: zColor(), // a word once it has been said
    upcomingColor: zColor(), // a word still to come
  }),

  // === PILL — the rounded sticker behind the line ===========================
  // Padding and radius are in EM so the sticker keeps its proportions at any
  // font size. The defaults reproduce the reference: at 58.3px type they give a
  // 104px-tall pill with 36px of side padding and a 22px corner radius.
  pill: z.object({
    enabled: z.boolean(),
    color: zColor(),
    paddingXEm: z.number().min(0).max(2).step(0.01),
    paddingYEm: z.number().min(0).max(2).step(0.01),
    radiusEm: z.number().min(0).max(2).step(0.01),
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(60).step(1),
      offsetY: z.number().min(0).max(40).step(1),
    }),
  }),

  // === MOTION — the only thing that animates is a word's colour ============
  motion: z.object({
    fillMs: z.number().min(0).max(1200).step(10), // grey -> black crossing time
    // Start the crossing this many ms BEFORE the word's timestamp. ASR tends to
    // stamp a word slightly late, and the reference has each word finishing its
    // fade about when the word finishes being said.
    leadMs: z.number().min(0).max(400).step(10),
    fadeInMs: z.number().min(0).max(600).step(10), // sticker entrance (0 = cut)
  }),
});

export type AliStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    wordSpacing: number;
    lineHeight: number;
    positionX: number;
    positionY: number;
  };
  text: {
    font: FontSlot;
    weight: number;
    uppercase: boolean;
    spokenColor: string;
    upcomingColor: string;
  };
  pill: {
    enabled: boolean;
    color: string;
    paddingXEm: number;
    paddingYEm: number;
    radiusEm: number;
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
  };
  motion: { fillMs: number; leadMs: number; fadeInMs: number };
};

// Defaults ARE the measurements taken off the reference reels.
export const ALI_DEFAULTS: AliStyle = {
  layout: {
    // 58.3px on a 1080-wide frame. Least-squares fit over 21 of the reference's
    // captions, solving for SIZE AND WORD GAP TOGETHER — the reference sets its
    // words about 4px further apart than Poppins' own space, and fitting the
    // size alone silently absorbs that into a slightly-too-big face (it drops
    // the mean width error from 0.44% to 0.25%, worst 1.05%). Cross-checks: the
    // measured 42px cap height over Poppins' 0.703em cap gives 59.7px, and
    // these values put the text baseline 72.4px below the pill top against 72px
    // measured.
    fontSizePct: 5.4,
    captionScale: 1,
    // Poppins 700's own space advance is 0.212em; the reference runs 0.046em
    // wider. Words are separate spans here, so this gap IS the space.
    wordSpacing: 0.26,
    lineHeight: 1,
    positionX: 50,
    // Under the chin, well clear of the face. Two of the three references sit
    // here; the third is framed lower and sits at 72. Tune per clip.
    positionY: 78,
  },
  text: {
    // Poppins 700, identified rather than guessed: fitted against 38 Google
    // families x 3 weights, it wins the width fit (0.44% mean error over 21
    // captions vs 0.85% for the runner-up) AND the glyph-silhouette match
    // (0.845 IoU against the video's own pixels vs 0.733 for the next best) —
    // two independent tests agreeing, which is why the single-storey "a" here
    // is the reference's own letterform and not a substitution.
    font: { family: "Poppins", custom: "" },
    weight: 700,
    uppercase: false,
    spokenColor: "#000000",
    upcomingColor: "#d3cfc3",
  },
  pill: {
    enabled: true,
    color: "#fffaee",
    paddingXEm: 0.62, // 36px of side padding @ 58.3px type
    paddingYEm: 0.39, // -> a 104px-tall pill, against ~104 measured
    radiusEm: 0.38, // 22px corner radius @ 58.3px type
    // Subtle — in the references the sticker reads as sitting just off the
    // footage, not floating above it.
    shadow: { enabled: true, color: "rgba(0,0,0,0.18)", blur: 14, offsetY: 4 },
  },
  motion: {
    // 7 frames at the reference's 25fps.
    fillMs: 280,
    // The karaoke fill leads the raw word timestamp for the same reason the
    // caption itself does: the ASR pads each word to swallow the pause after
    // it, so a word's startMs lands after the speaker has begun it. Was 0,
    // which is why "CPP" read as arriving late. See caption-timing.ts.
    leadMs: CAPTION_LEAD_MS,
    fadeInMs: 0, // the references hard-cut between captions
  },
};

const AliStyleContext = createContext<AliStyle>(ALI_DEFAULTS);
export const AliStyleProvider = AliStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR). The real
// pipeline always has one; this keeps something legible on screen otherwise.
const FALLBACK_WORDS_PER_LINE = 5;
const FALLBACK_LINES = 1;
const MIN_FIT_SCALE = 0.5;
// The widest the STICKER may get, as a fraction of the frame. The widest one
// measured in the references was 948px on a 1080 frame (87.8%). `layout.mjs`
// derives this template's character budget from the same number, minus the
// pill's own padding — keep the two in step.
const FIT_WIDTH_FRACTION = 0.88;

/**
 * Renders ONE Ali caption: a single line of words on a hugging pill, each word
 * crossing from `upcomingColor` to `spokenColor` as it is said.
 *
 * `fontSize` is handed down so every caption in the video shares one size.
 */
const AliSegment: React.FC<{
  words: KineticWord[];
  wordStartFrames: number[];
  fontSize: number;
  fadeInFrames: number;
  font: ResolvedFont;
}> = ({ words, wordStartFrames, fontSize, fadeInFrames, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(AliStyleContext);

  const { captionScale, wordSpacing, lineHeight, positionX, positionY } = style.layout;
  const { uppercase, spokenColor, upcomingColor, weight } = style.text;
  const pill = style.pill;
  const fillFrames = Math.max(1, Math.round((style.motion.fillMs / 1000) * fps));

  const enter =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const fontWeight = effectiveWeight(font, weight);

  // ---- FIT so the sticker can NEVER leave the screen ------------------------
  // Measure the PILL's own width (offsetWidth is the natural, un-transformed
  // width, so applying a scale never changes what we measure — no oscillation)
  // and scale the whole sticker down if it would run past the frame. Scaling the
  // pill rather than the text keeps the pill hugging its words exactly. A
  // delayRender holds the export until the first measurement lands, so no frame
  // paints unscaled.
  const avail = width * FIT_WIDTH_FRACTION;
  const pillRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [fitHandle] = useState(() => delayRender("Ali sticker fit"));
  const fitReleased = useRef(false);
  useLayoutEffect(() => {
    const el = pillRef.current;
    const natural = el?.offsetWidth ?? 0;
    const next = natural > avail ? Math.max(MIN_FIT_SCALE, avail / natural) : 1;
    setFitScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    if (!fitReleased.current) {
      fitReleased.current = true;
      continueRender(fitHandle);
    }
  }, [words, avail, fontSize, wordSpacing, fontWeight, pill.paddingXEm, fitHandle]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          transform: `translate(-50%, -50%) scale(${captionScale * fitScale})`,
          transformOrigin: "center center",
          fontFamily: font.fontFamily,
          fontWeight,
          fontSize,
          textTransform: uppercase ? "uppercase" : "none",
          opacity: enter,
        }}
      >
        {/* dir="auto" so Arabic lays out RTL, Latin LTR, mixed by bidi. */}
        <div
          ref={pillRef}
          dir="auto"
          style={{
            display: "flex",
            alignItems: "center",
            columnGap: `${fontSize * wordSpacing}px`,
            whiteSpace: "pre",
            lineHeight,
            padding: `${fontSize * pill.paddingYEm}px ${fontSize * pill.paddingXEm}px`,
            borderRadius: `${fontSize * pill.radiusEm}px`,
            background: pill.enabled ? pill.color : "transparent",
            boxShadow:
              pill.enabled && pill.shadow.enabled
                ? `0 ${pill.shadow.offsetY}px ${pill.shadow.blur}px ${pill.shadow.color}`
                : undefined,
          }}
        >
          {words.map((token, wi) => {
            // A word crosses from upcoming to spoken over `fillMs`, starting at
            // its own timestamp. Already-spoken words stay at the far end.
            const start = wordStartFrames[wi] ?? 0;
            const t = interpolate(frame, [start, start + fillFrames], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span
                key={wi}
                style={{
                  display: "inline-block",
                  whiteSpace: "pre",
                  color: interpolateColors(t, [0, 1], [upcomingColor, spokenColor]),
                }}
              >
                {token.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Ali style: one <Sequence> per caption from the caption document, each a single
 * line of words on a hugging sticker whose words darken as they are spoken.
 */
export const PageAli: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(AliStyleContext);

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

  // Resolve the font once (fetched + registered a single time; the delayRender
  // inside the hook keeps a render from painting before it is ready).
  const font = useFontSlot(style.text.font);

  // One size for the whole video, as a % of frame width. A caption still too
  // wide is shrunk inside its own segment by DOM measurement (see the fit
  // there), so nothing can ever overflow.
  const fontSize = (width * style.layout.fontSizePct) / 100;

  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // Every caption starts LEAD ms early — the ASR pads each word to swallow
  // the pause after it, so a raw startMs lands after the word is spoken.
  // Deriving the end from the same array makes gaps/overlaps impossible.
  const captionStarts = captionStartFrames(
    blocks.map((b) => b.startMs),
    fps,
    CAPTION_LEAD_MS,
  );
  const fadeInFrames = Math.round((style.motion.fadeInMs / 1000) * fps);
  const { leadMs } = style.motion;

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = captionStarts[i];
        const endFrame = captionEndFrame(captionStarts, i, durationInFrames);
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        // This template is always ONE line, but the document may still carry a
        // caption as several lines (it is shared with other templates), so flatten.
        const words = block.lines.flat();
        // Frame, LOCAL to the segment, at which each word starts darkening.
        const wordStartFrames = words.map((w) =>
          Math.max(0, msToFrame(w.fromMs - leadMs) - startFrame),
        );
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Caption ${i + 1}`}
          >
            <AliSegment
              words={words}
              wordStartFrames={wordStartFrames}
              fontSize={fontSize}
              fadeInFrames={fadeInFrames}
              font={font}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
