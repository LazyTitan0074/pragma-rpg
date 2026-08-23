import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, buildGameMasterSystemText, resolveProtagonistName } from "../lib/prompt.js";

// Item 4 — NPC mode: the active sheet becomes the story's central character
// (an NPC played by the DM), while the user plays a separate, optional protagonist.

const NPC = { name: "Lara Enache", role: "The college dean", universe: "Bucharest, today" };
const PROTAGONIST = { name: "Alex", role: "Second-year student" };
const CAMPAIGN = {
  title: "The hidden semester",
  setting: "A college in Bucharest",
  tone: "Academic drama",
  premise: "The academic year begins with a rumor about the main scholarship.",
  lore: "The scholarship depends on a single signature.",
  npcs: [{ name: "Lara Enache", role: "Dean" }],
  mechanics: ["Reputation"],
  missions: [{ title: "The first week", difficulty: "medium", description: "The first meeting." }],
};

test("buildPrompt normal (no NPC mode) stays unchanged — without NPC markers", () => {
  const p = buildPrompt(NPC, "slice_of_life", "scurta", "18");
  assert.doesNotMatch(p, /NPC MODE ACTIVE/);
  assert.match(p, /around this central character/);
});

test("buildPrompt NPC mode with protagonist: the sheet becomes the NPC, the protagonist appears separately", () => {
  const p = buildPrompt(NPC, "slice_of_life", "sandbox", "18", { npcMode: true, protagonist: PROTAGONIST });
  assert.match(p, /NPC MODE ACTIVE/);
  assert.match(p, /story's CENTRAL CHARACTER/);
  assert.match(p, /PROTAGONIST/);
  assert.match(p, /"Alex"/);
  assert.match(p, /their own agenda, will and secrets/);
});

test("buildPrompt NPC mode without protagonist: explicit generic fallback", () => {
  const p = buildPrompt(NPC, "mister", "scurta", "13", { npcMode: true });
  assert.match(p, /NPC MODE ACTIVE/);
  assert.match(p, /has NOT defined a protagonist sheet yet/);
  assert.doesNotMatch(p, /"Alex"/);
});

test("buildGameMasterSystemText normal: the player remains the active sheet (historical behavior)", () => {
  const s = buildGameMasterSystemText({
    campaign: CAMPAIGN,
    character: NPC,
    maturity: "16",
  });
  assert.match(s, /The player is Lara Enache/);
  assert.doesNotMatch(s, /THE STORY'S CENTRAL CHARACTER/);
  assert.match(s, /CONTENT LEVEL CHOSEN BY THE PLAYER/);
});

test("buildGameMasterSystemText NPC mode: the protagonist is played, the central sheet becomes an NPC block", () => {
  const s = buildGameMasterSystemText({
    campaign: CAMPAIGN,
    character: NPC,
    protagonist: PROTAGONIST,
    npcMode: true,
    maturity: "18",
  });
  assert.match(s, /The player is Alex/);
  assert.match(s, /THE STORY'S CENTRAL CHARACTER \(MAIN NPC/);
  assert.match(s, /"Lara Enache"/);
  // the played profile contains the protagonist's sheet, not the NPC's
  assert.match(s, /"role": "Second-year student"/);
});

test("buildGameMasterSystemText NPC mode without protagonist: generic name + shaping note", () => {
  const s = buildGameMasterSystemText({
    campaign: CAMPAIGN,
    character: NPC,
    npcMode: true,
    maturity: "21",
    summary: "Alex promised he would find the file.",
  });
  assert.match(s, /The player is Main Character/);
  assert.match(s, /Shape them subtly/);
  assert.match(s, /SUMMARY OF PREVIOUS EVENTS/);
});

test("resolveProtagonistName: clean or empty name or missing object → generic", () => {
  assert.equal(resolveProtagonistName({ name: "  Ioana  " }), "Ioana");
  assert.equal(resolveProtagonistName({ name: "" }), "Main Character");
  assert.equal(resolveProtagonistName(null), "Main Character");
});
