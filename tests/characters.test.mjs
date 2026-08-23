import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTER_FIELDS, validateCharacterSheet } from "../lib/characters.js";

const full = {
  name: "Mara Vlaicu",
  role: "Itinerant witch",
  universe: "Transylvania, 1872",
  appearance: "Slim figure, black hair with silver strands",
  personality: "Cold with strangers, warm with the wounded",
  speech: "Low, rhythmic, with thoughtful pauses",
  philosophy: "Undivided power is power lost",
  connections: "A monastery that owes her a secret",
  secrets: "Has not aged since 1812",
};

test("full sheet passes untouched (with edge trim)", () => {
  const out = validateCharacterSheet({ ...full, name: "  Mara Vlaicu  " });
  assert.equal(out.name, "Mara Vlaicu");
  for (const f of CHARACTER_FIELDS) assert.equal(typeof out[f.key], "string");
});

test("missing name → rejected with a clear message", () => {
  const { name, ...withoutName } = full;
  assert.throws(() => validateCharacterSheet(withoutName), /missing its name/);
});

test("non-object or array input → rejected", () => {
  assert.throws(() => validateCharacterSheet(null), /not a valid object/);
  assert.throws(() => validateCharacterSheet("text"), /not a valid object/);
  assert.throws(() => validateCharacterSheet([full]), /not a valid object/);
});

test("non-string values become empty strings, not errors", () => {
  const out = validateCharacterSheet({ ...full, personality: 42, secrets: { yes: true } });
  assert.equal(out.personality, "");
  assert.equal(out.secrets, "");
  assert.equal(out.name, full.name);
});

test("foreign keys coming from the AI are discarded", () => {
  const out = validateCharacterSheet({ ...full, power_level: 9000, npc: ["x"] });
  assert.ok(!("power_level" in out));
  assert.deepEqual(Object.keys(out).sort(), CHARACTER_FIELDS.map((f) => f.key).sort());
});

test("empty secondary fields are allowed if name + role/universe exist", () => {
  const minimal = validateCharacterSheet({ name: "Ion", role: "Lighthouse keeper", universe: "" });
  assert.throws(() => validateCharacterSheet({ name: "Ion", role: "", universe: "" }), /too sparse/);
  assert.equal(minimal.universe, "");
});
