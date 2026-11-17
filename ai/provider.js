// AI provider layer. Every provider exposes the same interface:
//   id, label
//   availability() -> Promise<Record<capability, status>>
//   prepare(capability, { onProgress })        (download a model; needs user activation)
//   run(action, text, options) -> Promise<string>
//
// Providers: "builtin" (Chrome on-device AI, default). "byok" comes in step 7.

import * as builtin from "./builtin.js";
import { AIError } from "./errors.js";

export { AIError };
export const ACTIONS = ["fix", "rewrite", "summarize", "translate", "instruct"];

const PROVIDERS = { builtin };

export async function getProvider() {
  let choice = "builtin";
  try {
    ({ aiProvider: choice = "builtin" } = await chrome.storage.local.get("aiProvider"));
  } catch {}
  return PROVIDERS[choice] ?? builtin;
}

/**
 * Summarizes availability for the UI.
 * @returns {Promise<{provider:string, label:string, state:"ready"|"partial"|"download"|"downloading"|"unavailable",
 *   actions: Record<string, "ready"|"download"|"downloading"|"unavailable">, capabilities: Record<string,string>}>}
 */
export async function aiStatus() {
  const provider = await getProvider();
  const capabilities = await provider.availability();

  const toActionState = (s) =>
    s === "available" ? "ready" : s === "downloadable" ? "download" : s === "downloading" ? "downloading" : "unavailable";

  // An action is as ready as the least-ready capability it needs.
  const rank = ["unavailable", "download", "downloading", "ready"];
  const actions = Object.fromEntries(
    ACTIONS.map((a) => {
      const states = provider.ACTION_REQUIRES[a].map((c) => toActionState(capabilities[c]));
      return [a, states.sort((x, y) => rank.indexOf(x) - rank.indexOf(y))[0]];
    })
  );
  const values = Object.values(actions);

  let state;
  if (values.every((v) => v === "ready")) state = "ready";
  else if (values.includes("downloading")) state = "downloading";
  else if (values.includes("download")) state = "download";
  else if (values.includes("ready")) state = "partial";
  else state = "unavailable";

  return { provider: provider.id, label: provider.label, state, actions, capabilities };
}

/** Downloads every model that is still "downloadable". Call from a click handler. */
export async function enableAI(onProgress) {
  const provider = await getProvider();
  const capabilities = await provider.availability();
  const pending = Object.entries(capabilities)
    .filter(([, s]) => s === "downloadable" || s === "downloading")
    .map(([cap]) => cap);

  // Downloads share the same Gemini Nano model in most cases; report overall progress.
  const progress = Object.fromEntries(pending.map((c) => [c, 0]));
  const report = () =>
    onProgress?.(pending.length ? Object.values(progress).reduce((a, b) => a + b, 0) / pending.length : 1);

  await Promise.all(
    pending.map((cap) =>
      provider.prepare(cap, {
        onProgress: (f) => {
          progress[cap] = f;
          report();
        },
      })
    )
  );
  report();
}

export async function runAction(action, text, options) {
  const provider = await getProvider();
  return provider.run(action, text, options);
}
