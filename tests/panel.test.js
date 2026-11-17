// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const contentSrc = readFileSync("panel/content.js", "utf8");
const panelHtml = readFileSync("panel/panel.html", "utf8");

function stubChrome() {
  vi.stubGlobal("chrome", {
    runtime: { getURL: (p) => `chrome-extension://abc/${p}`, sendMessage: () => Promise.resolve() },
    storage: { local: { get: async () => ({}), set: async () => {} }, sync: { get: async () => ({}) } },
    contextMenus: { create() {}, removeAll(cb) { cb?.(); }, onClicked: { addListener() {} } },
    commands: { onCommand: { addListener() {} } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    scripting: { executeScript: async () => [] },
  });
  chrome.runtime.onInstalled = { addListener() {} };
  chrome.runtime.onMessage = { addListener() {} };
}

function loadContent() {
  delete window.__cleanwrite;
  // eslint-disable-next-line no-new-func
  new Function(contentSrc)();
  return window.__cleanwrite;
}

beforeEach(() => {
  stubChrome();
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) delete globalThis[g];
});

// ---------------------------------------------------------------------------
describe("content script (in-page host)", () => {
  it("opens the panel iframe in a Shadow DOM host and closes on Escape", () => {
    document.body.innerHTML = `<p id="p">Hello world</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p"));
    getSelection().addRange(range);

    const cw = loadContent();
    cw.open({ action: "fix" });
    expect(document.querySelector("cleanwrite-panel")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector("cleanwrite-panel")).toBeNull();
  });

  it("replaces the selection in a textarea and fires input/change", () => {
    document.body.innerHTML = `<textarea id="t">hello wrld, bye</textarea>`;
    const ta = document.getElementById("t");
    ta.focus();
    ta.setSelectionRange(0, 10);
    const events = [];
    ta.addEventListener("input", () => events.push("input"));
    ta.addEventListener("change", () => events.push("change"));

    const cw = loadContent();
    cw._capture();
    expect(cw._replace("Hello world")).toBe(true);
    expect(ta.value).toBe("Hello world, bye");
    expect(events).toEqual(["input", "change"]);
  });

  it("refuses to replace if the field changed meanwhile", () => {
    document.body.innerHTML = `<input id="i" value="abc def" />`;
    const el = document.getElementById("i");
    el.focus();
    el.setSelectionRange(0, 3);
    const cw = loadContent();
    cw._capture();
    el.value = "xyz def";
    expect(cw._replace("ABC")).toBe(false);
    expect(el.value).toBe("xyz def");
  });

  it("replaces inside contenteditable as text (never HTML), with <br> for new lines", () => {
    document.body.innerHTML = `<div id="ed" contenteditable="true"><p>one <b id="b">two</b> three</p></div>`;
    const ed = document.getElementById("ed");
    // jsdom has no isContentEditable: emulate the browser.
    Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
      configurable: true,
      get() { return this.closest?.("[contenteditable=true]") != null; },
    });
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("b"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);

    const cw = loadContent();
    cw._capture();
    expect(cw._replace("<img src=x onerror=alert(1)>\nTWO")).toBe(true);
    expect(ed.querySelector("img")).toBeNull();
    expect(ed.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(ed.querySelector("br")).not.toBeNull();
    delete HTMLElement.prototype.isContentEditable;
  });

  it("doesn't replace non-editable text", () => {
    document.body.innerHTML = `<p id="p">static text</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const cw = loadContent();
    cw._capture();
    expect(cw._replace("x")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("panel page", () => {
  async function loadPanel(init) {
    document.body.innerHTML = panelHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
    vi.resetModules();
    await import("../panel/panel.js");
    const port = { postMessage: vi.fn(), onmessage: null };
    const ev = new Event("message");
    Object.defineProperty(ev, "data", { value: { type: "cw-init", ...init } });
    Object.defineProperty(ev, "ports", { value: [port] });
    window.dispatchEvent(ev);
    return port;
  }

  const ready = () => {
    const mk = () => ({
      availability: async () => "available",
      create: async () => ({
        destroy() {},
        clone: async () => ({ prompt: async () => "Fixed text.", destroy() {} }),
        detect: async () => [{ detectedLanguage: "en", confidence: 0.99 }],
      }),
    });
    for (const g of ["LanguageModel", "Summarizer", "Translator", "LanguageDetector"]) globalThis[g] = mk();
  };

  it("runs the action from the menu and offers Replace when the selection is editable", async () => {
    ready();
    const port = await loadPanel({ text: "fixd txt", editable: true, action: "fix" });
    await vi.waitFor(() => expect(document.getElementById("viewResult").hidden).toBe(false));
    expect(document.getElementById("resultText").textContent).toBe("Fixed text.");
    expect(document.getElementById("replaceBtn").hidden).toBe(false);

    document.getElementById("replaceBtn").click();
    expect(port.postMessage).toHaveBeenCalledWith({ type: "replace", text: "Fixed text." });
  });

  it("hides Replace for non-editable text and makes Copy the main button", async () => {
    ready();
    await loadPanel({ text: "some text", editable: false, action: "fix" });
    await vi.waitFor(() => expect(document.getElementById("viewResult").hidden).toBe(false));
    expect(document.getElementById("replaceBtn").hidden).toBe(true);
    expect(document.getElementById("copyBtn").classList.contains("cw-btn--lime")).toBe(true);
  });

  it("applies case transforms from the Clean submenu instantly", async () => {
    await loadPanel({ text: "hello world", editable: true, action: "case", options: { transform: "titleCase" } });
    await vi.waitFor(() => expect(document.getElementById("viewResult").hidden).toBe(false));
    expect(document.getElementById("resultText").textContent).toBe("Hello World");
    expect(document.getElementById("resultLabel").textContent).toBe("Title Case");
  });

  it("shows the actions when opened without an action, with AI disabled if unavailable", async () => {
    await loadPanel({ text: "hello", editable: false, action: null });
    await vi.waitFor(() => expect(document.getElementById("aiNotice").hidden).toBe(false));
    expect(document.getElementById("viewActions").hidden).toBe(false);
    expect(document.querySelector('[data-action="fix"]').disabled).toBe(true);
    expect(document.querySelector('[data-action="clean"]').disabled).toBe(false);
  });

  it("asks to select text when nothing is selected", async () => {
    await loadPanel({ text: "", editable: false, action: null });
    expect(document.getElementById("viewEmpty").hidden).toBe(false);
  });

  it("Escape asks the host to close the panel", async () => {
    const port = await loadPanel({ text: "hello", editable: false, action: null });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(port.postMessage).toHaveBeenCalledWith({ type: "close" });
  });
});

// ---------------------------------------------------------------------------
describe("context menu", () => {
  it("maps menu items to panel actions", async () => {
    vi.resetModules();
    const { menuToPayload } = await import("../background.js");
    expect(menuToPayload("fix")).toEqual({ action: "fix" });
    expect(menuToPayload("rewrite:friendly")).toEqual({ action: "rewrite", options: { tone: "friendly" } });
    expect(menuToPayload("rewrite")).toBeNull(); // parent item
    expect(menuToPayload("clean:default")).toEqual({ action: "clean" });
    expect(menuToPayload("case:uppercase")).toEqual({ action: "case", options: { transform: "uppercase" } });
    expect(menuToPayload("open")).toEqual({ action: null });
  });
});
