/**
 * Merge two history lists by game id using updatedAt (last-write-wins).
 * Newest games first; trims to maxCount.
 */
export function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
  maxCount: number,
): T[] {
  const byId = new Map<string, T>()

  for (const rec of local) {
    if (rec && typeof rec.id === 'string') byId.set(rec.id, rec)
  }
  for (const rec of remote) {
    if (!rec || typeof rec.id !== 'string') continue
    const existing = byId.get(rec.id)
    if (!existing) {
      byId.set(rec.id, rec)
      continue
    }
    if (compareUpdatedAt(rec.updatedAt, existing.updatedAt) > 0) {
      byId.set(rec.id, rec)
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => compareUpdatedAt(b.updatedAt, a.updatedAt))
    .slice(0, maxCount)
}

/** Positive if a is newer than b. */
export function compareUpdatedAt(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return -1
  if (Number.isNaN(tb)) return 1
  return ta - tb
}
