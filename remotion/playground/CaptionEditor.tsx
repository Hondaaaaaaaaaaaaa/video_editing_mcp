import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { getVideoMetadata } from "@remotion/media-utils";
import type { CaptionDoc } from "../src/CaptionedVideo/styles/types";
import { EditorPreview } from "./EditorPreview";
import { EDITOR_STYLES } from "./styles";
import {
  mergeCaptionWithNext,
  moveWordsToNextSentence,
  moveWordsToPrevSentence,
  setLineCount,
  stepAddress,
  toggleEmphasis,
  withIds,
  type WordAddr,
} from "./captionDoc";
import { useHistory } from "./useHistory";

const FPS = 30;
const FALLBACK_FRAMES = 600;
// Portrait 9:16 until the real clip's dimensions come back from the file.
const FALLBACK_SIZE = { width: 1080, height: 1920 };

/** A clip the editor can open: a video in public/ plus its enriched document. */
type Clip = { name: string; video: string; doc: string };

type Sel = WordAddr | null;
// Document + selection travel together through the undo timeline, so undoing a
// word move puts the caret back on the word it moved.
type EditorState = { doc: CaptionDoc | null; sel: Sel };

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

const select_: React.CSSProperties = {
  background: "#16161d",
  color: "#e7e7ea",
  border: "1px solid #2a2a35",
  borderRadius: 6,
  padding: "4px 6px",
  fontSize: 12,
  maxWidth: 190,
};

const kbd: React.CSSProperties = {
  fontSize: 10,
  color: "#5b5b69",
  border: "1px solid #23232e",
  borderRadius: 4,
  padding: "1px 4px",
};

export const CaptionEditor: React.FC = () => {
  const hist = useHistory<EditorState>({ doc: null, sel: null });
  const { doc, sel } = hist.state;
  const { push, replace, reset, undo, redo, canUndo, canRedo } = hist;

  // --- which clip + which template ---------------------------------------
  const [clips, setClips] = useState<Clip[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [styleId, setStyleId] = useState<string>(EDITOR_STYLES[0]?.id ?? "Hormozi");
  const [size, setSize] = useState(FALLBACK_SIZE);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);

  const styleProps = useMemo(
    () => EDITOR_STYLES.find((s) => s.id === styleId)?.defaults ?? {},
    [styleId],
  );

  // Discover clips from the dev server (any video in public/ with a matching
  // `.enriched.json`). Falls back to nothing, and the UI says so.
  useEffect(() => {
    fetch("/api/clips")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Clip[]) => {
        setClips(list);
        setClip((c) => c ?? list.find((x) => x.name === "sample-video") ?? list[0] ?? null);
      })
      .catch(() => setClips([]));
  }, []);

  // Load the selected clip's caption document.
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    fetch(clip.doc)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CaptionDoc | null) => {
        if (!cancelled) reset({ doc: d ? withIds(d) : null, sel: null });
      })
      .catch(() => {
        if (!cancelled) reset({ doc: null, sel: null });
      });
    return () => {
      cancelled = true;
    };
  }, [clip, reset]);

  // Real frame size + duration, so a 16:9 clip isn't previewed in a 9:16 box.
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    setSize(FALLBACK_SIZE);
    setVideoSeconds(null);
    getVideoMetadata(clip.video)
      .then((m) => {
        if (cancelled) return;
        setSize({ width: m.width, height: m.height });
        setVideoSeconds(m.durationInSeconds);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clip]);

  const durationInFrames = useMemo(() => {
    if (videoSeconds) return Math.max(1, Math.ceil(videoSeconds * FPS));
    if (!doc) return FALLBACK_FRAMES;
    const words = doc.segments.flatMap((s) => s.lines.flatMap((l) => l.words));
    const lastMs = words.length ? Math.max(...words.map((w) => w.endMs)) : 0;
    return lastMs ? Math.ceil((lastMs / 1000) * FPS) + FPS : FALLBACK_FRAMES;
  }, [doc, videoSeconds]);

  // An EDIT: new document, new selection, one undo step. Structural edits pass
  // no selection (indices shift under them) and simply clear it.
  const apply = useCallback(
    (next: CaptionDoc, nextSel: Sel = null) => push({ doc: next, sel: nextSel }),
    [push],
  );
  // Selection only — no undo step.
  const select = useCallback((next: Sel) => replace({ doc, sel: next }), [replace, doc]);

  // The two boundary moves, shared by the buttons and the ←/→ keys. The moved
  // word stays selected so it can be walked across several captions in a row.
  // Move the selected word — and everything after it (→) or before it (←) —
  // into the adjacent sentence. The moved word stays selected.
  const moveWord = useCallback(
    (dir: 1 | -1) => {
      if (!doc || !sel) return;
      const res =
        dir === 1
          ? moveWordsToNextSentence(doc, sel.s, sel.l, sel.w)
          : moveWordsToPrevSentence(doc, sel.s, sel.l, sel.w);
      if (res) push({ doc: res.doc, sel: res.sel });
    },
    [doc, sel, push],
  );

  // --- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (!doc || !sel) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowLeft": {
          e.preventDefault();
          const forward = e.key === "ArrowRight";
          // Alt walks the SELECTION; plain arrows MOVE the word (+ rest) to the
          // next / previous sentence.
          if (e.altKey) select(stepAddress(doc, sel, forward ? 1 : -1));
          else moveWord(forward ? 1 : -1);
          return;
        }
        case "Escape":
          select(null);
          return;
        default:
          break;
      }

      if (mod) return; // leave browser/OS combos alone
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        apply(toggleEmphasis(doc, sel.s, sel.l, sel.w), sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, sel, apply, select, moveWord, undo, redo]);

  const selWord =
    sel && doc?.segments[sel.s]?.lines[sel.l]?.words[sel.w]
      ? doc.segments[sel.s].lines[sel.l].words[sel.w]
      : null;
  // A word can always move to an adjacent sentence (a new one is created at the
  // ends), so the only requirement is that a word is selected.
  const canMove = Boolean(selWord);

  const exportDoc = () => {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip?.name ?? "captions"}.enriched.edited.json`;
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h1 style={{ fontSize: 15, margin: 0, flex: 1 }}>Caption Editor</h1>
            <button
              type="button"
              style={btn()}
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↶
            </button>
            <button
              type="button"
              style={btn()}
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↷
            </button>
          </div>

          {/* clip + template pickers */}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <select
              style={{ ...select_, flex: 1 }}
              value={clip?.name ?? ""}
              onChange={(e) =>
                setClip(clips.find((c) => c.name === e.target.value) ?? null)
              }
              title="Clip (any video in public/ with a matching .enriched.json)"
            >
              {clips.length ? null : <option value="">no clips found</option>}
              {clips.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              style={select_}
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              title="Caption template"
            >
              {EDITOR_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: 11, color: "#6b6b79", margin: "8px 0 0", lineHeight: 1.6 }}>
            Click a word, then move it (and everything after / before it) to the next or previous
            sentence. Auto is the starting point; every edit pins that caption.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
            <span style={kbd}>← →&nbsp; move to sentence</span>
            <span style={kbd}>alt+← →&nbsp; select</span>
            <span style={kbd}>E&nbsp; emphasis</span>
            <span style={kbd}>⌘Z&nbsp; undo</span>
          </div>
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
          {selWord && doc && sel ? (
            <>
              <span style={{ fontSize: 11, color: "#6b6b79", marginRight: 4 }}>
                “{selWord.text}”
              </span>
              <button
                type="button"
                style={btn(false, true)}
                disabled={!canMove}
                onClick={() => moveWord(-1)}
                title="Move this word and everything BEFORE it to the end of the previous sentence"
              >
                ← previous sentence
              </button>
              <button
                type="button"
                style={btn(false, true)}
                disabled={!canMove}
                onClick={() => moveWord(1)}
                title="Move this word and everything AFTER it to the start of the next sentence"
              >
                next sentence →
              </button>
              <button
                type="button"
                style={btn(selWord.emphasis)}
                onClick={() => apply(toggleEmphasis(doc, sel.s, sel.l, sel.w), sel)}
              >
                ★ Emphasis
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#5b5b69" }}>
              Select a word to move it to the next or previous sentence.
            </span>
          )}
        </div>

        {/* Caption list */}
        <div style={{ overflowY: "auto", padding: 12, flex: 1 }}>
          {!doc ? (
            <p style={{ fontSize: 12, color: "#6b6b79", lineHeight: 1.6 }}>
              No caption document loaded. Put a video in <code>public/</code> and run the
              transcribe → enrich pass so a matching <code>.enriched.json</code> sits next to
              it, then pick it above.
            </p>
          ) : null}
          {doc?.segments.map((seg, s) => {
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
                    {line.words.map((word, w) => {
                      const isSel = sel && sel.s === s && sel.l === l && sel.w === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => select({ s, l, w })}
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
          <button
            type="button"
            style={{ ...btn(false, true), width: "100%", padding: "9px 10px" }}
            disabled={!doc}
            onClick={exportDoc}
          >
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
        {clip && doc ? (
          <Player
            component={EditorPreview}
            inputProps={{ src: clip.video, doc, styleId, styleProps }}
            durationInFrames={durationInFrames}
            fps={FPS}
            compositionWidth={size.width}
            compositionHeight={size.height}
            style={{
              height: "calc(100vh - 48px)",
              aspectRatio: `${size.width} / ${size.height}`,
              borderRadius: 8,
            }}
            controls
            loop
          />
        ) : (
          <span style={{ color: "#5b5b69", fontSize: 13 }}>No clip selected.</span>
        )}
      </main>
    </div>
  );
};
