// Pure planning logic for syncing saves across devices.
// Depends on neither React nor fetch — testable directly with node --test.
//
// We compare server metadata against the local list and compute both directions:
// - toPush  — campaigns that exist only locally OR whose local version is newer than what the server knows;
// - toFetch — campaigns that exist only on the server OR whose server version is newer than the
//   local copy (fix: until now, existing campaigns were never updated from the server).
//
// Timestamps arrive in two formats (ISO string from the client, epoch-ms number from the server),
// so we normalize both through Date.

export function recordTime(value) {
  if (value == null) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {Array} localList
 * @param {Array} serverList
 * @param {Array<{id: string, deletedAt: number|string}>} tombstones  deletions recorded
 *        on the server (Aug 23, 2026): they prevent deleted campaigns from being "resurrected"
 *        by a device that was offline at deletion time and re-uploads them.
 */
export function planSync(localList = [], serverList = [], tombstones = []) {
  const locals = Array.isArray(localList) ? localList.filter((x) => x && typeof x === "object" && x.id) : [];
  const remotes = Array.isArray(serverList) ? serverList.filter((x) => x && typeof x === "object" && x.id) : [];
  const graves = Array.isArray(tombstones) ? tombstones.filter((t) => t && t.id) : [];

  const remoteById = new Map(remotes.map((r) => [r.id, r]));
  const graveById = new Map(graves.map((g) => [g.id, recordTime(g.deletedAt)]));
  // Deletions apply locally ONLY if the local copy is not newer than the tombstone
  // (an edit made after the deletion is a conscious intent to keep/recreate it).
  const toDeleteLocally = locals.filter((item) => {
    const deletedAt = graveById.get(item.id);
    return deletedAt !== undefined && recordTime(item.updatedAt) <= deletedAt;
  });

  const toPush = locals.filter((item) => {
    if (toDeleteLocally.includes(item)) return false; // tombstone wins
    const deletedAt = graveById.get(item.id);
    if (deletedAt !== undefined && recordTime(item.updatedAt) <= deletedAt) return false;
    const remote = remoteById.get(item.id);
    return !remote || recordTime(item.updatedAt) > recordTime(remote.updatedAt);
  });

  const toFetch = remotes.filter((meta) => {
    const local = locals.find((l) => l.id === meta.id);
    return !local || recordTime(meta.updatedAt) > recordTime(local.updatedAt);
  });

  return { toPush, toFetch, toDeleteLocally };
}
