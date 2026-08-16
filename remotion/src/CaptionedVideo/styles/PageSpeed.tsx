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
import type { CaptionStyleProps, EnrichedSegment, EnrichedWord, WordColor } from "./types";
import { captionedVideoSchema } from "../index";
import {
  fontSlotSchema,
  useFontSlot,
  effectiveWeight,
  type FontSlot,
  type ResolvedFont,
} from "./font-slot";
// The SHARED easing control, so this template offers the same curve choices as
// every other one instead of hard-coding its own.
import {
  easingSlotSchema,
  makeOpacityEasing,
  type EasingSlot,
} from "./easing-slot";

// ---------------------------------------------------------------------------
// SPEED — the fast-cut viral look: heavy ALL-CAPS display type in the middle of
// the frame, words appearing ONE AT A TIME, coloured by MEANING.
//
// Reverse-engineered from remotion/public/speed (two reels, 1080x1440 @ 60fps).
// Measuring this one was harder than the sticker templates: the camera never
// stops moving, the grade pushes the footage into the same reds and greens as
// the captions, and there is no opaque plate behind the text to anchor on. The
// numbers below come from estimating the background PER COLUMN from rows above
// and below the glyph band IN THE SAME FRAME, which survives camera motion, and
// reading alpha off whichever channel separates the text (blue, for yellow or
// white text over a pale wall).
//
//   * WORD-BY-WORD BUILD. Each word fades in on its own timestamp; earlier
//     words stay put. Measured over 8 frames at the reference 60fps = 133ms,
//     DECELERATING: 0.26 / 0.39 / 0.71 / 0.78 / 0.86 / 0.93 / 0.99 / 1.0
//     (mean of the REASON and NAME? entrances, which both take 8 frames).
//   * A SLOW POP, BUT A SMALL ONE. The scale is real and about 2%: measured on
//     the glyph CORES (thresholded above the glow so it is the text, not the
//     halo) the span goes 286 -> 291px across the entrance. It is NOT a spring
//     and NOT an overshoot — the outer ink box appears to grow 34% in height,
//     but that is the GLOW blooming in, and letter PITCH (which a glow cannot
//     move) holds at 201-204px throughout. So: a 2% grow on the same curve and
//     the same window as the fade.
//   * The curve fits the shared easing slot at `ease-out` strength 2. The
//     slot's own DEFAULT, `smooth`, is badly wrong here — it reaches 0.66 one
//     frame in where the reference is at 0.36 — so this template sets easing
//     explicitly.
//   * THE OUT IS A HARD CUT, not a fade: measured 0.88 -> 0.00 in one frame.
//   * COLOUR IS PER PHRASE AND CARRIES MEANING, from a FOUR-COLOUR palette:
//     white base, YELLOW for the normal highlight, GREEN for good things, RED
//     for bad things, and RED WITH A WHITE OUTLINE for a surprise. The unit is
//     a contiguous run — "DESTROY YOU", "SOUTH DAKOTA" — or a whole line, not
//     a lone word, and nearly every caption carries one. Claude assigns the
//     role in the enrich pass (EnrichedWord.color); this file only maps role ->
//     colour, so re-palletting never needs a model re-run, and `varyAccents`
//     keeps two consecutive captions from wearing the same one.
//   * A LINE WAITS FOR THE LINE ABOVE IT to finish building before it starts.
//   * PUNCTUATION KEEPS THE BASE COLOUR even when its word is coloured —
//     "NAME" is yellow but its "?" is white, "TIM" is green but its quotes are
//     white. Small detail, very visible.
// ---------------------------------------------------------------------------

export const speedSchema = captionedVideoSchema.extend({
  // === LAYOUT ===============================================================
  layout: z.object({
    // A PERCENTAGE OF FRAME WIDTH, so the look holds at 9:16 and at the
    // reference's own 3:4 alike.
    fontSizePct: z.number().min(2).max(20).step(0.01),
    captionScale: z.number().min(0.5).max(2).step(0.05),
    letterSpacing: z.number().min(-0.05).max(0.4).step(0.01), // em, this look tracks wide
    wordSpacing: z.number().min(0).max(1).step(0.01), // em
    lineSpacing: z.number().min(0.8).max(2).step(0.05),
    positionX: z.number().min(0).max(100).step(1),
    positionY: z.number().min(0).max(100).step(1),
    italic: z.boolean(),
    // Slant in DEGREES, applied as a skew, rather than relying on
    // font-style:italic. The Bold Font ships no italic face, so the browser
    // would synthesise its own oblique at a fixed angle we cannot tune — and
    // the references clearly slant, but I could not measure the angle
    // reliably (a deskew search returned 6deg on a KNOWN-upright control, so
    // the method was not trustworthy on this footage). Exposing the angle means
    // it can be set by eye against the reference instead of guessed.
    slantDeg: z.number().min(0).max(25).step(0.5),
  }),

  // === TEXT =================================================================
  text: z.object({
    font: fontSlotSchema, // The Bold Font, shipped in public/fonts
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
  }),

  // === PALETTE — the base colour plus an EDITABLE LIST of accents ===========
  // A list rather than fixed fields so the user can add their own colours and
  // switch the defaults off. Each entry carries only what makes it look
  // different: a fill and an outline. Animation and glow are deliberately NOT
  // here — every word fades, pops and glows identically whatever colour it is.
  palette: z.object({
    base: zColor(),
    accents: z.array(
      z.object({
        // Stable key stored on the word. Claude emits key/positive/negative/
        // shock; anything else is user-added.
        id: z.string(),
        label: z.string(),
        // OFF renders words tagged with it as base. The tag stays on the word,
        // so switching it back on restores them.
        enabled: z.boolean(),
        color: zColor(),
        strokeWidth: z.number().min(0).max(16).step(0.5),
        strokeColor: zColor(),
      }),
    ),
  }),

  // === EFFECTS — the dark shadow under the type + a glow in its own colour ===
  effects: z.object({
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
    // The glow takes the WORD's colour, so red text glows red. Only its
    // strength is a prop.
    glow: z.object({
      enabled: z.boolean(),
      blur: z.number().min(0).max(60).step(1),
      opacity: z.number().min(0).max(1).step(0.05),
    }),
  }),

  // === MOTION — a fade per word, and the gap between captions ================
  motion: z.object({
    wordFadeMs: z.number().min(0).max(600).step(5),
    // THE SLOW POP. Deliberately DECOUPLED from the fade: the scale runs on its
    // own duration so it can keep easing out after the word is fully opaque,
    // which is what reads as "slow popping in" rather than a snap.
    //   popFrom — the scale a word starts at (0.94 = grows 6% into place)
    //   popMs   — how long the growth takes; longer than wordFadeMs = slower pop
    // The measured value off the reference is only ~2% (glyph-core span 286 ->
    // 291px). These defaults are deliberately MORE than that, tuned by eye
    // rather than measured, because the measured 2% is nearly invisible.
    popFrom: z.number().min(0.5).max(1).step(0.005),
    popMs: z.number().min(0).max(1200).step(5),
    easing: easingSlotSchema,
    outFadeMs: z.number().min(0).max(400).step(5),
    gapMs: z.number().min(0).max(500).step(10), // empty screen between captions
  }),
});

export type SpeedStyle = {
  layout: {
    fontSizePct: number;
    captionScale: number;
    letterSpacing: number;
    wordSpacing: number;
    lineSpacing: number;
    positionX: number;
    positionY: number;
    italic: boolean;
    slantDeg: number;
  };
  text: { font: FontSlot; weight: number; uppercase: boolean };
  palette: {
    base: string;
    accents: {
      id: string;
      label: string;
      enabled: boolean;
      color: string;
      strokeWidth: number;
      strokeColor: string;
    }[];
  };
  effects: {
    shadow: { enabled: boolean; color: string; blur: number; offsetY: number };
    glow: { enabled: boolean; blur: number; opacity: number };
  };
  motion: {
    wordFadeMs: number;
    popFrom: number;
    popMs: number;
    easing: EasingSlot;
    outFadeMs: number;
    gapMs: number;
  };
};

// Defaults ARE the measurements taken off the reference reels.
export const SPEED_DEFAULTS: SpeedStyle = {
  layout: {
    // Anchored on CAP HEIGHT (48px on a 1080-wide frame) rather than on line
    // widths: 48 / 0.735 cap-per-em = 67.8px = 6.28% of the frame width.
    // Solving the two line widths *exactly* instead lets the cap height drift
    // 17% and demands an implausible 0.38em of tracking — anchoring on the
    // height and letting the widths land within ~2% is the honest fit.
    fontSizePct: 6.28,
    captionScale: 1,
    // Fitted at that size against two reference lines of different lengths —
    // "MY MAN BE CAREFUL" (810px) and "YOU KNOW" (416px), measured on a frame
    // with a DARK background so the glyph mask is unambiguous. They imply
    // 0.198em and 0.166em; this is the mean, and it reproduces both within 2%.
    // (An earlier fit off a pale-wall frame was wrong: the near-white wall
    // passed the "white text" test and inflated every line width.)
    letterSpacing: 0.18,
    wordSpacing: 0.3,
    lineSpacing: 1.12,
    positionX: 50,
    positionY: 47, // the references sit mid-frame, not under the chin
    // The 0-3s section of speed 1 ("BEG YOUR PARDON?", "WHO CREATED / THE WORLD
    // WIDE WEB") is clearly oblique. Other sections are upright, so the
    // reference mixes — this defaults to the slanted look.
    italic: true,
    slantDeg: 12,
  },
  text: {
    // The client-supplied display face, shipped in public/fonts. A single
    // static weight, so the slot renders it at its natural weight (no faux
    // bold). `family` is only the fallback if the file ever goes missing.
    font: { family: "Montserrat", custom: "THEBOLDFONT-FREEVERSION.otf" },
    weight: 700,
    uppercase: true,
  },
  palette: {
    base: "#ffffff",
    // FOUR colours plus the outlined variant. The references also show magenta
    // and cyan; they are deliberately absent so a video reads as one system.
    // Only `shock` carries an outline — that IS what makes it the surprise beat.
    accents: [
      { id: "key", label: "Yellow — key term", enabled: true, color: "#ffe000", strokeWidth: 0, strokeColor: "#ffffff" },
      { id: "positive", label: "Green — good", enabled: true, color: "#22e34a", strokeWidth: 0, strokeColor: "#ffffff" },
      { id: "negative", label: "Red — bad", enabled: true, color: "#ff1a1a", strokeWidth: 0, strokeColor: "#ffffff" },
      { id: "shock", label: "Red + outline — surprise", enabled: true, color: "#ff1a1a", strokeWidth: 6, strokeColor: "#ffffff" },
    ],
  },
  effects: {
    shadow: { enabled: true, color: "rgba(0,0,0,0.55)", blur: 12, offsetY: 6 },
    glow: { enabled: true, blur: 26, opacity: 0.55 },
  },
  motion: {
    // 8 frames at the reference 60fps. Measured by counting ink pixels above a
    // fixed threshold (monotonic in alpha, needs no background model) across two
    // separate single-word entrances, REASON and NAME?, which both take exactly
    // 8 frames from first pixel to settled. An earlier photometric estimate said
    // 5 frames / 85ms because its percentile estimator saturated early — at 85ms
    // the fade is over before the eye registers it, which is what "it has no
    // fading" actually was. Stored in MS so it holds at any frame rate.
    wordFadeMs: 133,
    // Measured is ~2% (popFrom 0.97) over the fade window. These are larger and
    // slower on purpose — a 2% pop over 133ms cannot be seen.
    popFrom: 0.94,
    popMs: 260,
    // FITTED, not picked: the measured ramp (0.36 / 0.65 / 0.82 / 0.90 / 1.0)
    // matches `ease-out` at strength 2 with rms 0.030. Note the slot's own
    // default, `smooth`, is badly wrong for this look — it reaches 0.66 after
    // one frame where the reference is at 0.36.
    easing: { type: "ease-out", strength: 2 },
    // The reference CUTS out: measured 0.88 -> 0.00 in a single frame. There is
    // no out-fade at all.
    outFadeMs: 0,
    gapMs: 100,
  },
};

const SpeedStyleContext = createContext<SpeedStyle>(SPEED_DEFAULTS);
export const SpeedStyleProvider = SpeedStyleContext.Provider;

const MIN_FIT_SCALE = 0.5;
// The widest a line may run before it is shrunk. `layout.mjs` derives this
// template's character budget from the same number — keep the two in step.
const FIT_WIDTH_FRACTION = 0.87;

// Leading/trailing punctuation and quote marks stay in the BASE colour even
// when the word itself is coloured — measured off the reference, where "NAME"
// is yellow but its "?" is white and "TIM" is green inside white quotes.
const PUNCT = /^([\p{Ps}\p{Pi}"'«“‘¿¡\-–—]*)(.*?)([\p{Pe}\p{Pf}"'»”’.,!?;:…\-–—]*)$/u;
const splitPunctuation = (text: string): [string, string, string] => {
  const m = PUNCT.exec(text);
  if (!m || !m[2]) return ["", text, ""];
  return [m[1] ?? "", m[2], m[3] ?? ""];
};

/**
 * Resolve a word's palette id to what it actually paints.
 *
 * An id that is missing from the palette, or whose entry is switched OFF,
 * falls back to BASE. That is what makes disabling a colour safe: the id stays
 * on the word, so switching the entry back on restores it untouched.
 */
const paintFor = (
  role: WordColor,
  palette: SpeedStyle["palette"],
): { fill: string; stroke: string | null; strokeWidth: number } => {
  const hit = palette.accents.find((a) => a.id === role && a.enabled);
  if (!hit) return { fill: palette.base, stroke: null, strokeWidth: 0 };
  return {
    fill: hit.color,
    stroke: hit.strokeWidth > 0 ? hit.strokeColor : null,
    strokeWidth: hit.strokeWidth,
  };
};

/**
 * Guarantee that CONSECUTIVE CAPTIONS never wear the same accent.
 *
 * Claude picks the role by meaning, but meaning alone clusters — a run of
 * excited lines all come out the same colour and the video stops feeling varied, which
 * is the opposite of what these edits do. So this walks each caption's accent
 * forward to the next unused one whenever it would repeat the caption before
 * it. Claude still decides WHICH PHRASE is accented and what it means; this
 * only breaks ties, and it is deterministic, so a render never flickers.
 *
 * Returns, per caption, the role each accented phrase should actually paint in.
 */
const varyAccents = (
  captionRoles: (WordColor | undefined)[][],
  enabledIds: string[],
): WordColor[][] => {
  let prev: WordColor | null = null;
  return captionRoles.map((roles) => {
    // The caption's own accent (the first non-base role Claude assigned).
    const own = roles.find((r) => r && r !== "base");
    if (!own) return roles.map(() => "base" as WordColor);
    let use: WordColor = own;
    // Only ever step onto a colour that is switched ON; with none enabled the
    // caption simply keeps what Claude picked and paintFor() renders it base.
    if (use === prev && enabledIds.length > 1) {
      const i = enabledIds.indexOf(String(use));
      use = enabledIds[(i + 1) % enabledIds.length];
    }
    prev = use;
    return roles.map((r) => (r && r !== "base" ? use : "base"));
  });
};

type SpeedLine = EnrichedWord[];

/** Renders ONE Speed caption: 1-2 lines whose words fade in as they are said. */
const SpeedSegment: React.FC<{
  lines: SpeedLine[];
  roles: WordColor[][];
  blockStartMs: number;
  endFadeStartFrame: number;
  fontSize: number;
  font: ResolvedFont;
}> = ({ lines, roles, blockStartMs, endFadeStartFrame, fontSize, font }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const style = useContext(SpeedStyleContext);

  const {
    captionScale, letterSpacing, wordSpacing, lineSpacing, positionX, positionY, italic, slantDeg,
  } = style.layout;
  const { uppercase, weight } = style.text;
  const { palette, effects, motion } = style;

  // makeOpacityEasing, NOT makeEasing: this curve drives OPACITY, and a
  // `bouncy` slot deliberately overshoots past 1, which is not a valid alpha.
  const easing = useMemo(() => makeOpacityEasing(motion.easing), [motion.easing]);
  const fadeFrames = Math.max(1, Math.round((motion.wordFadeMs / 1000) * fps));
  const outFrames = Math.max(1, Math.round((motion.outFadeMs / 1000) * fps));
  const popFrames = Math.max(1, Math.round((motion.popMs / 1000) * fps));

  // The whole caption fades OUT at the end of its window — a fast dip, then the
  // gap before the next caption is empty screen (the Sequence simply ends).
  const outOpacity = interpolate(frame, [endFadeStartFrame, endFadeStartFrame + outFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fontWeight = effectiveWeight(font, weight);

  // A line may not begin building until the line ABOVE it is complete. ASR
  // timestamps can overlap a line break slightly, which would start line 2 while
  // line 1 is still filling in and read as two things happening at once. This
  // gates each line on the last word of the previous one.
  const lineGateMs = useMemo(() => {
    const gates: number[] = [];
    let running = -Infinity;
    for (const line of lines) {
      gates.push(running);
      const last = line[line.length - 1];
      running = Math.max(running, last?.endMs ?? running);
    }
    return gates;
  }, [lines]);

  // Per-word opacity from its OWN spoken timestamp, so the caption builds up.
  // Eased 0..1 progress for a word, over an arbitrary window length. The fade
  // and the pop each get their own, so the scale can keep easing out after the
  // opacity has already arrived — that lag is what makes the pop read as slow.
  const wordProgress = (w: EnrichedWord, li: number, durationFrames: number): number => {
    const startMs = Math.max(w.startMs, lineGateMs[li] ?? -Infinity);
    const start = Math.max(0, Math.round(((startMs - blockStartMs) / 1000) * fps));
    return interpolate(frame, [start, start + Math.max(1, durationFrames)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
  };

  const shadowCss = effects.shadow.enabled
    ? `0 ${effects.shadow.offsetY}px ${effects.shadow.blur}px ${effects.shadow.color}`
    : "";

  // ---- PER-LINE FIT so a long line can never leave the frame ---------------
  // Measure each line's NATURAL width (offsetWidth is un-transformed, so a
  // scale never changes what we measure — stable, no oscillation) and shrink
  // only the lines that would overrun. The reference does the same: its
  // longest lines render visibly smaller (cap height 46px against 49px on a
  // short one). A delayRender holds the export until the first measurement
  // lands, so no frame paints unscaled.
  const avail = width * FIT_WIDTH_FRACTION;
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>(() => lines.map(() => 1));
  const [fitHandle] = useState(() => delayRender("Speed line fit"));
  const fitReleased = useRef(false);
  useLayoutEffect(() => {
    const next = lines.map((_, i) => {
      const el = lineRefs.current[i];
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
  }, [lines, avail, fontSize, letterSpacing, wordSpacing, fontWeight, fitHandle]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: `${positionX}%`,
          top: `${positionY}%`,
          width: "100%",
          // skewX LAST so the slant applies to the laid-out block rather than
          // to the positioning translate. Negative leans the tops to the right,
          // which is the direction the references slant.
          transform:
            `translate(-50%, -50%) scale(${captionScale})` +
            (italic && slantDeg > 0 ? ` skewX(-${slantDeg}deg)` : ""),
          transformOrigin: "center center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: font.fontFamily,
          fontWeight,
          // Skew rather than font-style, so the angle is ours to set. Combined
          // with the block transform below.
          fontStyle: "normal",
          fontSize,
          letterSpacing: `${letterSpacing}em`,
          textTransform: uppercase ? "uppercase" : "none",
          lineHeight: lineSpacing,
          opacity: outOpacity,
        }}
      >
        {lines.map((line, li) => (
          // dir="auto" so Arabic lays out RTL, Latin LTR, mixed by bidi.
          <div
            key={li}
            dir="auto"
            ref={(el) => {
              lineRefs.current[li] = el;
            }}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "baseline",
              columnGap: `${fontSize * wordSpacing}px`,
              whiteSpace: "pre",
              // `max-content` so the line sizes to its own text and the
              // measurement above is its NATURAL width; the scale below is what
              // keeps it inside the frame.
              width: "max-content",
              transform: (scales[li] ?? 1) < 1 ? `scale(${scales[li]})` : undefined,
              transformOrigin: "center center",
            }}
          >
            {line.map((w, wi) => {
              const p = wordProgress(w, li, fadeFrames);
              const popP = wordProgress(w, li, popFrames);
              const pop = motion.popFrom + (1 - motion.popFrom) * popP;
              const role = roles[li]?.[wi] ?? "base";
              const { fill, stroke, strokeWidth } = paintFor(role, palette);
              const [lead, core, tail] = splitPunctuation(w.text);
              // The glow is on EVERY word, in that word's own colour, so white
              // text glows white and red text glows red. Two stacked shadows
              // build the density the references have — one tight, one wide.
              const glow =
                effects.glow.enabled && effects.glow.opacity > 0
                  ? `0 0 ${Math.round(effects.glow.blur * 0.4)}px ${fill}, ` +
                    `0 0 ${effects.glow.blur}px ${fill}`
                  : "";
              const textShadow = [shadowCss, glow].filter(Boolean).join(", ");
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    opacity: p,
                    // The slow pop: same curve, same window as the fade.
                    transform: motion.popFrom < 1 ? `scale(${pop.toFixed(4)})` : undefined,
                    transformOrigin: "center center",
                    textShadow: textShadow || undefined,
                  }}
                >
                  {/* Punctuation stays BASE colour; only the word body takes
                      the semantic colour. */}
                  {lead ? <span style={{ color: palette.base }}>{lead}</span> : null}
                  <span
                    style={{
                      color: fill,
                      WebkitTextStroke: stroke ? `${strokeWidth}px ${stroke}` : undefined,
                      paintOrder: "stroke fill",
                    }}
                  >
                    {core}
                  </span>
                  {tail ? <span style={{ color: palette.base }}>{tail}</span> : null}
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
 * Speed style: one <Sequence> per caption from the caption document. Each
 * caption's words fade in on their own timestamps, the caption dips out at the
 * end of its window, and a short gap of empty screen separates it from the
 * next — exactly as measured off the references.
 */
export const PageSpeed: React.FC<CaptionStyleProps> = ({ segments }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const style = useContext(SpeedStyleContext);

  // This template reads the caption document DIRECTLY rather than going through
  // the shared enrichedToBlocks helper, because it needs each word's semantic
  // `color`, which the shared KineticWord shape does not carry.
  const blocks = useMemo(() => {
    const segs: EnrichedSegment[] = segments ?? [];
    const raw = segs
      .map((seg) => {
        const lines = (seg.lines ?? []).map((l) => l.words ?? []).filter((l) => l.length > 0);
        const flat = lines.flat();
        return { lines, startMs: flat[0]?.startMs ?? 0 };
      })
      .filter((b) => b.lines.length > 0);

    // The role Claude assigned, per word, FLATTENED per caption. Documents
    // written before per-word colour existed carry only the boolean
    // `emphasis`, so fall back to it — an emphasised word becomes the
    // caption's accent, everything else base. That keeps the template usable
    // on existing captions without a Claude re-run.
    const perCaption = raw.map((b) =>
      b.lines.flat().map((w): WordColor | undefined => w.color ?? (w.emphasis ? "key" : "base")),
    );
    const enabledIds = style.palette.accents.filter((a) => a.enabled).map((a) => a.id);
    const varied = varyAccents(perCaption, enabledIds);

    // Re-shape the flat roles back onto the caption's lines.
    return raw.map((b, i) => {
      let k = 0;
      const roles = b.lines.map((line) => line.map(() => varied[i][k++] ?? "base"));
      return { ...b, roles };
    });
  }, [segments, style.palette.accents]);

  const font = useFontSlot(style.text.font);
  const fontSize = (width * style.layout.fontSizePct) / 100;
  const msToFrame = (ms: number) => Math.round((ms / 1000) * fps);
  const gapFrames = Math.round((style.motion.gapMs / 1000) * fps);
  const outFrames = Math.max(1, Math.round((style.motion.outFadeMs / 1000) * fps));

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {blocks.map((block, i) => {
        const startFrame = i === 0 ? 0 : msToFrame(block.startMs);
        const next = blocks[i + 1];
        // End the caption `gapMs` BEFORE the next one starts, so the screen is
        // genuinely empty in between — the beat the references have.
        const endFrame = next ? msToFrame(next.startMs) - gapFrames : durationInFrames;
        const segDurationInFrames = Math.max(1, endFrame - startFrame);
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segDurationInFrames}
            name={`Caption ${i + 1}`}
          >
            <SpeedSegment
              lines={block.lines}
              roles={block.roles}
              blockStartMs={block.startMs}
              endFadeStartFrame={Math.max(0, segDurationInFrames - outFrames)}
              fontSize={fontSize}
              font={font}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
