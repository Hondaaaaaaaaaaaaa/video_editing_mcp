import { z } from "zod";
import { durationMsSchema } from "./timing";
import { easingSlotSchema, makeEasing, makeOpacityEasing, type EasingSlot } from "./easing-slot";

// ---------------------------------------------------------------------------
// TEXT ANIMATION — how a caption ARRIVES, and how it moves while it is there.
// Independent effects, because they are independent things: a caption can fade
// without changing size, pop without ever being transparent, or do both.
//
//   fade in          opacity 0 -> 1. Nothing moves, nothing resizes.
//   pop in           scale n -> 1. SETTLES at full size and stops.
//   zoom continuous  scale that NEVER settles — it keeps growing for as long as
//                    the caption is on screen, so it is still moving when the
//                    next caption takes over.
//
// Names come from remotion/docs/motion-vocabulary.md. Use them.
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

/**
 * WHAT the fade applies to. The two look nothing alike and the difference is
 * the whole reason this field exists:
 *
 *   "word"     each word fades on its OWN cue, so the sentence builds and you
 *              only ever see the part that has been spoken.
 *   "caption"  the whole sentence has ONE cue: every word is present from the
 *              first frame and they brighten together. You never see half a
 *              sentence.
 *
 * DEFAULT IS "word", chosen by the user 2026-09-06 after seeing both rendered
 * side by side. This SUPERSEDES the 2026-07-17 "still text" preference as the
 * default for new work.
 *
 * It changes nothing that exists today: the only template wired to this slot is
 * Hormozi 2, and it runs `fadeInMs: 0` — no fade at all — so the unit never
 * comes into play there. Hormozi 2 and Hormozi keep rendering still text, which
 * is what the 2026-07-17 decision was actually protecting (a per-word fade made
 * Hormozi's accent colour look like it crawled along the line).
 */
export const fadeUnitSchema = z.enum(["word", "caption"]);
export type FadeUnit = z.infer<typeof fadeUnitSchema>;

export const textAnimationSchema = z.object({
  // 0 = the caption is fully opaque on its first frame (the reference).
  fadeInMs: durationMsSchema,
  fadeUnit: fadeUnitSchema,
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
  /**
   * TRACK OUT — the gaps between letters widen, so the line spreads sideways
   * from its own centre. The GLYPHS NEVER CHANGE SIZE; that is the whole
   * difference from a zoom, and the only way to tell the two apart by eye is to
   * measure one glyph's cap height.
   *
   * Unlike the zoom this one SETTLES, because that is what the reference does:
   * it eases to its target over ~1 s and then holds. Measured on
   * public/References/Fade + pop/fade  in .mp4 — mean letter pitch 18.17 ->
   * 19.92 px (+9.6 %) while cap height stayed 21.74 -> 21.98 px.
   *
   * While enabled this REPLACES the template's own static letterSpacing for the
   * length of the ramp; disabled, the template's value stands.
   */
  trackOut: z.discriminatedUnion("enabled", [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      fromEm: z.number().min(-0.05).max(0.8).step(0.005),
      toEm: z.number().min(-0.05).max(0.8).step(0.005),
      durationMs: durationMsSchema,
      easing: easingSlotSchema,
    }),
  ]),
  /**
   * ZOOM CONTINUOUS — the whole caption scales about its centre at a fixed rate
   * and never stops. NOT a pop in: a pop settles at 100 % and holds, this one
   * keeps going and passes it. Because it is rate-driven, a caption that stays
   * up longer ends up bigger.
   *
   * Picked by the user 2026-09-06 out of a four-way comparison; the working
   * demo of all four is `src/FadePopDemo.tsx`.
   */
  zoomContinuous: z.discriminatedUnion("enabled", [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      // Size on the caption's first frame, as a % of nominal. Under 100 starts
      // small and grows THROUGH full size; 100 starts at full size and passes it.
      fromPct: z.number().min(50).max(150).step(0.5),
      // % of nominal size added every second, for as long as the caption is up.
      ratePctPerSec: z.number().min(0).max(50).step(0.5),
    }),
  ]),
});

export type TextAnimation = z.infer<typeof textAnimationSchema>;

/** Reference behaviour: the caption simply appears. */
export const TEXT_ANIMATION_NONE: TextAnimation = {
  fadeInMs: 0,
  fadeUnit: "word",
  popIn: { enabled: false },
  trackOut: { enabled: false },
  zoomContinuous: { enabled: false },
};

/**
 * Opacity and scale at a moment of a caption's life.
 *
 * `secs` is CAPTION-LOCAL: 0 is the frame the caption appeared. Pop and zoom
 * are per-caption motions and always use it.
 *
 * `wordSecs` is WORD-LOCAL: 0 is the moment THIS word is spoken. A caller that
 * renders per word passes it, and the fade then follows `fadeUnit`. Omit it and
 * the fade falls back to the caption clock — which is why existing callers keep
 * working unchanged.
 */
export const textAnimationAt = (
  cfg: TextAnimation | undefined,
  secs: number,
  wordSecs?: number,
): { opacity: number; scale: number; trackingEm: number | null } => {
  if (!cfg) return { opacity: 1, scale: 1, trackingEm: null };

  const fadeClock = cfg.fadeUnit === "word" && wordSecs !== undefined ? wordSecs : secs;
  const fade =
    cfg.fadeInMs > 0 ? Math.min(1, Math.max(0, fadeClock / (cfg.fadeInMs / 1000))) : 1;

  let scale = 1;
  const pop = cfg.popIn;
  if (pop.enabled) {
    const t = secs - pop.startsAtMs / 1000;
    const from = pop.fromPct / 100;
    if (t <= 0) {
      scale = from;
    } else if (pop.durationMs > 0) {
      // Scale MAY overshoot (that is what a bouncy curve is for), so the full
      // easing is used here — unlike opacity below, which must stay in 0..1.
      const raw = Math.min(1, t / (pop.durationMs / 1000));
      scale = from + (1 - from) * makeEasing(pop.easing as EasingSlot)(raw);
    }
  }

  // The zoom MULTIPLIES whatever the pop settled on, so a template can pop in
  // and then keep drifting bigger. Unbounded on purpose — it never settles.
  const zoom = cfg.zoomContinuous;
  if (zoom.enabled) {
    scale *= (zoom.fromPct + zoom.ratePctPerSec * Math.max(0, secs)) / 100;
  }

  // null means "no tracking animation — use whatever letterSpacing the template
  // already sets". Only a running trackOut overrides it.
  let trackingEm: number | null = null;
  const track = cfg.trackOut;
  if (track.enabled) {
    const raw = track.durationMs > 0 ? Math.min(1, Math.max(0, secs / (track.durationMs / 1000))) : 1;
    trackingEm = track.fromEm + (track.toEm - track.fromEm) * makeEasing(track.easing as EasingSlot)(raw);
  }

  return { opacity: fade, scale, trackingEm };
};

/**
 * The curve to drive a fade with. Overshooting curves are substituted, because
 * alpha above 1 simply clips — the overshoot is invisible and the fade reads
 * wrong. See OVERSHOOTING in easing-slot.ts.
 */
export const fadeEasing = makeOpacityEasing;
