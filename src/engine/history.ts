import type {
  Card,
  GameMode,
  GameState,
  HandResult,
  Seat,
  SeatConfig,
  Suit,
  TrickPlay,
} from './types'

export const GAME_HISTORY_KEY = 'pidro-game-history'
const MAX_HISTORY_GAMES = 50

export interface TrickHistoryLog {
  trickNumber: number
  leader: Seat
  plays: TrickPlay[]
  winner: Seat
  pointsScored: {
    team0: number
    team1: number
  }
}

export interface RoundHistoryLog {
  roundNumber: number
  startedAt: string
  dealer: Seat
  seed: number
  /** Initial 9 cards dealt to each player before bidding */
  initialHands: [Card[], Card[], Card[], Card[]]
  initialStock: Card[]
  /** Snapshot of state right at the start of bidding for this round */
  initialStateSnapshot: GameState
  bids: Array<{ seat: Seat; bid: number | null }>
  bidWinner: { seat: Seat; bid: number } | null
  trump: Suit | null
  /** Kokkola extra cards or classic refills */
  refills: [Card[], Card[], Card[], Card[]]
  discards: [Card[], Card[], Card[], Card[]]
  lowHolder: Seat | null
  tricks: TrickHistoryLog[]
  result: HandResult | null
  scoresAfter: [number, number]
}

export interface GameHistoryRecord {
  id: string
  startedAt: string
  updatedAt: string
  gameMode: GameMode
  targetScore: number
  seed: number
  seats: [SeatConfig, SeatConfig, SeatConfig, SeatConfig]
  status: 'in_progress' | 'finished'
  winnerTeam: 0 | 1 | null
  finalScores: [number, number]
  rounds: RoundHistoryLog[]
  /** Latest state snapshot of the active game */
  latestStateSnapshot: GameState
}

export function loadGameHistory(): GameHistoryRecord[] {
  try {
    const raw = localStorage.getItem(GAME_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((g) => g && typeof g.id === 'string' && Array.isArray(g.rounds))
    }
  } catch (e) {
    console.error('Failed to load game history:', e)
  }
  return []
}

export function saveGameHistory(history: GameHistoryRecord[]): void {
  try {
    const trimmed = history.slice(0, MAX_HISTORY_GAMES)
    localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save game history:', e)
  }
}

export function deleteGameRecord(id: string): GameHistoryRecord[] {
  const history = loadGameHistory().filter((g) => g.id !== id)
  saveGameHistory(history)
  return history
}

export function clearAllGameHistory(): void {
  try {
    localStorage.removeItem(GAME_HISTORY_KEY)
  } catch {
    /* ignore */
  }
}

export function upsertGameRecord(record: GameHistoryRecord): GameHistoryRecord[] {
  const history = loadGameHistory()
  const idx = history.findIndex((g) => g.id === record.id)
  if (idx >= 0) {
    history[idx] = record
  } else {
    history.unshift(record)
  }
  saveGameHistory(history)
  return history
}

export function createNewGameRecord(state: GameState, date = new Date()): GameHistoryRecord {
  const id = `pidro_game_${date.getTime()}_${Math.random().toString(36).slice(2, 7)}`
  const startedAt = date.toISOString()

  const firstRound: RoundHistoryLog = {
    roundNumber: 1,
    startedAt,
    dealer: state.dealer,
    seed: state.seed,
    initialHands: [
      [...state.hands[0]],
      [...state.hands[1]],
      [...state.hands[2]],
      [...state.hands[3]],
    ],
    initialStock: [...state.stock],
    initialStateSnapshot: JSON.parse(JSON.stringify(state)),
    bids: [],
    bidWinner: null,
    trump: null,
    refills: [[], [], [], []],
    discards: [[], [], [], []],
    lowHolder: null,
    tricks: [],
    result: null,
    scoresAfter: [...state.scores],
  }

  const record: GameHistoryRecord = {
    id,
    startedAt,
    updatedAt: startedAt,
    gameMode: state.gameMode,
    targetScore: state.targetScore,
    seed: state.seed,
    seats: JSON.parse(JSON.stringify(state.seats)),
    status: 'in_progress',
    winnerTeam: null,
    finalScores: [...state.scores],
    rounds: [firstRound],
    latestStateSnapshot: JSON.parse(JSON.stringify(state)),
  }

  upsertGameRecord(record)
  return record
}

/**
 * Synchronize game history with the latest GameState transitions.
 */
export function updateGameHistoryWithState(
  record: GameHistoryRecord,
  state: GameState,
  date = new Date(),
): GameHistoryRecord {
  const updated: GameHistoryRecord = {
    ...record,
    updatedAt: date.toISOString(),
    gameMode: state.gameMode,
    finalScores: [...state.scores],
    latestStateSnapshot: JSON.parse(JSON.stringify(state)),
  }

  if (state.phase === 'game_over') {
    updated.status = 'finished'
    updated.winnerTeam = state.scores[0] >= state.targetScore ? 0 : 1
  }

  let rounds = [...updated.rounds]
  let currentRound = rounds[rounds.length - 1]

  if (!currentRound || (state.phase === 'bidding' && currentRound.result !== null)) {
    // New round started
    const newRoundNum = rounds.length + 1
    currentRound = {
      roundNumber: newRoundNum,
      startedAt: date.toISOString(),
      dealer: state.dealer,
      seed: state.seed,
      initialHands: [
        [...state.hands[0]],
        [...state.hands[1]],
        [...state.hands[2]],
        [...state.hands[3]],
      ],
      initialStock: [...state.stock],
      initialStateSnapshot: JSON.parse(JSON.stringify(state)),
      bids: [],
      bidWinner: null,
      trump: null,
      refills: [[], [], [], []],
      discards: [[], [], [], []],
      lowHolder: null,
      tricks: [],
      result: null,
      scoresAfter: [...state.scores],
    }
    rounds.push(currentRound)
  }

  // Update bids
  if (state.bids && state.bids.length > 0) {
    currentRound.bids = state.bids.map((b) => ({ seat: b.seat, bid: b.bid }))
  }

  // Update bidder & trump
  if (state.bidder !== null && state.highBid !== null) {
    currentRound.bidWinner = { seat: state.bidder, bid: state.highBid }
  }
  if (state.trump) {
    currentRound.trump = state.trump
  }
  if (state.lowHolder !== null) {
    currentRound.lowHolder = state.lowHolder
  }

  // Update discards
  if (state.dumpPiles) {
    currentRound.discards = [
      [...state.dumpPiles[0]],
      [...state.dumpPiles[1]],
      [...state.dumpPiles[2]],
      [...state.dumpPiles[3]],
    ]
  }

  // Update all tricks (completed tricks + in-progress trick during 'playing')
  const allTricks: TrickHistoryLog[] = []
  if (state.completedTricks && state.completedTricks.length > 0) {
    state.completedTricks.forEach((trick, tIdx) => {
      const leader = trick[0]?.seat ?? 0
      const winner = state.trump ? findTrickWinner(trick, state.trump) : leader
      allTricks.push({
        trickNumber: tIdx + 1,
        leader,
        plays: [...trick],
        winner,
        pointsScored: calculateTrickPoints(trick, state.trump, winner),
      })
    })
  }
  if (state.phase === 'playing' && state.currentTrick && state.currentTrick.length > 0) {
    const leader = state.trickLeader ?? state.currentTrick[0]?.seat ?? 0
    const winner = state.trump ? findTrickWinner(state.currentTrick, state.trump) : leader
    allTricks.push({
      trickNumber: allTricks.length + 1,
      leader,
      plays: [...state.currentTrick],
      winner,
      pointsScored: calculateTrickPoints(state.currentTrick, state.trump, winner),
    })
  }
  currentRound.tricks = allTricks

  // Update hand result if completed
  if (state.handResult) {
    currentRound.result = JSON.parse(JSON.stringify(state.handResult))
    currentRound.scoresAfter = [...state.scores]
  }

  updated.rounds = rounds
  upsertGameRecord(updated)
  return updated
}

function findTrickWinner(trick: TrickPlay[], trump: Suit): Seat {
  let best = trick[0]
  for (let i = 1; i < trick.length; i++) {
    if (getTrumpStrength(trick[i].card, trump) > getTrumpStrength(best.card, trump)) {
      best = trick[i]
    }
  }
  return best.seat
}

function getTrumpStrength(c: Card, trump: Suit): number {
  const sameColorSuit: Record<Suit, Suit> = { S: 'C', C: 'S', H: 'D', D: 'H' }
  const isRightPedro = c.suit === trump && c.rank === '5'
  const isLeftPedro = c.suit === sameColorSuit[trump] && c.rank === '5'
  const isTrumpCard = c.suit === trump || isLeftPedro

  if (!isTrumpCard) return -1
  if (c.suit === trump) {
    if (c.rank === 'A') return 100
    if (c.rank === 'K') return 90
    if (c.rank === 'Q') return 80
    if (c.rank === 'J') return 70
    if (c.rank === '10') return 60
    if (isRightPedro) return 50
  }
  if (isLeftPedro) return 40
  const num = Number(c.rank)
  if (!Number.isNaN(num)) return num
  return 0
}

function calculateTrickPoints(trick: TrickPlay[], trump: Suit | null, winner: Seat) {
  const pts = { team0: 0, team1: 0 }
  if (!trump) return pts

  const sameColor: Record<Suit, Suit> = { S: 'C', C: 'S', H: 'D', D: 'H' }
  const winnerTeam = (winner % 2) as 0 | 1

  for (const p of trick) {
    const c = p.card
    let cardPt = 0
    if (c.suit === trump) {
      if (c.rank === 'A') cardPt = 1
      else if (c.rank === 'K') cardPt = 0
      else if (c.rank === 'Q') cardPt = 0
      else if (c.rank === 'J') cardPt = 1
      else if (c.rank === '10') cardPt = 1
      else if (c.rank === '5') cardPt = 5 // Right Pedro
      else if (c.rank === '2') cardPt = 1 // Low
    } else if (c.suit === sameColor[trump] && c.rank === '5') {
      cardPt = 5 // Left Pedro
    }

    if (cardPt > 0) {
      if (c.rank === '2' && c.suit === trump) {
        // Low points go to player who held/played the 2
        const lowTeam = (p.seat % 2) === 0 ? 'team0' : 'team1'
        pts[lowTeam] += cardPt
      } else {
        const winTeamKey = winnerTeam === 0 ? 'team0' : 'team1'
        pts[winTeamKey] += cardPt
      }
    }
  }
  return pts
}

/**
 * Branch/replay a game starting from a specific round index.
 * Creates a brand new game record with current timestamp and restores the exact round state.
 */
export function branchGameFromRound(
  record: GameHistoryRecord,
  roundIndex: number,
  date = new Date(),
): { newRecord: GameHistoryRecord; state: GameState } {
  const targetRound = record.rounds[roundIndex]
  if (!targetRound || !targetRound.initialStateSnapshot) {
    throw new Error(`Round ${roundIndex + 1} snapshot not found`)
  }

  const newId = `pidro_game_${date.getTime()}_${Math.random().toString(36).slice(2, 7)}`
  const startedAt = date.toISOString()

  // Copy all rounds up to this round
  const copiedRounds: RoundHistoryLog[] = record.rounds.slice(0, roundIndex + 1).map((r, idx) => {
    if (idx === roundIndex) {
      return {
        ...r,
        startedAt,
        bids: [],
        bidWinner: null,
        trump: null,
        refills: [[], [], [], []],
        discards: [[], [], [], []],
        lowHolder: null,
        tricks: [],
        result: null,
        scoresAfter: [...r.initialStateSnapshot.scores],
      }
    }
    return JSON.parse(JSON.stringify(r))
  })

  // Deep clone snapshot state
  const restoredState: GameState = JSON.parse(JSON.stringify(targetRound.initialStateSnapshot))

  const newRecord: GameHistoryRecord = {
    id: newId,
    startedAt,
    updatedAt: startedAt,
    gameMode: restoredState.gameMode,
    targetScore: restoredState.targetScore,
    seed: restoredState.seed,
    seats: JSON.parse(JSON.stringify(restoredState.seats)),
    status: 'in_progress',
    winnerTeam: null,
    finalScores: [...restoredState.scores],
    rounds: copiedRounds,
    latestStateSnapshot: restoredState,
  }

  upsertGameRecord(newRecord)
  return { newRecord, state: restoredState }
}

/**
 * Generate human-readable + structured export text for clipboard and debugging.
 */
export function formatGameLogAsText(record: GameHistoryRecord): string {
  const seatNames = record.seats.map((s) => s.name)
  const lines: string[] = []

  lines.push(`=======================================================`)
  lines.push(`PIDRO MATCH LOG - ${record.id}`)
  lines.push(`Started: ${record.startedAt}`)
  lines.push(`Updated: ${record.updatedAt}`)
  lines.push(`Game Mode: ${record.gameMode.toUpperCase()}`)
  lines.push(`Target Score: ${record.targetScore}`)
  lines.push(`Status: ${record.status.toUpperCase()}${record.winnerTeam !== null ? ` (Winner: Team ${record.winnerTeam === 0 ? 'South & North' : 'West & East'})` : ''}`)
  lines.push(`Final Scores: South & North [${record.finalScores[0]}] — West & East [${record.finalScores[1]}]`)
  lines.push(`Seats:`)
  record.seats.forEach((s, idx) => {
    lines.push(`  Seat ${idx} (${['South', 'West', 'North', 'East'][idx]}): ${s.name} [${s.kind}${s.difficulty ? `, ${s.difficulty}` : ''}${s.biddingRisk ? `, risk:${s.biddingRisk}` : ''}]`)
  })
  lines.push(`=======================================================\n`)

  record.rounds.forEach((round) => {
    lines.push(`--- ROUND ${round.roundNumber} ---`)
    lines.push(`Dealer: Seat ${round.dealer} (${seatNames[round.dealer]}) | Seed: ${round.seed}`)
    
    // Initial hands dealt
    lines.push(`Initial Deals:`)
    round.initialHands.forEach((hand, sIdx) => {
      const cardsStr = hand.map((c) => `${c.rank}${c.suit}`).join(' ')
      lines.push(`  ${seatNames[sIdx]} (${['South', 'West', 'North', 'East'][sIdx]}): ${cardsStr}`)
    })

    // Bidding sequence
    lines.push(`Bidding Sequence:`)
    if (round.bids.length === 0) {
      lines.push(`  (No bids logged)`)
    } else {
      round.bids.forEach((b) => {
        lines.push(`  ${seatNames[b.seat]}: ${b.bid === null ? 'Pass' : b.bid}`)
      })
    }
    if (round.bidWinner) {
      lines.push(`Contract Winner: ${seatNames[round.bidWinner.seat]} with bid of ${round.bidWinner.bid}`)
    }
    if (round.trump) {
      lines.push(`Trump Chosen: ${round.trump}`)
    }

    // Tricks
    lines.push(`Tricks Played (${round.tricks.length}):`)
    round.tricks.forEach((t) => {
      const playsStr = t.plays.map((p) => `${seatNames[p.seat]}:${p.card.rank}${p.card.suit}`).join(' -> ')
      lines.push(`  Trick ${t.trickNumber}: ${playsStr} | Won by ${seatNames[t.winner]} (Pts: S-N +${t.pointsScored.team0}, W-E +${t.pointsScored.team1})`)
    })

    // Result
    if (round.result) {
      lines.push(`Round Result:`)
      lines.push(`  Bidder Team: Team ${round.result.bidderTeam} | Contract: ${round.result.bid} points`)
      lines.push(`  Points Taken: S-N: ${round.result.teamPointsTaken[0]} | W-E: ${round.result.teamPointsTaken[1]}`)
      lines.push(`  Contract ${round.result.made ? 'MADE' : 'FAILED / SET'}`)
      lines.push(`  Score Delta: S-N ${round.result.teamScoreDelta[0] >= 0 ? '+' : ''}${round.result.teamScoreDelta[0]}, W-E ${round.result.teamScoreDelta[1] >= 0 ? '+' : ''}${round.result.teamScoreDelta[1]}`)
      lines.push(`  Cumulative Score After Round: S-N ${round.scoresAfter[0]} — W-E ${round.scoresAfter[1]}`)
    }
    lines.push(``)
  })

  lines.push(`=======================================================`)
  lines.push(`FULL JSON REPLAY PAYLOAD:`)
  lines.push(JSON.stringify(record, null, 2))
  lines.push(`=======================================================`)

  return lines.join('\n')
}
