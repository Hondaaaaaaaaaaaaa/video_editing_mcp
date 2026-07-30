import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname, basename, join } from "node:path";
import { createReadStream, readdirSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(here, "../public");

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".json": "application/json",
};

/** Every clip URL goes through /api/file?name=… — see the endpoint below. */
const fileUrl = (name: string) => `/api/file?name=${encodeURIComponent(name)}`;

/**
 * Dev-only endpoints backing the caption editor.
 *
 * `/api/clips` lists what the editor can open: every `<name>.enriched.json` in
 * public/ that has a video of the same base name next to it. Drop a clip and its
 * enriched document in public/ and it shows up in the picker — that is what
 * frees the editor from a hardcoded sample.
 *
 * `/api/file?name=…` streams one of those files. Vite's own static middleware
 * cannot serve real-world clip names (a `#` in the filename never survives the
 * URL path), so the name travels as a QUERY parameter instead, and this handler
 * does the lookup itself. It supports Range requests, which the <video> element
 * needs in order to seek.
 */
const clipsApi = (): Plugin => ({
  name: "vemcp-clips-api",
  configureServer(server) {
    server.middlewares.use("/api/clips", (_req, res) => {
      let clips: { name: string; video: string; doc: string }[] = [];
      try {
        const files = readdirSync(PUBLIC_DIR);
        const videos = new Map(
          files
            .filter((f) => VIDEO_EXT.includes(extname(f).toLowerCase()))
            .map((f) => [basename(f, extname(f)), f]),
        );
        clips = files
          .filter((f) => f.endsWith(".enriched.json"))
          .map((f) => {
            const name = f.slice(0, -".enriched.json".length);
            const video = videos.get(name);
            return video ? { name, video: fileUrl(video), doc: fileUrl(f) } : null;
          })
          .filter((c): c is { name: string; video: string; doc: string } => c !== null)
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        clips = [];
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(clips));
    });

    server.middlewares.use("/api/file", (req, res) => {
      const query = new URL(req.url ?? "/", "http://localhost");
      const requested = query.searchParams.get("name") ?? "";
      // basename() pins the lookup inside public/ — no path traversal.
      const name = basename(requested);
      const path = join(PUBLIC_DIR, name);
      let size: number;
      try {
        const st = statSync(path);
        if (!st.isFile()) throw new Error("not a file");
        size = st.size;
      } catch {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      const type = MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Accept-Ranges", "bytes");

      // Range request — the <video> element uses these to seek.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start >= size || end < start) {
          res.statusCode = 416;
          res.setHeader("Content-Range", `bytes */${size}`);
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", String(end - start + 1));
        createReadStream(path, { start, end }).pipe(res);
        return;
      }

      res.setHeader("Content-Length", String(size));
      createReadStream(path).pipe(res);
    });
  },
});

// A tiny standalone dev app that previews the caption styles in an embedded
// <Player> and drives their props with REAL <input type="range"> sliders —
// something Remotion Studio's schema editor can't render (it only has a
// drag-to-scrub number). This is a separate Vite app so it can host arbitrary
// custom UI alongside the Remotion components imported from ../src.
export default defineConfig({
  root: here,
  plugins: [react(), clipsApi()],
  // Serve the same assets the Remotion compositions use (sample-video.mp4 +
  // sample-video.json) so staticFile("...") -> "/..." resolves here too.
  publicDir: PUBLIC_DIR,
  server: { port: 3100 },
});
