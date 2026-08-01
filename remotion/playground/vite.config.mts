import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname, basename, join, relative, sep } from "node:path";
import { createReadStream, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(here, "../public");
const FONTS_DIR = resolve(PUBLIC_DIR, "fonts");
// Client uploads land in their own subfolder so they never mix with the fonts
// that are checked into the repo.
const UPLOADS_DIR = resolve(FONTS_DIR, "uploads");

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const FONT_EXT = [".ttf", ".otf", ".woff", ".woff2"];
const MAX_FONT_BYTES = 10 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
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

    // Serve public/fonts ourselves, ahead of Vite's static handler. Vite reads
    // publicDir once at startup, so a font uploaded mid-session would 404 (and
    // fall through to index.html) until the server restarted — which would make
    // an upload look broken in the preview. Reading from disk per request means
    // a newly uploaded font is usable immediately. `staticFile()` resolves to
    // this same /fonts/... URL, and Remotion's own server handles it in Studio
    // and in renders.
    server.middlewares.use("/fonts", (req, res, next) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
      const path = resolve(FONTS_DIR, rel);
      // resolve() collapses any ../ — reject anything that escaped public/fonts.
      if (path !== FONTS_DIR && !path.startsWith(FONTS_DIR + sep)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      let size: number;
      try {
        const st = statSync(path);
        if (!st.isFile()) return next();
        size = st.size;
      } catch {
        return next();
      }
      res.setHeader(
        "Content-Type",
        MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      );
      res.setHeader("Content-Length", String(size));
      createReadStream(path).pipe(res);
    });

    // --- FONTS -------------------------------------------------------------
    // `GET /api/fonts` lists every font under public/fonts (recursively), so
    // anything dropped in there — including a whole downloaded family — shows up
    // in the template's font pickers. Paths are relative to public/fonts, which
    // is exactly what a FontSlot stores.
    server.middlewares.use("/api/fonts", (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "POST" && url.pathname.replace(/\/$/, "").endsWith("/upload")) {
        const raw = basename(url.searchParams.get("name") ?? "");
        const ext = extname(raw).toLowerCase();
        if (!FONT_EXT.includes(ext)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: `unsupported font type "${ext || "?"}"` }));
          return;
        }
        // Keep only characters that are safe in a filename AND a URL.
        const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "");
        const chunks: Buffer[] = [];
        let total = 0;
        let aborted = false;
        req.on("data", (c: Buffer) => {
          if (aborted) return;
          total += c.length;
          if (total > MAX_FONT_BYTES) {
            aborted = true;
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "font larger than 10MB" }));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on("end", () => {
          if (aborted) return;
          try {
            mkdirSync(UPLOADS_DIR, { recursive: true });
            writeFileSync(join(UPLOADS_DIR, safe), Buffer.concat(chunks));
            res.setHeader("Content-Type", "application/json");
            // The path a FontSlot stores: relative to public/fonts, POSIX style.
            res.end(JSON.stringify({ file: `uploads/${safe}` }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
        return;
      }

      const out: { file: string; label: string }[] = [];
      const walk = (dir: string) => {
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = join(dir, entry);
          let st;
          try {
            st = statSync(full);
          } catch {
            continue;
          }
          if (st.isDirectory()) walk(full);
          else if (FONT_EXT.includes(extname(entry).toLowerCase())) {
            const rel = relative(FONTS_DIR, full).split(sep).join("/");
            out.push({ file: rel, label: basename(entry, extname(entry)) });
          }
        }
      };
      walk(FONTS_DIR);
      out.sort((a, b) => a.file.localeCompare(b.file));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
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
