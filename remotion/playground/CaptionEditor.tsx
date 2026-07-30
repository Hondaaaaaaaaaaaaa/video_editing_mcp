import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import type { CaptionDoc } from "../src/CaptionedVideo/styles/types";
import { EditorPreview, HORMOZI_STYLE_DEFAULT } from "./EditorPreview";
import {
  breakLineBefore,
  mergeCaptionWithNext,
  mergeLineUp,
  setLineCount,
  splitCaptionBefore,
  toggleEmphasis,
  withIds,
} from "./captionDoc";

const FPS = 30;
const SRC = "/sample-video.mp4"; // served from ../public by Vite
const DOC_URL = "/sample-video.enriched.json";
const FALLBACK_FRAMES = 600;

type Sel = { s: number; l: number; w: number } | null;

// --- tiny style helpers (match the dark playground theme) ---
const btn = (active = false, accent = false): React.CSSProperties => ({
  padding: "4px 9px",
  borderRadius: 6,
  border: "1px solid #2a2a35",
  cursor: "pointer",
  fontSize: 12,
  background: active ? "#2563eb" : accent ? "#1c2733" : "#16161d",
  color: active ? "#fff" : accent ? "#7dd3fc" : "#e7e7ea",
});

export const CaptionEditor: React.FC = () => {
  const [doc, setDoc] = useState<CaptionDoc | null>(null);
  const [sel, setSel] = useState<Sel>(null);

  useEffect(() => {
    fetch(DOC_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CaptionDoc | null) => setDoc(d ? withIds(d) : null))
      .catch(() => setDoc(null));
  }, []);

  const durationInFrames = useMemo(() => {
    if (!doc) return FALLBACK_FRAMES;
    const words = doc.segments.flatMap((s) => s.lines.flatMap((l) => l.words));
    const lastMs = words.length ? Math.max(...words.map((w) => w.endMs)) : 0;
    return lastMs ? Math.ceil((lastMs / 1000) * FPS) + FPS : FALLBACK_FRAMES;
  }, [doc]);

  if (!doc) {
    return (
      <div style={{ padding: 24, color: "#e7e7ea" }}>
        Loading caption document (<code>{DOC_URL}</code>)… run the enrich pass first if this
        stays empty.
      </div>
    );
  }

  // Apply an operation and clear selection (indices may shift after an edit).
  const apply = (next: CaptionDoc) => {
    setDoc(next);
    setSel(null);
  };

  const selWord =
    sel && doc.segments[sel.s]?.lines[sel.l]?.words[sel.w]
      ? doc.segments[sel.s].lines[sel.l].words[sel.w]
      : null;

  const exportDoc = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-video.enriched.edited.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", height: "100vh", color: "#e7e7ea" }}>
      {/* ---- Editor panel ---- */}
      <aside
        style={{
          width: 460,
          flexShrink: 0,
          borderRight: "1px solid #21212b",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #21212b" }}>
          <h1 style={{ fontSize: 15, margin: 0 }}>Caption Editor — Hormozi</h1>
          <p style={{ fontSize: 11, color: "#6b6b79", margin: "6px 0 0", lineHeight: 1.5 }}>
            Click a word, then choose an action. Auto is the starting point; every edit is
            yours and pins that caption.
          </p>
        </div>

        {/* Context action bar — reacts to the selected word */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "10px 16px",
            borderBottom: "1px solid #21212b",
            minHeight: 34,
            alignItems: "center",
          }}
        >
          {selWord ? (
            <>
              <span style={{ fontSize: 11, color: "#6b6b79", marginRight: 4 }}>
                “{selWord.text}”
              </span>
              <button
                type="button"
                style={btn(selWord.emphasis)}
                onClick={() => apply(toggleEmphasis(doc, sel!.s, sel!.l, sel!.w))}
              >
                ★ Emphasis
              </button>
              <button
                type="button"
                style={btn(false, true)}
                disabled={sel!.w <= 0}
                onClick={() => apply(breakLineBefore(doc, sel!.s, sel!.l, sel!.w))}
              >
                ⏎ Break line
              </button>
              <button
                type="button"
                style={btn(false, true)}
                onClick={() => apply(splitCaptionBefore(doc, sel!.s, sel!.l, sel!.w))}
              >
                ✂ New caption here
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#5b5b69" }}>
              Select a word to move it, break a line, or start a new caption.
            </span>
          )}
        </div>

        {/* Caption list */}
        <div style={{ overflowY: "auto", padding: 12, flex: 1 }}>
          {doc.segments.map((seg, s) => {
            const lineCount = seg.lines.length;
            return (
              <div
                key={seg.id ?? s}
                style={{
                  border: "1px solid #23232e",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 10,
                  background: "#121218",
                }}
              >
                {/* caption header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                    fontSize: 11,
                    color: "#6b6b79",
                  }}
                >
                  <span>#{s + 1}</span>
                  {seg.edited ? (
                    <span style={{ color: "#f59e0b" }}>• edited</span>
                  ) : (
                    <span style={{ color: "#3f6b3f" }}>• auto</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "#4b4b59" }}>lines</span>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      style={btn(n === lineCount)}
                      onClick={() => apply(setLineCount(doc, s, n))}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={btn(false, true)}
                    disabled={s >= doc.segments.length - 1}
                    onClick={() => apply(mergeCaptionWithNext(doc, s))}
                    title="Merge with next caption"
                  >
                    ⇊
                  </button>
                </div>

                {/* lines of word chips */}
                {seg.lines.map((line, l) => (
                  <div
                    key={l}
                    style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginBottom: 4 }}
                  >
                    {l > 0 ? (
                      <button
                        type="button"
                        style={{ ...btn(false), padding: "2px 6px", color: "#8b8b99" }}
                        onClick={() => apply(mergeLineUp(doc, s, l))}
                        title="Merge into line above"
                      >
                        ⤴
                      </button>
                    ) : null}
                    {line.words.map((word, w) => {
                      const isSel = sel && sel.s === s && sel.l === l && sel.w === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setSel({ s, l, w })}
                          dir="auto"
                          style={{
                            padding: "3px 7px",
                            borderRadius: 5,
                            border: isSel ? "1px solid #2563eb" : "1px solid #2a2a35",
                            cursor: "pointer",
                            fontSize: 13,
                            background: isSel ? "#1e3a8a" : word.emphasis ? "#3a2f10" : "#1b1b22",
                            color: word.emphasis ? "#ffd400" : "#e7e7ea",
                          }}
                        >
                          {word.text}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #21212b" }}>
          <button type="button" style={{ ...btn(false, true), width: "100%", padding: "9px 10px" }} onClick={exportDoc}>
            Export edited document (JSON)
          </button>
        </div>
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
          background: "#0b0b0f",
        }}
      >
        <Player
          component={EditorPreview}
          inputProps={{ src: SRC, doc, style: HORMOZI_STYLE_DEFAULT }}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ height: "calc(100vh - 48px)", aspectRatio: "9 / 16", borderRadius: 8 }}
          controls
          loop
        />
      </main>
    </div>
  );
};
