import type { GameState } from '../types'
import type { GameHistoryRecord, RoundHistoryLog } from '../history'

/**
 * Deep-clone a GameState with redundant / UI-only fields stripped so history
 * JSON stays under localStorage quota while resume + round replay still work.
 */
export function compactGameState(state: GameState): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state))
  // Long UI messages bloat every snapshot; resume does not need them.
  clone.message = ''
  return clone
}

/**
 * Compact a full history record before persistence.
 * - Compacts snapshots
 * - For finished rounds, drops initialStateSnapshot.completedTricks /
 *   currentTrick (always empty or redundant with round.tricks at round start)
 */
export function compactHistoryRecord(record: GameHistoryRecord): GameHistoryRecord {
  const rounds: RoundHistoryLog[] = record.rounds.map((r) => compactRound(r))
  return {
    ...record,
    rounds,
    latestStateSnapshot: compactGameState(record.latestStateSnapshot),
    seats: JSON.parse(JSON.stringify(record.seats)),
    finalScores: [...record.finalScores] as [number, number],
  }
}

function compactRound(round: RoundHistoryLog): RoundHistoryLog {
  const snap = compactGameState(round.initialStateSnapshot)
  // Round-start snapshots never need completed mid-hand trick data.
  snap.completedTricks = []
  snap.currentTrick = []
  snap.handResult = null
  return {
    ...round,
    initialHands: round.initialHands.map((h) => [...h]) as RoundHistoryLog['initialHands'],
    initialStock: [...round.initialStock],
    initialStateSnapshot: snap,
    bids: round.bids.map((b) => ({ ...b })),
    refills: round.refills.map((r) => [...r]) as RoundHistoryLog['refills'],
    discards: round.discards.map((d) => [...d]) as RoundHistoryLog['discards'],
    tricks: round.tricks.map((t) => ({
      ...t,
      plays: t.plays.map((p) => ({ ...p, card: { ...p.card } })),
      pointsScored: { ...t.pointsScored },
    })),
    result: round.result ? JSON.parse(JSON.stringify(round.result)) : null,
    scoresAfter: [...round.scoresAfter] as [number, number],
  }
}

export function compactHistoryList(history: GameHistoryRecord[]): GameHistoryRecord[] {
  return history.map(compactHistoryRecord)
}

/**
 * Aggressive size reduction when quota is tight: drop initialStateSnapshot for
 * finished games older than keepFullSnapshots (keep latestStateSnapshot so
 * finished games remain listable; branching those rounds becomes unavailable).
 */
export function aggressivelyCompactHistory(
  history: GameHistoryRecord[],
  keepFullSnapshots = 10,
): GameHistoryRecord[] {
  return history.map((rec, idx) => {
    const base = compactHistoryRecord(rec)
    if (idx < keepFullSnapshots) return base
    if (rec.status !== 'finished') return base
    return {
      ...base,
      rounds: base.rounds.map((r) => ({
        ...r,
        // Minimal stub — branching will throw clearly if snapshot missing
        initialStateSnapshot: {
          ...r.initialStateSnapshot,
          hands: [[], [], [], []] as GameState['hands'],
          stock: [],
          dumpPiles: [[], [], [], []] as GameState['dumpPiles'],
          completedTricks: [],
          currentTrick: [],
          handHistory: [],
          message: '',
        },
      })),
    }
  })
}
