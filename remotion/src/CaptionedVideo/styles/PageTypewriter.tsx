import React, { createContext, useContext } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { fitText } from "@remotion/layout-utils";
import type { CaptionStyleProps } from "./types";
import { fontFamily } from "../load-font";
import { captionedVideoSchema } from "../index";

// ---------------------------------------------------------------------------
// User-customizable props. These are a frame-based reimplementation of the
// React Bits "TextType" web component's FEATURES — none of its setTimeout /
// gsap / useState timing is used, because that is non-deterministic and breaks
// in Remotion rendering. Everything here is a pure function of useCurrentFrame.
//
// Studio renders each prop as a control: number -> slider, boolean -> toggle,
// string -> text field, zColor() -> color picker, array -> add/remove list.
// Typewriter has its own schema; Classic / TheCine / Highlight are unaffected.
// ---------------------------------------------------------------------------
export const typewriterSchema = captionedVideoSchema.extend({
  // ms per character. Frame-based: drives how far each word's letters step
  // back from when the word is spoken (so typing stays synced to the audio).
  typingSpeed: z.number().min(10).max(400).step(5),
  // ms to wait (within each caption page) before the first letter appears.
  initialDelay: z.number().min(0).max(3000).step(50),

  // --- cursor ---
  showCursor: z.boolean(),
  // Any string: "_", "|", ".", "▮", emoji … shown trailing the typed text.
  cursorCharacter: z.string(),
  // ms for one full blink (fade out + back in). Driven by cos(frame).
  cursorBlinkDuration: z.number().min(100).max(2000).step(10),
  // Hide the cursor while letters are actively appearing; show it at rest.
  hideCursorWhileTyping: z.boolean(),

  // --- per-character speed variation (deterministic, NOT Math.random) ---
  variableSpeed: z.boolean(),
  variableSpeedMin: z.number().min(10).max(400).step(5), // ms/char fastest
  variableSpeedMax: z.number().min(10).max(400).step(5), // ms/char slowest

  // Cycled per word (sentence-ish). Empty -> plain white. Each entry is a
  // color picker in Studio.
  textColors: z.array(zColor()),

  // How each individual letter eases in once it appears (dropdown), and how
  // strong/snappy that curve is (slider). easingSpeed feeds the easing
  // function: it's the poly exponent for "smooth" and the overshoot for
  // "bouncy" (ignored for "linear").
  easing: z.enum(["linear", "smooth", "bouncy"]),
  easingSpeed: z.number().min(1).max(6).step(0.1),
});

export type TypewriterEasing = "linear" | "smooth" | "bouncy";

export type TypewriterStyle = {
  typingSpeed: number;
  initialDelay: number;
  showCursor: boolean;
  cursorCharacter: string;
  cursorBlinkDuration: number;
  hideCursorWhileTyping: boolean;
  variableSpeed: boolean;
  variableSpeedMin: number;
  variableSpeedMax: number;
  textColors: string[];
  easing: TypewriterEasing;
  easingSpeed: number;
};

// Defaults double as the context fallback if a page is ever rendered without a
// provider (isolation / tests) and as Root.tsx's defaultProps.
export const TYPEWRITER_DEFAULTS: TypewriterStyle = {
  typingSpeed: 60,
  initialDelay: 0,
  showCursor: true,
  cursorCharacter: "_",
  cursorBlinkDuration: 530,
  hideCursorWhileTyping: false,
  variableSpeed: false,
  variableSpeedMin: 40,
  variableSpeedMax: 120,
  textColors: ["#ffffff", "#ffd400", "#ff8a00"],
  easing: "linear",
  easingSpeed: 3,
};

// Carries the schema props from Root down to the style without touching the
// shared engine (CaptionedVideo / SubtitlePage).
const TypewriterStyleContext = createContext<TypewriterStyle>(TYPEWRITER_DEFAULTS);
export const TypewriterStyleProvider = TypewriterStyleContext.Provider;

// ---------------------------------------------------------------------------
// CONFIG — non-prop tuning.
// ---------------------------------------------------------------------------
const DESIRED_FONT_SIZE = 120;
const FONT_WEIGHT = 800;

// Builds the per-letter easing function from the `easing` TYPE (dropdown) and
// the `easingSpeed` SLIDER (how strong/snappy the curve is). For "smooth",
// easingSpeed is the polynomial exponent (1 = linear … 6 = very snappy); for
// "bouncy" it's the back-overshoot amount; "linear" ignores it.
const makeEasing = (type: TypewriterEasing, easingSpeed: number): ((input: number) => number) => {
  switch (type) {
    case "smooth":
      return Easing.out(Easing.poly(easingSpeed));
    case "bouncy":
      return Easing.out(Easing.back(easingSpeed));
    case "linear":
    default:
      return Easing.linear;
  }
};

// Deterministic pseudo-random in [0,1) from an integer index. Replaces
// Math.random() from the web component so the same frame always renders the
// same per-character speed — required for correct Remotion (re)rendering.
const hash01 = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Typewriter style (frame-based rebuild of React Bits "TextType").
 *
 * Within each caption page the text types out letter-by-letter, each word
 * finishing roughly as it's spoken. `typingSpeed` (ms/char) sets the spacing
 * between consecutive letters; `variableSpeed` jitters that per character
 * deterministically. A customizable cursor (`cursorCharacter`) trails the last
 * typed letter and blinks via cos(frame) over `cursorBlinkDuration`. Words
 * cycle through `textColors`. All timing is a pure function of the current
 * frame — no setTimeout/gsap/useState.
 */
export const PageTypewriter: React.FC<CaptionStyleProps> = ({ page }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  const {
    typingSpeed,
    initialDelay,
    showCursor,
    cursorCharacter,
    cursorBlinkDuration,
    hideCursorWhileTyping,
    variableSpeed,
    variableSpeedMin,
    variableSpeedMax,
    textColors,
    easing,
    easingSpeed,
  } = useContext(TypewriterStyleContext);

  const easingFn = makeEasing(easing, easingSpeed);

  // Typing clock for this page (shifted by the initial delay).
  const t = timeInMs - initialDelay;

  // Per-character interval (ms). Constant `typingSpeed`, or deterministically
  // varied within [min,max] keyed off the character's global index.
  const charDelayMs = (globalIndex: number): number => {
    if (!variableSpeed) {
      return typingSpeed;
    }
    const lo = Math.min(variableSpeedMin, variableSpeedMax);
    const hi = Math.max(variableSpeedMin, variableSpeedMax);
    return lo + hash01(globalIndex) * (hi - lo);
  };

  const fittedText = fitText({
    fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    fontWeight: FONT_WEIGHT,
  });
  const fontSize = Math.min(DESIRED_FONT_SIZE, fittedText.fontSize);

  // Per-word reveal: the word's last letter lands ~when it's spoken (relEnd),
  // each earlier letter stepping back by that letter's own delay. `offset` is
  // the word's first char index within the page so the cursor can track the
  // single furthest-typed letter.
  let acc = 0;
  const tokenInfo = page.tokens.map((token, ti) => {
    const relStart = token.fromMs - page.startMs;
    const relEnd = Math.max(token.toMs - page.startMs, relStart + 1);
    const offset = acc;
    const n = token.text.length;

    // Suffix-sum of delays from the end of the word so letters land in order.
    const appear: number[] = new Array<number>(n);
    let suffix = 0;
    for (let ci = n - 1; ci >= 0; ci--) {
      suffix += charDelayMs(offset + ci);
      appear[ci] = relEnd - suffix;
    }

    acc += n;
    const color = textColors.length ? textColors[ti % textColors.length] : "white";
    return { token, offset, appear, color };
  });

  const totalChars = acc;

  // Index of the furthest letter that has started appearing (-1 = none yet).
  let lastRevealed = -1;
  for (const { offset, appear } of tokenInfo) {
    for (let ci = 0; ci < appear.length; ci++) {
      if (t >= appear[ci]) {
        lastRevealed = Math.max(lastRevealed, offset + ci);
      }
    }
  }

  // "Typing" == letters are still being revealed (between the first letter and
  // the last). Before the first and after the last the cursor is "at rest".
  const fullyTyped = totalChars > 0 && lastRevealed >= totalChars - 1;
  const isTyping = lastRevealed > -1 && !fullyTyped;

  // Blink via cos(frame): solid (opacity 1) while typing, fading at rest — this
  // mirrors gsap's behavior of pausing the blink mid-type, frame-deterministically.
  const blinkOpacity = 0.5 + 0.5 * Math.cos((timeInMs / cursorBlinkDuration) * Math.PI * 2);
  const cursorOpacity = isTyping ? 1 : blinkOpacity;
  const cursorVisible = showCursor && !(hideCursorWhileTyping && isTyping);

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
        {cursorCharacter}
      </span>
    ) : null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: undefined,
        bottom: 350,
        height: 200,
      }}
    >
      <div
        style={{
          fontSize,
          width: "100%",
          textAlign: "center",
          fontFamily,
          fontWeight: FONT_WEIGHT,
          color: "white",
          textShadow: "0 4px 14px rgba(0,0,0,0.7)",
        }}
      >
        {/* Cursor sits at the very start until the first letter shows. */}
        {lastRevealed === -1
          ? renderCursor("cursor-start", tokenInfo[0]?.color ?? "white")
          : null}

        {tokenInfo.map(({ token, offset, appear, color }, ti) => (
          // Whole word is an atomic inline-block so it never breaks mid-word.
          <span key={ti} style={{ display: "inline-block", whiteSpace: "pre", color }}>
            {token.text.split("").map((char, ci) => {
              const appearStart = appear[ci];
              const appearMs = Math.max(60, charDelayMs(offset + ci));
              const eased = interpolate(t, [appearStart, appearStart + appearMs], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easingFn,
              });
              const opacity = Math.min(1, Math.max(0, eased));
              const scale = easing === "linear" ? 1 : Math.max(0, 0.4 + 0.6 * eased);
              const gi = offset + ci;

              return (
                <React.Fragment key={ci}>
                  <span
                    style={{
                      display: "inline-block",
                      whiteSpace: "pre",
                      opacity,
                      transform: `scale(${scale})`,
                      transformOrigin: "center bottom",
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
      </div>
    </AbsoluteFill>
  );
};
