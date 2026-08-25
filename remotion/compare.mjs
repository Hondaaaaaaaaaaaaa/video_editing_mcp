// Pixel-diff two baseline dirs produced by baseline.mjs.
//
//   node compare.mjs <dirA> <dirB> [tolerance]
//
// Reports, per still: how many pixels differ by more than `tolerance` (0-255)
// and the worst single-channel delta. Video decoding is not bit-exact across
// runs, so a handful of pixels differing by 1-2 is noise; a real regression
// moves thousands of pixels or shows a large max delta.
import { readdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const [dirA, dirB, tolArg] = process.argv.slice(2);
const TOL = Number(tolArg ?? 4);
if (!dirA || !dirB) { console.error("usage: node compare.mjs <dirA> <dirB> [tolerance]"); process.exit(1); }

function readPng(p) {
  const buf = readFileSync(p);
  let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let p2 = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p2++], line = raw.subarray(p2, p2 + stride); p2 += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      cur[x] = v;
    }
  }
  return { w, h, ch, data: out };
}

// Stills that are NOT reproducible run-to-run: the frame lands on a scene cut
// in the source video, and OffthreadVideo can seek to either side of it. Two
// renders of IDENTICAL code differ by ~85% here, so a diff on these proves
// nothing. Verified by rendering twice with no code change.
const KNOWN_FLAKY = new Set(["EditsMatch__f1300.png"]);
const files = readdirSync(dirA).filter((f) => f.endsWith(".png"));
let worstFiles = 0;
for (const f of files.sort()) {
  let A, B;
  try { A = readPng(`${dirA}/${f}`); B = readPng(`${dirB}/${f}`); }
  catch { console.log(`  MISSING  ${f}`); worstFiles++; continue; }
  if (A.w !== B.w || A.h !== B.h) { console.log(`  SIZE     ${f}  ${A.w}x${A.h} vs ${B.w}x${B.h}`); worstFiles++; continue; }
  let diff = 0, max = 0;
  for (let i = 0; i < A.data.length; i++) {
    const d = Math.abs(A.data[i] - B.data[i]);
    if (d > max) max = d;
    if (d > TOL) diff++;
  }
  const pct = (100 * diff) / A.data.length;
  if (diff === 0) console.log(`  same     ${f}`);
  else if (KNOWN_FLAKY.has(f)) console.log(`  flaky    ${f}  (known non-deterministic, ignored)`);
  else { console.log(`  DIFF     ${f}  ${diff} subpixels (${pct.toFixed(3)}%)  max delta ${max}`); worstFiles++; }
}
console.log(`\n${files.length - worstFiles}/${files.length} identical (tolerance ${TOL})`);
