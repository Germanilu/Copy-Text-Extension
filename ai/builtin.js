// Provider "builtin": Chrome's on-device AI (Gemini Nano).
//   summarize -> Summarizer API
//   translate -> LanguageDetector + Translator API
//   fix / rewrite / instruct -> Prompt API (LanguageModel)
//
// Must run in a window context (extension page, offscreen document or iframe):
// these APIs are not exposed in Web Workers, and creating a model that still needs
// downloading requires user activation (a click).

import { AIError, toAIError } from "./errors.js";
import { SYSTEM_PROMPT, buildPrompt } from "./prompts.js";
import { MODEL_LANGUAGES, browserLanguage, normalizeLanguage } from "./languages.js";
import { splitText, mapChunks } from "./chunk.js";

export const id = "builtin";
export const label = "On your device";
/** Default limit (rewrite, instruct): these need the whole text at once to stay coherent. */
export const MAX_CHARS = 4000;
/** Actions that work chunk by chunk accept longer texts. */
export const MAX_CHARS_BY_ACTION = { summarize: 30000, translate: 30000, fix: 30000 };
/** Size of each chunk sent to the on-device model. */
export const CHUNK_CHARS = 3000;

export function maxCharsFor(action) {
  return MAX_CHARS_BY_ACTION[action] ?? MAX_CHARS;
}

const GLOBALS = {
  prompt: "LanguageModel",
  summarizer: "Summarizer",
  translator: "Translator",
  detector: "LanguageDetector",
};

/** Which capability each action needs. */
export const ACTION_CAPABILITY = {
  fix: "prompt",
  rewrite: "prompt",
  instruct: "prompt",
  summarize: "summarizer",
  translate: "translator",
};

/** Every capability an action needs to work (translate needs to detect the source language). */
export const ACTION_REQUIRES = {
  fix: ["prompt"],
  rewrite: ["prompt"],
  instruct: ["prompt"],
  summarize: ["summarizer"],
  translate: ["translator", "detector"],
};

const api = (cap) => globalThis[GLOBALS[cap]];

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Status of one capability: "available" | "downloadable" | "downloading" | "unavailable" | "unsupported".
 * "unsupported" = this Chrome doesn't expose the API at all.
 */
export async function capabilityStatus(cap, opts = {}) {
  if (!api(cap)?.availability) return "unsupported";
  // A hanging availability() must not block the whole UI.
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[CleanWrite] ${GLOBALS[cap]}.availability() timed out`);
      resolve("unavailable");
    }, 5000);
  });
  try {
    return await Promise.race([rawStatus(cap, opts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function rawStatus(cap, { language = "en", target } = {}) {
  const A = api(cap);
  try {
    if (cap === "prompt") return await A.availability(promptLanguageOptions(language));
    if (cap === "translator") {
      const targetLanguage = target || browserLanguage();
      const sourceLanguage = targetLanguage === "en" ? "es" : "en";
      return await A.availability({ sourceLanguage, targetLanguage });
    }
    return await A.availability();
  } catch {
    return "unavailable";
  }
}

/** Status of every capability, e.g. { prompt: "available", summarizer: "downloadable", … }. */
export async function availability() {
  const caps = Object.keys(GLOBALS);
  const statuses = await Promise.all(caps.map((c) => capabilityStatus(c)));
  return Object.fromEntries(caps.map((c, i) => [c, statuses[i]]));
}

/**
 * Downloads the model behind a capability. Call it from a click handler
 * (user activation is required while the model is "downloadable").
 * @param {(fraction:number)=>void} [onProgress] 0..1
 */
export async function prepare(cap, { onProgress } = {}) {
  const A = api(cap);
  if (!A?.create) throw new AIError("unavailable");
  const options = { monitor: monitor(onProgress) };
  if (cap === "translator") {
    const targetLanguage = browserLanguage();
    Object.assign(options, { sourceLanguage: targetLanguage === "en" ? "es" : "en", targetLanguage });
  }
  if (cap === "prompt") Object.assign(options, promptLanguageOptions("en"));
  try {
    const instance = await A.create(options);
    instance.destroy?.();
  } catch (err) {
    throw toAIError(err);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * @param {"fix"|"rewrite"|"summarize"|"translate"|"instruct"} action
 * @param {string} text
 * @param {{signal?:AbortSignal, onProgress?:(n:number)=>void, onStep?:(done:number,total:number)=>void,
 *   tone?:string, instruction?:string, targetLanguage?:string}} [options]
 *   onStep reports progress when a long text is processed in several parts.
 *   Passing onProgress means "the caller has user activation and can show a download":
 *   models that still need downloading will be downloaded. Without it, they throw needs_download.
 * @returns {Promise<string>}
 */
export async function run(action, text, options = {}) {
  const cap = ACTION_CAPABILITY[action];
  if (!cap) throw new Error(`Unknown action "${action}"`);
  text = String(text ?? "");
  if (!text.trim()) return "";
  const max = maxCharsFor(action);
  if (text.length > max) throw new AIError("too_long", { max });
  throwIfAborted(options.signal);

  let language = null;
  try {
    language = await detectLanguage(text.slice(0, 2000));
    throwIfAborted(options.signal);

    if (cap === "translator") return await translate(text, language, options);

    if (language && !MODEL_LANGUAGES.has(language)) {
      throw new AIError("language_unsupported", { language });
    }
    await ensureReady(cap, language, options);
    if (cap === "summarizer") return await summarize(text, language, options);
    return await prompt(action, text, language, options);
  } catch (err) {
    throw toAIError(err, { language, max });
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const cache = new Map(); // key -> Promise<instance>

function cached(key, factory) {
  if (!cache.has(key)) {
    const p = factory();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

/** For tests. */
export function _reset() {
  cache.clear();
}

async function ensureReady(cap, language, { onProgress }) {
  const status = await capabilityStatus(cap, { language: language || "en" });
  if (status === "unsupported" || status === "unavailable") throw new AIError("unavailable");
  if (status !== "available" && !onProgress) throw new AIError("needs_download");
}

/** Returns a base language code, or null if unknown / detector not ready. Never triggers a download. */
async function detectLanguage(text) {
  const A = api("detector");
  if (!A?.create) return null;
  if ((await capabilityStatus("detector")) !== "available") return null;
  const detector = await cached("detector", () => A.create());
  const [top] = await detector.detect(text);
  if (!top || top.detectedLanguage === "und" || top.confidence < 0.5) return null;
  return normalizeLanguage(top.detectedLanguage);
}

async function prompt(action, text, language, options) {
  if (action === "fix" && text.length > CHUNK_CHARS) {
    // Corrections are local: fix paragraph groups one by one and keep the layout.
    const chunks = splitText(text, CHUNK_CHARS);
    return (
      await mapChunks(chunks, async (part, i, n) => {
        options.onStep?.(i, n);
        throwIfAborted(options.signal);
        return promptOnce(action, part, language, options);
      })
    ).trim();
  }
  return promptOnce(action, text, language, options);
}

async function promptOnce(action, text, language, { signal, onProgress, tone, instruction }) {
  const A = api("prompt");
  const base = await cached(`prompt:${language ?? "*"}`, () =>
    A.create({
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      monitor: monitor(onProgress),
      ...(language ? promptLanguageOptions(language) : {}),
    })
  );
  // Clone so every request starts from the clean system prompt (no shared history).
  const session = await base.clone({ signal });
  try {
    const out = await session.prompt(buildPrompt(action, text, { tone, instruction }), { signal });
    return out.trim();
  } finally {
    session.destroy?.();
  }
}

async function summarize(text, language, { signal, onProgress, onStep }) {
  const A = api("summarizer");
  const summarizer = await cached(`summarizer:${language ?? "*"}`, () =>
    A.create({
      type: "tldr",
      format: "plain-text",
      length: "medium",
      monitor: monitor(onProgress),
      ...(language ? { expectedInputLanguages: [language], outputLanguage: language } : {}),
    })
  );
  const once = async (t, context) =>
    (await abortable(summarizer.summarize(t, context ? { context } : undefined), signal)).trim();

  if (text.length <= CHUNK_CHARS) return once(text);

  // Long text: summarize each part, then summarize the summaries (repeat if still too long).
  let parts = splitText(text, CHUNK_CHARS).map((c) => c.text.trim()).filter(Boolean);
  const total = parts.length + 1;
  let done = 0;
  while (true) {
    const summaries = [];
    for (const part of parts) {
      onStep?.(done++, total);
      throwIfAborted(signal);
      summaries.push(await once(part, "This is one part of a longer text."));
    }
    const joined = summaries.join("\n\n");
    if (joined.length <= CHUNK_CHARS) {
      onStep?.(total - 1, total);
      return once(joined, "These are summaries of consecutive parts of one longer text. Write one summary of the whole text.");
    }
    parts = splitText(joined, CHUNK_CHARS).map((c) => c.text.trim()).filter(Boolean);
  }
}

async function translate(text, sourceLanguage, { signal, onProgress, onStep, targetLanguage }) {
  const A = api("translator");
  if (!A?.create) throw new AIError("unavailable");
  if (!sourceLanguage) throw new AIError("language_unknown");
  const target = normalizeLanguage(targetLanguage) || browserLanguage();
  if (sourceLanguage === target) throw new AIError("same_language", { language: target });

  const status = await A.availability({ sourceLanguage, targetLanguage: target });
  if (status === "unavailable") throw new AIError("language_unsupported", { language: sourceLanguage });
  if (status !== "available" && !onProgress) throw new AIError("needs_download");

  const translator = await cached(`translator:${sourceLanguage}>${target}`, () =>
    A.create({ sourceLanguage, targetLanguage: target, monitor: monitor(onProgress) })
  );
  if (text.length <= CHUNK_CHARS) return (await abortable(translator.translate(text), signal)).trim();
  const chunks = splitText(text, CHUNK_CHARS);
  return (
    await mapChunks(chunks, async (part, i, n) => {
      onStep?.(i, n);
      throwIfAborted(signal);
      return (await abortable(translator.translate(part), signal)).trim();
    })
  ).trim();
}

function promptLanguageOptions(language) {
  return {
    expectedInputs: [{ type: "text", languages: [language] }],
    expectedOutputs: [{ type: "text", languages: [language] }],
  };
}

function monitor(onProgress) {
  return (m) => {
    if (onProgress) m.addEventListener("downloadprogress", (e) => onProgress(e.loaded));
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new AIError("aborted");
}

/** Summarizer/Translator don't document AbortSignal: stop waiting for them instead. */
function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AIError("aborted"));
    const onAbort = () => reject(new AIError("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
