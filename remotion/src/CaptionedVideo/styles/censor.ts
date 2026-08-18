// ---------------------------------------------------------------------------
// PROFANITY MASKING — the "F*CKING" / "K*LL" convention.
//
// The Classic 2 reference masks strong language rather than bleeping or dropping
// it: exactly ONE character is replaced with an asterisk, and it is the word's
// FIRST VOWEL. Both examples in the footage agree —
//   FUCKING -> F*CKING   (the U, not the later I)
//   KILL    -> K*LL      (the I)
// so the rule is "first vowel", not "all vowels" and not "second character".
//
// This is a RENDER-TIME transform, like punctuation stripping: the caption
// document always keeps the real word, so turning the toggle off restores it and
// editing/searching the document is never affected.
// ---------------------------------------------------------------------------

// Matched case-insensitively against the word with its punctuation stripped, so
// "fucking," and "Fucking!" are both caught. Stems, not exhaustive: a word is
// masked when it STARTS WITH one of these, which covers the usual inflections
// (fuck/fucking/fucked, shit/shitty, bitch/bitches).
const PROFANITY_STEMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "dick",
  "piss",
  "whore",
  "slut",
  "bastard",
  "asshole",
  "motherfuck",
  "nigg",
  "kill",
  "rape",
  "suicide",
];

const VOWELS = "aeiouAEIOU";

/** Strips leading/trailing punctuation so "fucking," still matches a stem. */
const core = (word: string): string => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Mask a word's first vowel with `*` when it is profanity; otherwise return it
 * untouched. Punctuation and casing are preserved — only the vowel changes.
 */
export const censorWord = (word: string, enabled: boolean): string => {
  if (!enabled || !word) return word;
  const bare = core(word).toLowerCase();
  if (!bare) return word;
  if (!PROFANITY_STEMS.some((stem) => bare.startsWith(stem))) return word;
  // Mask the first vowel IN THE WORD ITSELF (index into the original string, so
  // any leading quote/bracket is skipped naturally by searching for a letter).
  for (let i = 0; i < word.length; i++) {
    if (VOWELS.includes(word[i])) {
      return word.slice(0, i) + "*" + word.slice(i + 1);
    }
  }
  return word;
};
