// API for syncing campaigns between devices (Phase 6).
// GET            /api/saves        → lightweight list (metadata), newest first
// GET  ?id=...                     → full record
// POST           /api/saves        → upsert { record } (last-write-wins on updatedAt)
// DELETE ?id=...                    → delete
//
// The trust perimeter is the private tailnet; like the other routes, protection
// is rate-limit + strict validation, no auth (personal use).

import { checkRateLimit } from "../../lib/rateLimit";
import { upsertCampaign, listCampaigns, getCampaign, deleteCampaign, listDeletedCampaigns } from "../../lib/savesDb";

const RATE_LIMIT_PER_MINUTE = 60;

export default async function handler(req, res) {
  const rl = checkRateLimit(req, "saves", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many save operations. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  try {
    switch (req.method) {
      case "GET": {
        const id = req.query.id;
        if (id) {
          const full = getCampaign(String(id));
          if (!full) return res.status(404).json({ error: "Campaign not found." });
          return res.status(200).json({ record: full });
        }
        // Last week's tombstones: the client uses them to propagate deletions
        // to devices that were offline.
        const tombstones = listDeletedCampaigns(Date.now() - 7 * 24 * 3600 * 1000);
        return res.status(200).json({ campaigns: listCampaigns(), tombstones });
      }

      case "POST": {
        const { record } = req.body || {};
        if (!record || typeof record !== "object") {
          return res.status(400).json({ error: "Missing the \"record\" object with the campaign." });
        }
        const result = upsertCampaign(record);
        return res.status(200).json(result);
      }

      case "DELETE": {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: "Missing campaign id." });
        const deleted = deleteCampaign(String(id));
        if (!deleted) return res.status(404).json({ error: "Campaign not found." });
        return res.status(200).json({ ok: true });
      }

      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (e) {
    console.error("[Saves] Error:", e.message);
    return res.status(500).json({ error: `Save error: ${e.message}` });
  }
}
