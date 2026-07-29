// Transcribe video/audio into word-level caption JSON using a pluggable ASR
// provider. This is the ONE seam the whole product routes through — swap or add
// a provider without touching anything downstream (Claude layer, templates).
//
// Default provider: ElevenLabs Scribe (best for Arabic dialects + code-switching,
// with precise native word timestamps — no separate alignment stage needed).
// Whisper/Groq can be added later as a cheap English branch behind this same
// interface. See memory: transcription-architecture-decision.
//
// Usage:
//   node transcribe.mjs                         # every video in public/
//   node transcribe.mjs "public/clip.mp4"       # one file
//   node transcribe.mjs "public/clip.mp4" ar    # force a language code
//
// For each `<name>.mp4` it writes `<name>.json` shaped as Caption[] (from
// @remotion/captions) — exactly what CaptionedVideo/the templates load.

import path from "path";
import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  lstatSync,
} from "node:fs";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".m4a", ".mp3", ".wav"];

// ---------------------------------------------------------------------------
// .env loader — so `node transcribe.mjs` just works without dotenv installed.
// Only fills vars that aren't already set in the real environment.
// ---------------------------------------------------------------------------
const loadEnv = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim();
    }
  }
};
loadEnv();

// ---------------------------------------------------------------------------
// Audio extraction — 16kHz mono WAV (what ASR engines want). Uses Remotion's
// bundled ffmpeg via `npx remotion ffmpeg` so there's no separate dependency.
// ---------------------------------------------------------------------------
const extractAudio = (mediaPath, wavPath) => {
  execSync(
    `npx remotion ffmpeg -i "${mediaPath}" -ar 16000 -ac 1 "${wavPath}" -y`,
    { stdio: ["ignore", "ignore", "inherit"] },
  );
};

// ---------------------------------------------------------------------------
// PROVIDER: ElevenLabs Scribe (speech-to-text).
// Returns { languageCode, text, words:[{text, startMs, endMs}] }.
// ---------------------------------------------------------------------------
const scribeProvider = async (wavPath, { languageCode = null } = {}) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is missing — add it to remotion/.env (gitignored).",
    );
  }

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  // null = let Scribe auto-detect the language per clip.
  if (languageCode) form.append("language_code", languageCode);
  const bytes = readFileSync(wavPath);
  form.append("file", new Blob([bytes]), path.basename(wavPath));

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Scribe HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  // Scribe returns a token stream; keep the real words (drop 'spacing'/'audio'
  // tokens) and normalise seconds -> milliseconds for the Caption[] shape.
  const words = (data.words || [])
    .filter((w) => w.type === "word")
    .map((w) => ({
      text: w.text,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }));

  return { languageCode: data.language_code ?? null, text: data.text ?? "", words };
};

// The provider registry — the routing seam. Add "whisper"/"groq" here later and
// pick per language; nothing downstream changes.
const PROVIDERS = { scribe: scribeProvider };

/**
 * THE transcription interface. Extracts audio, runs the chosen provider, and
 * returns { languageCode, text, words }. `provider` defaults to scribe.
 */
export const transcribe = async (
  mediaPath,
  { provider = "scribe", languageCode = null } = {},
) => {
  const run = PROVIDERS[provider];
  if (!run) throw new Error(`Unknown ASR provider: ${provider}`);

  const tempDir = path.join(process.cwd(), "temp");
  const madeTemp = !existsSync(tempDir);
  if (madeTemp) mkdirSync(tempDir);
  const wavPath = path.join(tempDir, `${path.basename(mediaPath).split(".")[0]}.wav`);

  try {
    extractAudio(mediaPath, wavPath);
    return await run(wavPath, { languageCode });
  } finally {
    if (existsSync(wavPath)) rmSync(wavPath);
    if (madeTemp && existsSync(tempDir)) rmSync(tempDir, { recursive: true });
  }
};

// ---------------------------------------------------------------------------
// Convert provider words -> Caption[] (the @remotion/captions shape the
// templates load) and write `<name>.json` next to the media file.
// ---------------------------------------------------------------------------
const toJsonPath = (mediaPath) =>
  VIDEO_EXTENSIONS.reduce(
    (acc, ext) => acc.replace(new RegExp(`\\${ext}$`, "i"), ".json"),
    mediaPath,
  );

const wordsToCaptions = (words) =>
  words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
    timestampMs: Math.round((w.startMs + w.endMs) / 2),
    confidence: null,
  }));

const processFile = async (mediaPath, languageCode) => {
  const outPath = toJsonPath(mediaPath);
  console.log(`Transcribing ${path.basename(mediaPath)} …`);
  const { languageCode: detected, words } = await transcribe(mediaPath, { languageCode });
  writeFileSync(outPath, JSON.stringify(wordsToCaptions(words), null, 2));
  console.log(
    `  -> ${path.relative(process.cwd(), outPath)}  (lang: ${detected}, ${words.length} words)`,
  );
};

const isMedia = (p) => VIDEO_EXTENSIONS.some((e) => p.toLowerCase().endsWith(e));

const processDirectory = async (dir, languageCode) => {
  for (const entry of readdirSync(dir).filter((f) => f !== ".DS_Store")) {
    const full = path.join(dir, entry);
    if (lstatSync(full).isDirectory()) await processDirectory(full, languageCode);
    else if (isMedia(full)) await processFile(full, languageCode);
  }
};

// --- CLI ---
const [target, langArg] = process.argv.slice(2);
const languageCode = langArg || null;
if (!target) {
  await processDirectory(path.join(process.cwd(), "public"), languageCode);
} else {
  const full = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
  if (!existsSync(full)) {
    console.error(`Not found: ${full}`);
    process.exit(1);
  }
  if (lstatSync(full).isDirectory()) await processDirectory(full, languageCode);
  else await processFile(full, languageCode);
}
process.exit(0);
