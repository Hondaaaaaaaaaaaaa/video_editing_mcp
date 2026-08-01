// ---------------------------------------------------------------------------
// FONT SLOTS — "a built-in family, OR a font file the client uploaded".
//
// The original `fontFamilySchema` offers one dropdown of built-in families,
// which is all most templates need. Gadzhi shows TWO weights on screen at the
// same time (a bold spoken line over a thin unspoken one), and a client may
// want to supply their own face for each — so a slot is the reusable unit:
// every template that wants a custom font takes one or more `fontSlotSchema`s
// instead of a bare enum. Nothing here changes the existing picker.
//
// WHY A FILE ON DISK, NOT A BROWSER UPLOAD: a font chosen with <input
// type="file"> only exists as a blob URL inside that one tab. Remotion Studio
// and `remotion render` load the composition in a SEPARATE browser, so such a
// font is invisible to them and the export silently falls back. A slot
// therefore stores a PATH under public/fonts (e.g. "uploads/Client-Bold.otf"),
// which `staticFile()` resolves in every context. The playground's upload
// button writes the file there; in the hosted product that POST becomes an
// object-storage upload and this module is unchanged.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { z } from "zod";
import {
  FONT_FAMILIES,
  FONT_FAMILY_DEFAULT,
  resolveFontFamily,
  type FontFamilyName,
} from "./fonts";

// Marks the schema so the playground renders its own font-slot widget (dropdown
// of built-ins + discovered files, plus an Upload button) instead of the
// generic object -> select + text box it would otherwise generate. Mirrors how
// zColor() brands itself with "__remotion-color".
export const FONT_SLOT_BRAND = "__vemcp-font-slot";

export const fontSlotSchema = z
  .object({
    // Used whenever `custom` is empty.
    family: z.enum(FONT_FAMILIES),
    // Path RELATIVE TO public/fonts, "" for none. e.g. "uploads/Client-Bold.otf"
    // or "montserrat full version/Montserrat-Thin.otf".
    custom: z.string(),
  })
  .describe(FONT_SLOT_BRAND);

export type FontSlot = {
  family: FontFamilyName;
  custom: string;
};

export const fontSlot = (family: FontFamilyName = FONT_FAMILY_DEFAULT): FontSlot => ({
  family,
  custom: "",
});

// ---------------------------------------------------------------------------
// Registering an uploaded file as a usable CSS family.
// ---------------------------------------------------------------------------

/** A stable, CSS-safe family name derived from the file path. */
const customFamilyName = (file: string): string =>
  `vemcp-${file.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

/** Weight range a font actually supports. `null` = no variable weight axis. */
export type WeightAxis = { min: number; max: number } | null;

type LoadedFont = { family: string; axis: WeightAxis };

const loaded = new Map<string, Promise<LoadedFont>>();

/**
 * Read the `wght` variation axis out of a font binary.
 *
 * A normal font file is ONE weight — asking the browser for a bold it does not
 * contain makes it smear the outlines into a fake bold. A variable font carries
 * a whole range in one file, and only then is a weight slider meaningful. The
 * `fvar` table is what distinguishes them, so we read it directly rather than
 * guessing from the filename.
 *
 * Returns null for .woff/.woff2 (the tables are compressed, and decompressing
 * them here would cost more than it's worth) — those are treated as static.
 */
const readWeightAxis = (buf: ArrayBuffer): WeightAxis => {
  try {
    const dv = new DataView(buf);
    if (dv.byteLength < 12) return null;
    const tag = dv.getUint32(0);
    // 0x00010000 = TrueType outlines, "OTTO" = CFF outlines. "wOFF"/"wOF2" are
    // compressed containers and "ttcf" collections put something other than a
    // table directory at offset 12 — all treated as static rather than guessed.
    if (tag !== 0x00010000 && tag !== 0x4f54544f) return null;

    const numTables = dv.getUint16(4);
    let fvarOffset = 0;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (rec + 16 > dv.byteLength) return null;
      const name = String.fromCharCode(
        dv.getUint8(rec),
        dv.getUint8(rec + 1),
        dv.getUint8(rec + 2),
        dv.getUint8(rec + 3),
      );
      if (name === "fvar") {
        fvarOffset = dv.getUint32(rec + 8);
        break;
      }
    }
    if (!fvarOffset || fvarOffset + 16 > dv.byteLength) return null;

    const axesArrayOffset = fvarOffset + dv.getUint16(fvarOffset + 4);
    const axisCount = dv.getUint16(fvarOffset + 8);
    const axisSize = dv.getUint16(fvarOffset + 10);
    // VariationAxisRecord: tag[4] minValue[4] defaultValue[4] maxValue[4]
    // flags[2] axisNameID[2] = 20 bytes.
    for (let i = 0; i < axisCount; i++) {
      const a = axesArrayOffset + i * axisSize;
      if (a + 20 > dv.byteLength) break;
      const axisTag = String.fromCharCode(
        dv.getUint8(a),
        dv.getUint8(a + 1),
        dv.getUint8(a + 2),
        dv.getUint8(a + 3),
      );
      if (axisTag === "wght") {
        // Fixed 16.16 values.
        const min = dv.getInt32(a + 4) / 65536;
        const max = dv.getInt32(a + 12) / 65536;
        if (max > min) return { min: Math.round(min), max: Math.round(max) };
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Fetch + register an uploaded font once, and report whether it has a real
 * weight axis. Cached per file so repeated renders don't refetch.
 */
export const loadCustomFont = (file: string): Promise<LoadedFont> => {
  const existing = loaded.get(file);
  if (existing) return existing;

  const family = customFamilyName(file);
  const url = staticFile(`fonts/${file}`);
  const promise = (async (): Promise<LoadedFont> => {
    if (typeof document === "undefined") return { family, axis: null };
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${file}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const face = new FontFace(family, buf);
    await face.load();
    document.fonts.add(face);
    return { family, axis: readWeightAxis(buf) };
  })();

  loaded.set(file, promise);
  return promise;
};

export type ResolvedFont = {
  /** CSS font-family to render with. */
  fontFamily: string;
  /**
   * The weight axis of a custom font, or `undefined` for a built-in family
   * (whose separate per-weight files make any weight valid). `null` means the
   * uploaded file is a single static weight — callers must NOT send it a weight
   * number, or the browser fakes one.
   */
  axis: WeightAxis | undefined;
  /** False while an uploaded font is still being fetched. */
  ready: boolean;
};

/**
 * Resolve a slot to a renderable family. Built-in families resolve
 * synchronously; an uploaded file is fetched, and the render is held open with
 * delayRender() so an export never paints a frame in the fallback face.
 */
export const useFontSlot = (slot: FontSlot | undefined): ResolvedFont => {
  const file = slot?.custom ?? "";
  const builtIn = resolveFontFamily(slot?.family ?? FONT_FAMILY_DEFAULT);
  const [state, setState] = useState<{ family: string; axis: WeightAxis } | null>(null);

  useEffect(() => {
    if (!file) {
      setState(null);
      return;
    }
    let cancelled = false;
    const handle = delayRender(`Loading custom font ${file}`);
    // continueRender must fire exactly once per handle, whether the load
    // settles or the effect is torn down first.
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        continueRender(handle);
      }
    };
    loadCustomFont(file)
      .then((res) => {
        if (!cancelled) setState(res);
      })
      .catch(() => {
        // A missing or invalid upload falls back to the built-in family rather
        // than failing the whole render.
        if (!cancelled) setState(null);
      })
      .finally(release);
    return () => {
      cancelled = true;
      release();
    };
  }, [file]);

  if (!file) return { fontFamily: builtIn, axis: undefined, ready: true };
  if (!state) return { fontFamily: builtIn, axis: null, ready: false };
  return { fontFamily: state.family, axis: state.axis, ready: true };
};

/**
 * The weight to actually put in CSS. A static uploaded file already IS its
 * weight, so we send `normal` and let the file speak; anything else invites a
 * synthesised faux-bold.
 */
export const effectiveWeight = (
  resolved: ResolvedFont,
  requested: number,
): number | "normal" => {
  if (resolved.axis === undefined) return requested; // built-in family
  if (resolved.axis === null) return "normal"; // static uploaded file
  return Math.max(resolved.axis.min, Math.min(resolved.axis.max, requested));
};
