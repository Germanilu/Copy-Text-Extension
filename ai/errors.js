// Errors shared by all AI providers. `code` is stable (UI logic), `message` is for display.

export const LANGUAGE_NAMES = {
  en: "English", es: "Spanish", it: "Italian", pt: "Portuguese", fr: "French", de: "German", ja: "Japanese",
};

export class AIError extends Error {
  /**
   * @param {"unavailable"|"needs_download"|"language_unsupported"|"language_unknown"|"same_language"|"too_long"|"aborted"|"failed"} code
   * @param {object} [details]
   */
  constructor(code, details = {}) {
    super(messageFor(code, details));
    this.name = "AIError";
    this.code = code;
    this.details = details;
  }
}

function messageFor(code, d) {
  const lang = LANGUAGE_NAMES[d.language] || d.language;
  switch (code) {
    case "unavailable":
      return "AI is not available on this device.";
    case "needs_download":
      return "The on-device AI model needs to be downloaded first. Open CleanWrite and click “Enable AI”.";
    case "language_unsupported":
      return `On-device AI can't do this reliably in ${lang} yet.`;
    case "language_unknown":
      return "Couldn't detect the language of this text. Try selecting a longer piece of text.";
    case "same_language":
      return `The text is already in ${lang}.`;
    case "too_long":
      return `This text is too long for AI. Select a shorter piece (up to ${d.max ?? "a few thousand"} characters).`;
    case "aborted":
      return "Cancelled.";
    default:
      return "Something went wrong with the AI. Please try again.";
  }
}

/** Converts DOMExceptions thrown by Chrome's built-in AI into AIError. */
export function toAIError(err, details = {}) {
  if (err instanceof AIError) return err;
  switch (err?.name) {
    case "AbortError":
      return new AIError("aborted");
    case "NotSupportedError":
      return new AIError("language_unsupported", details);
    case "QuotaExceededError":
      return new AIError("too_long", details);
    case "NotAllowedError":
      return new AIError("needs_download");
    default:
      return new AIError("failed", { cause: err?.message });
  }
}
