// Server-side persistence layer (Phase 6 audit): campaigns live in SQLite,
// so the same story continues regardless of device (phone / PC).
// Uses the NATIVE node:sqlite module — zero new dependencies.
//
// Conflict strategy: last-write-wins per id, comparing updated_at (epoch ms).
// Single user on a private tailnet, so real conflicts are practically impossible;
// the comparison only guards against stale writes arriving out of order.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.PRAGMA_DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "pragma.db");

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL DEFAULT 'unknown',
      title TEXT NOT NULL,
      setting TEXT NOT NULL DEFAULT '',
      tone TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT '',
      length TEXT NOT NULL DEFAULT '',
      used_model TEXT NOT NULL DEFAULT '',
      character_json TEXT NOT NULL DEFAULT '{}',
      campaign_json TEXT NOT NULL DEFAULT '{}',
      game_messages TEXT NOT NULL DEFAULT '[]',
      story_summary TEXT NOT NULL DEFAULT '',
      msg_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_updated ON campaigns(updated_at DESC);
    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    );
  `);
  migrateSchema(db);
  return db;
}

// Incremental migrations (SQLite has no ADD COLUMN IF NOT EXISTS): the new
// NPC-mode columns (item 4) are added politely on top of existing databases.
function migrateSchema(database) {
  const columns = new Set(
    database.prepare("PRAGMA table_info(campaigns)").all().map((c) => c.name)
  );
  if (!columns.has("npc_mode")) {
    database.exec("ALTER TABLE campaigns ADD COLUMN npc_mode INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("protagonist_json")) {
    database.exec("ALTER TABLE campaigns ADD COLUMN protagonist_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!columns.has("story_bible")) {
    database.exec("ALTER TABLE campaigns ADD COLUMN story_bible TEXT NOT NULL DEFAULT '{}'");
  }
}

function normalizeRecord(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid record: expected a campaign object.");
  }
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : null;
  if (!id) throw new Error("Invalid record: missing id.");

  // Accept epoch ms (number) or an ISO string from the client
  const num = (v) => {
    if (Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string") {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return Date.now();
  };
  const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
  const json = (v, fallback) => {
    try {
      return JSON.stringify(v ?? fallback);
    } catch {
      return JSON.stringify(fallback);
    }
  };
  const messages = Array.isArray(input.gameMessages) ? input.gameMessages : [];

  return {
    id,
    device_id: str(input.deviceId, "unknown"),
    title: str(input.title, "Untitled Campaign"),
    setting: str(input.setting),
    tone: str(input.tone),
    mode: str(input.mode),
    variant: str(input.variant),
    length: str(input.length),
    used_model: str(input.usedModel),
    character_json: json(input.character, {}),
    campaign_json: json(input.campaign, {}),
    game_messages: json(messages, []),
    msg_count: messages.length,
    story_summary: str(input.storySummary, ""),
    npc_mode: input.npcMode ? 1 : 0,
    protagonist_json: json(input.protagonist, {}),
    story_bible: json(input.storyBible, {}),
    updated_at: Math.trunc(num(input.updatedAt)),
  };
}

function rowToFullRecord(row) {
  const parse = (text, fallback) => {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    deviceId: row.device_id,
    title: row.title,
    setting: row.setting,
    tone: row.tone,
    mode: row.mode,
    variant: row.variant,
    length: row.length,
    usedModel: row.used_model,
    character: parse(row.character_json, {}),
    campaign: parse(row.campaign_json, {}),
    gameMessages: parse(row.game_messages, []),
    storySummary: row.story_summary,
    npcMode: Boolean(row.npc_mode),
    protagonist: parse(row.protagonist_json || "{}", {}),
    storyBible: parse(row.story_bible || "{}", {}),
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts or updates a campaign. Writes only if the record is newer than what
 * already exists (last-write-wins by updated_at) and if it is not blocked by a
 * more recent tombstone (deletion propagated from another device).
 * @returns {{ ok: boolean, applied: boolean, reason?: string }}
 */
export function upsertCampaign(record) {
  const r = normalizeRecord(record);
  const database = getDb();

  // Anti-resurrection guard: the id was deleted on another device more recently
  // than this write's timestamp → reject it politely. An edit NEWER than the
  // deletion counts as a deliberate intent to recreate → release the tombstone.
  const grave = database
    .prepare("SELECT deleted_at FROM tombstones WHERE id = ? AND kind = 'campaign'")
    .get(r.id);
  if (grave) {
    if (r.updated_at <= Number(grave.deleted_at)) {
      return { ok: true, applied: false, reason: "deleted recently on another device (tombstone)" };
    }
    database.prepare("DELETE FROM tombstones WHERE id = ? AND kind = 'campaign'").run(r.id);
  }

  const existing = database
    .prepare("SELECT updated_at FROM campaigns WHERE id = ?")
    .get(r.id);

  // On an EXACT timestamp tie we apply the incoming write (tie-break on last arrival):
  // makes retries idempotent and allows multiple saves within the same millisecond.
  if (existing && Number(existing.updated_at) > r.updated_at) {
    return { ok: true, applied: false, reason: "older version than the existing one" };
  }

  database
    .prepare(
      `INSERT INTO campaigns
        (id, device_id, title, setting, tone, mode, variant, length, used_model,
         character_json, campaign_json, game_messages, story_summary,
         npc_mode, protagonist_json, story_bible, msg_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         device_id = excluded.device_id,
         title = excluded.title,
         setting = excluded.setting,
         tone = excluded.tone,
         mode = excluded.mode,
         variant = excluded.variant,
         length = excluded.length,
         used_model = excluded.used_model,
         character_json = excluded.character_json,
         campaign_json = excluded.campaign_json,
         game_messages = excluded.game_messages,
         story_summary = excluded.story_summary,
         npc_mode = excluded.npc_mode,
         protagonist_json = excluded.protagonist_json,
         story_bible = excluded.story_bible,
         msg_count = excluded.msg_count,
         updated_at = excluded.updated_at`
    )
    .run(
      r.id, r.device_id, r.title, r.setting, r.tone, r.mode, r.variant, r.length,
      r.used_model, r.character_json, r.campaign_json, r.game_messages,
      r.story_summary, r.npc_mode, r.protagonist_json, r.story_bible,
      r.msg_count, r.updated_at
    );
  return { ok: true, applied: true };
}

/** Lightweight list (metadata only) for the campaign manager, most recent first. */
export function listCampaigns() {
  const rows = getDb()
    .prepare(
      `SELECT id, device_id, title, setting, tone, mode, variant, length,
              used_model, story_summary, msg_count, updated_at
       FROM campaigns ORDER BY updated_at DESC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    title: row.title,
    setting: row.setting,
    tone: row.tone,
    mode: row.mode,
    variant: row.variant,
    length: row.length,
    usedModel: row.used_model,
    hasSummary: Boolean(row.story_summary),
    messageCount: row.msg_count,
    updatedAt: row.updated_at,
  }));
}

/** Full record by id, or null if it does not exist. */
export function getCampaign(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const row = getDb().prepare("SELECT * FROM campaigns WHERE id = ?").get(id.trim());
  return row ? rowToFullRecord(row) : null;
}

/** Deletes by id and leaves a tombstone so sync does not resurrect it from other devices.
 *  @returns {boolean} true if it existed and was deleted. */
export function deleteCampaign(id) {
  if (typeof id !== "string" || !id.trim()) return false;
  const database = getDb();
  const result = database.prepare("DELETE FROM campaigns WHERE id = ?").run(id.trim());
  if (result.changes > 0) {
    database
      .prepare(
        "INSERT INTO tombstones (id, kind, deleted_at) VALUES (?, 'campaign', ?) ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, kind = excluded.kind"
      )
      .run(id.trim(), Date.now());
  }
  return result.changes > 0;
}

/** Campaign tombstones since a given moment (for offline deletion propagation). */
export function listDeletedCampaigns(sinceMs = 0) {
  return getDb()
    .prepare("SELECT id, deleted_at AS deletedAt FROM tombstones WHERE kind = 'campaign' AND deleted_at > ? ORDER BY deleted_at DESC")
    .all(Math.trunc(Number(sinceMs) || 0));
}
