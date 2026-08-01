import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import type { Caption } from "@remotion/captions";
import { Preview } from "./Preview";
import { EditorPreview } from "./EditorPreview";
import { SchemaControls } from "./SchemaControls";
import { STYLES, STYLE_BY_ID, type StyleProps } from "./styles";
import type { CaptionDoc } from "../src/CaptionedVideo/styles/types";

const FPS = 30;
const SRC = "/sample-video.mp4"; // served from ../public by Vite
const CAPTIONS_URL = "/sample-video.json";
const DOC_URL = "/sample-video.enriched.json";
const FALLBACK_FRAMES = 600;

// One independent props bag per style, seeded from each style's own defaults.
const initialProps = (): Record<string, StyleProps> =>
  Object.fromEntries(STYLES.map((s) => [s.id, { ...s.defaults }]));

export const App: React.FC = () => {
  const [styleId, setStyleId] = useState<string>(STYLES[0].id);
  const [propsById, setPropsById] = useState<Record<string, StyleProps>>(initialProps);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [doc, setDoc] = useState<CaptionDoc | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(CAPTIONS_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Caption[]) => setCaptions(Array.isArray(data) ? data : []))
      .catch(() => setCaptions([]));
    // The kinetic templates lay out the caption DOCUMENT themselves rather than
    // painting a pre-grouped page, so the tuner needs the enriched file too.
    fetch(DOC_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CaptionDoc | null) => setDoc(d))
      .catch(() => setDoc(null));
  }, []);

  const durationInFrames = useMemo(() => {
    const lastMs = captions.length ? Math.max(...captions.map((c) => c.endMs)) : 0;
    return lastMs ? Math.ceil((lastMs / 1000) * FPS) + FPS : FALLBACK_FRAMES;
  }, [captions]);

  const entry = STYLE_BY_ID[styleId];
  const styleProps = propsById[styleId];

  const onChange = (key: string, value: unknown) =>
    setPropsById((prev) => ({ ...prev, [styleId]: { ...prev[styleId], [key]: value } }));

  const resetStyle = () =>
    setPropsById((prev) => ({ ...prev, [styleId]: { ...entry.defaults } }));

  const copyProps = () => {
    navigator.clipboard
      .writeText(JSON.stringify({ src: "<your video>", ...styleProps }, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  };

  const inputProps = useMemo(
    () => ({ src: SRC, captions, styleId, styleProps }),
    [captions, styleId, styleProps],
  );

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* ---- Control panel ---- */}
      <aside
        style={{
          width: 380,
          flexShrink: 0,
          borderRight: "1px solid #21212b",
          padding: 16,
          overflowY: "auto",
        }}
      >
        <h1 style={{ fontSize: 16, margin: "0 0 12px" }}>Caption Style Playground</h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyleId(s.id)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #2a2a35",
                cursor: "pointer",
                background: s.id === styleId ? "#2563eb" : "#16161d",
                color: "#e7e7ea",
                fontSize: 12,
              }}
            >
              {s.id}
            </button>
          ))}
        </div>

        <SchemaControls schema={entry.schema} values={styleProps} onChange={onChange} />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={copyProps}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #2a2a35",
              background: "#16161d",
              color: "#7dd3fc",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {copied ? "Copied!" : "Copy props JSON"}
          </button>
          <button
            type="button"
            onClick={resetStyle}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #2a2a35",
              background: "#16161d",
              color: "#e7e7ea",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Reset
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#5b5b69", marginTop: 10, lineHeight: 1.5 }}>
          Drag the sliders to tune live. "Copy props JSON" copies this style's props — paste them
          into the matching <code>defaultProps</code> in <code>src/Root.tsx</code> to use them in
          renders.
        </p>
      </aside>

      {/* ---- Live preview ---- */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          minWidth: 0,
        }}
      >
        {/* Document-driven templates (Gadzhi / Shiny / Hormozi) render the whole
            timeline from the caption document; the per-page styles are handed
            one pre-grouped page at a time. Feeding the wrong one leaves the
            preview blank, so pick the matching surface. */}
        {entry?.documentDriven ? (
          doc ? (
            <Player
              component={EditorPreview}
              inputProps={{ src: SRC, doc, styleId, styleProps }}
              durationInFrames={durationInFrames}
              fps={FPS}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ height: "calc(100vh - 48px)", aspectRatio: "9 / 16", borderRadius: 8 }}
              controls
              loop
              autoPlay
            />
          ) : (
            <span style={{ color: "#5b5b69", fontSize: 13 }}>
              Loading {DOC_URL} — run the enrich pass if this stays empty.
            </span>
          )
        ) : (
          <Player
            component={Preview}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={FPS}
            compositionWidth={1080}
            compositionHeight={1920}
            style={{ height: "calc(100vh - 48px)", aspectRatio: "9 / 16", borderRadius: 8 }}
            controls
            loop
            autoPlay
          />
        )}
      </main>
    </div>
  );
};
