// Font loading now lives in styles/fonts.ts, which loads every selectable
// caption font (a small set of Google Fonts). This module stays as the engine's
// entry point: it awaits ALL of them so whichever font is picked in Studio is
// ready before the first frame renders, and still exposes the default family
// for any code that needs a font without a prop.
import { loadFonts, resolveFontFamily, FONT_FAMILY_DEFAULT } from "./styles/fonts";

// Default caption font (Inter) as a ready-to-use CSS font-family string.
export const fontFamily = resolveFontFamily(FONT_FAMILY_DEFAULT);

// Awaited inside delayRender() in CaptionedVideo so renders wait for fonts.
export const loadFont = loadFonts;
