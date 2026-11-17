import { describe, it, expect } from "vitest";
import { splitText, mapChunks } from "../ai/chunk.js";

const join = (chunks) => chunks.map((c) => c.text + c.sep).join("");
const para = (n, len = 500) => Array.from({ length: n }, (_, i) => `P${i} ` + "x".repeat(len)).join("\n\n");

describe("splitText", () => {
  it("returns a single chunk for short text", () => {
    expect(splitText("hello world", 100)).toEqual([{ text: "hello world", sep: "" }]);
  });

  it("packs paragraphs into chunks under the limit and can be joined back exactly", () => {
    const text = para(10);
    const chunks = splitText(text, 1200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1200);
    expect(join(chunks)).toBe(text);
  });

  it("splits a long paragraph by sentences", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = splitText(text, 200);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(200);
    expect(join(chunks)).toBe(text);
  });

  it("hard-cuts text without any break", () => {
    const text = "a".repeat(1050);
    const chunks = splitText(text, 500);
    expect(chunks.map((c) => c.text.length)).toEqual([500, 500, 50]);
    expect(join(chunks)).toBe(text);
  });

  it("keeps odd whitespace between paragraphs", () => {
    const text = "one\n  \n\ntwo\n\n\nthree";
    expect(join(splitText(text, 4))).toBe(text);
  });
});

describe("mapChunks", () => {
  it("processes each chunk and keeps the separators", async () => {
    const chunks = splitText("a\n\nb\n\nc", 1);
    const steps = [];
    const out = await mapChunks(chunks, async (t, i, n) => (steps.push([i, n]), t.toUpperCase()));
    expect(out).toBe("A\n\nB\n\nC");
    expect(steps).toEqual([[0, 3], [1, 3], [2, 3]]);
  });
});
