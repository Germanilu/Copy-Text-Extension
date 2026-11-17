// Splits long text into chunks the on-device model can handle, preserving the
// exact whitespace between them so the processed chunks can be joined back.

/**
 * @param {string} text
 * @param {number} max maximum characters per chunk (content, excluding the separator)
 * @returns {{text:string, sep:string}[]} chunks; joining `text + sep` of all chunks gives back `text`.
 */
export function splitText(text, max) {
  // 1) Paragraphs (keep the blank-line separators).
  const units = splitKeep(text, /(\n[ \t]*\n\s*)/);

  // 2) Paragraphs that are still too long -> sentences -> hard cuts.
  const small = [];
  for (const u of units) {
    if (u.text.length <= max) small.push(u);
    else {
      const sentences = splitKeep(u.text, /((?<=[.!?…。！？])\s+|\n)/);
      sentences[sentences.length - 1].sep += u.sep;
      for (const s of sentences) {
        if (s.text.length <= max) small.push(s);
        else {
          for (let i = 0; i < s.text.length; i += max) {
            const last = i + max >= s.text.length;
            small.push({ text: s.text.slice(i, i + max), sep: last ? s.sep : "" });
          }
        }
      }
    }
  }

  // 3) Greedily pack units back together up to `max`.
  const chunks = [];
  let cur = null;
  for (const u of small) {
    if (cur && cur.text.length + cur.sep.length + u.text.length <= max) {
      cur.text += cur.sep + u.text;
      cur.sep = u.sep;
    } else {
      if (cur) chunks.push(cur);
      cur = { ...u };
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.text.length || c.sep.length);
}

/** Splits by a regex with ONE capturing group, attaching each separator to the piece before it. */
function splitKeep(text, re) {
  const parts = text.split(re);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i] ?? "";
    const sep = parts[i + 1] ?? "";
    if (piece === "" && out.length) out[out.length - 1].sep += sep;
    else out.push({ text: piece, sep });
  }
  return out.length ? out : [{ text: "", sep: "" }];
}

/**
 * Runs `fn` on every chunk in order and joins the results with the original separators.
 * Leading/trailing whitespace of each chunk is preserved around the processed text.
 */
export async function mapChunks(chunks, fn) {
  let out = "";
  for (let i = 0; i < chunks.length; i++) {
    const { text, sep } = chunks[i];
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.trim();
    out += (core ? lead + (await fn(core, i, chunks.length)) + trail : text) + sep;
  }
  return out;
}
