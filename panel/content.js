// CleanWrite · in-page panel host (content script, injected on demand with activeTab).
// Draws a Shadow DOM host next to the selection and loads panel/panel.html inside an
// iframe (the on-device AI runs there, in an extension page). Talks to it through a
// private MessageChannel. Also performs "Replace" in the page.

(() => {
  if (window.__cleanwrite) return;

  const PANEL_URL = chrome.runtime.getURL("panel/panel.html");
  const PANEL_ORIGIN = new URL(PANEL_URL).origin;
  const GAP = 8;
  const MARGIN = 12;

  let ui = null; // { host, frame, iframe, port }
  let saved = null; // captured selection

  // -------------------------------------------------------------------------
  // Selection capture
  // -------------------------------------------------------------------------
  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function isTextField(el) {
    return (
      el?.tagName === "TEXTAREA" ||
      (el?.tagName === "INPUT" && /^(text|search|email|url|tel|)$/i.test(el.type || ""))
    );
  }

  function closestEditable(node) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el && !el.isContentEditable) el = el.parentElement;
    if (!el) return null;
    // Return the editing host (outermost contenteditable).
    while (el.parentElement?.isContentEditable) el = el.parentElement;
    return el;
  }

  function capture() {
    const el = deepActiveElement();
    if (isTextField(el) && el.selectionStart !== el.selectionEnd) {
      return {
        kind: "field",
        el,
        start: el.selectionStart,
        end: el.selectionEnd,
        text: el.value.slice(el.selectionStart, el.selectionEnd),
      };
    }
    const sel = window.getSelection();
    if (sel?.rangeCount && !sel.isCollapsed && sel.toString().trim()) {
      const range = sel.getRangeAt(0).cloneRange();
      const editable = closestEditable(range.commonAncestorContainer);
      return { kind: editable ? "editable" : "static", el: editable, range, text: sel.toString() };
    }
    return null;
  }

  function anchorRect() {
    if (!saved) return null;
    if (saved.kind === "field") return saved.el.getBoundingClientRect();
    if (saved.range?.getClientRects) {
      const rects = saved.range.getClientRects();
      const r = rects.length ? rects[rects.length - 1] : saved.range.getBoundingClientRect();
      const first = rects.length ? rects[0] : r;
      return { top: first.top, bottom: r.bottom, left: first.left, right: r.right };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------------
  const STYLE = `
    :host { all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; }
    .frame {
      width: min(440px, calc(100vw - 24px));
      border: 1px solid #CBD5E1;
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(17, 24, 39, 0.16);
      background: #FFFFFF;
      overflow: hidden;
    }
    iframe { display: block; width: 100%; height: 140px; border: 0; background: transparent; }
    @media (prefers-color-scheme: dark) {
      .frame { border-color: #374151; background: #1F2937; }
    }
  `;

  function open(payload = {}) {
    close();
    saved = capture();
    if (!saved && payload.fallbackText) saved = { kind: "static", text: payload.fallbackText };

    const host = document.createElement("cleanwrite-panel");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const frame = document.createElement("div");
    frame.className = "frame";
    const iframe = document.createElement("iframe");
    iframe.title = "CleanWrite";
    iframe.allow = "language-model; summarizer; translator; language-detector; clipboard-write";
    iframe.src = PANEL_URL;
    frame.append(iframe);
    root.append(style, frame);
    document.documentElement.append(host);
    ui = { host, frame, iframe, port: null };
    position();

    iframe.addEventListener("load", () => {
      const channel = new MessageChannel();
      ui.port = channel.port1;
      ui.port.onmessage = (e) => onPanelMessage(e.data);
      iframe.contentWindow.postMessage(
        {
          type: "cw-init",
          text: saved?.text || "",
          editable: saved?.kind === "field" || saved?.kind === "editable",
          action: payload.action || null,
          options: payload.options || {},
        },
        PANEL_ORIGIN,
        [channel.port2]
      );
      iframe.focus();
    });

    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("mousedown", onOutside, true);
    window.addEventListener("scroll", position, { capture: true, passive: true });
    window.addEventListener("resize", position, { passive: true });
  }

  function close() {
    if (!ui) return;
    ui.port?.close();
    ui.host.remove();
    ui = null;
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("mousedown", onOutside, true);
    window.removeEventListener("scroll", position, { capture: true });
    window.removeEventListener("resize", position);
  }

  function position() {
    if (!ui) return;
    const w = ui.frame.offsetWidth;
    const h = ui.frame.offsetHeight;
    const r = anchorRect() || { top: innerHeight / 3, bottom: innerHeight / 3, left: (innerWidth - w) / 2 };
    // Below the selection; above if it doesn't fit; otherwise keep it inside the viewport.
    let top = r.bottom + GAP;
    if (top + h > innerHeight - MARGIN) {
      top = r.top - GAP - h >= MARGIN ? r.top - GAP - h : Math.max(MARGIN, innerHeight - h - MARGIN);
    }
    const left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, innerWidth - w - MARGIN));
    ui.host.style.top = `${Math.round(top)}px`;
    ui.host.style.left = `${Math.round(left)}px`;
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  function onOutside(e) {
    // Clicks inside the iframe never reach the page, so any page click is "outside".
    if (ui && !e.composedPath().includes(ui.host)) close();
  }

  function onPanelMessage(msg) {
    if (!msg || !ui) return;
    if (msg.type === "resize") {
      ui.iframe.style.height = `${Math.ceil(msg.height)}px`;
      position();
    } else if (msg.type === "close") {
      close();
      restoreFocus();
    } else if (msg.type === "replace") {
      const ok = replace(msg.text);
      ui.port.postMessage({ type: "replaced", ok });
      if (ok) close();
    }
  }

  function restoreFocus() {
    try {
      saved?.el?.focus();
    } catch {}
  }

  // -------------------------------------------------------------------------
  // Replace the original selection with new text
  // -------------------------------------------------------------------------
  function insertText(text) {
    // Native insertText keeps undo (Ctrl+Z) and fires beforeinput/input, so editors
    // like Gmail, LinkedIn, Notion and WhatsApp Web update their own state.
    try {
      return typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    } catch {
      return false;
    }
  }

  function replace(text) {
    if (!saved || saved.kind === "static") return false;

    if (saved.kind === "field") {
      const { el, start, end } = saved;
      if (!el.isConnected || el.value.slice(start, end) !== saved.text) return false; // text changed meanwhile
      el.focus();
      el.setSelectionRange(start, end);
      if (!insertText(text)) {
        el.setRangeText(text, start, end, "end");
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // contenteditable
    const { el, range } = saved;
    if (!el?.isConnected) return false;
    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (insertText(text)) return true;

    // Fallback: insert text nodes + <br> (never HTML) and notify the editor.
    range.deleteContents();
    const frag = document.createDocumentFragment();
    text.split("\n").forEach((line, i) => {
      if (i) frag.append(document.createElement("br"));
      frag.append(document.createTextNode(line));
    });
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: text }));
    return true;
  }

  /** Used by the keyboard shortcut to pick the frame that holds the selection. */
  function hasSelection() {
    return !!capture();
  }

  window.__cleanwrite = { open, close, hasSelection, _replace: replace, _capture: () => (saved = capture()) };
})();
