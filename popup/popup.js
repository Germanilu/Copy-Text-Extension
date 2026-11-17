import { aiStatus, enableAI, runAction, AIError } from "../ai/provider.js";
import { TRANSLATE_TARGETS, browserLanguage, languageName } from "../ai/languages.js";
import { clean, DEFAULT_RULES, TRANSFORMS } from "../clean/rules.js";

const $ = (id) => document.getElementById(id);
const input = $("input");

const ACTION_LABELS = { fix: "Fix", rewrite: "Rewrite", summarize: "Summarize", translate: "Translate", instruct: "Your instruction", clean: "Clean" };
const TONE_LABELS = { professional: "Professional", friendly: "Friendly", shorter: "Shorter", simpler: "Simpler" };
const LANGS_NOTE = "Fix, Rewrite and Summarize work in English, Spanish, French, German and Japanese.";

let status = { state: "checking", actions: {}, label: "" };
let controller = null; // AbortController of the running AI request
let lastRun = null; // { action, options } to support "Try again"

// ---------------------------------------------------------------------------
// Views: actions · busy · result
// ---------------------------------------------------------------------------
function show(view) {
  $("viewActions").hidden = view !== "actions";
  $("viewBusy").hidden = view !== "busy";
  $("viewResult").hidden = view !== "result";
}

// ---------------------------------------------------------------------------
// AI availability card
// ---------------------------------------------------------------------------
async function refreshStatus() {
  try {
    status = await withTimeout(aiStatus(), 10000);
    console.info("[CleanWrite] AI status", status);
  } catch (err) {
    console.error("[CleanWrite] AI status check failed", err);
    status = { state: "error", actions: {}, label: "" };
  }
  try {
    renderStatus();
  } catch (err) {
    console.error("[CleanWrite] render failed", err);
    $("aiTitle").textContent = "Couldn't check AI";
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out checking AI availability")), ms)),
  ]);
}

const CARD = {
  ready: ["AI ready · on your device", LANGS_NOTE],
  partial: ["Some AI actions are available", `Greyed-out actions aren't supported on this device yet. ${LANGS_NOTE}`],
  download: [
    "Enable on-device AI",
    "Chrome needs a one-time download of its built-in AI model (several GB). Then it all runs on your computer: free, no account, no key.",
    "Enable AI",
  ],
  downloading: ["Downloading the AI model…", "You can keep browsing while Chrome downloads it.", "Show progress"],
  unavailable: [
    "AI isn't available on this device",
    "Chrome's built-in AI needs Chrome 138+ on a computer with 22 GB free disk and 16 GB RAM or a GPU with more than 4 GB. Clean always works.",
  ],
  error: ["Couldn't check AI", "Something went wrong while checking Chrome's built-in AI. Clean always works.", "Retry"],
};

function renderStatus() {
  const [title, text, button] = CARD[status.state] ?? CARD.error;
  $("aiCard").dataset.state = status.state;
  $("aiTitle").textContent = title;
  $("aiText").textContent = text;
  $("aiText").hidden = !text;
  $("enableAI").hidden = !button;
  if (button) $("enableAI").textContent = button;

  for (const btn of document.querySelectorAll("#actions [data-action]")) {
    const a = btn.dataset.action;
    if (a === "clean") continue;
    const s = status.actions[a];
    btn.disabled = !s || s === "unavailable";
    btn.title = btn.disabled ? "Not available on this device" : s === "ready" ? "" : "Downloads the AI model first";
  }
  const askOff = !status.actions.instruct || status.actions.instruct === "unavailable";
  $("ask").disabled = askOff;
  $("askBtn").disabled = askOff;
  if (askOff) {
    $("tones").hidden = true;
    $("actions").querySelector('[data-action="rewrite"]').setAttribute("aria-expanded", "false");
  }
}

$("enableAI").addEventListener("click", async () => {
  if (status.state === "error") {
    $("aiTitle").textContent = "Checking AI…";
    return refreshStatus();
  }
  // Inside the click handler: Chrome requires user activation to start the download.
  const btn = $("enableAI");
  btn.disabled = true;
  $("aiProgress").hidden = false;
  try {
    await enableAI(setProgress);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    $("aiProgress").hidden = true;
    await refreshStatus();
  }
});

function setProgress(fraction) {
  $("aiBar").style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

// ---------------------------------------------------------------------------
// State 1 · Actions
// ---------------------------------------------------------------------------
$("actions").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;

  if (action === "rewrite") {
    // Rewrite opens the tone row instead of running directly.
    const open = $("tones").hidden;
    $("tones").hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-active", open);
    if (open) $("tones").querySelector("button").focus();
    return;
  }
  run(action);
});

$("tones").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tone]");
  if (btn) run("rewrite", { tone: btn.dataset.tone });
});

$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const instruction = $("ask").value.trim();
  if (!instruction) return $("ask").focus();
  run("instruct", { instruction });
});

// ---------------------------------------------------------------------------
// Run an action
// ---------------------------------------------------------------------------
async function run(action, options = {}) {
  const text = input.value;
  if (!text.trim()) {
    showError("Paste or type some text first.");
    return input.focus();
  }
  hideError();
  lastRun = { action, options };

  if (action === "clean") {
    const { cleanRules } = await chrome.storage.sync.get("cleanRules");
    return showResult(action, clean(text, { ...DEFAULT_RULES, ...cleanRules }), "Instant · on your device");
  }

  controller = new AbortController();
  const busyLabel = labelFor(action, options);
  $("busyText").textContent = `${busyLabel}…`;
  show("busy");
  $("cancelBtn").focus();
  try {
    const result = await runAction(action, text, {
      ...options,
      signal: controller.signal,
      // Long texts are processed in parts: show where we are.
      onStep: (i, n) => ($("busyText").textContent = `${busyLabel} · part ${i + 1} of ${n}…`),
      // We're in a click handler, so a model that still needs downloading may be downloaded now.
      onProgress: (f) => {
        $("aiProgress").hidden = f >= 1;
        setProgress(f);
      },
    });
    showResult(action, result, status.label || "On your device", options);
  } catch (err) {
    show("actions");
    if (!(err instanceof AIError && err.code === "aborted")) showError(err.message);
  } finally {
    controller = null;
    $("aiProgress").hidden = true;
    if (status.state !== "ready") refreshStatus();
  }
}

function labelFor(action, options = {}) {
  if (action === "rewrite") return `Rewrite · ${TONE_LABELS[options.tone] ?? "Professional"}`;
  if (action === "translate") return `Translate → ${languageName(options.targetLanguage || browserLanguage())}`;
  return ACTION_LABELS[action];
}

$("cancelBtn").addEventListener("click", () => controller?.abort());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (controller) {
    e.preventDefault();
    controller.abort();
  } else if (!$("viewResult").hidden) {
    e.preventDefault();
    backToActions();
  }
});

// ---------------------------------------------------------------------------
// State 3 · Result
// ---------------------------------------------------------------------------
function showResult(action, text, source, options = {}) {
  $("resultLabel").textContent = labelFor(action, options);
  $("resultSource").textContent = source;
  $("resultText").textContent = text;
  renderExtra(action, options);
  show("result");
  $("copyBtn").textContent = "Copy";
  $("copyBtn").focus();
}

function renderExtra(action, options) {
  const extra = $("resultExtra");
  extra.replaceChildren();

  if (action === "translate") {
    // Language selector: change it to translate again into another language.
    const label = document.createElement("label");
    label.className = "cw-source";
    label.textContent = "To";
    label.htmlFor = "targetLang";
    const select = document.createElement("select");
    select.id = "targetLang";
    select.className = "cw-select";
    const current = options.targetLanguage || browserLanguage();
    const codes = TRANSLATE_TARGETS.includes(current) ? TRANSLATE_TARGETS : [current, ...TRANSLATE_TARGETS];
    for (const code of codes) select.add(new Option(languageName(code), code, false, code === current));
    select.addEventListener("change", () => run("translate", { targetLanguage: select.value }));
    extra.append(label, select);
  }

  if (action === "clean") {
    // Case transforms live under Clean (applied to the cleaned result).
    for (const [key, name] of [["lowercase", "lowercase"], ["uppercase", "UPPERCASE"], ["titleCase", "Title Case"]]) {
      const b = document.createElement("button");
      b.className = "cw-pill cw-pill--sm";
      b.textContent = name;
      b.addEventListener("click", () => {
        $("resultText").textContent = TRANSFORMS[key]($("resultText").textContent);
      });
      extra.append(b);
    }
  }
  extra.hidden = !extra.children.length;
}

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("resultText").textContent);
    $("copyBtn").textContent = "Copied ✓";
  } catch {
    $("copyBtn").textContent = "Couldn't copy";
  }
  setTimeout(() => ($("copyBtn").textContent = "Copy"), 1200);
});

$("retryBtn").addEventListener("click", () => lastRun && run(lastRun.action, lastRun.options));
$("backBtn").addEventListener("click", backToActions);

function backToActions() {
  show("actions");
  input.focus();
}

// ---------------------------------------------------------------------------
// Draft persistence + errors
// ---------------------------------------------------------------------------
let saveTimer;
input.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ latestText: input.value }), 300);
});

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

function hideError() {
  $("error").hidden = true;
}

// ---------------------------------------------------------------------------
// Init (last, so every const and listener above already exists)
// ---------------------------------------------------------------------------
async function init() {
  const { latestText, lastError } = await chrome.storage.local.get(["latestText", "lastError"]);
  input.value = latestText || "";
  if (lastError) {
    showError(lastError);
    chrome.storage.local.set({ lastError: null });
  }
  chrome.runtime.sendMessage({ action: "resetIcon" }).catch(() => {});
  await refreshStatus();
}

init();
