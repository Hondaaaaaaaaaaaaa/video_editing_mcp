import React, { useEffect, useRef, useState } from "react";
import { FONT_FAMILIES } from "../src/CaptionedVideo/styles/fonts";
import type { FontSlot } from "../src/CaptionedVideo/styles/font-slot";

// ---------------------------------------------------------------------------
// The control behind a `fontSlotSchema` field: pick a built-in family, pick a
// font already sitting in public/fonts, or upload a new one.
//
// The upload POSTs to the dev server, which writes the file into
// public/fonts/uploads/ — NOT a browser-only blob. That matters because a blob
// URL exists in one tab and would be invisible to Remotion Studio and to
// `remotion render`, so an exported video would silently fall back to the
// built-in face. Storing a real file means what you preview is what you export.
// ---------------------------------------------------------------------------

export type FontFile = { file: string; label: string };

// The catalogue is shared by every slot on screen, so fetch it once and let the
// slots subscribe. An upload refreshes it for all of them.
let catalogue: FontFile[] | null = null;
const listeners = new Set<(f: FontFile[]) => void>();

const refreshCatalogue = async (): Promise<void> => {
  try {
    const res = await fetch("/api/fonts");
    catalogue = res.ok ? await res.json() : [];
  } catch {
    catalogue = [];
  }
  for (const l of listeners) l(catalogue ?? []);
};

const useFontCatalogue = (): FontFile[] => {
  const [files, setFiles] = useState<FontFile[]>(catalogue ?? []);
  useEffect(() => {
    listeners.add(setFiles);
    if (catalogue === null) void refreshCatalogue();
    else setFiles(catalogue);
    return () => {
      listeners.delete(setFiles);
    };
  }, []);
  return files;
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#16161d",
  border: "1px solid #2a2a35",
  borderRadius: 6,
  color: "#e7e7ea",
  padding: "5px 8px",
  fontSize: 13,
};

const BUILTIN = "__builtin__";

export const FontSlotControl: React.FC<{
  label: string;
  value: FontSlot | undefined;
  onChange: (v: FontSlot) => void;
}> = ({ label, value, onChange }) => {
  const files = useFontCatalogue();
  const slot: FontSlot = value ?? { family: "Montserrat", custom: "" };
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy("Uploading…");
    try {
      const res = await fetch(`/api/fonts/upload?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await refreshCatalogue();
      onChange({ ...slot, custom: body.file });
      setBusy(null);
    } catch (e) {
      setBusy(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, marginBottom: 4, color: "#b9b9c3" }}>{label}</div>
      <select
        style={input}
        value={slot.custom ? slot.custom : BUILTIN}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === BUILTIN ? { ...slot, custom: "" } : { ...slot, custom: v });
        }}
      >
        <optgroup label="Built-in">
          <option value={BUILTIN}>{slot.family} (built-in)</option>
        </optgroup>
        {files.length ? (
          <optgroup label="From public/fonts">
            {files.map((f) => (
              <option key={f.file} value={f.file}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {/* Which built-in family the slot falls back to — only meaningful while
          no custom file is selected. */}
      {!slot.custom ? (
        <select
          style={{ ...input, marginTop: 6 }}
          value={slot.family}
          onChange={(e) => onChange({ ...slot, family: e.target.value as FontSlot["family"] })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      ) : null}

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{ ...input, width: "auto", cursor: "pointer", color: "#7dd3fc" }}
        >
          ⬆ Upload font
        </button>
        {slot.custom ? (
          <button
            type="button"
            onClick={() => onChange({ ...slot, custom: "" })}
            style={{ ...input, width: "auto", cursor: "pointer" }}
            title="Go back to the built-in family"
          >
            ✕
          </button>
        ) : null}
        {busy ? <span style={{ fontSize: 11, color: "#f59e0b" }}>{busy}</span> : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      <div style={{ fontSize: 10, color: "#5b5b69", marginTop: 4, lineHeight: 1.5 }}>
        {slot.custom
          ? "Custom file — the weight slider applies only if this is a variable font."
          : "Built-in family — the weight slider picks a real weight."}
      </div>
    </div>
  );
};
