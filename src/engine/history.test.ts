import { beforeEach, describe, expect, it } from 'vitest'
import {
  branchGameFromRound,
  clearAllGameHistory,
  createNewGameRecord,
  deleteGameRecord,
  formatGameLogAsText,
  loadGameHistory,
  updateGameHistoryWithState,
} from './history'
import {
  chooseTrump,
  createLobbyState,
  placeBid,
  playCard,
  startMatch,
} from './game'

// In-memory mock for localStorage in tests if needed
const storageMock: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key: string) => storageMock[key] ?? null,
  setItem: (key: string, value: string) => {
    storageMock[key] = value
  },
  removeItem: (key: string) => {
    delete storageMock[key]
  },
  clear: () => {
    for (const k of Object.keys(storageMock)) delete storageMock[k]
  },
  length: 0,
  key: () => null,
}

describe('Game History & Logging Engine', () => {
  beforeEach(() => {
    clearAllGameHistory()
  })

  it('creates and persists a new game record with timestamp and round 1', () => {
    const state = startMatch(createLobbyState(123), { seed: 123, gameMode: 'classic' })
    const date = new Date('2026-08-15T12:00:00.000Z')
    const record = createNewGameRecord(state, date)

    expect(record.id).toContain('pidro_game_')
    expect(record.startedAt).toBe('2026-08-15T12:00:00.000Z')
    expect(record.gameMode).toBe('classic')
    expect(record.status).toBe('in_progress')
    expect(record.rounds.length).toBe(1)
    expect(record.rounds[0].roundNumber).toBe(1)
    expect(record.rounds[0].initialHands[0].length).toBe(9)

    const loaded = loadGameHistory()
    expect(loaded.length).toBe(1)
    expect(loaded[0].id).toBe(record.id)
  })

  it('updates game history as bids, trumps, and tricks are played', () => {
    let state = startMatch(createLobbyState(100), { seed: 100, gameMode: 'classic' })
    let record = createNewGameRecord(state)

    // Bidding
    const bidder = state.currentSeat!
    state = placeBid(state, bidder, 7)
    record = updateGameHistoryWithState(record, state)
    expect(record.rounds[0].bids.length).toBe(1)
    expect(record.rounds[0].bids[0].bid).toBe(7)

    state = placeBid(state, ((bidder + 1) % 4) as any, null)
    state = placeBid(state, ((bidder + 2) % 4) as any, null)
    state = placeBid(state, ((bidder + 3) % 4) as any, null)
    record = updateGameHistoryWithState(record, state)

    expect(state.phase).toBe('choose_trump')
    expect(record.rounds[0].bidWinner?.seat).toBe(bidder)
    expect(record.rounds[0].bidWinner?.bid).toBe(7)

    // Choose trump
    state = chooseTrump(state, bidder, 'H')
    record = updateGameHistoryWithState(record, state)
    expect(record.rounds[0].trump).toBe('H')
    expect(state.phase).toBe('playing')

    // Play trick
    while (state.phase === 'playing') {
      const actor = state.currentSeat!
      const hand = state.hands[actor]
      const trumps = hand.filter((c) => c.suit === 'H' || (c.suit === 'D' && c.rank === '5'))
      const cardToPlay = trumps[0] ?? hand[0]
      state = playCard(state, actor, cardToPlay.id)
      record = updateGameHistoryWithState(record, state)
    }

    expect(state.phase).toBe('trick_pause')
    expect(record.rounds[0].tricks.length).toBe(1)
    expect(record.rounds[0].tricks[0].plays.length).toBeGreaterThan(0)
  })

  it('branches from an existing round as a new game with current timestamp', () => {
    let state = startMatch(createLobbyState(555), { seed: 555, gameMode: 'classic' })
    let record = createNewGameRecord(state, new Date('2026-08-15T10:00:00.000Z'))

    // Place bid
    const bidder = state.currentSeat!
    state = placeBid(state, bidder, 6)
    record = updateGameHistoryWithState(record, state)

    // Branch from Round 1 at 11:30
    const branchDate = new Date('2026-08-15T11:30:00.000Z')
    const { newRecord, state: branchedState } = branchGameFromRound(record, 0, branchDate)

    expect(newRecord.id).not.toBe(record.id)
    expect(newRecord.startedAt).toBe('2026-08-15T11:30:00.000Z')
    expect(newRecord.status).toBe('in_progress')
    expect(branchedState.phase).toBe('bidding')

    const history = loadGameHistory()
    expect(history.length).toBe(2)
    expect(history[0].id).toBe(newRecord.id)
  })

  it('formats human readable text log with full JSON export', () => {
    const state = startMatch(createLobbyState(777), { seed: 777, gameMode: 'classic' })
    const record = createNewGameRecord(state)
    const text = formatGameLogAsText(record)

    expect(text).toContain('PIDRO MATCH LOG')
    expect(text).toContain('CLASSIC')
    expect(text).toContain('ROUND 1')
    expect(text).toContain('FULL JSON REPLAY PAYLOAD')
  })

  it('deletes games from history', () => {
    const state1 = startMatch(createLobbyState(1), { seed: 1 })
    const rec1 = createNewGameRecord(state1)
    const state2 = startMatch(createLobbyState(2), { seed: 2 })
    const rec2 = createNewGameRecord(state2)

    expect(loadGameHistory().length).toBe(2)
    const remaining = deleteGameRecord(rec1.id)
    expect(remaining.length).toBe(1)
    expect(remaining[0].id).toBe(rec2.id)
  })
})
