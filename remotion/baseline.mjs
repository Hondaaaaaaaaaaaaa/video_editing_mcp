// Pixel-baseline harness. Renders fixed frames from every composition so a
// refactor can be proved to change nothing. Bundles ONCE, then renders many
// stills — `npx remotion still` re-bundles per call and is far too slow for
// a whole-project sweep.
//
//   node baseline.mjs <outDir> [idFilter]
//
// Pair with compare.mjs, which diffs two output dirs pixel by pixel.
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill, ensureBrowser } from "@remotion/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
const filter = process.argv[3] ?? "";
if (!outDir) {
  console.error("usage: node baseline.mjs <outDir> [idFilter]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Sampled at fixed FRACTIONS of each timeline, so the same three moments are
// compared even if a composition's duration changes for an unrelated reason.
const FRACTIONS = [0.2, 0.5, 0.8];

console.log("ensuring browser…");
await ensureBrowser();
console.log("bundling…");
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
console.log("bundled:", serveUrl);

const comps = await getCompositions(serveUrl);
const targets = comps.filter((c) => (filter ? c.id.includes(filter) : true));
console.log(`${targets.length} composition(s)\n`);

const manifest = [];
for (const c of targets) {
  for (const f of FRACTIONS) {
    const frame = Math.max(0, Math.min(c.durationInFrames - 1, Math.round(c.durationInFrames * f)));
    const output = path.join(outDir, `${c.id}__f${String(frame).padStart(4, "0")}.png`);
    try {
      await renderStill({ composition: c, serveUrl, output, frame, overwrite: true });
      manifest.push({ id: c.id, frame, fps: c.fps, w: c.width, h: c.height, ok: true });
      console.log(`  ok   ${c.id} @${frame}`);
    } catch (e) {
      manifest.push({ id: c.id, frame, ok: false, error: String(e).slice(0, 200) });
      console.log(`  FAIL ${c.id} @${frame}: ${String(e).slice(0, 120)}`);
    }
  }
}
writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));
const ok = manifest.filter((m) => m.ok).length;
console.log(`\n${ok}/${manifest.length} stills rendered -> ${outDir}`);
