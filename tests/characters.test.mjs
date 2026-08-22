import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTER_FIELDS, validateCharacterSheet } from "../lib/characters.js";

const full = {
  name: "Mara Voss",
  role: "Wandering witch",
  universe: "Transylvania, 1872",
  appearance: "Slim silhouette, black hair with silver strands",
  personality: "Cold with strangers, warm with the wounded",
  speech: "Low, measured, thoughtful pauses",
  philosophy: "Power left undivided is power lost",
  connections: "A monastery that owes her a secret",
  secrets: "She has not aged since 1812",
};

test("a complete sheet passes through untouched (trimmed at edges)", () => {
  const out = validateCharacterSheet({ ...full, name: "  Mara Voss  " });
  assert.equal(out.name, "Mara Voss");
  for (const f of CHARACTER_FIELDS) assert.equal(typeof out[f.key], "string");
});

test("missing name → rejected with a clear message", () => {
  const { name, ...withoutName } = full;
  assert.throws(() => validateCharacterSheet(withoutName), /name/);
});

test("non-object input or array → rejected", () => {
  assert.throws(() => validateCharacterSheet(null), /valid object/);
  assert.throws(() => validateCharacterSheet("text"), /valid object/);
  assert.throws(() => validateCharacterSheet([full]), /valid object/);
});

test("non-string values become empty strings, not errors", () => {
  const out = validateCharacterSheet({ ...full, personality: 42, secrets: { yes: true } });
  assert.equal(out.personality, "");
  assert.equal(out.secrets, "");
  assert.equal(out.name, full.name);
});

test("foreign keys coming from the AI are dropped", () => {
  const out = validateCharacterSheet({ ...full, power_level: 9000, npc: ["x"] });
  assert.ok(!("power_level" in out));
  assert.deepEqual(Object.keys(out).sort(), CHARACTER_FIELDS.map((f) => f.key).sort());
});

test("empty secondary fields are allowed when name + role/universe exist", () => {
  const minimal = validateCharacterSheet({ name: "John", role: "Lighthouse keeper", universe: "" });
  assert.throws(() => validateCharacterSheet({ name: "John", role: "", universe: "" }), /too thin/);
  assert.equal(minimal.universe, "");
});
