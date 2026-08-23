import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Server-side character library (Aug 23, 2026): LWW upsert, list, get, delete.
// Test DB in a unique temp folder, before import (getDb reads env at first call).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pragma-chars-test-"));
process.env.PRAGMA_DATA_DIR = tmp;

const { upsertCharacter, listCharacters, getCharacter, deleteCharacter, listDeletedCharacters } = await import(
  "../lib/charactersDb.js"
);

before(() => {
  for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
});

test("upsert + get: full sheet saves and reads back", () => {
  const sheet = { name: "Klara", role: "Apothecary", universe: "Transylvania, 1872", secrets: "keeps a ledger" };
  const r = upsertCharacter({ id: "char_1", character: sheet, updatedAt: 1000 });
  assert.equal(r.applied, true);
  const got = getCharacter("char_1");
  assert.equal(got.name, "Klara");
  assert.deepEqual(got.character, sheet);
});

test("last-write-wins: older version rejected", () => {
  upsertCharacter({ id: "char_2", character: { name: "New" }, updatedAt: 2000 });
  const stale = upsertCharacter({ id: "char_2", character: { name: "Old" }, updatedAt: 1000 });
  assert.equal(stale.applied, false);
  assert.equal(getCharacter("char_2").name, "New");
});

test("on equal timestamp the incoming write wins (idempotent retry)", () => {
  upsertCharacter({ id: "char_3", character: { name: "A" }, updatedAt: 500 });
  const r = upsertCharacter({ id: "char_3", character: { name: "B" }, updatedAt: 500 });
  assert.equal(r.applied, true);
  assert.equal(getCharacter("char_3").name, "B");
});

test("list ordered desc by updated_at + metadata extracted", () => {
  const before = listCharacters().length;
  upsertCharacter({ id: "a", character: { name: "Older", role: "R1", universe: "U1" }, updatedAt: 1_000_000 });
  upsertCharacter({ id: "b", character: { name: "Newer", role: "R2", universe: "U2" }, updatedAt: 2_000_000 });
  const list = listCharacters();
  assert.equal(list.length, before + 2);
  assert.equal(list[0].id, "b");
  assert.equal(list.some((c) => c.id === "a"), true);
});

test("delete + nonexistent", () => {
  upsertCharacter({ id: "char_9", character: { name: "X" }, updatedAt: 1 });
  assert.equal(deleteCharacter("char_9"), true);
  assert.equal(deleteCharacter("char_9"), false);
  assert.equal(getCharacter("char_9"), null);
});

test("invalid input: missing id or missing object → polite error", () => {
  assert.throws(() => upsertCharacter({ character: { name: "No id" } }), /missing character id/i);
  assert.throws(() => upsertCharacter(null), /Invalid record/i);
});

test("character tombstone: delete leaves a grave; stale re-upsert rejected; newer edit wins", () => {
  const now = Date.now();
  upsertCharacter({ id: "char_g1", character: { name: "To delete" }, updatedAt: now + 10_000 });
  assert.equal(deleteCharacter("char_g1"), true);
  assert.equal(listDeletedCharacters(0).some((g) => g.id === "char_g1"), true);

  // an edit NEWER than the grave passes and clears the tombstone
  const revived = upsertCharacter({ id: "char_g1", character: { name: "Recreated" }, updatedAt: now + 11_000 });
  assert.equal(revived.applied, true);
  assert.equal(getCharacter("char_g1").name, "Recreated");
  assert.equal(listDeletedCharacters(0).some((g) => g.id === "char_g1"), false);

  // the blocking case: a copy older than the deletion comes back offline → rejected
  upsertCharacter({ id: "char_g2", character: { name: "X" }, updatedAt: now });
  deleteCharacter("char_g2");
  const blocked = upsertCharacter({ id: "char_g2", character: { name: "X" }, updatedAt: now - 1000 });
  assert.equal(blocked.applied, false);
  assert.match(blocked.reason, /tombstone/);
});
