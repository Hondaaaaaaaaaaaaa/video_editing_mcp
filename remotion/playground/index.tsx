import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CaptionEditor } from "./CaptionEditor";

// A thin shell that switches between the Phase 2 Caption Editor (the new
// per-caption editing UI) and the original Style Tuner (schema sliders).
const Shell: React.FC = () => {
  const [tab, setTab] = useState<"editor" | "tuner">("editor");
  const tabBtn = (id: "editor" | "tuner", label: string): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #2a2a35",
    cursor: "pointer",
    fontSize: 12,
    background: tab === id ? "#2563eb" : "#16161d",
    color: "#e7e7ea",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0b0b0f" }}>
      <nav
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #21212b",
          alignItems: "center",
        }}
      >
        <strong style={{ color: "#e7e7ea", fontSize: 13, marginRight: 8 }}>VEMCP Captions</strong>
        <button type="button" style={tabBtn("editor", "editor")} onClick={() => setTab("editor")}>
          Caption Editor
        </button>
        <button type="button" style={tabBtn("tuner", "tuner")} onClick={() => setTab("tuner")}>
          Style Tuner
        </button>
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>{tab === "editor" ? <CaptionEditor /> : <App />}</div>
    </div>
  );
};

const el = document.getElementById("root");
if (!el) {
  throw new Error("missing #root");
}
createRoot(el).render(<Shell />);
