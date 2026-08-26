import { z } from "zod";

// ---------------------------------------------------------------------------
// TIMING — durations are authored in MILLISECONDS, never in frames.
//
// A frame count means different things at different frame rates: 13 frames is
// 433ms at 30fps but 217ms at 60fps, so a template authored in frames animates
// at DOUBLE speed the moment a project switches rate. Milliseconds are the same
// duration everywhere; frames are derived at render time from the composition's
// own fps.
//
// The sliders users see say "Duration" and are labelled in ms. Only the field
// name carries the `Ms` suffix — which is also what makes a rename safe: an old
// frame-based value can never be silently reinterpreted as a millisecond one.
// ---------------------------------------------------------------------------

/** How long an entrance/exit takes, in ms. 0 = instant (no animation). */
export const durationMsSchema = z.number().min(0).max(3000).step(5);

/** Convert a millisecond duration to frames at the composition's rate. */
export const msToFrames = (ms: number, fps: number): number => (ms / 1000) * fps;

/**
 * Frames for a duration, floored so an `interpolate` range is never zero-width
 * (a zero range makes the value jump rather than animate).
 */
export const msToFramesMin = (ms: number, fps: number, min = 0.0001): number =>
  Math.max(min, msToFrames(ms, fps));

// WHY THIS DOES NOT ROUND TO WHOLE FRAMES.
//
// Rounding would make this migration bit-identical to the old frame-based code
// (verified: with Math.round, Classic renders pixel-for-pixel the same). It is
// still wrong. A 85ms fade is 2.55 frames at 30fps; rounding it to 3 frames
// makes it a 100ms fade — a 17% error, and worst precisely on the fast motion
// where the duration matters most.
//
// Unrounded, `interpolate(frame, [0, 2.55], …)` samples the real curve: frame 2
// is 78% through the fade, frame 3 clamps to done. That is a truer rendering of
// "85 milliseconds" than snapping to the frame grid.
//
// The cost is sub-pixel: converting Classic's 4-frame pop to 133ms yields 3.99
// frames, which shifted glyph anti-aliasing on ONE caption line by at most one
// step of 255 — 1722 subpixels inside a 374x29 box. Invisible, and measured
// rather than assumed.
