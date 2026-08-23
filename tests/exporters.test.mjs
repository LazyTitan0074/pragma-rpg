import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SAVED_CAMPAIGNS,
  mergeCampaignLists,
  campaignToMarkdown,
  campaignToObsidian,
  campaignToFoundryVTT,
  campaignToPrintHtml,
} from "../lib/exporters.js";

const camp = (overrides = {}) => ({
  id: "c1",
  title: "Delphi Shadows",
  updatedAt: "2026-08-22T10:00:00.000Z",
  ...overrides,
});

test("merge: per id the newer version wins", () => {
  const merged = mergeCampaignLists(
    [camp({ title: "OLD", updatedAt: "2026-01-01T00:00:00.000Z" })],
    [camp({ title: "NEW" })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "NEW");
});

test("merge: on equal timestamp the item from the second list wins (arrived later)", () => {
  const merged = mergeCampaignLists([camp({ title: "A" })], [camp({ title: "B" })]);
  assert.equal(merged[0].title, "B");
});

test("merge: descending sort by updatedAt", () => {
  const merged = mergeCampaignLists(
    [camp({ id: "x", updatedAt: "2026-05-01T00:00:00.000Z" }), camp({ id: "y", updatedAt: "2026-03-01T00:00:00.000Z" })],
    [camp({ id: "z", updatedAt: "2026-07-01T00:00:00.000Z" })]
  );
  assert.deepEqual(merged.map((m) => m.id), ["z", "x", "y"]);
});

test("merge: the maximum cap is respected and is configurable", () => {
  const many = Array.from({ length: 30 }, (_, i) => camp({ id: `id${i}`, updatedAt: new Date(2026, 0, i + 1).toISOString() }));
  assert.equal(mergeCampaignLists(many, []).length, MAX_SAVED_CAMPAIGNS);
  assert.equal(mergeCampaignLists(many, [], 5).length, 5);
});

const fullCampaign = {
  title: "The Basement Crypt",
  setting: "High school, present day",
  tone: "mystery",
  mode: "sandbox",
  premise: "The first day of school.",
  lore: "Rumors about the basement.",
  locations: [{ name: "The old cellar", description: "Rusty doors.", vibe: "tense" }],
  missions: [{
    title: "Opening scene", difficulty: "free", description: "You discover the door.",
    objectives: ["Explore"], encounters: ["Noise in the cellar"], rewards: ["Reputation"],
  }],
  npcs: [{ name: "Mrs. Vasilescu", role: "homeroom teacher", personality: "Strict", connection: "" }],
  mechanics: ["Rumors that spread"],
  endings: ["The truth comes to light"],
};

test("markdown: all sections appear in the document", () => {
  const md = campaignToMarkdown(fullCampaign);
  assert.match(md, /# The Basement Crypt/);
  assert.match(md, /## Key Locations/);
  assert.match(md, /### 📍 The old cellar \(tense\)/);
  assert.match(md, /## Starting Point/); // sandbox
  assert.match(md, /### 1\. Opening scene \(free\)/);
  assert.match(md, /\*\*Objectives:\*\*/);
  assert.match(md, /\*\*Mrs\. Vasilescu\*\* — homeroom teacher/);
  assert.match(md, /## Mechanics & Dynamics/);
  assert.match(md, /## Possible Endings/);
});

test("markdown: mission-based campaign uses the right heading", () => {
  const md = campaignToMarkdown({ ...fullCampaign, mode: "missions" });
  assert.match(md, /## Missions/);
  assert.doesNotMatch(md, /## Starting Point/);
});

test("markdown: fallback for a missing NPC relationship and empty arrays", () => {
  const md = campaignToMarkdown({
    title: "T", setting: "S", tone: "M", mode: "sandbox", premise: "P", lore: "L",
    locations: [], missions: [], npcs: [{ name: "X", role: "", personality: "", connection_to_lara: "Lara's cousin" }],
    mechanics: [], endings: [],
  });
  assert.match(md, /Relationship: Lara's cousin/);
  assert.doesNotMatch(md, /## Mechanics & Dynamics/);
});

test("obsidian: frontmatter, tags and [[NPC]] links generated automatically", () => {
  const md = campaignToObsidian({
    ...fullCampaign,
    npcs: [{ name: "Mrs. Vasilescu", role: "homeroom teacher", personality: "Strict with everyone" }],
  });
  md.replace("Strict with everyone", "Mrs. Vasilescu is strict"); // mention in text → must be linked
  const withMention = campaignToObsidian({
    ...fullCampaign,
    premise: "It all begins when Mrs. Vasilescu sees you.",
    npcs: [{ name: "Mrs. Vasilescu", role: "homeroom teacher", personality: "Strict" }],
  });
  assert.match(md, /^---\ntitle:/m);
  assert.match(md, /tags:\n {2}- campaign/);
  assert.match(md, /#mission|#location|## Supporting Characters #npc/);
  assert.match(withMention, /\[\[Mrs\. Vasilescu\]\] sees you/); // auto-link in text
});

test("obsidian: every NPC gets a heading with an internal link", () => {
  const md = campaignToObsidian(fullCampaign);
  assert.match(md, /### \[\[Mrs\. Vasilescu\]\]/);
});

test("foundry: adventure structure with journals and actors", () => {
  const doc = campaignToFoundryVTT(
    { ...fullCampaign, npcs: [{ name: "Mrs. Vasilescu", role: "homeroom teacher", personality: "Strict", connection: "Has known her since childhood" }] },
    "Lara"
  );
  assert.equal(doc.name, "The Basement Crypt");
  assert.ok(Array.isArray(doc.journals) && doc.journals.length >= 3); // premise + mission + npc + location
  assert.ok(doc.journals.some((j) => j.name.includes("Premise")));
  assert.ok(doc.journals.some((j) => j.name.startsWith("NPC — Mrs. Vasilescu")));
  assert.ok(doc.actors.length === 1 && doc.actors[0].name === "Mrs. Vasilescu");
  assert.match(doc.actors[0].system.details.biography, /Relationship with Lara/);
  assert.equal(doc.scenes.length, 0);
});

test("print html: complete document with fonts and clean print layout", () => {
  const html = campaignToPrintHtml(fullCampaign, "Lara");
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Cormorant\+Garamond/);
  assert.match(html, /@media print/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /Character: <strong>Lara<\/strong>/);
});
