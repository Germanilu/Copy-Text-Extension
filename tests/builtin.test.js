import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as builtin from "../ai/builtin.js";
import { AIError } from "../ai/errors.js";

// ---------------------------------------------------------------------------
// Fake Chrome built-in AI (shapes from developer.chrome.com/docs/ai)
// ---------------------------------------------------------------------------
function fakeMonitor(options, steps = [0.5, 1]) {
  if (!options?.monitor) return;
  const target = new EventTarget();
  options.monitor(target);
  for (const loaded of steps) {
    const e = new Event("downloadprogress");
    e.loaded = loaded;
    target.dispatchEvent(e);
  }
}

function install({ status = {}, detected = "es", confidence = 0.95 } = {}) {
  const st = { prompt: "available", summarizer: "available", translator: "available", detector: "available", ...status };
  const calls = { prompt: [], create: [], summarize: [], translate: [] };

  globalThis.LanguageModel = {
    availability: vi.fn(async () => st.prompt),
    create: vi.fn(async (opts) => {
      calls.create.push(["prompt", opts]);
      fakeMonitor(opts);
      const session = {
        clone: async () => ({
          prompt: async (msg, o) => {
            if (o?.signal?.aborted) throw new DOMException("aborted", "AbortError");
            calls.prompt.push(msg);
            return "  resultado  ";
          },
          destroy: vi.fn(),
        }),
        destroy: vi.fn(),
      };
      return session;
    }),
  };
  globalThis.Summarizer = {
    availability: vi.fn(async () => st.summarizer),
    create: vi.fn(async (opts) => {
      calls.create.push(["summarizer", opts]);
      fakeMonitor(opts);
      return { summarize: async (t) => (calls.summarize.push(t), " resumen ") };
    }),
  };
  globalThis.Translator = {
    availability: vi.fn(async () => st.translator),
    create: vi.fn(async (opts) => {
      calls.create.push(["translator", opts]);
      fakeMonitor(opts);
      return { translate: async (t) => (calls.translate.push([opts, t]), "translated") };
    }),
  };
  globalThis.LanguageDetector = {
    availability: vi.fn(async () => st.detector),
    create: vi.fn(async () => ({
      detect: async () => [{ detectedLanguage: detected, confidence }],
    })),
  };
  return calls;
}

function uninstall() {
  delete globalThis.LanguageModel;
  delete globalThis.Summarizer;
  delete globalThis.Translator;
  delete globalThis.LanguageDetector;
}

beforeEach(() => builtin._reset());
afterEach(uninstall);

const expectCode = async (promise, code) => {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(AIError);
  expect(err.code).toBe(code);
  return err;
};

// ---------------------------------------------------------------------------

describe("availability", () => {
  it("reports 'unsupported' when Chrome doesn't expose the APIs", async () => {
    expect(await builtin.availability()).toEqual({
      prompt: "unsupported",
      summarizer: "unsupported",
      translator: "unsupported",
      detector: "unsupported",
    });
  });

  it("returns each API's own status", async () => {
    install({ status: { prompt: "downloadable", translator: "unavailable" } });
    expect(await builtin.availability()).toEqual({
      prompt: "downloadable",
      summarizer: "available",
      translator: "unavailable",
      detector: "available",
    });
  });
});

describe("run · prompt actions", () => {
  it("fix: sends system prompt, the text in <text> tags and the detected language", async () => {
    const calls = install({ detected: "es" });
    expect(await builtin.run("fix", "hola q tal")).toBe("resultado");

    const [, opts] = calls.create.find(([k]) => k === "prompt");
    expect(opts.initialPrompts[0]).toMatchObject({ role: "system" });
    expect(opts.expectedOutputs).toEqual([{ type: "text", languages: ["es"] }]);
    expect(calls.prompt[0]).toMatch(/Correct spelling/);
    expect(calls.prompt[0]).toMatch(/<text>\nhola q tal\n<\/text>/);
  });

  it("rewrite uses the chosen tone", async () => {
    const calls = install({ detected: "en" });
    await builtin.run("rewrite", "hey send me the file", { tone: "friendly" });
    expect(calls.prompt[0]).toMatch(/friendly/);
  });

  it("instruct passes the user's instruction", async () => {
    const calls = install({ detected: "fr" });
    await builtin.run("instruct", "bonjour", { instruction: "make it rhyme" });
    expect(calls.prompt[0]).toMatch(/make it rhyme/);
  });

  it("refuses languages the on-device model doesn't support (Italian)", async () => {
    install({ detected: "it" });
    const err = await expectCode(builtin.run("fix", "ciao come stai"), "language_unsupported");
    expect(err.message).toMatch(/Italian/);
  });

  it("throws needs_download when the model isn't downloaded and the caller can't show progress", async () => {
    install({ status: { prompt: "downloadable" } });
    await expectCode(builtin.run("fix", "hola"), "needs_download");
  });

  it("downloads with progress when the caller passes onProgress", async () => {
    install({ status: { prompt: "downloadable" } });
    const progress = [];
    await builtin.run("fix", "hola", { onProgress: (f) => progress.push(f) });
    expect(progress).toEqual([0.5, 1]);
  });

  it("throws unavailable when the device can't run the model", async () => {
    install({ status: { prompt: "unavailable" } });
    await expectCode(builtin.run("fix", "hola"), "unavailable");
  });

  it("can be cancelled", async () => {
    install();
    const ac = new AbortController();
    ac.abort();
    await expectCode(builtin.run("fix", "hola", { signal: ac.signal }), "aborted");
  });

  it("rejects rewrite/instruct texts over the length limit", async () => {
    install();
    const err = await expectCode(builtin.run("rewrite", "a".repeat(builtin.MAX_CHARS + 1)), "too_long");
    expect(err.details.max).toBe(builtin.MAX_CHARS);
  });

  it("fixes long texts chunk by chunk and keeps paragraphs", async () => {
    const calls = install({ detected: "en" });
    const long = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(150).trim()).join("\n\n");
    const steps = [];
    const out = await builtin.run("fix", long, { onStep: (i, n) => steps.push([i, n]) });
    expect(calls.prompt.length).toBeGreaterThan(1);
    expect(out.split("\n\n").every((p) => p === "resultado")).toBe(true);
    expect(steps.at(-1)[0]).toBe(steps.at(-1)[1] - 1);
  });

  it("works without language hints if the detector is not ready", async () => {
    const calls = install({ status: { detector: "downloadable" } });
    expect(await builtin.run("fix", "hola")).toBe("resultado");
    const [, opts] = calls.create.find(([k]) => k === "prompt");
    expect(opts.expectedOutputs).toBeUndefined();
  });
});

describe("run · summarize", () => {
  it("uses the Summarizer API with plain text in the input language", async () => {
    const calls = install({ detected: "de" });
    expect(await builtin.run("summarize", "langer Text")).toBe("resumen");
    const [, opts] = calls.create.find(([k]) => k === "summarizer");
    expect(opts).toMatchObject({ type: "tldr", format: "plain-text", outputLanguage: "de" });
  });

  it("summarizes long texts as a summary of summaries", async () => {
    const calls = install({ detected: "en" });
    const long = Array.from({ length: 10 }, (_, i) => `Part ${i}. ` + "Some text here. ".repeat(60)).join("\n\n");
    expect(long.length).toBeGreaterThan(builtin.CHUNK_CHARS);
    const steps = [];
    expect(await builtin.run("summarize", long, { onStep: (i, n) => steps.push([i, n]) })).toBe("resumen");
    const parts = calls.summarize.length - 1;
    expect(parts).toBeGreaterThan(1);
    // last call summarizes the joined partial summaries
    expect(calls.summarize.at(-1)).toBe(Array(parts).fill("resumen").join("\n\n"));
    expect(steps.at(-1)).toEqual([parts, parts + 1]);
  });

  it("rejects summaries of very long texts", async () => {
    install({ detected: "en" });
    await expectCode(builtin.run("summarize", "a ".repeat(20000)), "too_long");
  });

  it("reuses the summarizer between calls", async () => {
    install({ detected: "en" });
    await builtin.run("summarize", "one");
    await builtin.run("summarize", "two");
    expect(globalThis.Summarizer.create).toHaveBeenCalledTimes(1);
  });
});

describe("run · translate", () => {
  it("translates from the detected language to the browser language by default", async () => {
    const calls = install({ detected: "it" }); // Translator supports Italian even if the LLM doesn't
    vi.stubGlobal("navigator", { language: "es-ES" });
    expect(await builtin.run("translate", "ciao a tutti")).toBe("translated");
    expect(calls.translate[0][0]).toMatchObject({ sourceLanguage: "it", targetLanguage: "es" });
    vi.unstubAllGlobals();
  });

  it("translates long texts chunk by chunk keeping paragraphs", async () => {
    const calls = install({ detected: "en" });
    const long = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(150).trim()).join("\n\n");
    const out = await builtin.run("translate", long, { targetLanguage: "es" });
    expect(calls.translate.length).toBeGreaterThan(1);
    expect(out.split("\n\n").every((p) => p === "translated")).toBe(true);
  });

  it("accepts an explicit target language", async () => {
    const calls = install({ detected: "en" });
    await builtin.run("translate", "hello", { targetLanguage: "pt-BR" });
    expect(calls.translate[0][0]).toMatchObject({ sourceLanguage: "en", targetLanguage: "pt" });
  });

  it("says so when the text is already in the target language", async () => {
    install({ detected: "en" });
    await expectCode(builtin.run("translate", "hello", { targetLanguage: "en" }), "same_language");
  });

  it("needs a detectable source language", async () => {
    install({ confidence: 0.2 });
    await expectCode(builtin.run("translate", "ok", { targetLanguage: "en" }), "language_unknown");
  });

  it("reports unsupported language pairs", async () => {
    install({ detected: "en", status: { translator: "unavailable" } });
    await expectCode(builtin.run("translate", "hello", { targetLanguage: "xx" }), "language_unsupported");
  });
});

describe("prepare", () => {
  it("creates the model with a progress monitor and releases it", async () => {
    install({ status: { summarizer: "downloadable" } });
    const progress = [];
    await builtin.prepare("summarizer", { onProgress: (f) => progress.push(f) });
    expect(progress).toEqual([0.5, 1]);
  });

  it("maps NotAllowedError (no user activation) to needs_download", async () => {
    install();
    globalThis.Summarizer.create = async () => {
      throw new DOMException("activation required", "NotAllowedError");
    };
    await expectCode(builtin.prepare("summarizer"), "needs_download");
  });
});
