import { z } from "zod";
import { durationMsSchema } from "./timing";
import { easingSlotSchema, makeEasing, makeOpacityEasing, type EasingSlot } from "./easing-slot";

// ---------------------------------------------------------------------------
// TEXT ANIMATION — how a caption ARRIVES. Two independent effects:
//
//   fade in   opacity 0 -> 1. Nothing moves, nothing resizes.
//   pop in    scale  n -> 1. Fully visible the whole time.
//
// They are separate because they are separate: a caption can fade without
// changing size, pop without ever being transparent, or do both at once.
//
// DEFAULTS ARE "NEITHER", because that is what the reference does. Measured on
// the Hormozi 2 reel, on entrances where the background was provably stable
// (sharpness flat at 0.75-0.77, so no transition blur to confuse the reading):
//
//   width over the first four frames of a new caption:  482 482 482 482
//   brightest 1% of caption pixels on frame one:        255
//
// Full size and full opacity on the very first frame. An earlier reading of
// "starts at 70%" came from a frame inside a whole-frame transition blur, which
// dimmed the glyphs below the detection threshold and made them measure narrow.
// That was an artifact, not a scale.
//
// The controls stay on every template regardless, because plenty of looks DO
// want a pop or a fade — they are simply off until asked for.
// ---------------------------------------------------------------------------

export const textAnimationSchema = z.object({
  // 0 = the caption is fully opaque on its first frame (the reference).
  fadeInMs: durationMsSchema,
  popIn: z.discriminatedUnion("enabled", [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      // Size the caption starts at, as a % of its final size. 100 = no pop.
      fromPct: z.number().min(0).max(100).step(1),
      durationMs: durationMsSchema,
      // Delay before the pop begins, measured from the caption appearing.
      startsAtMs: durationMsSchema,
      easing: easingSlotSchema,
    }),
  ]),
});

export type TextAnimation = z.infer<typeof textAnimationSchema>;

/** Reference behaviour: the caption simply appears. */
export const TEXT_ANIMATION_NONE: TextAnimation = {
  fadeInMs: 0,
  popIn: { enabled: false },
};

/**
 * Opacity and scale at a moment of a caption's life.
 * `secs` is CAPTION-LOCAL: 0 is the frame the caption appeared.
 */
export const textAnimationAt = (
  cfg: TextAnimation | undefined,
  secs: number,
): { opacity: number; scale: number } => {
  if (!cfg) return { opacity: 1, scale: 1 };

  const fade = cfg.fadeInMs > 0 ? Math.min(1, Math.max(0, secs / (cfg.fadeInMs / 1000))) : 1;

  let scale = 1;
  const pop = cfg.popIn;
  if (pop.enabled) {
    const t = secs - pop.startsAtMs / 1000;
    const from = pop.fromPct / 100;
    if (t <= 0) {
      scale = from;
    } else if (pop.durationMs > 0) {
      const raw = Math.min(1, t / (pop.durationMs / 1000));
      // Scale MAY overshoot (that is what a bouncy curve is for), so the full
      // easing is used here — unlike opacity below, which must stay in 0..1.
      scale = from + (1 - from) * makeEasing(pop.easing as EasingSlot)(raw);
    }
  }

  return { opacity: fade, scale };
};

/**
 * The curve to drive a fade with. Overshooting curves are substituted, because
 * alpha above 1 simply clips — the overshoot is invisible and the fade reads
 * wrong. See OVERSHOOTING in easing-slot.ts.
 */
export const fadeEasing = makeOpacityEasing;
