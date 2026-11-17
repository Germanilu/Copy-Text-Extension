// CleanWrite · Clean rules
// Pure functions (string -> string), no DOM or chrome.* access, so they can be
// unit-tested and reused from the service worker, the panel and the popup.

// ---------------------------------------------------------------------------
// Individual rules
// ---------------------------------------------------------------------------

/** Zero-width chars and BOM are removed; no-break and narrow no-break spaces become normal spaces. */
export function invisibles(text) {
  return text.replace(/[​-‍﻿]/g, "").replace(/[  ]/g, " ");
}

/** Runs of spaces/tabs inside a line become a single space (leading indentation is kept). */
export function multipleSpaces(text) {
  return text.replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ");
}

/** Removes spaces/tabs at the end of each line. */
export function trailingSpaces(text) {
  return text.replace(/[ \t]+$/gm, "");
}

/** Collapses 2+ blank lines into one blank line (paragraphs are kept). */
export function multipleLineBreaks(text) {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n");
}

/** Typographic dashes and quotes become plain ASCII. */
export function typography(text) {
  return text
    .replace(/[–—−]/g, "-")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, "...");
}

/** Markdown leftovers: **bold**, __bold__, # headings, "* " / "+ " bullets -> "- ". */
export function markdown(text) {
  return text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1$2")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ");
}

/** Strips HTML tags/comments/scripts and decodes the most common entities. */
export function html(text) {
  const body = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) text = body[1];
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[a-z!\/][^>]*>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Removes http(s):// and www. links. */
export function urls(text) {
  return text.replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, "");
}

/**
 * Removes emojis (incl. skin tones, flags, keycaps and ZWJ sequences).
 * Uses Extended_Pictographic, not \p{Emoji}, which also matches 0-9, # and *.
 */
export function emojis(text) {
  return text
    .replace(/\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])*(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])*)*/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[#*0-9]️?⃣/gu, "")
    .replace(/️/g, "");
}

// ---------------------------------------------------------------------------
// Rule set
// ---------------------------------------------------------------------------

// Order matters: rules that delete content run first, whitespace rules last.
export const RULES = [
  { id: "invisibles", fn: invisibles, default: true },
  { id: "html", fn: html, default: false },
  { id: "urls", fn: urls, default: false },
  { id: "emojis", fn: emojis, default: false },
  { id: "markdown", fn: markdown, default: true },
  { id: "typography", fn: typography, default: false },
  { id: "multipleSpaces", fn: multipleSpaces, default: true },
  { id: "trailingSpaces", fn: trailingSpaces, default: true },
  { id: "multipleLineBreaks", fn: multipleLineBreaks, default: true },
];

export const DEFAULT_RULES = Object.fromEntries(RULES.map((r) => [r.id, r.default]));

/**
 * Applies the enabled rules in a fixed order.
 * @param {string} text
 * @param {Record<string, boolean>} [enabled] rule id -> on/off (missing ids use the default)
 */
export function clean(text, enabled = {}) {
  let out = String(text).replace(/\r\n?/g, "\n");
  for (const rule of RULES) {
    if (enabled[rule.id] ?? rule.default) out = rule.fn(out);
  }
  // Removing content (URLs, emojis, tags) leaves gaps: tidy them if whitespace rules are on.
  if (enabled.multipleSpaces ?? true) out = out.replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ");
  if (enabled.trailingSpaces ?? true) out = out.replace(/[ \t]+$/gm, "");
  return out.replace(/^\n+|\n+$/g, "");
}

// ---------------------------------------------------------------------------
// Case transforms (submenu of Clean in the panel)
// ---------------------------------------------------------------------------

export const lowercase = (text) => text.toLowerCase();
export const uppercase = (text) => text.toUpperCase();

/** Title Case that works with accented letters (é, ñ, à…) and keeps apostrophes (don't). */
export function titleCase(text) {
  return text
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export const TRANSFORMS = { lowercase, uppercase, titleCase };
