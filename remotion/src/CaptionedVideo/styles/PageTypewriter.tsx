import React, { createContext, useContext, useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
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
  textEffectsSchema,
  textEffectStyle,
  TEXT_EFFECTS_DEFAULTS,
  type TextEffects,
} from "./text-effects";
import {
  fontFamilySchema,
  FONT_DEFAULTS,
  resolveFontFamily,
  type FontSelection,
} from "./fonts";
import { groupWordsIntoBlocks, enrichedToBlocks, type KineticWord } from "./PageShiny";

// ---------------------------------------------------------------------------
// TYPEWRITER — text typed character by character, with a trailing cursor.
//
// The typing engine is a frame-based reimplementation of the React Bits
// "TextType" component's FEATURES. None of its setTimeout / gsap / useState
// timing is used: Remotion renders frames deterministically and often out of
// order across parallel processes, so wall-clock animation renders as garbage.
// Everything here is a pure function of useCurrentFrame(). This is why the
// project does NOT depend on gsap — the cursor blink is a cosine of the frame.
//
// TWO LOOKS, ONE ENGINE — `layout.anchor`:
//
//   "center" — reverse-engineered from `public/Typewriter sample .mp4`
//              (1920x1080, 29.97fps). The line is CENTRE-anchored, so already
//              typed characters slide outward as new ones land. Measured across
//              the clip's first line, while the text grew from 29px wide to
//              525px:
//
//                 frame  text          width   centre
//                 f001   |              29px    1018
//                 f005   Hey t|        216px    1017
//                 f009   Hey there|    402px    1017
//                 f012   Hey there,|   525px    1018
//
//              The centre never moves; both edges travel outward symmetrically
//              (left 1003->755, right 1032->1280). That is the whole trick —
//              it is what makes this read as "moving" rather than as a normal
//              typewriter. ~1 character per frame at 29.97fps = ~33ms/char.
//
//   "left"   — the classic terminal typewriter: the left edge is pinned and
//              text only extends rightward. Nothing already typed ever moves.
//
// Both share every other prop (speed, cursor, blink, colours, font), which is
// why this is one template with a toggle rather than two near-identical files.
// ---------------------------------------------------------------------------

export type TypewriterAnchor = "center" | "left";

export const typewriterSchema = captionedVideoSchema.extend({
  layout: z.object({
    // Glyph height as a % of FRAME WIDTH, so the look holds at any export
    // resolution. Capacity in layout.mjs is derived from this number — change
    // one and the other must follow (see docs/adding-a-caption-template.md).
    fontSizePct: z.number().min(2).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    wordSpacing: z.number().min(0).max(1.5).step(0.05),
    lineSpacing: z.number().min(0.8).max(2.5).step(0.05),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
    // THE toggle between the two looks. See the header comment.
    anchor: z.enum(["center", "left"]),
  }),

  text: z.object({
    weight: z.number().min(100).max(900).step(100),
    // The reference face is a heavy ITALIC sans; kept a prop so the classic
    // terminal look can switch it off.
    italic: z.boolean(),
    uppercase: z.boolean(),
    baseTextColor: zColor(),
    // OPTIONAL per-word accent cycling. Empty (the default) = every word uses
    // baseTextColor.
    textColors: z.array(zColor()),
  }),

  motion: z.object({
    // ms per character. The reference measures ~33.
    typingSpeed: z.number().min(10).max(400).step(1),
    // ms to wait, within each screen, before the first character appears.
    initialDelay: z.number().min(0).max(3000).step(50),
    // How each character eases in once it appears. The reference has NO fade
    // at all — characters are simply present on the frame they land — so
    // "linear" over a very short window is the faithful setting.
    easing: z.enum(["linear", "smooth", "bouncy"]),
    easingSpeed: z.number().min(1).max(6).step(0.1),
    // Deterministic per-character speed jitter (NOT Math.random, which would
    // differ between frames and between render processes).
    variableSpeed: z.boolean(),
    variableSpeedMin: z.number().min(10).max(400).step(5),
    variableSpeedMax: z.number().min(10).max(400).step(5),
  }),

  cursor: z.object({
    show: z.boolean(),
    // Any string: "|", "_", "▮", an emoji …
    character: z.string(),
    // ms for one full blink cycle.
    blinkDuration: z.number().min(100).max(2000).step(10),
    hideWhileTyping: z.boolean(),
  }),

  // Shared shadow + stroke.
  ...textEffectsSchema,
  // Shared font dropdown.
  ...fontFamilySchema,
});

export type TypewriterEasing = "linear" | "smooth" | "bouncy";

export type TypewriterStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    anchor: TypewriterAnchor;
  };
  text: {
    weight: number;
    italic: boolean;
    uppercase: boolean;
    baseTextColor: string;
    textColors: string[];
  };
  motion: {
    typingSpeed: number;
    initialDelay: number;
    easing: TypewriterEasing;
    easingSpeed: number;
    variableSpeed: boolean;
    variableSpeedMin: number;
    variableSpeedMax: number;
  };
  cursor: {
    show: boolean;
    character: string;
    blinkDuration: number;
    hideWhileTyping: boolean;
  };
} & TextEffects &
  FontSelection;

// Defaults ARE the measurements off the reference clip where the reference has
// an opinion, and house values where it does not (it is a 16:9 intro, so its
// framing does not transfer to a 9:16 reel).
export const TYPEWRITER_DEFAULTS: TypewriterStyle = {
  layout: {
    // The reference sets ~101px on a 1920 frame = 5.26% of width, but that is a
    // landscape intro with room to spare. 7% is the vertical-reel equivalent
    // and matches the density of the other templates. layout.mjs derives
    // charsPerLine from exactly this number.
    fontSizePct: 7,
    captionScale: 1,
    wordSpacing: 0.24,
    lineSpacing: 1.15,
    positionX: 50,
    // The house safe zone — under the chin, clear of the platform UI. The
    // reference's own 76% is a landscape framing and does not transfer.
    positionY: 78,
    anchor: "center",
  },
  text: {
    weight: 800,
    italic: true, // the reference face is a heavy italic sans
    uppercase: false, // the reference is sentence case ("Hey there,")
    baseTextColor: "#ffffff",
    textColors: [],
  },
  motion: {
    // Measured: ~1 character per frame at 29.97fps.
    typingSpeed: 33,
    initialDelay: 0,
    // The reference has no per-character fade, so keep the curve flat.
    easing: "linear",
    easingSpeed: 3,
    variableSpeed: false,
    variableSpeedMin: 40,
    variableSpeedMax: 120,
  },
  cursor: {
    show: true,
    character: "|", // the reference's own cursor glyph
    blinkDuration: 530,
    hideWhileTyping: false,
  },
  ...TEXT_EFFECTS_DEFAULTS,
  ...FONT_DEFAULTS,
};

const TypewriterStyleContext = createContext<TypewriterStyle>(TYPEWRITER_DEFAULTS);
export const TypewriterStyleProvider = TypewriterStyleContext.Provider;

// Grouping used ONLY when there is no caption document (raw ASR, no Claude
// pass). The real pipeline always has one.
const FALLBACK_WORDS_PER_LINE = 3;
const FALLBACK_LINES = 2;

// Fraction of a screen's life reserved AFTER typing finishes, so a completed
// line is readable before the screen changes rather than vanishing on the last
// keystroke.
const REST_FRACTION = 0.12;

/**
 * Builds the per-character easing from the `easing` type and `easingSpeed`.
 * For "smooth" the speed is the polynomial exponent; for "bouncy" it is the
 * back-overshoot; "linear" ignores it.
 */
const makeEasing = (type: TypewriterEasing, speed: number): ((input: number) => number) => {
  switch (type) {
    case "smooth":
      return Easing.out(Easing.poly(speed));
    case "bouncy":
      return Easing.out(Easing.back(speed));
    case "linear":
    default:
      return Easing.linear;
  }
};

/**
 * Deterministic pseudo-random in [0,1) from an integer index. Replaces
 * Math.random() so the same character always gets the same speed on every
 * frame and in every render process — required for correct Remotion output.
 */
const hash01 = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Renders ONE screen: its lines type out character by character, in reading
 * order, each word starting when it is spoken.
 */
const TypewriterSegment: React.FC<{
  lines: KineticWord[][];
  startMs: number;
  durationInFrames: number;
}> = ({ lines, startMs, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(TypewriterStyleContext);

  const { fontSizePct, captionScale, wordSpacing, lineSpacing, positionX, positionY, anchor } =
    style.layout;
  const { weight, italic, uppercase, baseTextColor, textColors } = style.text;
  const {
    typingSpeed,
    initialDelay,
    easing,
    easingSpeed,
    variableSpeed,
    variableSpeedMin,
    variableSpeedMax,
  } = style.motion;
  const cursorCfg = style.cursor;

  const fontFamily = resolveFontFamily(style.fontFamily);
  const fontSize = (width * fontSizePct) / 100;
  const easingFn = makeEasing(easing, easingSpeed);

  const timeInMs = (frame / fps) * 1000;
  const t = timeInMs - initialDelay;
  const screenDurationMs = (durationInFrames / fps) * 1000;

  const charDelayMs = (globalIndex: number): number => {
    if (!variableSpeed) return typingSpeed;
    const lo = Math.min(variableSpeedMin, variableSpeedMax);
    const hi = Math.max(variableSpeedMin, variableSpeedMax);
    return lo + hash01(globalIndex) * (hi - lo);
  };

  // Schedule every character in reading order. Each WORD is anchored forward
  // from the moment it is spoken, so typing stays synced to the audio; its
  // characters then step forward one delay at a time. Anchoring forward from
  // the spoken START (rather than back from the END) guarantees a word begins
  // typing inside the screen's window — a word can be spoken right up to the
  // boundary, but its end often falls past it.
  const schedule = useMemo(() => {
    let acc = 0;
    const out = lines.map((line, li) =>
      line.map((token, wi) => {
        const relStart = Math.max(0, token.fromMs - startMs);
        const offset = acc;
        const chars = (uppercase ? token.text.toUpperCase() : token.text).split("");
        const appear: number[] = new Array<number>(chars.length);
        let within = 0;
        for (let ci = 0; ci < chars.length; ci++) {
          appear[ci] = relStart + within;
          within += charDelayMs(offset + ci);
        }
        acc += chars.length;
        const colorIndex = li * 100 + wi;
        const color = textColors.length
          ? textColors[colorIndex % textColors.length]
          : baseTextColor;
        return { chars, offset, appear, color };
      }),
    );
    return { out, totalChars: acc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, startMs, uppercase, textColors, baseTextColor, typingSpeed, variableSpeed, variableSpeedMin, variableSpeedMax]);

  // Compress the schedule so every character is typed while the screen is still
  // up. If the natural schedule already fits, `fit` is 1 and the audio-synced
  // timing is untouched; only over-full screens are squeezed. This is what
  // guarantees no character is ever skipped.
  const { fit, lastRevealed } = useMemo(() => {
    let rawEnd = 0;
    for (const line of schedule.out) {
      for (const { offset, appear } of line) {
        for (let ci = 0; ci < appear.length; ci++) {
          rawEnd = Math.max(rawEnd, appear[ci] + Math.max(60, charDelayMs(offset + ci)));
        }
      }
    }
    const budget = Math.max(1, (screenDurationMs - initialDelay) * (1 - REST_FRACTION));
    const f = rawEnd > budget ? budget / rawEnd : 1;

    let last = -1;
    for (const line of schedule.out) {
      for (const { offset, appear } of line) {
        for (let ci = 0; ci < appear.length; ci++) {
          if (t >= appear[ci] * f) last = Math.max(last, offset + ci);
        }
      }
    }
    return { fit: f, lastRevealed: last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, screenDurationMs, initialDelay, t]);

  const fullyTyped = schedule.totalChars > 0 && lastRevealed >= schedule.totalChars - 1;
  const isTyping = lastRevealed > -1 && !fullyTyped;

  // Blink as a cosine of time: solid while typing, blinking at rest. That
  // mirrors gsap's pause-while-typing behaviour, frame-deterministically.
  const blink = 0.5 + 0.5 * Math.cos((timeInMs / cursorCfg.blinkDuration) * Math.PI * 2);
  const cursorOpacity = isTyping ? 1 : blink;
  const cursorVisible = cursorCfg.show && !(cursorCfg.hideWhileTyping && isTyping);

  const renderCursor = (key: string, color: string) =>
    cursorVisible ? (
      <span
        key={key}
        style={{
          display: "inline-block",
          whiteSpace: "pre",
          color,
          opacity: cursorOpacity,
          marginLeft: fontSize * 0.04,
        }}
      >
        {cursorCfg.character}
      </span>
    ) : null;

  // THE ANCHOR. "center" centres each line's content, so a growing line pushes
  // outward in both directions and everything already typed slides — the
  // reference's behaviour. "left" pins the left edge so nothing typed ever
  // moves. Everything else about the two looks is identical.
  const justify = anchor === "center" ? "center" : "flex-start";

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
          fontSize,
          fontFamily,
          fontWeight: weight,
          fontStyle: italic ? "italic" : "normal",
          color: baseTextColor,
          lineHeight: lineSpacing,
          ...textEffectStyle(style),
        }}
      >
        {schedule.out.map((line, li) => (
          // dir="auto" so an Arabic caption lays out RTL and mixed text follows
          // the Unicode bidi algorithm.
          <div
            key={li}
            dir="auto"
            style={{
              display: "flex",
              justifyContent: justify,
              alignItems: "baseline",
              columnGap: `${fontSize * wordSpacing}px`,
              whiteSpace: "pre",
            }}
          >
            {line.map(({ chars, offset, appear, color }, wi) => (
              <span key={wi} style={{ display: "inline-block", whiteSpace: "pre", color }}>
                {chars.map((char, ci) => {
                  const start = appear[ci] * fit;
                  const dur = Math.max(40, charDelayMs(offset + ci) * fit);
                  const eased = interpolate(t, [start, start + dur], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easingFn,
                  });
                  const gi = offset + ci;
                  return (
                    <React.Fragment key={ci}>
                      <span
                        style={{
                          display: "inline-block",
                          whiteSpace: "pre",
                          opacity: Math.min(1, Math.max(0, eased)),
                          // A character that has not landed yet must take up NO
                          // width, or the line would be pre-spaced to its final
                          // size and the centre anchor could not travel.
                          ...(eased <= 0 ? { display: "none" } : null),
                        }}
                      >
                        {char}
                      </span>
                      {gi === lastRevealed ? renderCursor(`cursor-${gi}`, color) : null}
                    </React.Fragment>
                  );
                })}
              </span>
            ))}
            {/* Before anything is typed the cursor sits alone on the first line. */}
            {li === 0 && lastRevealed === -1
              ? renderCursor("cursor-start", baseTextColor)
              : null}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Typewriter: one <Sequence> per screen from the caption document, each typing
 * its own text out character by character.
 */
export const PageTypewriter: React.FC<CaptionStyleProps> = ({ captions = [], segments }) => {
  const { fps, durationInFrames } = useVideoConfig();

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
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={dur}
            name={`Caption ${i + 1}`}
          >
            <TypewriterSegment
              lines={block.lines}
              startMs={block.startMs}
              durationInFrames={dur}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
