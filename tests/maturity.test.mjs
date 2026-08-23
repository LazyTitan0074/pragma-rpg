import { test } from "node:test";
import assert from "node:assert/strict";
import { MATURITY_LEVELS, maturityLabel, buildMaturityRules, buildPrompt } from "../lib/prompt.js";

test("defined levels: exactly 13/16/18/21, coherent labels", () => {
  assert.deepEqual(MATURITY_LEVELS.map((m) => m.id), ["13", "16", "18", "21"]);
  assert.deepEqual(MATURITY_LEVELS.map((m) => maturityLabel(m.id)), ["13+", "16+", "18+", "21+"]);
});

test("unknown or missing id → 18+ rules (historical behavior)", () => {
  assert.equal(buildMaturityRules("whatever"), buildMaturityRules("18"));
  assert.equal(buildMaturityRules(undefined), buildMaturityRules("18"));
  assert.equal(maturityLabel("x"), "18+");
});

test("13+ forbids sexuality and explicit gore", () => {
  const r = buildMaturityRules("13");
  assert.match(r, /ZERO sexuality/);
  assert.match(r, /ZERO gore/);
  assert.doesNotMatch(r, /mature\/adult scenes/);
});

test("16+ allows moderate violence but no explicit scenes", () => {
  const r = buildMaturityRules("16");
  assert.match(r, /Moderate descriptive violence/);
  assert.match(r, /no explicit sex scenes/);
});

test("18+ keeps the historical absolute limits", () => {
  const r = buildMaturityRules("18");
  assert.match(r, /rape scenes portrayed as positive/);
  assert.match(r, /school\/high-school settings/);
});

test("21+ adds extreme horror on top of the absolute limits", () => {
  const r = buildMaturityRules("21");
  assert.match(r, /Cosmic and bodily horror|body horror/);
  assert.match(r, /rape scenes portrayed as positive/);
});

test("buildPrompt injects the chosen level's rules", () => {
  const p13 = buildPrompt({ name: "X" }, "mister", "scurta", "13");
  const p21 = buildPrompt({ name: "X" }, "brutal", "scurta", "21");
  assert.match(p13, /ZERO sexuality/);
  assert.doesNotMatch(p13, /body horror/);
  assert.match(p21, /Cosmic and bodily horror|body horror/);
});
