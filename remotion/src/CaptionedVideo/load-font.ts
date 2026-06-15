import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// A heavy weight reads well as a TikTok-style caption. Using a Google Font
// means we don't have to ship a binary .ttf in the repo.
const loaded = loadInter("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
});

export const fontFamily = loaded.fontFamily;

// Awaited inside delayRender() so renders wait for the font to be ready.
export const loadFont = async (): Promise<void> => {
  await loaded.waitUntilDone();
};
