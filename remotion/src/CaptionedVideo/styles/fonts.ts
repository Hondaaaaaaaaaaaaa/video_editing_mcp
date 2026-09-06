import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMarcellus } from "@remotion/google-fonts/Marcellus";
import { staticFile } from "remotion";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared font picker for every caption style.
//
// One source of truth so Classic / Shiny / Typewriter / Highlight all expose
// the same `fontFamily` dropdown (z.enum -> Studio dropdown). Each template
// spreads `fontFamilySchema` into its schema, adds `FontSelection` to its style
// type + defaults, and resolves the picked name to a real loaded CSS family via
// `resolveFontFamily()`.
//
// Every option is a Google Font (no binary .ttf shipped in the repo). Adding a
// font here is the only change needed to offer it in all templates. Per-user
// uploaded fonts come later in the web UI.
// ---------------------------------------------------------------------------

// Dropdown options shown in Studio. The display name doubles as the enum value.
export const FONT_FAMILIES = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Bebas Neue",
  "Anton",
  "Playfair Display",
  "Marcellus",
  "Kufyan Arabic",
] as const;
export type FontFamilyName = (typeof FONT_FAMILIES)[number];

// Default == the original caption font, so existing compositions are unchanged.
export const FONT_FAMILY_DEFAULT: FontFamilyName = "Inter";

// Load each option once, at module load. Heavy weights read best as captions;
// Inter / Montserrat / Poppins ship 700 + 800, while Bebas Neue + Anton are
// single-weight (400) display faces that are already bold by design. Options
// are inlined (not extracted) so the weight literals get contextually typed.
// Montserrat also carries the LIGHT end (200/300): the Gadzhi template pairs a
// bold spoken line with a thin unspoken one, so both extremes of the family have
// to be loaded or the browser synthesises a fake thin weight.
const inter = loadInter("normal", { weights: ["200", "300", "700", "800"], subsets: ["latin"] });
const montserrat = loadMontserrat("normal", {
  weights: ["200", "300", "700", "800"],
  subsets: ["latin"],
});
const poppins = loadPoppins("normal", { weights: ["200", "300", "700", "800"], subsets: ["latin"] });
const bebasNeue = loadBebasNeue("normal", { weights: ["400"], subsets: ["latin"] });
const anton = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
// Playfair Display — the high-contrast Didone serif behind the "elegant" role in
// kinetic templates. Loaded ITALIC (the reference's elegant words are all
// italic) at 500/700 so both a lighter and a bolder italic are available.
const playfair = loadPlayfair("italic", { weights: ["500", "700"], subsets: ["latin"] });
// Marcellus — the classical Roman inscriptional serif behind Typewriter 3.
// Single weight (400) by design, like Bebas Neue and Anton: the face is already
// the shape it wants to be, and a synthesised bold would ruin the thin strokes
// that make it read as carved rather than printed. Identified by fingerprinting
// the reel's captions (ink width over cap height) against 21 Roman serifs — it
// won at 0.46% error, and held at 1.57% on two captions kept out of the fit.
const marcellus = loadMarcellus("normal", { weights: ["400"], subsets: ["latin"] });

// --- Local Arabic font (shipped in public/fonts, not a Google Font) ---------
// Kufyan Arabic — a Kufi display face for Arabic captions. Loaded via the native
// FontFace API (no @remotion/fonts dependency). The `staticFile` URL is resolved
// at module load; the actual load is async and awaited in loadFonts(). Guarded
// for the Node/SSR pass where `document` doesn't exist.
const KUFYAN_ARABIC_FAMILY = "Kufyan Arabic";
const kufyanArabicUrl = staticFile("fonts/KufyanArabic-Medium.ttf");
let kufyanArabicPromise: Promise<void> | null = null;
const loadKufyanArabic = (): Promise<void> => {
  if (typeof document === "undefined") return Promise.resolve();
  if (!kufyanArabicPromise) {
    const face = new FontFace(KUFYAN_ARABIC_FAMILY, `url(${kufyanArabicUrl})`);
    kufyanArabicPromise = face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
  }
  return kufyanArabicPromise;
};

// The actual CSS font-family string for each option, keyed by display name.
const FAMILY_BY_NAME: Record<FontFamilyName, string> = {
  Inter: inter.fontFamily,
  Montserrat: montserrat.fontFamily,
  Poppins: poppins.fontFamily,
  "Bebas Neue": bebasNeue.fontFamily,
  Anton: anton.fontFamily,
  "Playfair Display": playfair.fontFamily,
  Marcellus: marcellus.fontFamily,
  "Kufyan Arabic": KUFYAN_ARABIC_FAMILY,
};

// Resolve a dropdown selection to its loaded CSS font-family (falls back to the
// default font if an unknown value ever sneaks in).
export const resolveFontFamily = (name: FontFamilyName): string =>
  FAMILY_BY_NAME[name] ?? FAMILY_BY_NAME[FONT_FAMILY_DEFAULT];

// --- the bits each template / composition spreads in ---

// Spread into a `captionedVideoSchema.extend({ ... })` call -> Studio dropdown.
export const fontFamilySchema = {
  fontFamily: z.enum(FONT_FAMILIES),
};

export type FontSelection = {
  fontFamily: FontFamilyName;
};

export const FONT_DEFAULTS: FontSelection = {
  fontFamily: FONT_FAMILY_DEFAULT,
};

// Awaited inside delayRender() (see CaptionedVideo) so renders wait for every
// selectable font to be ready — switching fonts in Studio won't flash
// unstyled text.
export const loadFonts = async (): Promise<void> => {
  await Promise.all([
    ...[inter, montserrat, poppins, bebasNeue, anton, playfair].map((h) => h.waitUntilDone()),
    loadKufyanArabic(),
  ]);
};
