import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import type { Caption, TikTokPage } from "@remotion/captions";
import type { CaptionDoc } from "../src/CaptionedVideo/styles/types";
import { displayWord } from "../src/CaptionedVideo/punctuation";
import { STYLE_BY_ID, type StyleProps } from "./styles";

// The editor's live preview IS the real template fed by the in-memory caption
// document — so "what you edit is exactly what you get". It renders in the
// single-surface (self-grouping) mode: the page component reads `segments` and
// lays out each caption's lines as authored. Which template does the painting is
// picked from the shared registry, so the editor works with any document-driven
// style (Hormozi, Shiny, …) rather than one hardcoded look.

const EMPTY_PAGE: TikTokPage = { text: "", startMs: 0, durationMs: 0, tokens: [] };

export type EditorPreviewProps = {
  src: string;
  doc: CaptionDoc;
  styleId: string;
  styleProps: StyleProps;
};

export const EditorPreview: React.FC<EditorPreviewProps> = ({
  src,
  doc,
  styleId,
  styleProps,
}) => {
  const entry = STYLE_BY_ID[styleId];

  // Punctuation is stripped for the PREVIEW only (default off) so it matches the
  // final render; the caption cards still show/edit the real text.
  const showPunctuation = Boolean((styleProps as { showPunctuation?: boolean }).showPunctuation);
  const captions: Caption[] = doc.segments
    .flatMap((s) => s.lines)
    .flatMap((l) => l.words)
    .map((w) => ({
      text: displayWord(w.text, showPunctuation),
      startMs: w.startMs,
      endMs: w.endMs,
      timestampMs: Math.round((w.startMs + w.endMs) / 2),
      confidence: null,
    }));
  const displaySegments = showPunctuation
    ? doc.segments
    : doc.segments.map((seg) => ({
        ...seg,
        lines: seg.lines.map((line) => ({
          ...line,
          words: line.words.map((w) => ({ ...w, text: displayWord(w.text, false) })),
        })),
      }));

  if (!entry) return null;
  const { Provider, Page } = entry;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill>
        <OffthreadVideo style={{ objectFit: "cover" }} src={src} />
      </AbsoluteFill>
      {/* `Provider` is typed as never to stay style-agnostic in the registry;
          the value is the style's own props bag. */}
      <Provider value={styleProps as never}>
        <Page enterProgress={1} page={EMPTY_PAGE} captions={captions} segments={displaySegments} />
      </Provider>
    </AbsoluteFill>
  );
};
