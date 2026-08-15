import { z } from "zod";

// ---------------------------------------------------------------------------
// WHEN A CAPTION APPEARS — one source of truth for every template.
//
// THE PROBLEM. The ASR returns word boundaries that are CONTIGUOUS: every
// word's startMs is exactly the previous word's endMs, with no gaps at all
// (verified on sample-video: 23 of 23 boundaries contiguous). A pause therefore
// has nowhere to live except INSIDE the preceding word, which gets stretched to
// swallow it:
//
//     using      7520-8290ms   770ms
//     whisper    8290-9160ms   870ms   <- two syllables, padded with the pause
//     CPP        9160-9580ms   420ms
//
// So a word's startMs is NOT when it is spoken — it is when the previous word's
// padded span ends. Rendering a caption at its raw startMs therefore puts it on
// screen AFTER the speaker has begun the word. PageHormozi has known this since
// it was written (its SWITCH_LEAD_MS carries the same note), but that constant
// only moved the line-colour handoff; every template still started its
// <Sequence> at the raw timestamp.
//
// THE FIX. Start each caption `leadMs` EARLY. The error is worst on templates
// with many short screens — 130ms against a 420ms word like "CPP" is 31% of it,
// against a 2600ms Shiny caption it is 5% and invisible. That is exactly why it
// reads as lag on Classic (14 screens) and Ali, and not on the others.
//
// Deriving start AND end from the same array also makes gaps and overlaps
// impossible by construction: each caption ends exactly where the next begins.
// ---------------------------------------------------------------------------

/**
 * How early a caption appears, in ms. 130 is the value PageHormozi already used
 * for its colour handoff, arrived at against the same ASR behaviour.
 *
 * This is a TASTE value, not a measured one — too much and captions land before
 * the word is spoken. Every template takes it as a prop so it can be nudged per
 * look: fast one-word screens tolerate more lead than long stacked ones.
 */
export const CAPTION_LEAD_MS = 130;

export const captionLeadSchema = z.number().min(0).max(400).step(5);

/**
 * Frame at which each caption starts, with the lead applied.
 *
 * - the first caption always starts at 0, so a video never opens on blank frames
 * - never negative, and never before the caption before it (a big lead on
 *   closely-spaced captions is clamped rather than allowed to reorder them)
 * - strictly increasing, so no caption is ever zero-length
 *
 * Pair with `captionEndFrame` so start and end always agree.
 */
export const captionStartFrames = (
  startsMs: number[],
  fps: number,
  leadMs: number = CAPTION_LEAD_MS,
): number[] => {
  const out: number[] = [];
  for (let i = 0; i < startsMs.length; i++) {
    const led = i === 0 ? 0 : Math.round(((startsMs[i] - leadMs) / 1000) * fps);
    const prev = i === 0 ? -1 : out[i - 1];
    out.push(Math.max(0, led, prev + 1));
  }
  return out;
};

/** A caption runs until the next one begins, or to the end of the video. */
export const captionEndFrame = (
  starts: number[],
  i: number,
  durationInFrames: number,
): number => starts[i + 1] ?? durationInFrames;
