import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// A tiny standalone dev app that previews the caption styles in an embedded
// <Player> and drives their props with REAL <input type="range"> sliders —
// something Remotion Studio's schema editor can't render (it only has a
// drag-to-scrub number). This is a separate Vite app so it can host arbitrary
// custom UI alongside the Remotion components imported from ../src.
export default defineConfig({
  root: here,
  // Serve the same assets the Remotion compositions use (sample-video.mp4 +
  // sample-video.json) so staticFile("...") -> "/..." resolves here too.
  publicDir: resolve(here, "../public"),
  server: { port: 3100 },
});
