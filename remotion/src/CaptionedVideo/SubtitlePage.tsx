import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionStyle } from "./styles/types";

/**
 * Owns the per-page enter animation (a short spring) and delegates the actual
 * look to whichever `PageComponent` style is passed in. This is the seam that
 * makes caption styles swappable: same timing, different paint.
 */
const SubtitlePage: React.FC<{
  page: TikTokPage;
  PageComponent: CaptionStyle;
}> = ({ page, PageComponent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 5,
  });

  return <PageComponent enterProgress={enter} page={page} />;
};

export default SubtitlePage;
