// Transcribe video(s) in public/ into word-level caption JSON files using
// Whisper.cpp (running locally, no API key).
//
// Usage:
//   node sub.mjs                       # transcribe every video in public/
//   node sub.mjs public/sample-video.mp4   # transcribe a single file
//
// For each `public/<name>.mp4` it writes `public/<name>.json` shaped as
// Caption[] (from @remotion/captions) — exactly what CaptionedVideo loads.

import path from "path";
import { execSync } from "node:child_process";
import {
  existsSync,
  rmSync,
  writeFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import {
  WHISPER_LANG,
  WHISPER_MODEL,
  WHISPER_PATH,
  WHISPER_VERSION,
} from "./whisper-config.mjs";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov"];

const toJsonPath = (videoPath) =>
  VIDEO_EXTENSIONS.reduce(
    (acc, ext) => acc.replace(new RegExp(`\\${ext}$`), ".json"),
    videoPath,
  );

// Extract a 16kHz mono wav, which is what Whisper.cpp expects.
const extractToTempAudioFile = (fileToTranscribe, tempOutFile) => {
  execSync(`npx remotion ffmpeg -i "${fileToTranscribe}" -ar 16000 "${tempOutFile}" -y`, {
    stdio: ["ignore", "inherit", "inherit"],
  });
};

const subFile = async (filePath, outPath) => {
  const result = await transcribe({
    inputPath: filePath,
    model: WHISPER_MODEL,
    tokenLevelTimestamps: true,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    printOutput: false,
    translateToEnglish: false,
    language: WHISPER_LANG,
    splitOnWord: true,
  });

  const { captions } = toCaptions({ whisperCppOutput: result });
  writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(`  -> wrote ${path.relative(process.cwd(), outPath)} (${captions.length} words)`);
};

const processVideo = async (fullPath, entry) => {
  if (!VIDEO_EXTENSIONS.some((ext) => fullPath.toLowerCase().endsWith(ext))) {
    return;
  }

  const outPath = toJsonPath(fullPath);
  if (existsSync(outPath)) {
    console.log(`Skipping ${entry} (captions already exist)`);
    return;
  }

  let shouldRemoveTempDirectory = false;
  const tempDir = path.join(process.cwd(), "temp");
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir);
    shouldRemoveTempDirectory = true;
  }

  console.log(`Transcribing ${entry} ...`);
  const tempWavFileName = entry.split(".")[0] + ".wav";
  const tempOutFilePath = path.join(tempDir, tempWavFileName);

  extractToTempAudioFile(fullPath, tempOutFilePath);
  await subFile(tempOutFilePath, outPath);

  if (shouldRemoveTempDirectory) {
    rmSync(tempDir, { recursive: true });
  }
};

const processDirectory = async (directory) => {
  const entries = readdirSync(directory).filter((f) => f !== ".DS_Store");
  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    if (lstatSync(fullPath).isDirectory()) {
      await processDirectory(fullPath);
    } else {
      await processVideo(fullPath, entry);
    }
  }
};

// 1. Make sure Whisper.cpp + the model are present.
await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
await downloadWhisperModel({ folder: WHISPER_PATH, model: WHISPER_MODEL });

// 2. Transcribe either the given file(s) or everything in public/.
const args = process.argv.slice(2);
if (args.length === 0) {
  await processDirectory(path.join(process.cwd(), "public"));
} else {
  for (const arg of args) {
    const fullPath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
    if (!existsSync(fullPath)) {
      console.warn(`Path not found: ${fullPath}`);
      continue;
    }
    if (lstatSync(fullPath).isDirectory()) {
      await processDirectory(fullPath);
    } else {
      await processVideo(fullPath, path.basename(fullPath));
    }
  }
}

process.exit(0);
