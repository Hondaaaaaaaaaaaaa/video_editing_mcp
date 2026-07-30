import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import type { Caption, TikTokPage } from "@remotion/captions";
import {
  PageHormozi,
  HormoziStyleProvider,
  HORMOZI_DEFAULTS,
  type HormoziStyle,
} from "../src/CaptionedVideo/styles/PageHormozi";
import type { CaptionDoc } from "../src/CaptionedVideo/styles/types";

// The editor's live preview IS the real Hormozi template fed by the in-memory
// caption document — so "what you edit is exactly what you get". It renders in
// the single-surface (self-grouping) mode: PageHormozi reads `segments` and
// lays out each caption's lines as authored.

const EMPTY_PAGE: TikTokPage = { text: "", startMs: 0, durationMs: 0, tokens: [] };

export type EditorPreviewProps = {
  src: string;
  doc: CaptionDoc;
  style: HormoziStyle;
};

export const EditorPreview: React.FC<EditorPreviewProps> = ({ src, doc, style }) => {
  const captions: Caption[] = doc.segments
    .flatMap((s) => s.lines)
    .flatMap((l) => l.words)
    .map((w) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: w.endMs,
      timestampMs: Math.round((w.startMs + w.endMs) / 2),
      confidence: null,
    }));

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill>
        <OffthreadVideo style={{ objectFit: "cover" }} src={src} />
      </AbsoluteFill>
      <HormoziStyleProvider value={style}>
        <PageHormozi
          enterProgress={1}
          page={EMPTY_PAGE}
          captions={captions}
          segments={doc.segments}
        />
      </HormoziStyleProvider>
    </AbsoluteFill>
  );
};

export const HORMOZI_STYLE_DEFAULT = HORMOZI_DEFAULTS;
