import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  getStaticFiles,
  OffthreadVideo,
  Sequence,
  staticFile,
  useVideoConfig,
  watchStaticFile,
} from "remotion";
import { z } from "zod";
import { getVideoMetadata } from "@remotion/media-utils";
import { Caption, createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import { loadFont } from "./load-font";
import SubtitlePage from "./SubtitlePage";
import { NoCaptionFile } from "./NoCaptionFile";
import type { CaptionStyle, EnrichedSegment } from "./styles/types";

export const captionedVideoSchema = z.object({
  src: z.string(),
});

export type CaptionedVideoProps = z.infer<typeof captionedVideoSchema> & {
  // The active caption style. Not part of the zod schema because React
  // components aren't serializable — it's wired up in Root.tsx instead.
  PageComponent: CaptionStyle;
  // When true, the style does its OWN grouping from the flat caption stream
  // (e.g. Shiny kinetic). The engine renders ONE full-timeline surface and
  // passes all words via the `captions` prop, instead of per-page time
  // Sequences. Undefined/false = the default per-page (time-based) rendering.
  singleSurface?: boolean;
};

const FPS = 30;
const FALLBACK_DURATION_IN_SECONDS = 20;

// How aggressively words are grouped into a single caption page. ~1200ms puts
// a short phrase on screen at a time. NOTE: this only controls *grouping* — how
// long each page stays visible is driven by the next page's start (see below),
// so there are no blank gaps between pages.
const SWITCH_CAPTIONS_EVERY_MS = 1200;

// Placeholder page for the single-surface (self-grouping) render path: the
// style ignores `page` and builds its own layout from the `captions` prop.
const EMPTY_PAGE: TikTokPage = { text: "", startMs: 0, durationMs: 0, tokens: [] };

// `src` defaultProps are stored as a PLAIN FILENAME string (e.g.
// "sample-video.mp4"), not `staticFile("…")` — a function call makes the whole
// defaultProps object non-static, which blocks Remotion Studio from saving edited
// props ("Can't save default props for composition …"). So we resolve the bare
// filename to a real static-file URL HERE instead. An already-resolved URL
// (http(s)/blob/data, or a leading "/") is passed through untouched.
const isResolvedUrl = (s: string): boolean => /^(https?:|blob:|data:|\/)/i.test(s);
export const resolveSrc = (s: string): string => (isResolvedUrl(s) ? s : staticFile(s));

const toCaptionsFileName = (src: string): string =>
  src
    .replace(/\.mp4$/, ".json")
    .replace(/\.mkv$/, ".json")
    .replace(/\.mov$/, ".json")
    .replace(/\.webm$/, ".json");

// `staticFile()` returns a full/encoded URL while getStaticFiles() entries are
// relative, so compare by decoded basename to reliably detect presence.
const basename = (p: string): string =>
  decodeURIComponent(p).split(/[?#]/)[0].split("/").pop() ?? p;

const fileExists = (src: string): boolean => {
  const target = basename(src);
  return getStaticFiles().some(
    (f) => basename(f.src) === target || basename(f.name) === target,
  );
};

/**
 * Derives the timeline length. Prefers the real video duration, but falls back
 * to the captions JSON (or a constant) so the composition still loads in the
 * Studio before a sample video has been dropped into `public/`.
 *
 * Generic over `{ src: string }` so it works for any composition whose props
 * extend the base schema (e.g. Shiny's extra glow/gradient props).
 */
export const calculateCaptionedVideoMetadata = async <T extends { src: string }>({
  props,
}: {
  props: T;
}): Promise<{ fps: number; durationInFrames: number }> => {
  const src = resolveSrc(props.src);
  try {
    const metadata = await getVideoMetadata(src);
    return {
      fps: FPS,
      durationInFrames: Math.max(1, Math.floor(metadata.durationInSeconds * FPS)),
    };
  } catch {
    try {
      const res = await fetch(toCaptionsFileName(src));
      const captions = (await res.json()) as Caption[];
      const lastMs = captions.length
        ? Math.max(...captions.map((c) => c.endMs))
        : FALLBACK_DURATION_IN_SECONDS * 1000;
      return {
        fps: FPS,
        durationInFrames: Math.max(1, Math.ceil((lastMs / 1000) * FPS) + FPS),
      };
    } catch {
      return {
        fps: FPS,
        durationInFrames: FALLBACK_DURATION_IN_SECONDS * FPS,
      };
    }
  }
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  src,
  PageComponent,
  singleSurface,
}) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  // Claude's semantic segments (from the enriched sidecar), passed to kinetic
  // templates so they group by meaning + use real emphasis. Undefined = raw.
  const [enrichedSegments, setEnrichedSegments] = useState<EnrichedSegment[]>();
  const [handle] = useState(() => delayRender("Loading captions"));
  const { fps, durationInFrames: compositionDurationInFrames } = useVideoConfig();

  // Resolve the bare-filename `src` prop to a real static-file URL (see resolveSrc).
  const resolvedSrc = useMemo(() => resolveSrc(src), [src]);
  const subtitlesFile = useMemo(() => toCaptionsFileName(resolvedSrc), [resolvedSrc]);
  // The Claude-enriched sidecar (corrected spelling + Arabic punctuation +
  // semantic segments), written by enrich.mjs next to the raw ASR json.
  const enrichedFile = useMemo(
    () => subtitlesFile.replace(/\.json$/i, ".enriched.json"),
    [subtitlesFile],
  );

  const fetchSubtitles = useCallback(async () => {
    try {
      await loadFont();
      // Prefer the enriched captions (corrected + segmented) when present;
      // flatten the segment/line/word tree back into the flat Caption[] the
      // engine and templates consume. Fall back to the raw ASR json.
      const enrichedRes = await fetch(enrichedFile);
      if (enrichedRes.ok) {
        const enriched = (await enrichedRes.json()) as { segments?: EnrichedSegment[] };
        const segs = enriched.segments ?? [];
        const captions: Caption[] = segs
          .flatMap((s) => s.lines ?? [])
          .flatMap((l) => l.words ?? [])
          .map((w) => ({
            text: w.text,
            startMs: w.startMs,
            endMs: w.endMs,
            timestampMs: Math.round((w.startMs + w.endMs) / 2),
            confidence: null,
          }));
        setEnrichedSegments(segs);
        setSubtitles(captions);
        continueRender(handle);
        return;
      }
      const res = await fetch(subtitlesFile);
      if (!res.ok) {
        setEnrichedSegments(undefined);
        setSubtitles([]);
        continueRender(handle);
        return;
      }
      const data = (await res.json()) as Caption[];
      setEnrichedSegments(undefined);
      setSubtitles(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [handle, subtitlesFile, enrichedFile]);

  useEffect(() => {
    fetchSubtitles();
    const cancelRaw = watchStaticFile(subtitlesFile, fetchSubtitles);
    const cancelEnriched = watchStaticFile(enrichedFile, fetchSubtitles);
    return () => {
      cancelRaw.cancel();
      cancelEnriched.cancel();
    };
  }, [fetchSubtitles, subtitlesFile, enrichedFile]);

  // Time-based pages drive the default per-page rendering. The single-surface
  // (self-grouping) path ignores these and groups the flat stream itself.
  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
        captions: subtitles ?? [],
      }),
    [subtitles],
  );

  const hasVideo = fileExists(resolvedSrc);
  const hasCaptions = fileExists(subtitlesFile);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill>
        {hasVideo ? (
          <OffthreadVideo style={{ objectFit: "cover" }} src={resolvedSrc} />
        ) : (
          // Stand-in background so the Studio is usable before a real video
          // is added to public/.
          <AbsoluteFill
            style={{ background: "linear-gradient(135deg,#1e1b4b,#4c1d95,#831843)" }}
          />
        )}
      </AbsoluteFill>

      {singleSurface ? (
        // SELF-GROUPING (e.g. Shiny kinetic): one full-timeline surface. The
        // style receives ALL words via `captions` and manages its own blocks +
        // timing, so useCurrentFrame here is the GLOBAL composition frame.
        <PageComponent
          enterProgress={1}
          page={EMPTY_PAGE}
          captions={subtitles ?? []}
          segments={enrichedSegments}
        />
      ) : (
        pages.map((page, index) => {
            const next = pages[index + 1] ?? null;
            const startFrame = (page.startMs / 1000) * fps;
            // Hold each page until the NEXT page begins (the last page runs to
            // the end of the composition). Anchoring endFrame to the next start
            // makes the next page appear exactly as the previous ends — no gap.
            const endFrame = next
              ? (next.startMs / 1000) * fps
              : compositionDurationInFrames;
            const durationInFrames = endFrame - startFrame;
            if (durationInFrames <= 0) {
              return null;
            }

            return (
              <Sequence
                key={index}
                from={startFrame}
                durationInFrames={durationInFrames}
              >
                <SubtitlePage page={page} PageComponent={PageComponent} />
              </Sequence>
            );
          })
        )}

      {hasCaptions ? null : <NoCaptionFile />}
    </AbsoluteFill>
  );
};
