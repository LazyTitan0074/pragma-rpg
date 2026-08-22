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
  title: "Shadows of Delphi",
  updatedAt: "2026-08-22T10:00:00.000Z",
  ...overrides,
});

test("merge: newest version wins per id", () => {
  const merged = mergeCampaignLists(
    [camp({ title: "OLD", updatedAt: "2026-01-01T00:00:00.000Z" })],
    [camp({ title: "NEW" })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "NEW");
});

test("merge: on equal timestamps the second list's item wins (arrived later)", () => {
  const merged = mergeCampaignLists([camp({ title: "A" })], [camp({ title: "B" })]);
  assert.equal(merged[0].title, "B");
});

test("merge: descending order by updatedAt", () => {
  const merged = mergeCampaignLists(
    [camp({ id: "x", updatedAt: "2026-05-01T00:00:00.000Z" }), camp({ id: "y", updatedAt: "2026-03-01T00:00:00.000Z" })],
    [camp({ id: "z", updatedAt: "2026-07-01T00:00:00.000Z" })]
  );
  assert.deepEqual(merged.map((m) => m.id), ["z", "x", "y"]);
});

test("merge: maximum cap respected and configurable", () => {
  const many = Array.from({ length: 30 }, (_, i) => camp({ id: `id${i}`, updatedAt: new Date(2026, 0, i + 1).toISOString() }));
  assert.equal(mergeCampaignLists(many, []).length, MAX_SAVED_CAMPAIGNS);
  assert.equal(mergeCampaignLists(many, [], 5).length, 5);
});

const fullCampaign = {
  title: "The Crypt Beneath",
  setting: "High school, present day",
  tone: "mystery",
  mode: "sandbox",
  premise: "First day of school.",
  lore: "Rumours about the basement.",
  locations: [{ name: "The old cellar", description: "Rusty doors.", vibe: "tense" }],
  missions: [{
    title: "Opening scene", difficulty: "free", description: "You discover the door.",
    objectives: ["Explore"], encounters: ["A noise in the cellar"], rewards: ["Reputation"],
  }],
  npcs: [{ name: "Mrs. Voss", role: "homeroom teacher", personality: "Strict", connection: "" }],
  mechanics: ["Rumours spread fast"],
  endings: ["The truth comes out"],
};

test("markdown: all sections appear in the document", () => {
  const md = campaignToMarkdown(fullCampaign);
  assert.match(md, /# The Crypt Beneath/);
  assert.match(md, /## Key Locations/);
  assert.match(md, /### 📍 The old cellar \(tense\)/);
  assert.match(md, /## Starting Point/); // sandbox
  assert.match(md, /### 1\. Opening scene \(free\)/);
  assert.match(md, /\*\*Objectives:\*\*/);
  assert.match(md, /\*\*Mrs\. Voss\*\* — homeroom teacher/);
  assert.match(md, /## Mechanics & Dynamics/);
  assert.match(md, /## Future Threads/);
});

test("markdown: mission campaigns use the right title", () => {
  const md = campaignToMarkdown({ ...fullCampaign, mode: "missions" });
  assert.match(md, /## Missions/);
  assert.doesNotMatch(md, /## Starting Point/);
});

test("markdown: fallback for missing NPC relationship and empty arrays", () => {
  const md = campaignToMarkdown({
    title: "T", setting: "S", tone: "M", mode: "sandbox", premise: "P", lore: "L",
    locations: [], missions: [], npcs: [{ name: "X", role: "", personality: "", connection_to_lara: "Lara's cousin" }],
    mechanics: [], endings: [],
  });
  assert.match(md, /Relationship: Lara's cousin/);
  assert.doesNotMatch(md, /## Mechanics & Dynamics/);
});

test("obsidian: frontmatter, tags and automatic [[NPC]] links", () => {
  const md = campaignToObsidian({
    ...fullCampaign,
    npcs: [{ name: "Mrs. Voss", role: "homeroom teacher", personality: "Strict with everyone" }],
  });
  assert.match(md, /^---\ntitle:/m);
  assert.match(md, /tags:\n {2}- campaign/);
  assert.match(md, /#mission|#location|## Supporting Characters #npc/);

  const withMention = campaignToObsidian({
    ...fullCampaign,
    premise: "Everything starts when Mrs. Voss sees you.",
    npcs: [{ name: "Mrs. Voss", role: "homeroom teacher", personality: "Strict" }],
  });
  assert.match(withMention, /\[\[Mrs\. Voss\]\] sees you/); // auto-linked in text
});

test("obsidian: every NPC gets a heading with an internal link", () => {
  const md = campaignToObsidian(fullCampaign);
  assert.match(md, /### \[\[Mrs\. Voss\]\]/);
});

test("foundry: adventure structure with journals and actors", () => {
  const doc = campaignToFoundryVTT(
    { ...fullCampaign, npcs: [{ name: "Mrs. Voss", role: "homeroom teacher", personality: "Strict", connection: "Has known you for years" }] },
    "Lara"
  );
  assert.equal(doc.name, "The Crypt Beneath");
  assert.ok(Array.isArray(doc.journals) && doc.journals.length >= 3); // premise + mission + npc + location
  assert.ok(doc.journals.some((j) => j.name.includes("Premise")));
  assert.ok(doc.journals.some((j) => j.name.startsWith("NPC — Mrs. Voss")));
  assert.ok(doc.actors.length === 1 && doc.actors[0].name === "Mrs. Voss");
  assert.match(doc.actors[0].system.details.biography, /Relationship with Lara/);
  assert.equal(doc.scenes.length, 0);
});

test("print html: complete document with fonts and clean printing", () => {
  const html = campaignToPrintHtml(fullCampaign, "Lara");
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Cormorant\+Garamond/);
  assert.match(html, /@media print/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /Character: <strong>Lara<\/strong>/);
});
