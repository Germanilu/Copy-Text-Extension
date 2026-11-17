// Language support of Chrome's built-in models.
// Source: developer.chrome.com/docs/ai (checked 2026-11-16). Re-check when Chrome updates.

/** Input/output languages of Gemini Nano for the Prompt API and Summarizer. */
export const MODEL_LANGUAGES = new Set(["en", "es", "ja", "de", "fr"]);

/** "pt-BR" -> "pt", "zh-TW" -> "zh-Hant", "zh-CN" -> "zh". */
export function normalizeLanguage(tag) {
  if (!tag) return null;
  const t = String(tag).trim();
  if (/^zh[-_](hant|tw|hk|mo)/i.test(t)) return "zh-Hant";
  return t.split(/[-_]/)[0].toLowerCase();
}

/** Default translation target: the browser UI language. */
export function browserLanguage() {
  const nav = globalThis.navigator;
  return normalizeLanguage(nav?.language || "en") || "en";
}

/** Translation targets offered in the UI (subset of the Translator API list). */
export const TRANSLATE_TARGETS = [
  "en", "es", "it", "pt", "fr", "de", "nl", "pl", "ro", "sv", "tr", "ru", "uk", "ar", "hi", "ja", "ko", "zh", "zh-Hant",
];

/** Display name of a language code in English, e.g. "it" -> "Italian". */
export function languageName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}
