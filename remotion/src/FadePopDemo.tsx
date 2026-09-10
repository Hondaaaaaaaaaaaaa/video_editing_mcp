import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import {
  FONT_FAMILIES,
  resolveFontFamily,
  type FontFamilyName,
} from "./CaptionedVideo/styles/fonts";

// ---------------------------------------------------------------------------
// TEXT MOTION LAB — four ways a caption can "grow", on a plain background, with
// every value exposed as a control. Built to settle what the effect in
// public/References/Fade + pop/fade  in .mp4 should be CALLED and which of
// these the user actually wants.
//
// The four growths are separate, independent knobs, because they are separate
// things and only measurement tells them apart:
//
//   TRACK  letter-spacing grows. Gaps widen, GLYPHS DO NOT CHANGE SIZE. The
//          line pushes outward from its centre. (This is what the reference
//          measures as: cap height 21.74 -> 21.98 px while the line span went
//          +8.5 %, left edge -12.6 px, right edge +12.0 px, centre unmoved.)
//   ZOOM   the whole caption block scales about its centre. Everything grows
//          together — cap height, glyph widths AND gaps. A real zoom.
//   POP    each WORD scales up as it fades in, then stops. Per word, not per
//          caption; it is an entrance, not an ongoing growth.
//   (none) opacity only.
//
// And the growth can run two ways:
//
//   SETTLE      ease out to a target over `durationMs`, then hold still. This
//               is what the reference does — it is done growing after ~1 s.
//   CONTINUOUS  keep growing at a fixed rate for as long as the sentence is on
//               screen, so it is still moving when the next sentence takes over.
//
// The demo plays a SEQUENCE of sentences so "continuous until the next sentence
// appears" is actually visible.
//
// Reference geometry, measured off the 720x720 source: cap height 22 px =
// 3.06 % of frame width (em ~4.25 %); two lines at a 36 px baseline pitch
// (1.18 em); white bold OBLIQUE caps, thin dark outline, soft drop shadow;
// per-word fade in ~333 ms linear; whole-caption fade out ~430 ms.
// ---------------------------------------------------------------------------

export const growthKindSchema = z.enum(["none", "track", "zoom", "track+zoom"]);
export const growthModeSchema = z.enum(["settle", "continuous"]);

export const fadePopDemoSchema = z.object({
  // Each entry is one sentence; "|" splits it into two lines.
  sentences: z.array(z.string()),

  background: zColor(),

  text: z.object({
    fontFamily: z.enum(FONT_FAMILIES),
    weight: z.number().min(100).max(900).step(100),
    uppercase: z.boolean(),
    color: zColor(),
    // The reference is a bold OBLIQUE grotesque. A skew rather than a
    // synthesised italic, so the angle is an exact, tunable number.
    slantDeg: z.number().min(0).max(25).step(0.5),
    // Glyph height as a % of FRAME WIDTH, so the look holds at any resolution.
    fontSizePct: z.number().min(1).max(20).step(0.01),
    lineSpacing: z.number().min(0.8).max(2).step(0.01),
    positionY: z.number().min(0).max(100).step(1),
  }),

  // === HOW THE CAPTION GROWS while it is on screen ===
  growth: z.object({
    kind: growthKindSchema,
    mode: growthModeSchema,

    // TRACK: letter-spacing, in em. Glyph size is untouched.
    trackFromEm: z.number().min(-0.05).max(0.8).step(0.005),
    trackToEm: z.number().min(-0.05).max(0.8).step(0.005),
    /** continuous mode only: em of tracking added per second, forever. */
    trackRatePerSec: z.number().min(0).max(0.5).step(0.005),

    // ZOOM: scale of the whole block about its centre. 1 = actual size.
    zoomFrom: z.number().min(0.5).max(1.5).step(0.005),
    zoomTo: z.number().min(0.5).max(1.5).step(0.005),
    /** continuous mode only: scale added per second, forever. */
    zoomRatePerSec: z.number().min(0).max(1).step(0.005),

    /** settle mode only: how long the ramp takes before it stops. */
    durationMs: z.number().min(0).max(6000).step(10),
    /** 1 = linear. Higher = more front-loaded. The reference sits near 2. */
    easeOutStrength: z.number().min(1).max(5).step(0.1),
  }),

  // === THE PER-WORD ENTRANCE ===
  word: z.object({
    fadeInMs: z.number().min(0).max(1500).step(1),
    // 0 = every word of the caption arrives together, i.e. a whole-caption
    // fade rather than a per-word one.
    intervalMs: z.number().min(0).max(2000).step(10),
    /**
     * Per-WORD pop: the scale a word starts at and grows from as it fades in,
     * over the same window as its fade. 1 = no pop, which is what the reference
     * measures (cap height flat to 0.1 px through a word's whole fade-in).
     */
    popFrom: z.number().min(0.3).max(1.5).step(0.01),
  }),

  timing: z.object({
    startMs: z.number().min(0).max(5000).step(10),
    /** How long each sentence owns the screen, entrance included. */
    sentenceMs: z.number().min(500).max(12000).step(50),
    fadeOutMs: z.number().min(0).max(2000).step(1),
  }),

  effects: z.object({
    outline: z.object({
      enabled: z.boolean(),
      widthPx: z.number().min(0).max(6).step(0.1),
      color: zColor(),
    }),
    shadow: z.object({
      enabled: z.boolean(),
      color: zColor(),
      blur: z.number().min(0).max(40).step(1),
      offsetY: z.number().min(0).max(30).step(1),
    }),
  }),

  /** Draws a centre line and the caption's box, to make the motion legible. */
  showGuides: z.boolean(),
});

export type FadePopDemoProps = z.infer<typeof fadePopDemoSchema>;

const SENTENCES = ["And you wanna|volunteer to be next?", "It doesn't matter.|Let's just go."];

export const FADE_POP_DEMO_DEFAULTS: FadePopDemoProps = {
  sentences: SENTENCES,
  background: "#101d2b", // the flat navy the cleanest reference caption sits on
  text: {
    fontFamily: "Inter",
    weight: 800,
    uppercase: true,
    color: "#ffffff",
    slantDeg: 12,
    fontSizePct: 4.25, // 3.06 % measured cap height / 0.72 cap-to-em
    lineSpacing: 1.18, // 36 px baseline pitch over a 30.6 px em
    positionY: 50,
  },
  growth: {
    kind: "track",
    mode: "settle",
    // 0.13 -> 0.20 em takes the line from 465.5 px to 505.5 px, +8.6 %, which
    // is the +8.9 % measured on the reference.
    trackFromEm: 0.13,
    trackToEm: 0.2,
    trackRatePerSec: 0.05,
    zoomFrom: 1,
    zoomTo: 1,
    zoomRatePerSec: 0.06,
    durationMs: 950, // 29 frames at 30 fps, measured
    easeOutStrength: 2,
  },
  word: {
    fadeInMs: 333, // 10 frames at 30 fps, measured
    intervalMs: 260,
    popFrom: 1, // measured: no pop
  },
  timing: { startMs: 300, sentenceMs: 2600, fadeOutMs: 430 },
  effects: {
    outline: { enabled: true, widthPx: 1, color: "rgba(0,0,0,0.85)" },
    shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 10, offsetY: 3 },
  },
  showGuides: false,
};

/** The four presets the compositions below are built from. */
export const PRESETS = {
  /** A — opacity only. The control case: nothing grows. */
  fadeOnly: {
    growth: { kind: "none" as const, trackFromEm: 0.18, trackToEm: 0.18, zoomFrom: 1, zoomTo: 1 },
    word: { popFrom: 1 },
  },
  /** B — what the reference actually measures as: letter gaps widen, glyphs don't. */
  trackOut: {
    growth: { kind: "track" as const, trackFromEm: 0.13, trackToEm: 0.2, zoomFrom: 1, zoomTo: 1 },
    word: { popFrom: 1 },
  },
  /** C — a real zoom: the whole caption scales about its centre, and keeps going. */
  zoomOut: {
    growth: {
      kind: "zoom" as const,
      mode: "continuous" as const,
      trackFromEm: 0.18,
      trackToEm: 0.18,
      zoomFrom: 0.92,
      zoomTo: 1.08,
      zoomRatePerSec: 0.06,
    },
    word: { popFrom: 1 },
  },
  /** D — per-word pop: each word scales up as it fades in, then stops. */
  wordPop: {
    growth: { kind: "none" as const, trackFromEm: 0.18, trackToEm: 0.18, zoomFrom: 1, zoomTo: 1 },
    word: { popFrom: 0.72 },
  },
};

/** Builds a full prop object from a preset patch. */
export const preset = (p: (typeof PRESETS)[keyof typeof PRESETS]): FadePopDemoProps => ({
  ...FADE_POP_DEMO_DEFAULTS,
  growth: { ...FADE_POP_DEMO_DEFAULTS.growth, ...p.growth },
  word: { ...FADE_POP_DEMO_DEFAULTS.word, ...p.word },
});

/** One line of one sentence: tracked out from its centre, words fading on cue. */
const Line: React.FC<{
  words: string[];
  wordIndexOffset: number;
  trackingEm: number;
  props: FadePopDemoProps;
  localMs: number;
}> = ({ words, wordIndexOffset, trackingEm, props, localMs }) => {
  const { slantDeg, uppercase } = props.text;
  const { outline } = props.effects;
  const { fadeInMs, intervalMs, popFrom } = props.word;

  return (
    <div
      style={{
        // CSS puts tracking AFTER every character, the last one included, which
        // would drift a centred line rightward by half the tracking as it grows.
        // Pulling that final gap back off keeps the CENTRE fixed — which is what
        // the reference does (centre 360.2 px, unmoved through the whole ramp).
        marginRight: `${-trackingEm}em`,
        letterSpacing: `${trackingEm}em`,
        whiteSpace: "pre",
      }}
    >
      {words.map((word, i) => {
        const at = (wordIndexOffset + i) * intervalMs;
        const p = interpolate(localMs, [at, at + Math.max(1, fadeInMs)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const pop = popFrom + (1 - popFrom) * p;
        return (
          <span key={i} style={{ opacity: p }}>
            <span
              style={{
                display: "inline-block",
                // The oblique, plus the per-word pop. Skewing the WORD rather
                // than the row leaves the tracking gaps upright, exactly as a
                // real oblique face does.
                transform: `skewX(${-slantDeg}deg)${popFrom === 1 ? "" : ` scale(${pop.toFixed(4)})`}`,
                transformOrigin: "center center",
                // The outline lives HERE, on the same element as the transform,
                // and paints UNDER the fill. On an ancestor it slashed diagonal
                // cuts through the glyphs: -webkit-text-stroke paints over the
                // fill by default, so half its width ate into the letterforms.
                ...(outline.enabled
                  ? {
                      WebkitTextStroke: `${outline.widthPx}px ${outline.color}`,
                      paintOrder: "stroke fill" as const,
                    }
                  : {}),
              }}
            >
              {uppercase ? word.toUpperCase() : word}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
};

/** One sentence, with its own growth ramp running from its own start. */
const Sentence: React.FC<{ text: string; localMs: number; props: FadePopDemoProps }> = ({
  text,
  localMs,
  props,
}) => {
  const { width } = useVideoConfig();
  const { text: t, growth, timing, effects, showGuides } = props;
  const fontSize = (width * t.fontSizePct) / 100;

  const [l1, l2 = ""] = text.split("|");
  const words1 = l1.split(/\s+/).filter(Boolean);
  const words2 = l2.split(/\s+/).filter(Boolean);

  // --- the growth ramp -----------------------------------------------------
  // settle: ease out to the target over durationMs, then hold.
  // continuous: a constant rate that never stops, so the caption is still
  // growing when the next sentence takes the screen.
  let trackingEm: number;
  let zoom: number;
  if (growth.mode === "continuous") {
    const sec = Math.max(0, localMs) / 1000;
    trackingEm = growth.trackFromEm + growth.trackRatePerSec * sec;
    zoom = growth.zoomFrom + growth.zoomRatePerSec * sec;
  } else {
    const linear = interpolate(localMs, [0, Math.max(1, growth.durationMs)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const eased = 1 - Math.pow(1 - linear, growth.easeOutStrength);
    trackingEm = growth.trackFromEm + (growth.trackToEm - growth.trackFromEm) * eased;
    zoom = growth.zoomFrom + (growth.zoomTo - growth.zoomFrom) * eased;
  }
  const useTrack = growth.kind === "track" || growth.kind === "track+zoom";
  const useZoom = growth.kind === "zoom" || growth.kind === "track+zoom";
  if (!useTrack) trackingEm = growth.trackFromEm;
  if (!useZoom) zoom = 1;

  // --- the exit: the whole sentence fades out at the end of its slot --------
  const exitStart = timing.sentenceMs - timing.fadeOutMs;
  const opacity = interpolate(
    localMs,
    [exitStart, exitStart + Math.max(1, timing.fadeOutMs)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", top: `${t.positionY - 50}%` }}
    >
      <div
        style={{
          textAlign: "center",
          fontFamily: resolveFontFamily(t.fontFamily as FontFamilyName),
          fontWeight: t.weight,
          fontSize,
          lineHeight: t.lineSpacing,
          color: t.color,
          textShadow: effects.shadow.enabled
            ? `0 ${effects.shadow.offsetY}px ${effects.shadow.blur}px ${effects.shadow.color}`
            : "none",
          opacity,
          // The ZOOM. On the block, about its centre, so cap height and glyph
          // widths grow with the gaps — which is exactly what TRACK does not do.
          transform: `scale(${zoom.toFixed(4)})`,
          transformOrigin: "center center",
          outline: showGuides ? "1px solid rgba(255,120,120,0.6)" : undefined,
        }}
      >
        <Line
          words={words1}
          wordIndexOffset={0}
          trackingEm={trackingEm}
          props={props}
          localMs={localMs}
        />
        {words2.length ? (
          <Line
            words={words2}
            wordIndexOffset={words1.length}
            trackingEm={trackingEm}
            props={props}
            localMs={localMs}
          />
        ) : null}
      </div>
      {showGuides ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(255,120,120,0.5)",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const FadePopDemo: React.FC<FadePopDemoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;
  const { sentences, background, timing } = props;

  // Sentences take the screen in turn; each gets its own clock starting at 0,
  // so its growth ramp restarts with it.
  const i = Math.floor(Math.max(0, timeMs - timing.startMs) / timing.sentenceMs);
  const idx = Math.min(Math.max(0, i), sentences.length - 1);
  const localMs = timeMs - timing.startMs - idx * timing.sentenceMs;

  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      {localMs >= 0 ? (
        <Sentence key={idx} text={sentences[idx]} localMs={localMs} props={props} />
      ) : null}
    </AbsoluteFill>
  );
};
