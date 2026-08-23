// Server-side persistence for the CHARACTER LIBRARY (August 23, 2026):
// until today characters lived only in each browser's localStorage; now the
// same library is available on any device on the tailnet.
// Same DB file as the saves (data/pragma.db), separate table, zero dependencies.
//
// Conflict strategy: last-write-wins by updated_at, like campaigns
// (single user on the tailnet; the protection is only against stale writes).

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
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL DEFAULT 'unknown',
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      universe TEXT NOT NULL DEFAULT '',
      character_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_characters_updated ON characters(updated_at DESC);
    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    );
  `);
  return db;
}

function normalizeRecord(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid record: expected a character sheet.");
  }
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : null;
  if (!id) throw new Error("Invalid record: missing character id.");

  const num = (v) => {
    if (Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string") {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return Date.now();
  };
  const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
  const sheet = input.character && typeof input.character === "object" ? input.character : {};
  const name = str(sheet.name).trim();

  return {
    id,
    device_id: str(input.deviceId, "unknown"),
    name: name || "Unnamed",
    role: str(sheet.role),
    universe: str(sheet.universe),
    character_json: (() => {
      try {
        return JSON.stringify(sheet);
      } catch {
        return "{}";
      }
    })(),
    updated_at: Math.trunc(num(input.updatedAt)),
  };
}

function rowToRecord(row) {
  let sheet = {};
  try {
    sheet = JSON.parse(row.character_json);
  } catch {}
  return {
    id: row.id,
    deviceId: row.device_id,
    name: row.name,
    role: row.role,
    universe: row.universe,
    character: sheet,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts or updates a character (last-write-wins by updated_at;
 * on an exact timestamp tie the incoming write wins — idempotent retries).
 * Anti-resurrection guard: a tombstone newer than the write → rejected; an edit
 * newer than the deletion → deliberate intent to recreate, so the grave is released.
 * @returns {{ ok: boolean, applied: boolean, reason?: string }}
 */
export function upsertCharacter(record) {
  const r = normalizeRecord(record);
  const database = getDb();

  const grave = database
    .prepare("SELECT deleted_at FROM tombstones WHERE id = ? AND kind = 'character'")
    .get(r.id);
  if (grave) {
    if (r.updated_at <= Number(grave.deleted_at)) {
      return { ok: true, applied: false, reason: "deleted recently on another device (tombstone)" };
    }
    database.prepare("DELETE FROM tombstones WHERE id = ? AND kind = 'character'").run(r.id);
  }

  const existing = database
    .prepare("SELECT updated_at FROM characters WHERE id = ?")
    .get(r.id);
  if (existing && Number(existing.updated_at) > r.updated_at) {
    return { ok: true, applied: false, reason: "older version than the existing one" };
  }
  database
    .prepare(
      `INSERT INTO characters (id, device_id, name, role, universe, character_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         device_id = excluded.device_id,
         name = excluded.name,
         role = excluded.role,
         universe = excluded.universe,
         character_json = excluded.character_json,
         updated_at = excluded.updated_at`
    )
    .run(r.id, r.device_id, r.name, r.role, r.universe, r.character_json, r.updated_at);
  return { ok: true, applied: true };
}

/** Full list (sheets are small; the library is a single shared collection). */
export function listCharacters() {
  const rows = getDb()
    .prepare("SELECT * FROM characters ORDER BY updated_at DESC")
    .all();
  return rows.map(rowToRecord);
}

export function getCharacter(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id.trim());
  return row ? rowToRecord(row) : null;
}

/** Deletes by id and leaves a tombstone so sync does not resurrect it from other devices. */
export function deleteCharacter(id) {
  if (typeof id !== "string" || !id.trim()) return false;
  const database = getDb();
  const result = database.prepare("DELETE FROM characters WHERE id = ?").run(id.trim());
  if (result.changes > 0) {
    database
      .prepare(
        "INSERT INTO tombstones (id, kind, deleted_at) VALUES (?, 'character', ?) ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, kind = excluded.kind"
      )
      .run(id.trim(), Date.now());
  }
  return result.changes > 0;
}

/** Character tombstones since a given moment (offline deletion propagation). */
export function listDeletedCharacters(sinceMs = 0) {
  return getDb()
    .prepare("SELECT id, deleted_at AS deletedAt FROM tombstones WHERE kind = 'character' AND deleted_at > ? ORDER BY deleted_at DESC")
    .all(Math.trunc(Number(sinceMs) || 0));
}
