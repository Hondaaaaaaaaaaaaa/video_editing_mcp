import React from "react";
import type { z } from "zod";
import type { StyleProps } from "./styles";
import { FONT_SLOT_BRAND, type FontSlot } from "../src/CaptionedVideo/styles/font-slot";
import { FontSlotControl } from "./FontSlotControl";

// ---------------------------------------------------------------------------
// Generate real HTML controls from a zod object schema. Numbers with
// .min()/.max() become <input type="range"> SLIDERS (the whole point), enums
// become <select>, booleans checkboxes, zColor() color pickers, arrays of
// colors an add/remove list. Introspection mirrors how Remotion reads zod v4
// (checks live at `_zod.def`), so the controls track the same schema wired to
// each <Composition>.
// ---------------------------------------------------------------------------

// zod internals are untyped here; keep one tightly-scoped escape hatch.
/* eslint-disable @typescript-eslint/no-explicit-any */
const getDef = (s: any): any => s?._def ?? s?._zod?.def;

const numConstraint = (s: any, kind: "min" | "max" | "step"): number | undefined => {
  const def = getDef(s);
  for (const c of def?.checks ?? []) {
    const d = c?._zod?.def;
    if (!d) continue;
    if (kind === "min" && d.check === "greater_than" && d.inclusive) return d.value;
    if (kind === "max" && d.check === "less_than" && d.inclusive) return d.value;
    if (kind === "step" && d.check === "multiple_of") return d.value;
  }
  return undefined;
};

const isColor = (s: any): boolean => s?.description === "__remotion-color";
const isFontSlot = (s: any): boolean => s?.description === FONT_SLOT_BRAND;
const fieldType = (s: any): string => getDef(s)?.type ?? "";
const enumValues = (s: any): string[] => Object.values(getDef(s)?.entries ?? {}) as string[];
const objectShape = (s: any): Record<string, any> => {
  const shape = getDef(s)?.shape;
  return typeof shape === "function" ? shape() : (shape ?? {});
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const labelize = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const row: React.CSSProperties = { marginBottom: 14 };
const labelStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  marginBottom: 4,
  color: "#b9b9c3",
};
const valueStyle: React.CSSProperties = { color: "#7dd3fc", fontVariantNumeric: "tabular-nums" };
const textInput: React.CSSProperties = {
  width: "100%",
  background: "#16161d",
  border: "1px solid #2a2a35",
  borderRadius: 6,
  color: "#e7e7ea",
  padding: "5px 8px",
  fontSize: 13,
};

const ColorInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  // Native swatch only understands #rrggbb; keep the text field as the source of
  // truth so rgba()/named colors still work.
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 28, padding: 0, background: "none", border: "none" }}
      />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={textInput} />
    </div>
  );
};

const Field: React.FC<{
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  value: unknown;
  onChange: (v: unknown) => void;
}> = ({ name, schema, value, onChange }) => {
  const type = fieldType(schema);

  // Font slot — branded object; gets its own picker + upload button instead of
  // the generic object -> {enum select, text box} rendering.
  if (isFontSlot(schema)) {
    return (
      <FontSlotControl
        label={labelize(name)}
        value={value as FontSlot | undefined}
        onChange={onChange}
      />
    );
  }

  // Color (zColor) — string with the remotion-color brand.
  if (isColor(schema)) {
    return (
      <div style={row}>
        <div style={labelStyle}>{labelize(name)}</div>
        <ColorInput value={String(value ?? "")} onChange={onChange} />
      </div>
    );
  }

  // Number with min/max -> SLIDER. Without min/max we still slide over a guessed
  // range so it's never a plain box.
  if (type === "number") {
    const min = numConstraint(schema, "min") ?? 0;
    const max = numConstraint(schema, "max") ?? 100;
    const step = numConstraint(schema, "step") ?? 1;
    const num = Number(value);
    return (
      <div style={row}>
        <div style={labelStyle}>
          <span>{labelize(name)}</span>
          <span style={valueStyle}>{num}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={num}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={num}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ ...textInput, width: 76 }}
          />
        </div>
        <div style={{ fontSize: 10, color: "#5b5b69", marginTop: 2 }}>
          {min} – {max} · step {step}
        </div>
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <label style={{ ...row, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 13 }}>{labelize(name)}</span>
      </label>
    );
  }

  if (type === "enum") {
    return (
      <div style={row}>
        <div style={labelStyle}>{labelize(name)}</div>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          style={textInput}
        >
          {enumValues(schema).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Array of OBJECTS (e.g. Speed's palette accents) -> one titled card per
  // entry, each recursing into the element schema, plus add/remove. Without
  // this an object array fell through to the colour-array branch below and
  // rendered as "[object Object]" swatches.
  if (type === "array" && getDef(getDef(schema)?.element ?? getDef(schema)?.type)?.shape) {
    const elementSchema = getDef(schema).element ?? getDef(schema).type;
    const shape = getDef(elementSchema).shape;
    const arr = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const set = (next: unknown[]) => onChange(next);
    // A new entry copies the LAST one and gives it a fresh id, so an added
    // colour arrives with sane outline/label fields already filled in.
    const blank = () => {
      const last = arr[arr.length - 1] ?? {};
      const n = arr.length + 1;
      return { ...last, id: `custom${n}`, label: `Custom ${n}`, enabled: true };
    };
    return (
      <div style={row}>
        <div style={labelStyle}>{labelize(name)}</div>
        {arr.map((item, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #2a2a35",
              borderRadius: 6,
              padding: 8,
              marginBottom: 6,
              background: "#131319",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 11, color: "#9aa" }}>
                {String(item.label ?? item.id ?? `#${i + 1}`)}
              </strong>
              <button
                type="button"
                onClick={() => set(arr.filter((_, j) => j !== i))}
                style={{ ...textInput, width: 28, cursor: "pointer" }}
                title="Remove this colour"
              >
                ✕
              </button>
            </div>
            {Object.keys(shape).map((k) => (
              <Field
                key={k}
                name={k}
                schema={shape[k]}
                value={item[k]}
                onChange={(v) =>
                  set(arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                }
              />
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() => set([...arr, blank()])}
          style={{ ...textInput, cursor: "pointer", color: "#7dd3fc" }}
        >
          + Add
        </button>
      </div>
    );
  }

  // Array of colors (e.g. textColors) -> add/remove list of color pickers.
  if (type === "array") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const set = (next: string[]) => onChange(next);
    return (
      <div style={row}>
        <div style={labelStyle}>{labelize(name)}</div>
        {arr.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <ColorInput value={c} onChange={(v) => set(arr.map((x, j) => (j === i ? v : x)))} />
            </div>
            <button
              type="button"
              onClick={() => set(arr.filter((_, j) => j !== i))}
              style={{ ...textInput, width: 32, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set([...arr, "#ffffff"])}
          style={{ ...textInput, cursor: "pointer", color: "#7dd3fc" }}
        >
          + Add color
        </button>
      </div>
    );
  }

  // Nested object -> a titled group that recurses. The sectioned schemas
  // (layout / text / motion / effects) are objects at the top level, and
  // without this every section collapsed into one "[object Object]" text box.
  if (type === "object") {
    const obj = (value ?? {}) as Record<string, unknown>;
    const shape = objectShape(schema);
    return (
      <fieldset
        style={{
          border: "1px solid #23232e",
          borderRadius: 8,
          padding: "10px 12px 2px",
          margin: "0 0 14px",
        }}
      >
        <legend style={{ fontSize: 11, color: "#7dd3fc", padding: "0 6px" }}>
          {labelize(name)}
        </legend>
        {Object.entries(shape).map(([k, sub]) => (
          <Field
            key={k}
            name={k}
            schema={sub}
            value={obj[k]}
            onChange={(v) => onChange({ ...obj, [k]: v })}
          />
        ))}
      </fieldset>
    );
  }

  // Fallback: plain string (e.g. cursorCharacter).
  return (
    <div style={row}>
      <div style={labelStyle}>{labelize(name)}</div>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        style={textInput}
      />
    </div>
  );
};

export const SchemaControls: React.FC<{
  schema: z.ZodTypeAny;
  values: StyleProps;
  onChange: (key: string, value: unknown) => void;
}> = ({ schema, values, onChange }) => {
  const shape = objectShape(schema);
  return (
    <div>
      {Object.entries(shape)
        .filter(([key]) => key !== "src") // src is fixed to the sample video
        .map(([key, fieldSchema]) => (
          <Field
            key={key}
            name={key}
            schema={fieldSchema}
            value={values[key]}
            onChange={(v) => onChange(key, v)}
          />
        ))}
    </div>
  );
};
