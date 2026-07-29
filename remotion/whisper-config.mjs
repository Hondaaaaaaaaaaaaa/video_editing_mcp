import path from "path";

// Where Whisper.cpp + the model get installed (gitignored, downloaded on demand).
export const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");

// Whisper.cpp version installed by @remotion/install-whisper-cpp.
export const WHISPER_VERSION = "1.5.5";

// Model to use. "large-v3" is the biggest/most accurate open Whisper model —
// and the MULTILINGUAL one (the ".en" models are English-only and CANNOT
// transcribe Arabic or any non-English language). This is a ~3GB download,
// fetched on demand into whisper.cpp/ and cached.
// Other options: tiny, base, small, medium, large-v3, large-v3-turbo
// (plus English-only tiny.en … medium.en — do NOT use those for Arabic).
export const WHISPER_MODEL = "large-v3";

// Spoken language. `null` = auto-detect, so the same pipeline handles Arabic,
// English, and any other language per clip. Set to a code (e.g. "ar", "en") to
// force one language when you know it.
export const WHISPER_LANG = null;
