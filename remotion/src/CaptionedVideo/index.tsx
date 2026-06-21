import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  getStaticFiles,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
  watchStaticFile,
} from "remotion";
import { z } from "zod";
import { getVideoMetadata } from "@remotion/media-utils";
import { Caption, createTikTokStyleCaptions } from "@remotion/captions";
import { loadFont } from "./load-font";
import SubtitlePage from "./SubtitlePage";
import { NoCaptionFile } from "./NoCaptionFile";
import type { CaptionStyle } from "./styles/types";

export const captionedVideoSchema = z.object({
  src: z.string(),
});

export type CaptionedVideoProps = z.infer<typeof captionedVideoSchema> & {
  // The active caption style. Not part of the zod schema because React
  // components aren't serializable — it's wired up in Root.tsx instead.
  PageComponent: CaptionStyle;
};

const FPS = 30;
const FALLBACK_DURATION_IN_SECONDS = 20;

// How aggressively words are grouped into a single caption page. ~1200ms puts
// a short phrase on screen at a time. NOTE: this only controls *grouping* — how
// long each page stays visible is driven by the next page's start (see below),
// so there are no blank gaps between pages.
const SWITCH_CAPTIONS_EVERY_MS = 1200;

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
  try {
    const metadata = await getVideoMetadata(props.src);
    return {
      fps: FPS,
      durationInFrames: Math.max(1, Math.floor(metadata.durationInSeconds * FPS)),
    };
  } catch {
    try {
      const res = await fetch(toCaptionsFileName(props.src));
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
}) => {
  const [subtitles, setSubtitles] = useState<Caption[]>([]);
  const [handle] = useState(() => delayRender("Loading captions"));
  const { fps, durationInFrames: compositionDurationInFrames } = useVideoConfig();

  const subtitlesFile = useMemo(() => toCaptionsFileName(src), [src]);

  const fetchSubtitles = useCallback(async () => {
    try {
      await loadFont();
      const res = await fetch(subtitlesFile);
      if (!res.ok) {
        setSubtitles([]);
        continueRender(handle);
        return;
      }
      const data = (await res.json()) as Caption[];
      setSubtitles(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [handle, subtitlesFile]);

  useEffect(() => {
    fetchSubtitles();
    const cancel = watchStaticFile(subtitlesFile, fetchSubtitles);
    return () => cancel.cancel();
  }, [fetchSubtitles, subtitlesFile]);

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
        captions: subtitles ?? [],
      }),
    [subtitles],
  );

  const hasVideo = fileExists(src);
  const hasCaptions = fileExists(subtitlesFile);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill>
        {hasVideo ? (
          <OffthreadVideo style={{ objectFit: "cover" }} src={src} />
        ) : (
          // Stand-in background so the Studio is usable before a real video
          // is added to public/.
          <AbsoluteFill
            style={{ background: "linear-gradient(135deg,#1e1b4b,#4c1d95,#831843)" }}
          />
        )}
      </AbsoluteFill>

      {pages.map((page, index) => {
        const next = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        // Hold each page until the NEXT page begins (the last page runs to the
        // end of the composition). The previous code capped every page at
        // `startFrame + SWITCH_CAPTIONS_EVERY_MS`, so whenever consecutive pages
        // started more than ~1200ms apart the caption vanished and left a blank
        // gap until the next one. Anchoring endFrame to the next start makes the
        // next page appear exactly as the previous ends — continuous, no gap.
        const endFrame = next
          ? (next.startMs / 1000) * fps
          : compositionDurationInFrames;
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
            <SubtitlePage page={page} PageComponent={PageComponent} />
          </Sequence>
        );
      })}

      {hasCaptions ? null : <NoCaptionFile />}
    </AbsoluteFill>
  );
};
