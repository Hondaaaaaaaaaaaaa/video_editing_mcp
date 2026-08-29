import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AbsoluteFill,
  Sequence,
  continueRender,
  delayRender,
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
// Same caption-document -> blocks conversion the other kinetic templates use;
// only the painting differs here.
import {
  groupWordsIntoBlocks,
  enrichedToBlocks,
  type KineticWord,
} from "./PageShiny";
import {
  captionStartFrames,
  captionEndFrame,
  CAPTION_LEAD_MS,
} from "./caption-timing";
import { wiggleSlotSchema, wiggleAt, type WiggleSlot } from "./wiggle-slot";
import {
  textAnimationSchema,
  textAnimationAt,
  type TextAnimation,
} from "./text-animation-slot";

// ---------------------------------------------------------------------------
// HORMOZI 2 — the "changing-color + wiggle" viral caption look.
//
// Reverse-engineered frame by frame from four reference reels
// (remotion/public/Hormozi 2/, 1080x1920):
//
//   * Every caption is TWO stacked lines, both on screen together, centred a
//     little below the middle of the frame, ALL-CAPS, in a heavy CONDENSED
//     ITALIC face (Avenir Next Condensed Heavy Italic, shipped in public/fonts).
//   * KARAOKE, LINE-LEVEL: the line CURRENTLY BEING SPOKEN lights up in an
//     accent colour; the other line stays white. The highlight steps from the
//     top line to the bottom line the instant the second phrase begins, then the
//     top line reverts to white. (Caught the same caption at 0.6s with the TOP
//     line yellow and at 0.9s with the BOTTOM line red — the highlight follows
//     the voice, and the colour differs each time a line lights up.)
//   * CHANGING COLOUR: each time a line lights up it takes a colour picked from a
//     three-colour palette (red / yellow / green in the references). The pick is
//     a SEEDED hash of the line's text, so it varies line-to-line yet is stable
//     across every frame of a render (Remotion can't use live randomness — the
//     colour would flicker every frame).
//   * STROKE FOLLOWS THE COLOUR (for contrast): red text gets a WHITE outline;
//     yellow / green text get a DARK outline; the plain white line a thin dark
//     one. Each palette entry therefore carries its own stroke colour.
//   * WIGGLE + POP: the moment a line becomes active it POPS a touch bigger and
//     WIGGLES (a small damped rotation that settles). The white line is still.
//
// Grouping (which words share a caption, split across the two lines) is NOT done
// here — it comes from the caption document (`variants.hormozi2`: Claude's
// meaning-based caption breaks, line-wrapped for this template by enrich.mjs, or
// the user's per-caption edits). Per-word `emphasis` is IGNORED: the colour
// is driven by the spoken line, not by marked words.
// ---------------------------------------------------------------------------

// A palette entry = the fill colour a lit line takes, plus the outline that
// keeps it legible over the footage.
const accentSchema = z.object({
  fill: zColor(),
  stroke: zColor(),
});

export const hormozi2Schema = captionedVideoSchema.extend({
  // === LAYOUT — placement + sizing. Line GROUPING is not here (see above). ===
  layout: z.object({
    // Size as a PERCENTAGE OF FRAME WIDTH, not absolute px, so the template
    // looks identical on the 1080 export and any smaller source clip (an
    // absolute size would silently trip the auto-fit on the smaller one).
    fontSizePct: z.number().min(2).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    wordSpacing: z.number().min(0).max(1.5).step(0.05), // gap between words (em)
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05), // vertical line spacing
    positionX: z.number().min(0).max(100).step(1), // block centre X
    positionY: z.number().min(0).max(100).step(1), // block centre Y
    alignment: z.enum(["center", "left", "right"]),
    // Auto-balance the LINE BREAK: re-split each caption's words into two lines
    // of ~equal width so BOTH lines render at the same big size (instead of one
    // big + one shrunk). Keeps every word in the same caption — only the top/
    // bottom split moves. Off = render the lines exactly as authored.
    balanceLines: z.boolean(),
  }),

  // === TEXT — the font, the white base line, and the 3-colour accent palette ==
  text: z.object({
    font: fontSlotSchema, // Avenir Next Condensed Heavy Italic by default
    uppercase: z.boolean(), // the references are ALL-CAPS
    baseColor: zColor(), // the non-spoken line
    baseStroke: zColor(), // its outline
    strokeWidth: z.number().min(0).max(24).step(0.5), // outline thickness (px)
    // The three colours a lit line rotates through (seeded per line).
    accents: z.object({
      one: accentSchema,
      two: accentSchema,
      three: accentSchema,
    }),
  }),

  // === MOTION — a continuous float of the WHOLE BLOCK (both lines together).
  // Measured off the slowed reference: the block drifts up/down ~±9px @1080
  // (~0.08 of the font size) over ~0.7s, both lines moving as one unit, with NO
  // scaling/pop. A small rotation on a SLIGHTLY DIFFERENT rhythm drifts in and
  // out of phase with the bob, giving the organic "sometimes a little tilt"
  // feel rather than a metronome. ===
  // === TEXT ANIMATION — how the caption ARRIVES (fade / pop) ===
  textAnimation: textAnimationSchema,

  // === WIGGLE — the slow drift it keeps WHILE on screen ===
  wiggle: wiggleSlotSchema,

  // === EFFECTS — the soft dark blurred "sticker" halo behind each line ===
  effects: z.object({
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
  }),
});

export type Hormozi2Alignment = "center" | "left" | "right";
type Accent = { fill: string; stroke: string };

export type Hormozi2Style = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    alignment: Hormozi2Alignment;
    balanceLines: boolean;
  };
  text: {
    font: FontSlot;
    uppercase: boolean;
    baseColor: string;
    baseStroke: string;
    strokeWidth: number;
    accents: { one: Accent; two: Accent; three: Accent };
  };
  textAnimation: TextAnimation;
  wiggle: WiggleSlot;
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
  };
};

// Defaults ARE the measurements taken off the reference reels.
export const HORMOZI2_DEFAULTS: Hormozi2Style = {
          layout: {
            fontSizePct: 13.5,
            captionScale: 1,
            wordSpacing: 0.22,
            lineSpacing: 1.05,
            positionX: 50,
            positionY: 64,
            alignment: "center" as const,
            balanceLines: true,
          },
          text: {
            font: {
              family: "Montserrat" as const,
              custom: "avenir-next-condensed-heavy-italic.ttf",
            },
            uppercase: true,
            baseColor: "#ffffff",
            baseStroke: "#0a0a0a",
            strokeWidth: 9,
            accents: {
              one: { fill: "#ff1f1f", stroke: "#ffffff" },
              two: { fill: "#ffe000", stroke: "#0a0a0a" },
              three: { fill: "#28e234", stroke: "#0a0a0a" },
            },
          },
          // The reference caption simply APPEARS - full size, full opacity on
          // frame one - so both entrance effects are off by default. The
          // controls remain for looks that do want them.
          textAnimation: {
            fadeInMs: 0,
            popIn: { enabled: false as const },
          },
          // Measured from public/References/wiggle.mp4. See wiggle-slot.ts.
          wiggle: {
            enabled: true as const,
            amountXEm: 0.48,
            amountYEm: 0.4,
            periodXSec: 4.75,
            periodYSec: 3.5,
            tiltDeg: 0,
            tiltPeriodSec: 2.9,
            startsAtMs: 0,
            durationMs: 0,
            onsetMs: 600,
          },
          effects: {
            shadow: {
              enabled: true,
              color: "rgba(0,0,0,0.78)",
              blur: 14,
              offsetY: 5,
            },
          },
        };

const Hormozi2StyleContext = createContext<Hormozi2Style>(HORMOZI2_DEFAULTS);
export const Hormozi2StyleProvider = Hormozi2StyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR). The real
// pipeline always has one; this keeps something legible on screen otherwise.
const FALLBACK_WORDS_PER_LINE = 3;
const FALLBACK_LINES = 2;
const MIN_FIT_SCALE = 0.5;
// Only shrink a line that would run past this fraction of the frame. Generous
// (0.94) so the big condensed size is kept for all but genuinely long lines.
const FIT_WIDTH_FRACTION = 0.94;

// The accent hands off to the next line this many ms BEFORE the timestamp
// boundary. ASR stretches a line's last word to swallow the pause before the
// next line, so the raw boundary sits AFTER the line is effectively done;
// leading the switch makes the colour move on the beat. (Matches Hormozi.)
const SWITCH_LEAD_MS = 130;

const ALIGN_TO_JUSTIFY: Record<Hormozi2Alignment, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// djb2 string hash + an avalanche finalizer -> a well-mixed non-negative
// integer. djb2's LOW bits are poorly distributed, so `% 3` straight off it
// clumps (mostly two of the three colours); the finalizer spreads the bits so
// the palette pick reads as genuinely random per line. Deterministic: the same
// text always yields the same number, so a render never flickers colours.
const hashText = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

// Assign a palette INDEX to every line, in reading order.
//
// A pure per-line text hash sounds "random" but distributes terribly across a
// short clip's handful of lines (`% 3` clumps — a whole video can come out
// almost all one colour). What the look actually needs is that the highlight
// CHANGES colour every time it lands, cycling through all three — so this walks
// the palette in order (red -> yellow -> green -> red …), advancing once per
// line. That GUARANTEES every colour shows, adjacent lit lines always differ,
// and the sequence never repeats back to back. Only the STARTING colour is
// hash-seeded from the document's text, so different videos don't all open on
// the same colour while any single render stays perfectly stable.
const assignAccentIndices = (blocks: { lines: KineticWord[][] }[], paletteSize: number): number[][] => {
  const seed = blocks
    .flatMap((b) => b.lines)
    .flat()
    .map((w) => w.text)
    .join(" ")
    .slice(0, 80);
  let k = hashText(seed) % paletteSize;
  return blocks.map((block) =>
    block.lines.map(() => {
      const idx = k;
      k = (k + 1) % paletteSize;
      return idx;
    }),
  );
};

// Re-split a caption's words into TWO lines of ~equal width, so both lines
// render at the same big size (rather than one big + one shrunk). Width is
// approximated by character count + the inter-word gaps — a good proxy for the
// condensed face, and the DOM per-line fit still guarantees nothing overflows.
// Only the LINE BREAK moves; every word stays in the same caption.
const balanceTwoLines = (words: KineticWord[]): KineticWord[][] => {
  if (words.length <= 1) return [words];
  const w = words.map((x) => x.text.length);
  const total = w.reduce((a, b) => a + b, 0) + (words.length - 1); // +gaps
  let best = 1;
  let bestDiff = Infinity;
  let top = 0;
  for (let k = 1; k < words.length; k++) {
    top += w[k - 1] + 1; // words 0..k-1 plus one gap
    const bottom = total - top;
    const diff = Math.abs(top - bottom);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return [words.slice(0, best), words.slice(best)];
};

/**
 * Renders ONE Hormozi 2 caption. Both lines are painted at once, hold their
 * size, and the WHOLE block floats up/down + tilts slightly as one unit. The
 * only per-line decision is which line is lit (`lineSwitchFrames`) and what
 * colour it takes (seeded from its text).
 *
 * `fontSize` is handed down so every caption in the video shares one size.
 */
const Hormozi2Segment: React.FC<{
  lines: KineticWord[][];
  accentIndices: number[];
  lineSwitchFrames: number[];
  fontSize: number;
  fadeInFrames: number;
  font: ResolvedFont;
}> = ({ lines, accentIndices, lineSwitchFrames, fontSize, fadeInFrames, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(Hormozi2StyleContext);

  const { captionScale, wordSpacing, lineSpacing, positionX, positionY, alignment } =
    style.layout;
  const { uppercase, baseColor, baseStroke, strokeWidth, accents } = style.text;
  const wiggleSlot = style.wiggle;
  const textAnim = style.textAnimation;
  const { shadow } = style.effects;

  const palette: Accent[] = [accents.one, accents.two, accents.three];

  // The lit line is the LAST one whose switch frame has been reached — an
  // instant step, exactly as in the references (no cross-fade).
  let activeLine = 0;
  for (let i = 0; i < lineSwitchFrames.length; i++) {
    if (frame >= lineSwitchFrames[i]) activeLine = i;
  }

  // Whole-block entrance fade. Nothing else about the block moves.
  const enter =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const fontWeight = effectiveWeight(font, 900);
  // A blurred, layered dark halo that HUGS the glyph shapes (drop-shadow follows
  // the text alpha, unlike a flat text-shadow) — the "lifted sticker" look. Two
  // stacked shadows build the density seen in the references.
  const shadowFilter = shadow.enabled
    ? `drop-shadow(0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}) ` +
      `drop-shadow(0 0 ${Math.round(shadow.blur * 0.6)}px ${shadow.color})`
    : undefined;

  // WHOLE-BLOCK float: the entire caption (both lines together) drifts up/down
  // and tilts a touch — measured off the slowed reference, where the two lines
  // move as ONE unit with NO scaling. The bob and the rotation run at DIFFERENT
  // rhythms so the tilt drifts in and out of phase with the float (organic
  // "sometimes a little tilt"). Driven by the caption-local frame, so each
  // caption starts its float from rest — no jump when it appears.
  const secs = frame / fps;
  // x and y drift on DIFFERENT periods, which is what stops the path retracing
  // itself and reading as a metronome. The onset envelope lives in wiggleAt.
  const wig = wiggleAt(wiggleSlot, secs, fontSize);
  const entrance = textAnimationAt(textAnim, secs);
  const wiggle =
    `translate(${wig.x.toFixed(2)}px, ${wig.y.toFixed(2)}px) ` +
    `rotate(${wig.deg.toFixed(3)}deg) scale(${entrance.scale.toFixed(4)})`;

  // ---- PER-LINE FIT so text can NEVER leave the screen ----------------------
  // Measure each line's ACTUAL rendered width in the DOM (not measureText — that
  // under-measures the uploaded italic font and let wide lines overflow) and
  // scale down only the lines that would exceed the frame. offsetWidth is the
  // NATURAL (un-transformed) width, so applying a scale never changes what we
  // measure — the result is stable, no oscillation. A delayRender holds the
  // export until the first measurement lands, so no frame paints unscaled.
  // The fit must ALSO leave room for the wiggle, because the drift translates
  // the line AFTER it has been fitted. Without this, a line that exactly fills
  // the frame gets pushed off the edge at the extremes of the x swing — which
  // is precisely what a wide caption did once the measured 0.48em amplitude
  // replaced the old 0.08em bob.
  const wiggleRoomPx = wiggleSlot.enabled ? wiggleSlot.amountXEm * fontSize : 0;
  const avail = Math.max(1, width * FIT_WIDTH_FRACTION - 2 * wiggleRoomPx);
  const innerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>(() => lines.map(() => 1));
  const [fitHandle] = useState(() => delayRender("Hormozi2 line fit"));
  const fitReleased = useRef(false);
  useLayoutEffect(() => {
    const next = lines.map((_, i) => {
      const el = innerRefs.current[i];
      if (!el || !el.offsetWidth) return 1;
      return el.offsetWidth > avail ? Math.max(MIN_FIT_SCALE, avail / el.offsetWidth) : 1;
    });
    setScales((prev) =>
      prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.002)
        ? prev
        : next,
    );
    if (!fitReleased.current) {
      fitReleased.current = true;
      continueRender(fitHandle);
    }
  }, [lines, avail, fontSize, wordSpacing, fontWeight, fitHandle]);

  const originForAlign =
    alignment === "left" ? "left center" : alignment === "right" ? "right center" : "center center";

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: "92%",
          transformOrigin: "center center",
          // Position, then the whole-block wiggle (float + tilt), then scale. The
          // wiggle rotates/translates the WHOLE block as one unit.
          transform: `translate(-50%, -50%) ${wiggle} scale(${captionScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          fontFamily: font.fontFamily,
          fontWeight,
          fontSize,
          textTransform: uppercase ? "uppercase" : "none",
          opacity: enter,
        }}
      >
        {lines.map((line, li) => {
          const isActive = li === activeLine;
          // Colour comes from the per-line index assigned in reading order by the
          // parent (hash-seeded, never repeating the previous line's colour), so
          // each lit line keeps one stable colour for its whole active window.
          const accent = palette[(accentIndices[li] ?? 0) % palette.length];
          const s = scales[li] ?? 1;
          return (
            // dir="auto" so Arabic lines lay out RTL, Latin LTR, mixed by bidi.
            <div
              key={li}
              dir="auto"
              style={{
                display: "flex",
                justifyContent: ALIGN_TO_JUSTIFY[alignment],
                alignItems: "center",
                lineHeight: lineSpacing,
                whiteSpace: "pre",
                color: isActive ? accent.fill : baseColor,
                WebkitTextStroke: `${strokeWidth}px ${isActive ? accent.stroke : baseStroke}`,
                paintOrder: "stroke fill", // outline UNDER the fill, never over it
                filter: shadowFilter,
              }}
            >
              {/* Inner span sizes to its content; we measure ITS width and shrink
                  only it, so a wide line fits while the rest stay full size. */}
              <span
                ref={(el) => {
                  innerRefs.current[li] = el;
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  whiteSpace: "pre",
                  columnGap: `${fontSize * wordSpacing}px`,
                  transform: s < 1 ? `scale(${s})` : undefined,
                  transformOrigin: originForAlign,
                }}
              >
                {line.map((token, wi) => (
                  <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Hormozi 2 style: one <Sequence> per caption from the caption document, each a
 * two-line block that floats as a whole; the LIT line's accent colour steps
 * top -> bottom in time with the speech.
 */
export const PageHormozi2: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(Hormozi2StyleContext);

  const hasDoc = Boolean(segments && segments.length);
  const balanceLines = style.layout.balanceLines;
  const blocks = useMemo(() => {
    const raw = hasDoc
      ? enrichedToBlocks(segments!)
      : groupWordsIntoBlocks(
          captions.map((c) => ({ text: c.text, fromMs: c.startMs, toMs: c.endMs })),
          FALLBACK_WORDS_PER_LINE,
          FALLBACK_LINES,
        );
    // Re-balance the LINE BREAK (top/bottom split) of every caption so both
    // lines are the same size. Caption membership (which words) is untouched —
    // we just flatten the two authored lines and re-split them evenly.
    if (!balanceLines) return raw;
    return raw.map((b) => ({ ...b, lines: balanceTwoLines(b.lines.flat()) }));
  }, [hasDoc, segments, captions, balanceLines]);

  // Assign each line its accent colour ONCE for the whole document, in reading
  // order, so the highlight changes colour line-to-line and never repeats back
  // to back (see assignAccentIndices). 3-colour palette.
  const accentIndices = useMemo(() => assignAccentIndices(blocks, 3), [blocks]);

  // Resolve the font once (fetched + registered a single time; the delayRender
  // inside the hook keeps a render from painting before it is ready).
  const font = useFontSlot(style.text.font);

  // The target size (a % of frame width). Each caption starts here; any line
  // that would still be too wide is shrunk to fit INSIDE the segment, by DOM
  // measurement (see the per-line fit there) — reliable even for the uploaded
  // italic font, which measureText mis-sizes.
  const { fontSizePct } = style.layout;
  const fontSize = (width * fontSizePct) / 100;

  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);

  // Every caption starts LEAD ms early — the ASR pads each word to swallow
  // the pause after it, so a raw startMs lands after the word is spoken.
  // Deriving the end from the same array makes gaps/overlaps impossible.
  const captionStarts = captionStartFrames(
    blocks.map((b) => b.startMs),
    fps,
    CAPTION_LEAD_MS,
  );
  const fadeInFrames = Math.round((style.textAnimation.fadeInMs / 1000) * fps);

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = captionStarts[i];
        const endFrame = captionEndFrame(captionStarts, i, durationInFrames);
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        // Local frame at which the accent LANDS on each line. Line 0 = caption
        // start; later lines switch the moment the PREVIOUS line finishes being
        // spoken (led by SWITCH_LEAD_MS so it doesn't linger through the pause).
        const lineSwitchFrames = block.lines.map((ln, li) => {
          if (li === 0) return 0;
          const prev = block.lines[li - 1];
          const prevEndMs = prev.length ? prev[prev.length - 1].toMs : 0;
          const thisStartMs = ln.length ? ln[0].fromMs : prevEndMs;
          const boundaryMs = Math.min(prevEndMs, thisStartMs) - SWITCH_LEAD_MS;
          return Math.max(0, msToFrame(boundaryMs) - startFrame);
        });
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Caption ${i + 1}`}
          >
            <Hormozi2Segment
              lines={block.lines}
              accentIndices={accentIndices[i] ?? []}
              lineSwitchFrames={lineSwitchFrames}
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
