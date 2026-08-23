import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUMMARIZE_AFTER_MESSAGES,
  KEEP_RECENT_MESSAGES,
  splitForSummarization,
  formatTranscript,
  sanitizeBible,
  formatBible,
} from "../lib/storyMemory.js";

const msg = (i) => ({ role: i % 2 === 0 ? "user" : "model", text: `message ${i}` });
const makeHistory = (n) => Array.from({ length: n }, (_, i) => msg(i));

test("the thresholds widened on Aug 23 are locked in (decision: rarer loss)", () => {
  assert.equal(SUMMARIZE_AFTER_MESSAGES, 60);
  assert.equal(KEEP_RECENT_MESSAGES, 24);
});

test("below threshold => null (nothing to summarize)", () => {
  assert.equal(splitForSummarization(makeHistory(SUMMARIZE_AFTER_MESSAGES)), null);
  assert.equal(splitForSummarization([]), null);
});

test("above threshold => older + recent, with no loss and no overlap", () => {
  const total = SUMMARIZE_AFTER_MESSAGES + 5;
  const result = splitForSummarization(makeHistory(total));
  assert.notEqual(result, null);
  assert.equal(result.older.length, total - KEEP_RECENT_MESSAGES);
  assert.equal(result.recent.length, KEEP_RECENT_MESSAGES);
  assert.deepEqual(
    [...result.older, ...result.recent].map((m) => m.text),
    makeHistory(total).map((m) => m.text)
  );
});

test("exact threshold +1 => everything beyond the recent window is compressed", () => {
  const result = splitForSummarization(makeHistory(SUMMARIZE_AFTER_MESSAGES + 1));
  assert.equal(result.older.length, SUMMARIZE_AFTER_MESSAGES + 1 - KEEP_RECENT_MESSAGES);
  assert.equal(result.recent.length, KEEP_RECENT_MESSAGES);
});

test("invalid input => null, does not throw", () => {
  assert.equal(splitForSummarization(null), null);
  assert.equal(splitForSummarization("text"), null);
});

test("formatTranscript labels the roles correctly", () => {
  const out = formatTranscript([
    { role: "user", text: "You walk into class." },
    { role: "model", text: "The teacher looks toward you." },
    { role: "player", text: "Hi!" },
  ]);
  assert.match(out, /PLAYER: You walk into class\./);
  assert.match(out, /GAME MASTER: The teacher looks/);
  assert.match(out, /PLAYER: Hi!/);
});

// ── Story bible (point C) ──

const VALID_BIBLE = {
  decizii: ["You promised the research plan by Friday."],
  npcs: [{ nume: "Lara", cine: "the dean", relatie: "transactional" }],
  promisiuni_secrete: [{ text: "The research plan", stare: "active" }],
  obiecte: [{ nume: "The old phone", descriere: "with a noted number", stare: "held" }],
  fire_deschise: ["The missing compromise file."],
};

test("sanitizeBible: a valid sheet passes intact", () => {
  const b = sanitizeBible(VALID_BIBLE);
  assert.deepEqual(b, VALID_BIBLE);
});

test("sanitizeBible: junk coming from the AI is cleaned, not discarded", () => {
  const b = sanitizeBible({
    decizii: [42, null, "real decision"],
    npcs: [{ nume: "" }, { nume: "Lara" }, "plain text"],
    promisiuni_secrete: [{ text: "promise" }],
    obiecte: [{ nume: "The key", descriere: 7, stare: null }],
    fire_deschise: [],
    extra_external: "discarded",
  });
  assert.equal(b.decizii[0], "real decision");
  assert.equal(b.npcs.length, 2); // {nume:"Lara"} + the converted plain string
  assert.equal(b.npcs[1].nume, "plain text");
  assert.deepEqual(b.promisiuni_secrete, [{ text: "promise", stare: "" }]);
  assert.deepEqual(b.obiecte, [{ nume: "The key", descriere: "", stare: "" }]);
});

test("sanitizeBible: empty or non-object input => null (not an empty bible)", () => {
  assert.equal(sanitizeBible(null), null);
  assert.equal(sanitizeBible("text"), null);
  assert.equal(sanitizeBible({ decizii: [], npcs: [], promisiuni_secrete: [], obiecte: [], fire_deschise: [] }), null);
  assert.equal(sanitizeBible({ decizii: [""], extra: true }), null);
});

// Aug 23: the AI pipeline writes in English — EN keys map onto the canonical RO keys.
test("sanitizeBible: accepts the EN pipeline's English keys", () => {
  const b = sanitizeBible({
    decisions: ["You promised the research plan by Friday."],
    npcs: [{ name: "Lara", who: "the dean", relation: "transactional" }],
    promises_secrets: [{ text: "The research plan", status: "active" }],
    items: [{ name: "The old phone", description: "with a noted number", status: "held" }],
    open_threads: ["The missing compromise file."],
  });
  assert.deepEqual(b, {
    decizii: ["You promised the research plan by Friday."],
    npcs: [{ nume: "Lara", cine: "the dean", relatie: "transactional" }],
    promisiuni_secrete: [{ text: "The research plan", stare: "active" }],
    obiecte: [{ nume: "The old phone", descriere: "with a noted number", stare: "held" }],
    fire_deschise: ["The missing compromise file."],
  });
});

test("formatBible: renders the sections with labels and states", () => {
  const out = formatBible(VALID_BIBLE);
  assert.match(out, /DECISIONS MADE:/);
  assert.match(out, /- Lara \(the dean\) — relationship: transactional/);
  assert.match(out, /PROMISES AND SECRETS:/);
  assert.match(out, /\[active\]/);
  assert.match(out, /- The old phone \(with a noted number\) \[held\]/);
  assert.match(out, /OPEN THREADS:/);
});

test("formatBible: empty sections are omitted; an empty bible => null", () => {
  const out = formatBible({ decizii: ["just one"] });
  assert.match(out, /DECISIONS MADE:/);
  assert.doesNotMatch(out, /NPCS MET:/);
  assert.equal(formatBible(null), null);
});
