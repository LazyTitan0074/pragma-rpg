// AI-generated character sheets (Phase 5). Shared schema between the
// /api/create-character route, the visual editor and the local library.
// Extra fields coming from the AI are dropped, non-string values become empty
// strings — the front-end always receives a predictable shape.

export const CHARACTER_FIELDS = [
  { key: "name", label: "Name", placeholder: "e.g.: Mara Voss" },
  { key: "role", label: "Role / occupation", placeholder: "e.g.: wandering witch" },
  { key: "universe", label: "Universe, place & period", placeholder: "e.g.: Transylvania, 1872" },
  { key: "appearance", label: "Appearance", placeholder: "" },
  { key: "personality", label: "Personality", placeholder: "" },
  { key: "speech", label: "Speech style", placeholder: "" },
  { key: "philosophy", label: "Philosophy / motivation", placeholder: "" },
  { key: "connections", label: "Notable ties", placeholder: "" },
  { key: "secrets", label: "Secrets", placeholder: "" },
];

const FIELD_KEYS = CHARACTER_FIELDS.map((f) => f.key);

/**
 * Validates and sanitises a character sheet received from the AI (or an
 * imported JSON file).
 * @returns {object} sheet with exactly the keys of CHARACTER_FIELDS, trimmed strings
 * @throws {Error} with a clear message when the sheet is unusable
 */
export function validateCharacterSheet(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The character sheet is not a valid object.");
  }

  const sheet = {};
  for (const key of FIELD_KEYS) {
    const value = parsed[key];
    sheet[key] = typeof value === "string" ? value.trim() : "";
  }

  if (!sheet.name) {
    throw new Error("The character sheet is missing its name.");
  }
  if (!sheet.role && !sheet.universe) {
    throw new Error("The sheet is too thin: it needs at least a role or a universe.");
  }
  return sheet;
}
