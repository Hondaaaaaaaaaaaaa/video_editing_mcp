import path from "path";

// Where Whisper.cpp + the model get installed (gitignored, downloaded on demand).
export const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");

// Whisper.cpp version installed by @remotion/install-whisper-cpp.
export const WHISPER_VERSION = "1.5.5";

// Model to use. "medium.en" is a good quality/speed balance for English.
// Other options: tiny.en, base.en, small.en, medium.en, large-v3, ...
export const WHISPER_MODEL = "medium.en";

// Spoken language ("en"). Set to null to auto-detect.
export const WHISPER_LANG = "en";
