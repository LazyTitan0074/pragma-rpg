// Tests for the save synchronization planner (lib/savesSync.js).
// Covers both directions, the mixed timestamp formats (ISO vs epoch ms),
// the key case of a campaign stuck on an old version, and corrupted entries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSync, recordTime } from "../lib/savesSync.js";

const T0 = 1755900000000;
const iso = (ms) => new Date(ms).toISOString();

test("planSync on empty lists plans nothing", () => {
  assert.deepEqual(planSync([], []), { toPush: [], toFetch: [], toDeleteLocally: [] });
});

test("a local-only campaign is pushed; a server-only one is fetched", () => {
  const { toPush, toFetch } = planSync(
    [{ id: "a", updatedAt: iso(T0) }],
    [{ id: "b", updatedAt: T0 }]
  );
  assert.equal(toPush.length, 1);
  assert.equal(toPush[0].id, "a");
  assert.equal(toFetch.length, 1);
  assert.equal(toFetch[0].id, "b");
});

test("server newer than the local copy → fetch (the stuck-old-version bug)", () => {
  const { toPush, toFetch } = planSync(
    [{ id: "x", updatedAt: iso(T0) }],
    [{ id: "x", updatedAt: T0 + 5000 }]
  );
  assert.deepEqual(toPush.map((i) => i.id), []);
  assert.deepEqual(toFetch.map((i) => i.id), ["x"]);
});

test("local copy newer than the server → push, no fetch", () => {
  const { toPush, toFetch } = planSync(
    [{ id: "x", updatedAt: iso(T0 + 9000) }],
    [{ id: "x", updatedAt: T0 + 1000 }]
  );
  assert.deepEqual(toPush.map((i) => i.id), ["x"]);
  assert.deepEqual(toFetch.map((i) => i.id), []);
});

test("equal timestamps → zero traffic (no useless churn)", () => {
  const { toPush, toFetch } = planSync(
    [{ id: "x", updatedAt: iso(T0) }],
    [{ id: "x", updatedAt: T0 }]
  );
  assert.deepEqual(toPush.map((i) => i.id), []);
  assert.deepEqual(toFetch.map((i) => i.id), []);
});

test("mixed: two campaigns synced in opposite directions simultaneously", () => {
  const { toPush, toFetch } = planSync(
    [
      { id: "veche-local", updatedAt: iso(T0) },
      { id: "noua-local", updatedAt: iso(T0 + 8000) },
    ],
    [
      { id: "veche-local", updatedAt: T0 + 4000 }, // server advanced → fetch
      { id: "noua-local", updatedAt: T0 + 2000 }, // local advanced → push
      { id: "doar-server", updatedAt: T0 + 1000 },
    ]
  );
  assert.deepEqual(toPush.map((i) => i.id), ["noua-local"]);
  assert.deepEqual(toFetch.map((i) => i.id), ["veche-local", "doar-server"]);
});

test("corrupted entries are politely ignored", () => {
  const { toPush, toFetch } = planSync(
    [null, {}, { id: null, updatedAt: iso(T0) }],
    ["junk", 42, { updatedAt: T0 }]
  );
  assert.deepEqual(toPush, []);
  assert.deepEqual(toFetch, []);
});

test("recordTime accepts ISO strings and epoch ms and rejects junk", () => {
  assert.equal(recordTime(iso(T0)), T0);
  assert.equal(recordTime(T0), T0);
  assert.equal(recordTime(undefined), 0);
  assert.equal(recordTime(null), 0);
  assert.equal(recordTime("not-a-date"), 0);
});

// ── Tombstones (Aug 23, 2026): deletions propagate to offline devices ──

test("tombstone: a campaign deleted on another device disappears locally and is not re-uploaded", () => {
  const local = [{ id: "moarta", updatedAt: iso(T0) }, { id: "vieata", updatedAt: iso(T0 + 100) }];
  const server = [local[1]];
  const { toPush, toFetch, toDeleteLocally } = planSync(local, server, [
    { id: "moarta", deletedAt: T0 + 500 },
  ]);
  assert.deepEqual(toDeleteLocally.map((i) => i.id), ["moarta"]);
  assert.deepEqual(toPush.map((i) => i.id), []); // moarta is NOT re-uploaded
  assert.deepEqual(toFetch.map((i) => i.id), []);
});

test("local edit NEWER than the deletion → the user's intent wins", () => {
  // the local copy was edited at T0+900, after the grave at T0+500
  const local = [{ id: "refacuta", title: "Consciously recreated", updatedAt: iso(T0 + 900) }];
  const { toPush, toFetch, toDeleteLocally } = planSync(local, [], [
    { id: "refacuta", deletedAt: T0 + 500 },
  ]);
  assert.deepEqual(toDeleteLocally.map((i) => i.id), []);
  assert.deepEqual(toPush.map((i) => i.id), ["refacuta"]); // re-uploaded as a recreation
});

test("without tombstones → historical behavior intact (regression)", () => {
  const local = [{ id: "a", updatedAt: iso(T0) }];
  const r1 = planSync(local, []);
  assert.deepEqual(r1.toPush.map((i) => i.id), ["a"]);
  assert.deepEqual(r1.toDeleteLocally, []);
});
