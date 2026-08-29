import { z } from "zod";
import { durationMsSchema } from "./timing";

// ---------------------------------------------------------------------------
// WIGGLE — the slow living drift a caption keeps while it sits on screen.
//
// This is a THIRD phase, neither entrance nor exit: it runs for as long as the
// caption is up. Our motion vocabulary only names `in` and `out`, so call this
// one `idle`.
//
// MEASURED from public/References/wiggle.mp4 (720x1280, 23.98fps, white text on
// flat red — the cleanest possible subject, segmented on the min channel):
//
//   x swings 321.6 -> 384.3 px   = ±31.4px = ±0.48em   period ~4.75s
//   y swings 687.6 -> 741.0 px   = ±26.7px = ±0.40em   period ~3.50s
//   width    548 -> 549 px       = CONSTANT — there is no scaling
//   height   118 -> 120 px       = CONSTANT
//   tilt     -0.73° -> -0.25°    = 0.48° total — noise, there is no rotation
//
// So it is PURE TRANSLATION. Tilt is offered but defaults to 0.
//
// THE DETAIL THAT MAKES IT LOOK ALIVE: x and y run on DIFFERENT periods (4.75s
// vs 3.50s). Sharing one clock traces the same line back and forth forever; two
// periods that do not divide evenly trace a path that never repeats. The old
// bobEm/bobSpeed pair moved on y only, on a single clock, which is why it read
// as a metronome rather than a drift.
//
// Smoothness is not a separate control: a single sine per axis IS smooth. The
// measured path bears that out — mean |2nd difference| 0.385px against 1.011px
// of travel per frame, i.e. a clean wave, not jitter.
// ---------------------------------------------------------------------------

export const wiggleSlotSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    // Amplitudes are in EM (× font size), never px, so the drift is the same
    // gesture at 720p, 1080p and 4K.
    amountXEm: z.number().min(0).max(1.5).step(0.01),
    amountYEm: z.number().min(0).max(1.5).step(0.01),
    // Seconds for ONE full there-and-back. Keep these unequal.
    periodXSec: z.number().min(0.3).max(12).step(0.05),
    periodYSec: z.number().min(0.3).max(12).step(0.05),
    // Optional tilt on its own rhythm. 0 in the reference.
    tiltDeg: z.number().min(0).max(8).step(0.1),
    tiltPeriodSec: z.number().min(0.3).max(12).step(0.05),
    // WHEN it runs, relative to the caption appearing.
    startsAtMs: durationMsSchema,
    // 0 = keep wiggling for as long as the caption is on screen.
    durationMs: z.number().min(0).max(20000).step(50),
    // How long the drift takes to reach full amplitude, so a caption glides
    // into its wiggle instead of starting mid-swing. Also used to ease it out.
    onsetMs: durationMsSchema,
  }),
]);

export type WiggleSlot = z.infer<typeof wiggleSlotSchema>;

/** The measured wiggle.mp4 values, ready to spread into a template's defaults. */
export const WIGGLE_MEASURED = {
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
};

const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * The wiggle offset at a given moment of a caption's life.
 *
 * `secs` is CAPTION-LOCAL (0 = the frame the caption appeared), so every caption
 * starts its drift from rest rather than joining a wave already in progress.
 */
export const wiggleAt = (
  slot: WiggleSlot | undefined,
  secs: number,
  fontSize: number,
): { x: number; y: number; deg: number } => {
  const none = { x: 0, y: 0, deg: 0 };
  if (!slot || !slot.enabled) return none;

  const t = secs - slot.startsAtMs / 1000;
  if (t <= 0) return none;

  const onset = slot.onsetMs > 0 ? smoothstep(t / (slot.onsetMs / 1000)) : 1;
  // A finite duration eases back out over the same onset window, so the caption
  // settles instead of snapping to a standstill mid-swing.
  let envelope = onset;
  if (slot.durationMs > 0) {
    const end = slot.durationMs / 1000;
    if (t >= end) {
      const fade = slot.onsetMs > 0 ? 1 - smoothstep((t - end) / (slot.onsetMs / 1000)) : 0;
      envelope = Math.min(onset, fade);
    }
  }
  if (envelope <= 0) return none;

  const wave = (period: number, phase: number) =>
    period > 0 ? Math.sin((2 * Math.PI * t) / period + phase) : 0;

  return {
    x: slot.amountXEm * fontSize * envelope * wave(slot.periodXSec, 0),
    // Phase-offset so y does not start in lockstep with x on the first frame.
    y: slot.amountYEm * fontSize * envelope * wave(slot.periodYSec, 1.1),
    deg: slot.tiltDeg * envelope * wave(slot.tiltPeriodSec, 0.5),
  };
};
