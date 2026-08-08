// Display-only punctuation stripping, shared by the render engine and the editor
// preview. When a caption style has `showPunctuation` OFF (the default clean
// look), sentence punctuation is removed from the EDGES of each word at RENDER
// time only — the caption document keeps the real text, so the transcript,
// timing, translation and the editor are all unaffected.
//
// Language-aware: covers Latin, Arabic and CJK terminal/separating marks. Only
// EDGE marks are removed, so internal apostrophes (don't), decimals (3.5) and
// hyphenated words (state-of-the-art) are preserved. A word that is ENTIRELY
// punctuation is left as-is (nothing meaningful would remain).

// Terminal / separating marks across the languages we caption. Intentionally
// excludes apostrophes, hyphens, currency and # so words stay intact.
const EDGE = "[.,!?;:…。、！？：；，،؛؟”“\"«»)(\\]\\[]";
const LEAD = new RegExp(`^(?:${EDGE}|\\s)+`, "u");
const TRAIL = new RegExp(`(?:${EDGE}|\\s)+$`, "u");

/** Strip edge punctuation from one word (keeps the original if nothing is left). */
export const stripWordPunctuation = (text: string): string => {
  const s = text.replace(LEAD, "").replace(TRAIL, "");
  return s.length ? s : text;
};

/**
 * Return `text` unchanged when punctuation should show, else the stripped form.
 * The single call site used everywhere so the behaviour stays identical.
 */
export const displayWord = (text: string, showPunctuation: boolean | undefined): string =>
  showPunctuation ? text : stripWordPunctuation(text);
