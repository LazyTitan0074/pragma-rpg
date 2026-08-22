import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUMMARIZE_AFTER_MESSAGES,
  KEEP_RECENT_MESSAGES,
  splitForSummarization,
  formatTranscript,
} from "../lib/storyMemory.js";

const msg = (i) => ({ role: i % 2 === 0 ? "user" : "model", text: `message ${i}` });
const makeHistory = (n) => Array.from({ length: n }, (_, i) => msg(i));

test("below threshold => null (no summarisation yet)", () => {
  assert.equal(splitForSummarization(makeHistory(SUMMARIZE_AFTER_MESSAGES)), null);
  assert.equal(splitForSummarization([]), null);
});

test("above threshold => older + recent, no loss and no overlap", () => {
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

test("threshold exactly +1 => everything beyond the recent window gets compressed", () => {
  const result = splitForSummarization(makeHistory(SUMMARIZE_AFTER_MESSAGES + 1));
  assert.equal(result.older.length, SUMMARIZE_AFTER_MESSAGES + 1 - KEEP_RECENT_MESSAGES);
  assert.equal(result.recent.length, KEEP_RECENT_MESSAGES);
});

test("invalid input => null, no exception thrown", () => {
  assert.equal(splitForSummarization(null), null);
  assert.equal(splitForSummarization("text"), null);
});

test("formatTranscript labels roles correctly", () => {
  const out = formatTranscript([
    { role: "user", text: "You walk into class." },
    { role: "model", text: "The teacher looks your way." },
    { role: "player", text: "Hi!" },
  ]);
  assert.match(out, /PLAYER: You walk into class\./);
  assert.match(out, /GAME MASTER: The teacher looks your way/);
  assert.match(out, /PLAYER: Hi!/);
});
