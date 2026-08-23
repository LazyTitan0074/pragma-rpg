import { test } from "node:test";
import assert from "node:assert/strict";

// Polite retry on 429: reads retryAfterSeconds, waits (injectable), retries.

const { postJsonRetry } = await import("../lib/clientFetch.js");

function fetchMock(responses) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  return { fetchFn, calls };
}
const jsonRes = (status, data) => ({ ok: status < 400, status, json: async () => data });

test("429 → retry after retryAfterSeconds → success on the second attempt", async () => {
  const { fetchFn, calls } = fetchMock([
    jsonRes(429, { error: "Too many...", retryAfterSeconds: 7 }),
    jsonRes(200, { reply: "OK" }),
  ]);
  const marks = [];
  const r = await postJsonRetry("/api/play", { x: 1 }, {
    retries: 2,
    sleepFn: async (ms) => marks.push(ms),
    fetchFn,
    onWait: (s) => marks.push(`notif:${s}`),
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.reply, "OK");
  assert.equal(calls.length, 2);
  assert.deepEqual(marks, ["notif:7", 7000]); // notify first, then wait
});

test("persistent 429 → exhausts the retries and returns the last response", async () => {
  const resp429 = () => jsonRes(429, { error: "Too many requests.", retryAfterSeconds: 5 });
  const { fetchFn, calls } = fetchMock([resp429(), resp429(), resp429()]);
  const r = await postJsonRetry("/api/generate", {}, { retries: 2, sleepFn: async () => {}, fetchFn });
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.match(r.data.error, /Too many/);
  assert.equal(calls.length, 3); // initial attempt + 2 retries
});

test("no retryAfterSeconds → default 10s backoff, clamped into the 5–60s window", async () => {
  const { fetchFn } = fetchMock([jsonRes(429, {}), jsonRes(200, {})]);
  const marks = [];
  await postJsonRetry("/", {}, { retries: 1, sleepFn: async (ms) => marks.push(ms), fetchFn });
  assert.deepEqual(marks, [10000]);
});

test("huge retryAfterSeconds clamps to 60s; zero/negative rises to the 5s minimum", async () => {
  { // upper clamp
    const { fetchFn } = fetchMock([jsonRes(429, { retryAfterSeconds: 500 }), jsonRes(200, {})]);
    const marks = [];
    await postJsonRetry("/", {}, { retries: 1, sleepFn: async (ms) => marks.push(ms), fetchFn });
    assert.deepEqual(marks, [60000]);
  }
  { // lower clamp
    const { fetchFn } = fetchMock([jsonRes(429, { retryAfterSeconds: -3 }), jsonRes(200, {})]);
    const marks = [];
    await postJsonRetry("/", {}, { retries: 1, sleepFn: async (ms) => marks.push(ms), fetchFn });
    assert.deepEqual(marks, [5000]);
  }
});

test("non-429 server errors are not retried", async () => {
  const { fetchFn, calls } = fetchMock([jsonRes(502, { error: "cascade down" })]);
  const r = await postJsonRetry("/", {}, { retries: 2, sleepFn: async () => {}, fetchFn });
  assert.equal(r.status, 502);
  assert.equal(calls.length, 1);
});
