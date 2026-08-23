// API for the server-shared character library (August 23, 2026).
// GET            /api/characters        → full list (the sheets are small)
// GET  ?id=...                          → a single character
// POST           /api/characters        → upsert { record } (last-write-wins)
// DELETE ?id=...                          → delete
//
// Like /api/saves: private tailnet perimeter, protection = rate-limit + validation.

import { checkRateLimit } from "../../lib/rateLimit";
import { upsertCharacter, listCharacters, getCharacter, deleteCharacter, listDeletedCharacters } from "../../lib/charactersDb";

const RATE_LIMIT_PER_MINUTE = 60;

export default async function handler(req, res) {
  const rl = checkRateLimit(req, "characters", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many character library operations. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  try {
    switch (req.method) {
      case "GET": {
        const id = req.query.id;
        if (id) {
          const full = getCharacter(String(id));
          if (!full) return res.status(404).json({ error: "Character not found." });
          return res.status(200).json({ record: full });
        }
        // Last week's tombstones for propagating offline deletions.
        const tombstones = listDeletedCharacters(Date.now() - 7 * 24 * 3600 * 1000);
        return res.status(200).json({ characters: listCharacters(), tombstones });
      }

      case "POST": {
        const { record } = req.body || {};
        if (!record || typeof record !== "object") {
          return res.status(400).json({ error: "Missing the \"record\" object with the character sheet." });
        }
        if (!record.character || typeof record.character !== "object" || !String(record.character.name || "").trim()) {
          return res.status(400).json({ error: "Invalid character sheet (missing character.name)." });
        }
        const result = upsertCharacter(record);
        return res.status(200).json(result);
      }

      case "DELETE": {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: "Missing character id." });
        const deleted = deleteCharacter(String(id));
        if (!deleted) return res.status(404).json({ error: "Character not found." });
        return res.status(200).json({ ok: true });
      }

      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (e) {
    console.error("[Characters] Error:", e.message);
    return res.status(500).json({ error: `Character library error: ${e.message}` });
  }
}
