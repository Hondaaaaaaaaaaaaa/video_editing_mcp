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
import {
  groupWordsIntoBlocks,
  enrichedToBlocks,
  type KineticWord,
} from "./PageShiny";

// ---------------------------------------------------------------------------
// TYPEWRITER 3 — a small Roman-serif caption TYPED OUT ONE CHARACTER AT A TIME,
// dead centre, under a wide soft glow.
//
// Reverse-engineered frame by frame from References/"typewriter 3 .mp4"
// (576x576 @30fps). Every number below is a measurement, not a preference.
//
// THE ANIMATION — a per-character reveal IN PLACE.
//
// Tracking one caption frame by frame, the line's LEFT edge never moves while
// its RIGHT edge grows:
//
//     f96   x 207-219          f111  line 2 starts   x 195-195
//     f98   x 207-238  (+19)   f113                  x 194-231  (+15)
//     f102  x 207-284  (+27)   f117                  x 194-278  (+16)
//     f108  x 207-368  (+20)   f127                  x 194-377  (+11)
//
// So the line is laid out at its FINAL centred position from the start and
// characters appear into it left to right. It never re-centres as it grows —
// which is the whole difference between this and a "grow from nothing" build.
// Un-revealed characters are therefore RENDERED, just transparent: they have to
// keep occupying their width or the line would shift under the typing.
//
// It is per CHARACTER, not per word: the number of rightward steps matches the
// GLYPH count, not the word count — 11 steps for the 12 glyphs of "FATHER
// FOUGHT", 7 for the 8 of "AND MY OWN".
//
// Rate: ~47ms per character, running as ONE continuous stream through both
// lines (line 2 picks up three frames after line 1 finishes — a single
// character's worth).
//
// NO FADE, either way. A character snaps to full white in a single frame, and
// the finished caption CUTS rather than fading (887 ink pixels -> 0 between two
// consecutive frames) after a ~230ms hold. Both are sliders here anyway, so the
// look can be softened, but the measured default is a hard snap.
//
// THE GLOW is real and was nearly mis-read as footage. Differencing the caption
// frame against the next frame — same shot, caption gone — the two agree to
// within 0.1 luma everywhere except the caption, which adds +83. The halo
// reaches far past the glyph edges:
//
//     4px +25 | 16px +21 | 32px +10 | 56px ~0
//
// so roughly a 40-60px radius on a 576 frame, about 2.5x the cap height.
//
// THE FACE is Marcellus 400, identified by fingerprinting ink width over cap
// height against 21 Roman serifs: it won at 0.46% error needing essentially no
// tracking, and held at 1.57% on two captions kept out of the fit (next best,
// Cinzel, 1.78%). Registered in fonts.ts.
// ---------------------------------------------------------------------------

export const typewriter3Schema = captionedVideoSchema.extend({
  // === LAYOUT — placement and size. Grouping comes from the caption document ===
  layout: z.object({
    // Size as a % of FRAME WIDTH so the look survives any export size.
    // 4.22 = the measured 17px cap height over Marcellus' 0.700 cap/em, on a
    // 576-wide frame.
    fontSizePct: z.number().min(1).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    // The reel needs essentially NO tracking (the font fit landed on -0.012em,
    // i.e. zero within measurement error).
    letterSpacing: z.number().min(-0.05).max(0.5).step(0.005),
    wordSpacing: z.number().min(0).max(1).step(0.01),
    // 0.87 = the measured 21px baseline gap over the 24.3px em. Tight, and that
    // tightness is a large part of the look.
    lineSpacing: z.number().min(0.7).max(2.5).step(0.01),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
  }),

  // === TYPING — the character stream ===
  typing: z.object({
    // Milliseconds between consecutive CHARACTERS. 47 measured.
    msPerChar: z.number().min(0).max(400).step(1),
    // Spaces are characters too in the reference (the gap between words costs
    // the same beat as a letter). Turn this off to jump straight to the next
    // word without spending a beat on the space.
    countSpaces: z.boolean(),
    // How long ONE character takes to appear. 0 = the measured hard snap; raise
    // it to soften the arrival into a fade.
    charFadeMs: z.number().min(0).max(600).step(5),
    // Never let a caption still be typing when it leaves the screen: if the
    // natural rate would not finish in time, the whole stream is sped up to
    // land inside this fraction of the caption's own duration. The reference
    // finishes its typing in 79% of the caption, so 0.8 keeps the measured
    // pacing and only ever bites on unusually long captions.
    fitWithin: z.number().min(0.1).max(1).step(0.05),
  }),

  // === TEXT ===
  text: z.object({
    font: fontSlotSchema,
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
  }),

  // === EFFECTS — the wide soft halo ===
  effects: z.object({
    glow: z.object({
      enabled: z.boolean(),
      // Both radii as a % of FRAME WIDTH, so the halo scales with the text.
      // The measured falloff has a bright core and a long tail, which one blur
      // cannot express, so it is modelled as two.
      innerPct: z.number().min(0).max(10).step(0.05),
      innerOpacity: z.number().min(0).max(1).step(0.05),
      outerPct: z.number().min(0).max(20).step(0.05),
      outerOpacity: z.number().min(0).max(1).step(0.05),
      color: zColor(),
    }),
    // A conventional dark drop shadow, OFF by default — the reference keeps the
    // text legible with the glow alone.
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
  }),
});

export type Typewriter3Style = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
  };
  typing: {
    msPerChar: number;
    countSpaces: boolean;
    charFadeMs: number;
    fitWithin: number;
  };
  text: { font: FontSlot; weight: number; uppercase: boolean; color: string };
  effects: {
    glow: {
      enabled: boolean;
      innerPct: number;
      innerOpacity: number;
      outerPct: number;
      outerOpacity: number;
      color: string;
    };
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
  };
};

// Defaults ARE the measurements taken off the reel.
export const TYPEWRITER3_DEFAULTS: Typewriter3Style = {
  layout: {
    fontSizePct: 4.22, // 17px cap / 0.700 cap-per-em / 576 frame width
    captionScale: 1,
    letterSpacing: 0, // the font fit wanted -0.012em: zero within error
    wordSpacing: 0.25,
    lineSpacing: 0.87, // 21px baseline gap / 24.3px em
    positionX: 50, // both lines centred to within 2px of frame centre
    positionY: 50, // block centre measured at 49.9% of frame height
  },
  typing: {
    msPerChar: 47, // 22 glyphs in 31 frames @30fps
    countSpaces: true,
    charFadeMs: 0, // measured: a character snaps in one frame
    fitWithin: 0.8, // the reference finishes typing in 79% of the caption
  },
  text: {
    // A built-in Google face, so no uploaded file: `custom` stays empty.
    font: { family: "Marcellus", custom: "" },
    weight: 400, // single-weight face; a synthesised bold would ruin it
    uppercase: true, // the reel is ALL CAPS throughout
    color: "#ffffff", // sampled pure white
  },
  effects: {
    glow: {
      enabled: true,
      // Fitted to the measured falloff (+25 at 4px, +21 at 16px, +10 at 32px,
      // ~0 by 56px) on a 576 frame: 1.4% of the width is ~8px, 6% is ~35px.
      innerPct: 1.4,
      innerOpacity: 0.55,
      outerPct: 6,
      outerOpacity: 0.4,
      color: "#ffffff",
    },
    shadow: { enabled: false, color: "rgba(0,0,0,0.55)", blur: 6, offsetY: 2 },
  },
};

const Typewriter3StyleContext = createContext<Typewriter3Style>(TYPEWRITER3_DEFAULTS);
export const Typewriter3StyleProvider = Typewriter3StyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one.
const FALLBACK_WORDS_PER_LINE = 3;
const FALLBACK_LINES = 2;

// How much of the frame width one line may occupy before it is shrunk to fit.
// The reel never runs a line past 43% of the frame (its widest measured line is
// 246px of 576), so 50% keeps the look while leaving normal lines untouched.
//
// This matters because the shared line splitter optimises for a natural break
// rather than for balance: it will take a comma and leave one line far longer
// than the other, which is how a 34-character line reaches this template. The
// renderer is the final authority on width, exactly as
// docs/adding-a-caption-template.md describes.
const FIT_WIDTH_FRACTION = 0.5;
// Floor, so a pathological line goes slightly small rather than unreadable.
const MIN_FIT_SCALE = 0.62;

/**
 * One screen: every character is laid out at its final position from the first
 * frame, and the typing only changes which of them are VISIBLE.
 */
const Typewriter3Segment: React.FC<{
  lines: KineticWord[][];
  durationMs: number;
  font: ResolvedFont;
}> = ({ lines, durationMs, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(Typewriter3StyleContext);
  const { fontSizePct, captionScale, letterSpacing, wordSpacing, lineSpacing, positionX, positionY } =
    style.layout;
  const { msPerChar, countSpaces, charFadeMs, fitWithin } = style.typing;
  const { weight, uppercase, color } = style.text;
  const { glow, shadow } = style.effects;

  const fontSize = (width * fontSizePct) / 100;
  const timeInMs = (frame / fps) * 1000;
  const avail = width * FIT_WIDTH_FRACTION;

  // Measured in the DOM rather than with measureText: this face is loaded at
  // runtime and its real advances are what decide whether a line fits.
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>(() => lines.map(() => 1));
  const fitHandle = useMemo(() => delayRender("typewriter3 line fit"), []);
  const fitReleased = useRef(false);

  useLayoutEffect(() => {
    const next = lines.map((_, i) => {
      const el = innerRefs.current[i];
      if (!el || !el.offsetWidth) return 1;
      return el.offsetWidth > avail ? Math.max(MIN_FIT_SCALE, avail / el.offsetWidth) : 1;
    });
    setScales((prev) =>
      prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.001)
        ? prev
        : next,
    );
    if (!fitReleased.current) {
      fitReleased.current = true;
      continueRender(fitHandle);
    }
  }, [lines, avail, fontSize, letterSpacing, wordSpacing, weight, fitHandle]);

  // Flatten the screen into ONE character stream, so the typing runs
  // continuously through both lines exactly as the reference does — line 2 is
  // not a fresh start, it is the same stream carrying on.
  const stream = useMemo(() => {
    const items: { line: number; word: number; char: string; index: number }[] = [];
    let index = 0;
    lines.forEach((line, li) => {
      line.forEach((token, wi) => {
        const text = uppercase ? token.text.toUpperCase() : token.text;
        for (const char of text) {
          items.push({ line: li, word: wi, char, index });
          index += 1;
        }
        // The gap to the next word costs a beat too, unless switched off.
        if (countSpaces && wi < line.length - 1) index += 1;
      });
      if (countSpaces && li < lines.length - 1) index += 1;
    });
    return { items, total: index };
  }, [lines, uppercase, countSpaces]);

  // Speed up only if the natural rate would still be typing when the caption
  // leaves. Normally this is a no-op and the measured 47ms stands.
  const naturalMs = stream.total * msPerChar;
  const allowedMs = Math.max(1, durationMs * fitWithin);
  const perChar = naturalMs > allowedMs ? allowedMs / Math.max(1, stream.total) : msPerChar;

  const textShadow = useMemo(() => {
    const parts: string[] = [];
    if (glow.enabled) {
      const inner = (width * glow.innerPct) / 100;
      const outer = (width * glow.outerPct) / 100;
      // Doubling the inner blur is what reproduces the measured bright core:
      // one pass alone reads as a thin outline rather than a bloom.
      parts.push(`0 0 ${inner.toFixed(1)}px ${glow.color}`);
      parts.push(`0 0 ${inner.toFixed(1)}px ${glow.color}`);
      parts.push(`0 0 ${outer.toFixed(1)}px ${glow.color}`);
    }
    if (shadow.enabled) parts.push(`0 ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`);
    return parts.length ? parts.join(", ") : undefined;
  }, [glow, shadow, width]);

  // Opacity is driven per character by how far the stream has advanced.
  // `timeInMs` is already relative to this screen: <Sequence> rebases the frame
  // counter to 0 at its own start, so no offset is needed here.
  const opacityFor = (index: number) => {
    const dueMs = timeInMs - index * perChar;
    if (charFadeMs <= 0) return dueMs >= 0 ? 1 : 0;
    if (dueMs <= 0) return 0;
    return Math.min(1, dueMs / charFadeMs);
  };

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          transform: `translate(-50%, -50%) scale(${captionScale})`,
          transformOrigin: "center center",
          // Never let a caption run to the frame edge.
          width: "88%",
          fontSize,
          fontFamily: font.fontFamily,
          fontWeight: effectiveWeight(font, weight),
          letterSpacing: `${letterSpacing}em`,
          lineHeight: lineSpacing,
          color,
          textShadow,
          textAlign: "center",
        }}
      >
        {lines.map((line, li) => (
          // dir="auto" so an Arabic caption lays out RTL and mixed text follows
          // the Unicode bidi algorithm.
          <div key={li} style={{ display: "flex", justifyContent: "center" }}>
            <div
              dir="auto"
              ref={(el) => {
                innerRefs.current[li] = el;
              }}
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "baseline",
                columnGap: `${fontSize * wordSpacing}px`,
                whiteSpace: "pre",
                // Scaling the LINE, not the block, so one over-long line shrinks
                // without dragging its neighbour down with it.
                transform: (scales[li] ?? 1) === 1 ? undefined : `scale(${(scales[li] ?? 1).toFixed(4)})`,
                transformOrigin: "center center",
              }}
            >
            {line.map((token, wi) => (
              <span key={wi} style={{ display: "inline-block", whiteSpace: "pre" }}>
                {stream.items
                  .filter((it) => it.line === li && it.word === wi)
                  .map((it, ci) => (
                    // REVEALED IN PLACE: the character is always rendered and
                    // always occupies its width — only its opacity changes — so
                    // the centred line never shifts as the typing advances.
                    <span key={ci} style={{ opacity: opacityFor(it.index) }}>
                      {it.char}
                    </span>
                  ))}
              </span>
            ))}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Typewriter 3: one <Sequence> per screen from the caption document, each
 * typing its pre-laid-out lines a character at a time.
 */
export const PageTypewriter3: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const style = useContext(Typewriter3StyleContext);

  // Resolved ONCE here rather than per screen, so the face is fetched and
  // registered a single time.
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
        // Each screen starts at the spoken onset of its first word, so the
        // typing begins when the words are actually said.
        const startFrame = msToFrame(block.startMs);
        const next = blocks[i + 1];
        const endFrame = next ? msToFrame(next.startMs) : durationInFrames;
        const dur = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} name={`Caption ${i + 1}`}>
            <Typewriter3Segment
              lines={block.lines}
              durationMs={(dur / fps) * 1000}
              font={font}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
