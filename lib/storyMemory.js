// Story memory: thresholds for the rolling chat summarization (audit R6).
// Every save includes the entire chat history; long sessions bloated
// records up to QuotaExceededError. Solution: when the history exceeds
// SUMMARIZE_AFTER_MESSAGES messages, the older part is compressed by the AI into a
// summary, and only the last KEEP_RECENT_MESSAGES turns remain in chat/save.
//
// Aug 23, 2026 (decision made with the user): cloud model windows are
// huge (131k–1M tokens), and detail loss came from small thresholds,
// not from the models. Raised 30→60 and 12→24: practical loss now starts after
// ~60 messages, with the last 24 seen verbatim. Cost: larger input per turn
// (free-tier quota consumption) — consciously accepted.

export const SUMMARIZE_AFTER_MESSAGES = 60;
export const KEEP_RECENT_MESSAGES = 24;

/**
 * Decides whether the history needs compressing and returns the two pieces.
 * @param {Array<{role: string, text: string}>} messages
 * @returns {null | {older: Array, recent: Array}} null = not needed yet
 */
export function splitForSummarization(messages) {
  if (!Array.isArray(messages)) return null;
  if (messages.length <= SUMMARIZE_AFTER_MESSAGES) return null;

  const cut = messages.length - KEEP_RECENT_MESSAGES;
  if (cut <= 0) return null;

  return {
    older: messages.slice(0, cut),
    recent: messages.slice(cut),
  };
}

/**
 * Formats a message list as a readable transcript for the summarization prompt.
 * (Labels are model-facing → English, like the rest of the AI context.)
 */
export function formatTranscript(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m) => `${m.role === "user" || m.role === "player" ? "PLAYER" : "GAME MASTER"}: ${m.text}`)
    .join("\n\n");
}

// ── Story bible (point C): the structured ledger of established facts ──
// Unlike the narrative summary (prose), the ledger is a list of facts with
// state — updated at every summarization, injected separately into the DM prompt,
// so promises, NPCs and items never get lost.

const asTrimmedString = (v) => (typeof v === "string" ? v.trim() : "");
const asCleanList = (v) =>
  Array.isArray(v)
    ? v.map(asTrimmedString).filter(Boolean)
    : typeof v === "string" && v.trim()
      ? [v.trim()]
      : [];

// Aug 23, 2026: the AI pipeline writes in English → the model may reply with
// EN keys; storage stays on the canonical RO keys (UI, DB, exports untouched).
// Only strings pass through (historic behavior: non-strings are dropped).
function firstKey(obj, ...keys) {
  for (const k of keys) {
    if (typeof obj[k] === "string") return obj[k];
  }
  return "";
}

function asFactList(v, keys, aliases = {}) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ [keys[0]]: item.trim(), ...(keys[1] ? { [keys[1]]: "" } : {}) });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const fact = {};
    let hasContent = false;
    keys.forEach((k, i) => {
      fact[k] = asTrimmedString(firstKey(item, k, ...(aliases[k] || [])));
      if (i === 0 && fact[k]) hasContent = true;
    });
    if (hasContent) out.push(fact);
  }
  return out;
}

/**
 * Tolerantly coerces anything coming from the AI into the bible schema:
 * { decizii: string[], npcs: [{nume,cine,relatie}], promisiuni_secrete: [{text,stare}],
 *   obiecte: [{nume,descriere,stare}], fire_deschise: string[] }
 * Also accepts the English keys produced by the EN pipeline (decisions etc.);
 * output is always on the canonical Romanian keys.
 * @returns {object|null} null if no useful fact exists
 */
export function sanitizeBible(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const bible = {
    decizii: asCleanList(parsed.decizii ?? parsed.decisions),
    npcs: asFactList(
      parsed.npcs,
      ["nume", "cine", "relatie"],
      { nume: ["name"], cine: ["who", "description"], relatie: ["relation", "relationship"] },
    ),
    promisiuni_secrete: asFactList(
      parsed.promisiuni_secrete ?? parsed.promises_secrets ?? parsed.promises_and_secrets,
      ["text", "stare"],
      { stare: ["status", "state"] },
    ),
    obiecte: asFactList(
      parsed.obiecte ?? parsed.items,
      ["nume", "descriere", "stare"],
      { nume: ["name"], descriere: ["description"], stare: ["status", "state"] },
    ),
    fire_deschise: asCleanList(parsed.fire_deschise ?? parsed.open_threads),
  };
  const total =
    bible.decizii.length +
    bible.npcs.length +
    bible.promisiuni_secrete.length +
    bible.obiecte.length +
    bible.fire_deschise.length;
  return total > 0 ? bible : null;
}

/**
 * Renders the bible as a readable block for the DM prompt (not raw JSON).
 * @returns {string|null} null if the bible is missing or empty
 */
export function formatBible(bible) {
  const clean = sanitizeBible(bible);
  if (!clean) return null;
  const lines = [];
  if (clean.decizii.length) {
    lines.push("DECISIONS MADE:");
    for (const d of clean.decizii) lines.push(`- ${d}`);
  }
  if (clean.npcs.length) {
    lines.push("NPCS MET:");
    for (const n of clean.npcs) lines.push(`- ${n.nume}${n.cine ? ` (${n.cine})` : ""}${n.relatie ? ` — relationship: ${n.relatie}` : ""}`);
  }
  if (clean.promisiuni_secrete.length) {
    lines.push("PROMISES AND SECRETS:");
    for (const p of clean.promisiuni_secrete) lines.push(`- ${p.text}${p.stare ? ` [${p.stare}]` : ""}`);
  }
  if (clean.obiecte.length) {
    lines.push("ITEMS AND RESOURCES:");
    for (const o of clean.obiecte) lines.push(`- ${o.nume}${o.descriere ? ` (${o.descriere})` : ""}${o.stare ? ` [${o.stare}]` : ""}`);
  }
  if (clean.fire_deschise.length) {
    lines.push("OPEN THREADS:");
    for (const f of clean.fire_deschise) lines.push(`- ${f}`);
  }
  return lines.length ? lines.join("\n") : null;
}
