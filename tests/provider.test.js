import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { aiStatus, enableAI } from "../ai/provider.js";
import { _reset } from "../ai/builtin.js";

function api(status, onCreate) {
  return {
    availability: vi.fn(async () => status),
    create: vi.fn(async (opts) => {
      onCreate?.(opts);
      return { destroy() {} };
    }),
  };
}

beforeEach(() => {
  _reset();
  vi.stubGlobal("chrome", { storage: { local: { get: async () => ({}) } } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) delete globalThis[g];
});

describe("aiStatus", () => {
  it("is 'unavailable' when Chrome has no built-in AI", async () => {
    const s = await aiStatus();
    expect(s.state).toBe("unavailable");
    expect(s.provider).toBe("builtin");
  });

  it("is 'ready' when every model is available", async () => {
    for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) globalThis[g] = api("available");
    const s = await aiStatus();
    expect(s.state).toBe("ready");
    expect(s.actions).toEqual({ fix: "ready", rewrite: "ready", summarize: "ready", translate: "ready", instruct: "ready" });
  });

  it("translate is only as ready as the language detector", async () => {
    globalThis.LanguageModel = api("available");
    globalThis.Summarizer = api("available");
    globalThis.Translator = api("available");
    globalThis.LanguageDetector = api("downloadable");
    const s = await aiStatus();
    expect(s.actions.translate).toBe("download");
    expect(s.actions.fix).toBe("ready");
    expect(s.state).toBe("download");
  });

  it("is 'partial' when some actions can never work on this device", async () => {
    globalThis.LanguageModel = api("unavailable");
    globalThis.Summarizer = api("available");
    globalThis.Translator = api("available");
    globalThis.LanguageDetector = api("available");
    const s = await aiStatus();
    expect(s.state).toBe("partial");
    expect(s.actions.fix).toBe("unavailable");
  });
});

describe("enableAI", () => {
  it("downloads only the pending models and reports overall progress", async () => {
    const progress = [];
    const fire = (opts) => {
      const t = new EventTarget();
      opts.monitor(t);
      const e = new Event("downloadprogress");
      e.loaded = 1;
      t.dispatchEvent(e);
    };
    globalThis.LanguageModel = api("downloadable", fire);
    globalThis.Summarizer = api("available", fire);
    globalThis.Translator = api("downloading", fire);
    globalThis.LanguageDetector = api("available", fire);

    await enableAI((f) => progress.push(f));

    expect(globalThis.LanguageModel.create).toHaveBeenCalledTimes(1);
    expect(globalThis.Translator.create).toHaveBeenCalledTimes(1);
    expect(globalThis.Summarizer.create).not.toHaveBeenCalled();
    expect(progress.at(-1)).toBe(1);
  });
});
