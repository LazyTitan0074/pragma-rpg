import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Test DB in a unique temp folder, set before the import (getDb reads the env
// on first use)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pragma-db-test-"));
process.env.PRAGMA_DATA_DIR = tmp;

const { upsertCampaign, listCampaigns, getCampaign, deleteCampaign } = await import(
  "../lib/savesDb.js"
);

const record = (overrides = {}) => ({
  id: "camp_1",
  deviceId: "device_A",
  title: "The Shadows of Delphi",
  setting: "Ancient Delphi",
  tone: "Mystery",
  mode: "missions",
  variant: "mister",
  length: "scurta",
  usedModel: "gemini-3.5-flash-lite",
  character: { name: "Lara" },
  campaign: { title: "The Shadows of Delphi", missions: [1, 2, 3] },
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
  assert.equal(full.title, "The Shadows of Delphi");
});

test("upsert with a newer version overwrites", () => {
  upsertCampaign(record({ title: "NEW", storySummary: "Updated summary.", updatedAt: 2000 }));
  const full = getCampaign("camp_1");
  assert.equal(full.title, "NEW");
  assert.equal(full.storySummary, "Updated summary.");
});

test("upsert at an EQUAL timestamp applies (last-arrived tie-break)", () => {
  upsertCampaign(record({ title: "EQUAL", updatedAt: 2000 }));
  assert.equal(getCampaign("camp_1").title, "EQUAL");
});

test("getCampaign rebuilds JSON objects intact", () => {
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

test("invalid input rejected with a clear error", () => {
  assert.throws(() => upsertCampaign(null), /campaign object/);
  assert.throws(() => upsertCampaign({ title: "no id" }), /missing id/);
  assert.equal(getCampaign(""), null);
  assert.equal(deleteCampaign(null), false);
});
