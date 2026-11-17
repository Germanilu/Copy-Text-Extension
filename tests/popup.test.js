// @vitest-environment jsdom
// Smoke test: loads the real popup.html + popup.js with a fake chrome.* API.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("popup/popup.html", "utf8");

function api(status) {
  return { availability: vi.fn(async () => status), create: vi.fn(async () => ({ destroy() {} })) };
}

async function loadPopup() {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  vi.resetModules();
  await import("../popup/popup.js");
  // Let init() and the status check finish.
  await vi.waitFor(() => expect(document.getElementById("aiTitle").textContent).not.toBe("Checking AI…"));
}

beforeEach(() => {
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}) },
    },
    runtime: { sendMessage: () => Promise.resolve() },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) delete globalThis[g];
});

describe("popup", () => {
  it("Rewrite opens the tone row instead of running", async () => {
    for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) globalThis[g] = api("available");
    await loadPopup();
    const rewrite = document.querySelector('[data-action="rewrite"]');
    expect(document.getElementById("tones").hidden).toBe(true);
    rewrite.click();
    expect(document.getElementById("tones").hidden).toBe(false);
    expect(rewrite.getAttribute("aria-expanded")).toBe("true");
  });

  it("disables AI actions and the instruction field when AI is unavailable", async () => {
    await loadPopup();
    expect(document.getElementById("ask").disabled).toBe(true);
    expect(document.querySelector('[data-action="translate"]').disabled).toBe(true);
  });

  it("leaves 'Checking AI…' when Chrome has no built-in AI", async () => {
    await loadPopup();
    expect(document.getElementById("aiTitle").textContent).toBe("AI isn't available on this device");
    expect(document.querySelector('[data-action="fix"]').disabled).toBe(true);
    expect(document.querySelector('[data-action="clean"]').disabled).toBe(false);
  });

  it("shows 'Enable AI' when models need downloading", async () => {
    for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) globalThis[g] = api("downloadable");
    await loadPopup();
    expect(document.getElementById("aiTitle").textContent).toBe("Enable on-device AI");
    expect(document.getElementById("enableAI").hidden).toBe(false);
  });

  it("shows ready state when every model is available", async () => {
    for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) globalThis[g] = api("available");
    await loadPopup();
    expect(document.getElementById("aiTitle").textContent).toMatch(/AI ready/);
  });

  it("Clean button works on the textarea", async () => {
    await loadPopup();
    document.getElementById("input").value = "## Hola   **mundo**";
    document.querySelector('[data-action="clean"]').click();
    await vi.waitFor(() => expect(document.getElementById("viewResult").hidden).toBe(false));
    expect(document.getElementById("resultText").textContent).toBe("Hola mundo");
    expect(document.getElementById("resultLabel").textContent).toBe("Clean");

    // Case transforms are offered under Clean
    [...document.querySelectorAll("#resultExtra button")].find((b) => b.textContent === "UPPERCASE").click();
    expect(document.getElementById("resultText").textContent).toBe("HOLA MUNDO");

    // Back returns to the actions view
    document.getElementById("backBtn").click();
    expect(document.getElementById("viewActions").hidden).toBe(false);
  });
});
