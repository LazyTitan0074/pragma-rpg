import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Test DB in a unique temp folder, before import (getDb reads env at first call)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pragma-db-test-"));
process.env.PRAGMA_DATA_DIR = tmp;

const { upsertCampaign, listCampaigns, getCampaign, deleteCampaign, listDeletedCampaigns } = await import(
  "../lib/savesDb.js"
);

const record = (overrides = {}) => ({
  id: "camp_1",
  deviceId: "device_A",
  title: "Shadows of Delphi",
  setting: "Ancient Delphi",
  tone: "Mystery",
  mode: "missions",
  variant: "mister",
  length: "scurta",
  usedModel: "gemini-3.5-flash-lite",
  character: { name: "Lara" },
  campaign: { title: "Shadows of Delphi", missions: [1, 2, 3] },
  gameMessages: [{ role: "user", text: "I enter the temple." }],
  storySummary: "",
  updatedAt: 1000,
  ...overrides,
});

before(() => {
  // cleanup between runs in the same tmp (mkdtemp is already unique, but defensive)
  for (const f of fs.readdirSync(tmp)) fs.unlinkSync(path.join(tmp, f));
});

test("upsert inserts a new record", () => {
  const res = upsertCampaign(record());
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
});

test("upsert with an older version does NOT overwrite (last-write-wins)", () => {
  const res = upsertCampaign(record({ title: "OLD", updatedAt: 500 }));
  assert.equal(res.applied, false);
  const full = getCampaign("camp_1");
  assert.equal(full.title, "Shadows of Delphi");
});

test("upsert with a newer version overwrites", () => {
  upsertCampaign(record({ title: "NEW", storySummary: "Updated summary.", updatedAt: 2000 }));
  const full = getCampaign("camp_1");
  assert.equal(full.title, "NEW");
  assert.equal(full.storySummary, "Updated summary.");
});

test("upsert at an EQUAL timestamp applies (tie-break on last arrival)", () => {
  upsertCampaign(record({ title: "EQUAL", updatedAt: 2000 }));
  assert.equal(getCampaign("camp_1").title, "EQUAL");
});

test("getCampaign rebuilds the JSON objects intact", () => {
  const full = getCampaign("camp_1");
  assert.deepEqual(full.character, { name: "Lara" });
  assert.deepEqual(full.campaign.missions, [1, 2, 3]);
  assert.equal(full.gameMessages[0].text, "I enter the temple.");
  assert.equal(full.deviceId, "device_A");
});

test("list ordered descending by updated_at, metadata only", () => {
  upsertCampaign(record({ id: "camp_0", title: "Older", updatedAt: 50 }));
  upsertCampaign(record({ id: "camp_2", title: "Newest", msgCountHint: 0, gameMessages: [], updatedAt: 3000 }));
  const list = listCampaigns();
  assert.deepEqual(list.map((c) => c.id), ["camp_2", "camp_1", "camp_0"]);
  assert.equal(list[0].messageCount, 0);
  assert.ok(!("campaign" in list[0]), "the list must not carry full blobs");
  assert.equal(list[1].messageCount, 1);
});

test("delete removes and reports correctly", () => {
  assert.equal(deleteCampaign("camp_0"), true);
  assert.equal(deleteCampaign("camp_0"), false);
  assert.equal(getCampaign("camp_0"), null);
});

test("tombstone: delete leaves a grave visible in the list (Aug 23)", () => {
  upsertCampaign(record({ id: "camp_tomb", title: "To delete", updatedAt: 5000 }));
  deleteCampaign("camp_tomb");
  const graves = listDeletedCampaigns(0);
  assert.equal(graves.some((g) => g.id === "camp_tomb"), true);
  assert.equal(Number.isFinite(graves.find((g) => g.id === "camp_tomb").deletedAt), true);
});

test("tombstone blocks re-upload of the old version, but a newer edit releases it", () => {
  // real timestamps: the tombstone writes Date.now() on the server
  const now = Date.now();
  // deleted now → the offline push with an older copy is rejected
  upsertCampaign(record({ id: "camp_res", title: "Resurrect?", updatedAt: now + 7000 }));
  deleteCampaign("camp_res");
  const rejected = upsertCampaign(record({ id: "camp_res", title: "Resurrect?", updatedAt: now - 1000 }));
  assert.equal(rejected.applied, false);
  assert.match(rejected.reason, /tombstone/);
  assert.equal(getCampaign("camp_res"), null);

  // an edit NEWER than the deletion = deliberate intent to recreate → passes + clears the grave
  const revived = upsertCampaign(record({ id: "camp_res", title: "Consciously recreated", updatedAt: now + 9000 }));
  assert.equal(revived.applied, true);
  assert.equal(getCampaign("camp_res").title, "Consciously recreated");
  assert.equal(listDeletedCampaigns(0).some((g) => g.id === "camp_res"), false);
});

test("invalid input rejected with a clear error", () => {
  assert.throws(() => upsertCampaign(null), /campaign object/);
  assert.throws(() => upsertCampaign({ title: "no id" }), /missing id/);
  assert.equal(getCampaign(""), null);
  assert.equal(deleteCampaign(null), false);
});

test("NPC mode: npcMode + protagonist persist and read back intact (item 4)", () => {
  // old campaigns (without the fields) read false/empty object, no errors
  const old = getCampaign("camp_1");
  assert.equal(old.npcMode, false);
  assert.deepEqual(old.protagonist, {});

  const protagonist = { name: "Alex", role: "Second-year student" };
  upsertCampaign(record({
    id: "camp_npc",
    title: "The hidden semester",
    npcMode: true,
    protagonist,
    updatedAt: 4000,
  }));
  const full = getCampaign("camp_npc");
  assert.equal(full.npcMode, true);
  assert.equal(full.protagonist.name, "Alex");
  assert.equal(full.protagonist.role, "Second-year student");

  upsertCampaign(record({ id: "camp_npc", title: "No NPC", npcMode: false, updatedAt: 5000 }));
  assert.equal(getCampaign("camp_npc").npcMode, false);

  // cleanup so other tests' lists stay unaffected
  deleteCampaign("camp_npc");
});

test("storyBible persists and reads back intact (point C)", () => {
  const bible = {
    decizii: ["You promised the plan by Friday."],
    npcs: [{ nume: "Lara", cine: "the dean", relatie: "transactional" }],
    promisiuni_secrete: [{ text: "The plan", stare: "active" }],
    obiecte: [{ nume: "The phone" }],
    fire_deschise: ["The missing file."],
  };
  upsertCampaign(record({ id: "camp_biblie", storyBible: bible, updatedAt: 6000 }));
  const full = getCampaign("camp_biblie");
  assert.deepEqual(full.storyBible, bible);

  // old campaigns without a bible => empty object, no error
  assert.deepEqual(getCampaign("camp_1").storyBible, {});

  deleteCampaign("camp_biblie");
});
