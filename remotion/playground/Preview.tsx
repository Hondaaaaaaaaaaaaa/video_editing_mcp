import React, { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import SubtitlePage from "../src/CaptionedVideo/SubtitlePage";
import { STYLE_BY_ID, type StyleProps } from "./styles";

// Mirror of CaptionedVideo's page grouping (index.tsx) so the preview's timing
// matches the real compositions exactly.
const SWITCH_CAPTIONS_EVERY_MS = 1200;

export type PreviewProps = {
  src: string;
  captions: Caption[];
  styleId: string;
  styleProps: StyleProps;
};

/**
 * The composition rendered inside the <Player>. It's a trimmed CaptionedVideo:
 * the real video behind the chosen caption style, fed live props from the
 * control panel. No Studio-only file checks / NoCaptionFile banner.
 */
export const Preview: React.FC<PreviewProps> = ({ src, captions, styleId, styleProps }) => {
  const { fps } = useVideoConfig();
  const entry = STYLE_BY_ID[styleId];

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
        captions: captions ?? [],
      }),
    [captions],
  );

  if (!entry) {
    return null;
  }
  const { Provider, Page } = entry;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill>
        <OffthreadVideo style={{ objectFit: "cover" }} src={src} />
      </AbsoluteFill>

      {/* `Provider` is typed as never to stay style-agnostic in the registry;
          the value is the style's own props bag. */}
      <Provider value={styleProps as never}>
        {pages.map((page, index) => {
          const next = pages[index + 1] ?? null;
          const startFrame = (page.startMs / 1000) * fps;
          const endFrame = Math.min(
            next ? (next.startMs / 1000) * fps : Infinity,
            startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
          );
          const durationInFrames = endFrame - startFrame;
          if (durationInFrames <= 0) {
            return null;
          }
          return (
            <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
              <SubtitlePage page={page} PageComponent={Page} />
            </Sequence>
          );
        })}
      </Provider>
    </AbsoluteFill>
  );
};
