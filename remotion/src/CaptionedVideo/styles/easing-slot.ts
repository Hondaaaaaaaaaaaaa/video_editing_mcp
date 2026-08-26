import { Easing, spring } from "remotion";
import { z } from "zod";

// ---------------------------------------------------------------------------
// EASING — a shared control, so every template offers the SAME curve choices
// instead of each hard-coding one.
//
// Easing is the RATE of a change, not the change itself. The same 4-frame scale
// from 0.9 to 1.0 feels completely different depending on how the time is
// distributed across it:
//
//   linear       constant speed. Mechanical — the eye reads it as machinery.
//   ease-out     fast, then decelerating into a soft landing. The correct
//                default for anything ARRIVING; it lands on the beat and settles.
//   ease-in      slow, then accelerating into a hard stop. Wrong for entrances
//                (reads as late, then slammed) — it belongs on EXITS, where the
//                thing is leaving and should pick up speed as it goes.
//   ease-in-out  slow at both ends, quick through the middle. Best for MOVING
//                something between two resting places, not for appearing.
//   smooth       cubic-bezier(0.32, 0.72, 0, 1) — the `micro-scale-fade`
//                signature from the animate-text catalog, whose usage note is
//                "for single words or short titles". Leaves the start almost
//                instantly and decelerates over most of its length, so the
//                settle reads smoother than a plain ease-out.
//   bouncy       ease-out that OVERSHOOTS past the target and springs back.
//
// `strength` (1..10) sets how PRONOUNCED the curve is — for the polynomial
// curves it is the exponent (higher = more abrupt at the fast end), and for
// `bouncy` it is how far the overshoot travels. It does nothing for `linear`
// and `smooth`, which are fixed curves by definition.
// ---------------------------------------------------------------------------

export const easingTypeEnum = z.enum([
  "smooth",
  "ease-out",
  "ease-in",
  "ease-in-out",
  "bouncy",
  "elastic",
  "spring",
  "linear",
]);

export type EasingType = z.infer<typeof easingTypeEnum>;

export const easingSlotSchema = z.object({
  type: easingTypeEnum,
  strength: z.number().min(1).max(10).step(1),
});

export type EasingSlot = z.infer<typeof easingSlotSchema>;

/** The animate-text `micro-scale-fade` signature curve. */
export const SMOOTH_BEZIER = [0.32, 0.72, 0, 1] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Resolution at which a spring is sampled as a 0..1 curve. The spring is FITTED
// to this window (durationInFrames), so it always settles exactly at t=1 rather
// than being cut off mid-wobble.
const SPRING_SAMPLES = 100;

// Curves that deliberately leave the 0..1 range. Valid for geometry (scale,
// position), never for opacity — alpha above 1 just clips, so the overshoot is
// invisible and the fade merely looks wrong.
const OVERSHOOTING: ReadonlySet<string> = new Set(["bouncy", "elastic", "spring"]);

/**
 * Turn a slot into a curve function for `interpolate({ easing })`.
 *
 * Every curve maps 0 -> 0 and 1 -> 1; only the path between them differs.
 * `bouncy` deliberately leaves that range mid-flight (that IS the overshoot),
 * so callers driving opacity should not use it — over 1 is not a valid alpha.
 */
export const makeEasing = (slot: EasingSlot | undefined): ((t: number) => number) => {
  const type = slot?.type ?? "smooth";
  const s = clamp(slot?.strength ?? 5, 1, 10);
  // 1..10 -> a polynomial exponent of 1.5..5. Below ~1.5 is indistinguishable
  // from linear; above ~5 the fast end is so quick it reads as a jump cut.
  const power = 1.5 + ((s - 1) / 9) * 3.5;

  switch (type) {
    case "linear":
      return Easing.linear;
    case "ease-in":
      return Easing.in(Easing.poly(power));
    case "ease-out":
      return Easing.out(Easing.poly(power));
    case "ease-in-out":
      return Easing.inOut(Easing.poly(power));
    case "bouncy":
      // 1..10 -> 0.4..3.0 of overshoot.
      return Easing.out(Easing.back(0.4 + ((s - 1) / 9) * 2.6));
    case "elastic":
      // 1..10 -> 0.3..3.0 bounciness: one soft wobble up to a rubbery ring-out.
      return Easing.out(Easing.elastic(0.3 + ((s - 1) / 9) * 2.7));
    case "spring": {
      // Real physics rather than a drawn curve. Bouncy (back) overshoots once
      // on a fixed shape; a spring is a mass on a damped spring, so it rings
      // down naturally and the number of wobbles falls out of the damping.
      // strength loosens it: 1 = firm and quick, 10 = loose and wobbly.
      const damping = 26 - ((s - 1) / 9) * 18;
      return (t: number) =>
        spring({
          frame: clamp(t, 0, 1) * SPRING_SAMPLES,
          fps: SPRING_SAMPLES,
          config: { damping, mass: 1, stiffness: 170 },
          durationInFrames: SPRING_SAMPLES,
        });
    }
    case "smooth":
    default:
      return Easing.bezier(...SMOOTH_BEZIER);
  }
};

/**
 * `bouncy` overshoots past 1, which is invalid for opacity. Anything driving
 * alpha should use this instead so the fade stays in range while the SCALE
 * still gets to overshoot.
 */
export const makeOpacityEasing = (slot: EasingSlot | undefined): ((t: number) => number) =>
  OVERSHOOTING.has(slot?.type ?? "") ? Easing.out(Easing.poly(2)) : makeEasing(slot);
