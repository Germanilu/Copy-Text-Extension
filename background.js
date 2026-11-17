// CleanWrite · service worker
// Right-click menu + keyboard shortcut. Both open the in-page panel (panel/content.js),
// optionally running an action straight away. The AI itself runs inside the panel.

// -------------------------------------
// 1) Context menu: CleanWrite ▸ actions
// -------------------------------------
// With several top-level items, Chrome groups them under "CleanWrite" automatically.
const MENUS = [
  { id: "fix", title: "Fix" },
  { id: "rewrite", title: "Rewrite" },
  { id: "rewrite:professional", parentId: "rewrite", title: "Professional" },
  { id: "rewrite:friendly", parentId: "rewrite", title: "Friendly" },
  { id: "rewrite:shorter", parentId: "rewrite", title: "Shorter" },
  { id: "rewrite:simpler", parentId: "rewrite", title: "Simpler" },
  { id: "summarize", title: "Summarize" },
  { id: "translate", title: "Translate" },
  { id: "clean", title: "Clean" },
  { id: "clean:default", parentId: "clean", title: "Clean up text" },
  { id: "case:lowercase", parentId: "clean", title: "lowercase" },
  { id: "case:uppercase", parentId: "clean", title: "UPPERCASE" },
  { id: "case:titleCase", parentId: "clean", title: "Title Case" },
  { id: "sep", type: "separator" },
  { id: "open", title: "More actions…" },
];

chrome.runtime.onInstalled.addListener(() => {
  // onInstalled also fires on updates: clear first to avoid "duplicate id" errors.
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create({ ...m, contexts: ["selection"] });
  });
});

/** Menu id -> what the panel should run. */
export function menuToPayload(id) {
  const [head, sub] = String(id).split(":");
  switch (head) {
    case "fix":
    case "summarize":
    case "translate":
      return { action: head };
    case "rewrite":
      return sub ? { action: "rewrite", options: { tone: sub } } : null;
    case "clean":
      return sub ? { action: "clean" } : null;
    case "case":
      return { action: "case", options: { transform: sub } };
    case "open":
      return { action: null };
    default:
      return null;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const payload = menuToPayload(info.menuItemId);
  if (!payload || !tab?.id) return;
  await openPanel(tab.id, info.frameId ?? 0, { ...payload, fallbackText: info.selectionText || "" });
});

// -------------------------------------
// 2) Keyboard shortcut (Alt+W by default)
// -------------------------------------
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-panel" || !tab?.id) return;
  let frameId = 0;
  try {
    // Inject everywhere we're allowed, then pick the frame that holds the selection.
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["panel/content.js"] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.__cleanwrite?.hasSelection() ?? false,
    });
    frameId = results.find((r) => r.result)?.frameId ?? 0;
  } catch {}
  await openPanel(tab.id, frameId, { action: null });
});

// -------------------------------------
// 3) Open the panel in the page
// -------------------------------------
async function openPanel(tabId, frameId, payload) {
  const target = { tabId, frameIds: [frameId] };
  try {
    await chrome.scripting.executeScript({ target, files: ["panel/content.js"] });
    await chrome.scripting.executeScript({ target, func: (p) => window.__cleanwrite.open(p), args: [payload] });
  } catch (err) {
    // Pages where extensions can't run (chrome://, Chrome Web Store, PDF viewer…):
    // keep the text for the popup and tell the user.
    console.warn("[CleanWrite] can't open the panel on this page", err);
    await chrome.storage.local.set({
      latestText: payload.fallbackText || "",
      lastError: "CleanWrite can't open on this page. Your selected text is here — use the actions below.",
    });
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#111827" });
  }
}

// -------------------------------------
// 4) Popup opened -> clear badge
// -------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "resetIcon") chrome.action.setBadgeText({ text: "" });
});
