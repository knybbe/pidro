import type { HistorySaveError } from './types'
import {
  aggressivelyCompactHistory,
  compactHistoryList,
} from './compact'
import type { GameHistoryRecord } from '../history'

export const GAME_HISTORY_KEY = 'pidro-game-history'

let lastSaveError: HistorySaveError | null = null
const errorListeners = new Set<(err: HistorySaveError | null) => void>()

export function getHistorySaveError(): HistorySaveError | null {
  return lastSaveError
}

export function subscribeHistorySaveError(
  listener: (err: HistorySaveError | null) => void,
): () => void {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

function setSaveError(err: HistorySaveError | null): void {
  lastSaveError = err
  for (const l of errorListeners) {
    try {
      l(err)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function clearHistorySaveError(): void {
  setSaveError(null)
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: string; code?: number; message?: string }
  return (
    err.name === 'QuotaExceededError' ||
    err.code === 22 ||
    err.code === 1014 ||
    (typeof err.message === 'string' &&
      /quota|exceeded/i.test(err.message))
  )
}

export function readLocalHistory(): GameHistoryRecord[] {
  try {
    const raw = localStorage.getItem(GAME_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (g) => g && typeof g.id === 'string' && Array.isArray(g.rounds),
      ) as GameHistoryRecord[]
    }
  } catch (e) {
    console.error('Failed to load game history:', e)
  }
  return []
}

/**
 * Persist history to localStorage. Compacts snapshots first; on quota errors
 * retries with aggressive compaction and by dropping oldest finished games.
 * Surfaces failures via getHistorySaveError / subscribers (non-silent).
 */
export function writeLocalHistory(
  history: GameHistoryRecord[],
  maxGames: number,
): GameHistoryRecord[] {
  const trimmed = history.slice(0, maxGames)
  const compacted = compactHistoryList(trimmed)

  const attempts: GameHistoryRecord[][] = [
    compacted,
    aggressivelyCompactHistory(compacted, 15),
    aggressivelyCompactHistory(compacted, 5),
  ]

  // Also try dropping oldest finished games progressively
  let dropping = [...compacted]
  for (let i = 0; i < 20 && dropping.length > 1; i++) {
    const oldestFinishedIdx = findOldestFinishedIndex(dropping)
    if (oldestFinishedIdx < 0) break
    dropping = dropping.filter((_, idx) => idx !== oldestFinishedIdx)
    attempts.push(aggressivelyCompactHistory(dropping, 5))
  }

  let lastError: unknown = null
  for (const candidate of attempts) {
    try {
      localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(candidate))
      setSaveError(null)
      return candidate
    } catch (e) {
      lastError = e
      if (!isQuotaError(e)) break
    }
  }

  const quotaExceeded = isQuotaError(lastError)
  const message = quotaExceeded
    ? 'Match history could not be saved — browser storage is full. Delete old matches or map a sync folder.'
    : `Match history could not be saved: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
  console.error('Failed to save game history:', lastError)
  setSaveError({ message, quotaExceeded })
  // Return the intended list for in-session use even if persist failed
  return compacted
}

function findOldestFinishedIndex(history: GameHistoryRecord[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'finished') return i
  }
  return -1
}

export function clearLocalHistory(): void {
  try {
    localStorage.removeItem(GAME_HISTORY_KEY)
    setSaveError(null)
  } catch {
    /* ignore */
  }
}
