// CleanWrite · panel page (runs inside the iframe that panel/content.js puts next to the selection).
// The host page sends the selected text through a private MessagePort ("cw-init").

import { aiStatus, enableAI, runAction, AIError } from "../ai/provider.js";
import { TRANSLATE_TARGETS, browserLanguage, languageName } from "../ai/languages.js";
import { clean, DEFAULT_RULES, TRANSFORMS } from "../clean/rules.js";

const $ = (id) => document.getElementById(id);

const ACTION_LABELS = { fix: "Fix", summarize: "Summarize", instruct: "Your instruction", clean: "Clean" };
const TONE_LABELS = { professional: "Professional", friendly: "Friendly", shorter: "Shorter", simpler: "Simpler" };
const CASE_LABELS = { lowercase: "lowercase", uppercase: "UPPERCASE", titleCase: "Title Case" };

let port = null;
let text = "";
let editable = false;
let status = { state: "checking", actions: {}, label: "" };
let controller = null;
let lastRun = null;

// ---------------------------------------------------------------------------
// Messaging with the host page
// ---------------------------------------------------------------------------
window.addEventListener("message", (e) => {
  if (port || e.data?.type !== "cw-init" || !e.ports?.[0]) return; // accept the first init only
  port = e.ports[0];
  port.onmessage = (m) => onHostMessage(m.data);
  init(e.data);
});

function send(msg) {
  port?.postMessage(msg);
}

function onHostMessage(msg) {
  if (msg?.type === "replaced" && !msg.ok) {
    showError("Couldn't replace the text: it changed or the field isn't editable anymore. Use Copy instead.");
  }
}

// Keep the iframe as tall as the content.
new ResizeObserver(() => send({ type: "resize", height: document.documentElement.scrollHeight })).observe(document.body);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function show(view) {
  for (const v of ["Actions", "Busy", "Result", "Empty"]) $(`view${v}`).hidden = view !== v.toLowerCase();
}

// ---------------------------------------------------------------------------
// AI availability
// ---------------------------------------------------------------------------
async function refreshStatus() {
  try {
    status = await Promise.race([
      aiStatus(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
    ]);
  } catch (err) {
    console.error("[CleanWrite] AI status check failed", err);
    status = { state: "unavailable", actions: {}, label: "" };
  }
  renderStatus();
}

const NOTICE = {
  partial: ["Some AI actions aren't available on this device.", false],
  download: ["On-device AI needs a one-time download.", true],
  downloading: ["Chrome is downloading its AI model…", true],
  unavailable: ["AI isn't available on this device. Clean always works.", false],
};

function renderStatus() {
  const notice = NOTICE[status.state];
  $("aiNotice").hidden = !notice;
  if (notice) {
    $("aiNoticeText").textContent = notice[0];
    $("enableAI").hidden = !notice[1];
    $("enableAI").textContent = status.state === "downloading" ? "Show progress" : "Enable AI";
  }
  for (const btn of document.querySelectorAll("#actions [data-action]")) {
    const a = btn.dataset.action;
    if (a === "clean") continue;
    const s = status.actions[a];
    btn.disabled = !s || s === "unavailable";
  }
  const askOff = !status.actions.instruct || status.actions.instruct === "unavailable";
  $("ask").disabled = askOff;
  $("askBtn").disabled = askOff;
}

$("enableAI").addEventListener("click", async () => {
  // Click inside this frame = user activation, required by Chrome to download the model.
  $("enableAI").disabled = true;
  $("aiProgress").hidden = false;
  try {
    await enableAI(setProgress);
  } catch (err) {
    showError(err.message);
  } finally {
    $("enableAI").disabled = false;
    $("aiProgress").hidden = true;
    await refreshStatus();
  }
});

function setProgress(f) {
  $("aiBar").style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
$("actions").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === "rewrite") {
    const open = $("tones").hidden;
    $("tones").hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-active", open);
    if (open) $("tones").querySelector("button").focus();
    return;
  }
  run(btn.dataset.action);
});

$("tones").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tone]");
  if (btn) run("rewrite", { tone: btn.dataset.tone });
});

$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const instruction = $("ask").value.trim();
  if (instruction) run("instruct", { instruction });
});

function labelFor(action, options = {}) {
  if (action === "rewrite") return `Rewrite · ${TONE_LABELS[options.tone] ?? "Professional"}`;
  if (action === "translate") return `Translate → ${languageName(options.targetLanguage || browserLanguage())}`;
  if (action === "case") return CASE_LABELS[options.transform] ?? "Change case";
  return ACTION_LABELS[action] ?? action;
}

async function run(action, options = {}) {
  hideError();
  lastRun = { action, options };

  if (action === "clean" || action === "case") {
    let out;
    if (action === "case") out = (TRANSFORMS[options.transform] ?? ((t) => t))(text);
    else {
      const { cleanRules } = await chrome.storage.sync.get("cleanRules");
      out = clean(text, { ...DEFAULT_RULES, ...cleanRules });
    }
    return showResult(action, out, "Instant · on your device", options);
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
      onStep: (i, n) => ($("busyText").textContent = `${busyLabel} · part ${i + 1} of ${n}…`),
      onProgress: (f) => {
        $("aiNotice").hidden = false;
        $("aiNoticeText").textContent = "Downloading the AI model…";
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
  }
}

$("cancelBtn").addEventListener("click", () => controller?.abort());

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (controller) controller.abort();
  else send({ type: "close" });
});

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
function showResult(action, out, source, options = {}) {
  $("resultLabel").textContent = labelFor(action, options);
  $("resultSource").textContent = source;
  $("resultText").textContent = out;
  renderExtra(action, options);

  // Replace only makes sense where the selection can be edited; otherwise Copy is the main button.
  $("replaceBtn").hidden = !editable;
  $("copyBtn").classList.toggle("cw-btn--lime", !editable);
  $("copyBtn").textContent = "Copy";
  show("result");
  (editable ? $("replaceBtn") : $("copyBtn")).focus();
}

function renderExtra(action, options) {
  const extra = $("resultExtra");
  extra.replaceChildren();

  if (action === "translate") {
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

  if (action === "clean" || action === "case") {
    for (const [key, name] of Object.entries(CASE_LABELS)) {
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

$("replaceBtn").addEventListener("click", () => send({ type: "replace", text: $("resultText").textContent }));

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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

function hideError() {
  $("error").hidden = true;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init(data) {
  text = String(data.text || "");
  editable = !!data.editable;

  if (!text.trim()) {
    show("empty");
    return;
  }
  show("actions");
  await refreshStatus();

  if (data.action) run(data.action, data.options || {});
  else $("actions").querySelector("button:not(:disabled)")?.focus();
}
