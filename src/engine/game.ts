import { createDeck, createRng, shuffle } from './deck'
import {
  cardPoints,
  DEFAULT_TARGET,
  HAND_SIZE_AFTER_DISCARD,
  isScoringTrump,
  isTrump,
  MAX_BID,
  MIN_BID,
  nextSeat,
  trumpsInHand,
  trumpStrength,
} from './rules'
import { matchWinner, scoreHand } from './score'
import type {
  Card,
  Difficulty,
  GameState,
  Seat,
  SeatConfig,
  Suit,
  TrickPlay,
} from './types'
import { teamOf } from './types'

function emptyHands(): [Card[], Card[], Card[], Card[]] {
  return [[], [], [], []]
}

export function defaultSeats(
  difficulties: [Difficulty, Difficulty, Difficulty] = [
    'medium',
    'medium',
    'medium',
  ],
): [SeatConfig, SeatConfig, SeatConfig, SeatConfig] {
  // 0 South human, 1 West bot, 2 North bot, 3 East bot
  return [
    { kind: 'human', name: 'You' },
    { kind: 'bot', difficulty: difficulties[0], name: 'West' },
    { kind: 'bot', difficulty: difficulties[1], name: 'North' },
    { kind: 'bot', difficulty: difficulties[2], name: 'East' },
  ]
}

export function createLobbyState(
  seed = Date.now(),
  seats = defaultSeats(),
): GameState {
  return {
    phase: 'lobby',
    seats,
    scores: [0, 0],
    dealer: 0,
    hands: emptyHands(),
    stock: [],
    bids: [],
    highBid: null,
    bidder: null,
    trump: null,
    lowHolder: null,
    currentTrick: [],
    trickLeader: null,
    completedTricks: [],
    pointsTaken: [0, 0],
    activeSeats: [0, 1, 2, 3],
    currentSeat: null,
    handResult: null,
    targetScore: DEFAULT_TARGET,
    seed,
    message: 'Ready to play',
  }
}

export function startMatch(
  state: GameState,
  options?: {
    seed?: number
    difficulties?: [Difficulty, Difficulty, Difficulty]
  },
): GameState {
  const seats = options?.difficulties
    ? defaultSeats(options.difficulties)
    : state.seats
  const seed = options?.seed ?? Date.now()
  let next = createLobbyState(seed, seats)
  next = dealHand(next, 0)
  return next
}

export function dealHand(state: GameState, dealer: Seat): GameState {
  const rng = createRng(state.seed + dealer * 997 + state.scores[0] * 13)
  const deck = shuffle(createDeck(), rng)
  const hands = emptyHands()
  let idx = 0
  // 9 cards each in packets of 3, starting left of dealer
  for (let packet = 0; packet < 3; packet++) {
    let s = nextSeat(dealer)
    for (let p = 0; p < 4; p++) {
      hands[s].push(deck[idx++], deck[idx++], deck[idx++])
      s = nextSeat(s)
    }
  }
  const stock = deck.slice(idx)

  return {
    ...state,
    phase: 'bidding',
    dealer,
    hands,
    stock,
    bids: [],
    highBid: null,
    bidder: null,
    trump: null,
    lowHolder: null,
    currentTrick: [],
    trickLeader: null,
    completedTricks: [],
    pointsTaken: [0, 0],
    activeSeats: [0, 1, 2, 3],
    currentSeat: nextSeat(dealer),
    handResult: null,
    message: 'Bidding — min 6, max 14',
    seed: state.seed,
  }
}

export function legalBids(state: GameState): number[] {
  if (state.phase !== 'bidding' || state.currentSeat === null) return []
  const high = state.highBid ?? MIN_BID - 1
  const bids: number[] = []
  for (let b = Math.max(MIN_BID, high + 1); b <= MAX_BID; b++) {
    bids.push(b)
  }
  // Dealer forced to bid MIN if all passed
  const isDealer = state.currentSeat === state.dealer
  const allPassed =
    state.bids.length === 3 && state.bids.every((e) => e.bid === null)
  if (isDealer && allPassed) {
    return [MIN_BID] // must bid 6, no pass
  }
  return bids
}

export function canPass(state: GameState): boolean {
  if (state.phase !== 'bidding' || state.currentSeat === null) return false
  const isDealer = state.currentSeat === state.dealer
  const allPassed =
    state.bids.length === 3 && state.bids.every((e) => e.bid === null)
  if (isDealer && allPassed) return false
  return true
}

export function placeBid(
  state: GameState,
  seat: Seat,
  bid: number | null,
): GameState {
  if (state.phase !== 'bidding' || state.currentSeat !== seat) {
    throw new Error('Not your turn to bid')
  }
  if (bid === null) {
    if (!canPass(state)) throw new Error('Cannot pass')
  } else {
    const legal = legalBids(state)
    if (!legal.includes(bid)) throw new Error(`Illegal bid ${bid}`)
  }

  const bids = [...state.bids, { seat, bid }]
  let highBid = state.highBid
  let bidder = state.bidder
  if (bid !== null) {
    highBid = bid
    bidder = seat
  }

  // Bidding complete after 4 actions
  if (bids.length === 4) {
    // If somehow no bidder (shouldn't with forced dealer), force dealer 6
    const finalBidder = bidder ?? state.dealer
    const finalBid = highBid ?? MIN_BID
    return {
      ...state,
      bids,
      highBid: finalBid,
      bidder: finalBidder,
      phase: 'choose_trump',
      currentSeat: finalBidder,
      message: `${state.seats[finalBidder].name} won bid at ${finalBid} — choose trump`,
    }
  }

  return {
    ...state,
    bids,
    highBid,
    bidder,
    currentSeat: nextSeat(seat),
    message:
      bid === null
        ? `${state.seats[seat].name} passes`
        : `${state.seats[seat].name} bids ${bid}`,
  }
}

export function chooseTrump(state: GameState, seat: Seat, trump: Suit): GameState {
  if (state.phase !== 'choose_trump' || state.bidder !== seat) {
    throw new Error('Not allowed to choose trump')
  }
  let next: GameState = {
    ...state,
    trump,
    message: `Trump is ${trump}`,
  }
  next = performDiscardAndRefill(next)
  return next
}

/**
 * Discard non-trumps, refill non-dealers to 6, dealer robs stock to 6.
 * Then enter playing phase.
 */
export function performDiscardAndRefill(state: GameState): GameState {
  const trump = state.trump
  if (!trump) throw new Error('No trump')

  const hands = state.hands.map((h) => [...h]) as [
    Card[],
    Card[],
    Card[],
    Card[],
  ]
  let stock = [...state.stock]

  // 1. Each player keeps only trumps; if >6, drop non-scoring trumps
  for (let s = 0; s < 4; s++) {
    let trumps = trumpsInHand(hands[s], trump)
    if (trumps.length > HAND_SIZE_AFTER_DISCARD) {
      const scoring = trumps.filter((c) => isScoringTrump(c, trump))
      const nonScoring = trumps
        .filter((c) => !isScoringTrump(c, trump))
        .sort((a, b) => trumpStrength(a, trump) - trumpStrength(b, trump))
      const keepNon = nonScoring.slice(
        -(HAND_SIZE_AFTER_DISCARD - scoring.length),
      )
      trumps = [...scoring, ...keepNon]
    }
    hands[s] = trumps
  }

  // 2. Non-dealers refill from stock (order: left of dealer first)
  let s = nextSeat(state.dealer)
  for (let i = 0; i < 3; i++) {
    while (hands[s].length < HAND_SIZE_AFTER_DISCARD && stock.length > 0) {
      hands[s].push(stock.shift()!)
    }
    s = nextSeat(s)
  }

  // 3. Dealer takes remaining stock and discards to 6
  const dealer = state.dealer
  hands[dealer] = [...hands[dealer], ...stock]
  stock = []
  hands[dealer] = discardDownToSix(hands[dealer], trump)

  // Low holder: who holds trump 2 after discard
  let lowHolder: Seat | null = null
  for (let seat = 0; seat < 4; seat++) {
    if (hands[seat].some((c) => c.suit === trump && c.rank === '2')) {
      lowHolder = seat as Seat
      break
    }
  }

  const activeSeats = ([0, 1, 2, 3] as Seat[]).filter(
    (seat) => trumpsInHand(hands[seat], trump).length > 0,
  )

  // Award low point to holder's team immediately at start of play
  const pointsTaken: [number, number] = [0, 0]
  if (lowHolder !== null) {
    pointsTaken[teamOf(lowHolder)] += 1
  }

  const bidder = state.bidder!
  return {
    ...state,
    hands,
    stock,
    lowHolder,
    pointsTaken,
    activeSeats,
    phase: 'playing',
    currentSeat: bidder,
    trickLeader: bidder,
    currentTrick: [],
    completedTricks: [],
    message: `Play — ${state.seats[bidder].name} leads`,
  }
}

function discardDownToSix(hand: Card[], trump: Suit): Card[] {
  if (hand.length <= HAND_SIZE_AFTER_DISCARD) return hand
  // Keep all scoring trumps, then highest non-scoring trumps, then anything
  const scoring = hand.filter((c) => isScoringTrump(c, trump))
  const nonScoringTrumps = hand
    .filter((c) => isTrump(c, trump) && !isScoringTrump(c, trump))
    .sort((a, b) => trumpStrength(b, trump) - trumpStrength(a, trump))
  const nonTrumps = hand.filter((c) => !isTrump(c, trump))
  const keep: Card[] = [...scoring]
  for (const c of nonScoringTrumps) {
    if (keep.length >= HAND_SIZE_AFTER_DISCARD) break
    keep.push(c)
  }
  // Prefer not keeping non-trumps, but if still short (shouldn't happen often):
  for (const c of nonTrumps) {
    if (keep.length >= HAND_SIZE_AFTER_DISCARD) break
    keep.push(c)
  }
  // If still over (too many scoring - max 6 scoring), drop lowest non-scoring first already handled
  // If scoring alone > 6 impossible (only 6 scoring cards exist)
  return keep.slice(0, HAND_SIZE_AFTER_DISCARD)
}

export function legalPlays(state: GameState, seat: Seat): Card[] {
  if (state.phase !== 'playing' || state.trump === null) return []
  if (!state.activeSeats.includes(seat)) return []
  return trumpsInHand(state.hands[seat], state.trump)
}

export function playCard(state: GameState, seat: Seat, cardId: string): GameState {
  if (state.phase !== 'playing' || state.currentSeat !== seat) {
    throw new Error('Not your turn to play')
  }
  const trump = state.trump!
  const legal = legalPlays(state, seat)
  const card = legal.find((c) => c.id === cardId)
  if (!card) throw new Error('Illegal play')

  const hands = state.hands.map((h) => h.filter((c) => c.id !== cardId)) as [
    Card[],
    Card[],
    Card[],
    Card[],
  ]

  const currentTrick: TrickPlay[] = [...state.currentTrick, { seat, card }]

  // Who still needs to play this trick?
  const seatsInTrick = seatsForTrick(state, state.trickLeader!)
  const playedSeats = new Set(currentTrick.map((p) => p.seat))
  const remaining = seatsInTrick.filter((s) => !playedSeats.has(s))

  if (remaining.length > 0) {
    return {
      ...state,
      hands,
      currentTrick,
      currentSeat: remaining[0],
      message: `${state.seats[seat].name} plays ${card.rank}${card.suit}`,
    }
  }

  // Trick complete
  const winner = trickWinner(currentTrick, trump)
  let pointsTaken = [...state.pointsTaken] as [number, number]
  for (const p of currentTrick) {
    // Low (2) already awarded to holder — do not double-count
    const pts = cardPoints(p.card, trump)
    if (p.card.rank === '2' && isTrump(p.card, trump)) continue
    pointsTaken[teamOf(winner)] += pts
  }

  const completedTricks = [...state.completedTricks, currentTrick]

  // Update active seats (have trumps left)
  let activeSeats = ([0, 1, 2, 3] as Seat[]).filter(
    (s) => trumpsInHand(hands[s], trump).length > 0,
  )

  // If winner has no trumps left, lead passes to next active clockwise
  let nextLeader: Seat | null = winner
  if (!activeSeats.includes(winner)) {
    nextLeader = nextActiveFrom(winner, activeSeats)
  }

  // Only one player left with trumps → they take remaining point cards on trumps
  if (activeSeats.length === 1) {
    const last = activeSeats[0]
    for (const c of trumpsInHand(hands[last], trump)) {
      if (c.rank === '2') continue
      pointsTaken[teamOf(last)] += cardPoints(c, trump)
    }
    // Clear remaining trumps
    hands[last] = hands[last].filter((c) => !isTrump(c, trump))
    activeSeats = []
    nextLeader = null
  }

  // Hand over when no active seats / no trumps left
  const handOver =
    activeSeats.length === 0 ||
    ([0, 1, 2, 3] as Seat[]).every(
      (s) => trumpsInHand(hands[s], trump).length === 0,
    )

  if (handOver) {
    // Keep the last trick visible on the table until the player continues
    return finishHand({
      ...state,
      hands,
      currentTrick,
      completedTricks,
      pointsTaken,
      activeSeats: [],
      currentSeat: null,
      trickLeader: null,
    })
  }

  return {
    ...state,
    hands,
    currentTrick: [],
    completedTricks,
    pointsTaken,
    activeSeats,
    trickLeader: nextLeader,
    currentSeat: nextLeader,
    message: `${state.seats[winner].name} wins the trick`,
  }
}

function seatsForTrick(state: GameState, leader: Seat): Seat[] {
  // Players with trumps at start of trick, in order from leader
  // Use who still had trumps when trick started — approximate: activeSeats ordered from leader
  // Also include anyone who is playing (active)
  const order: Seat[] = []
  let s = leader
  for (let i = 0; i < 4; i++) {
    if (state.activeSeats.includes(s) || s === leader) {
      // At trick start, leader is always included if they led (they had a trump)
      if (state.activeSeats.includes(s)) order.push(s)
    }
    s = nextSeat(s)
  }
  // Leader might have just been active; ensure leader is first
  if (!order.includes(leader)) {
    // Leader played last trump already? shouldn't start trick
    return order
  }
  // Rebuild from leader among activeSeats as of trick start
  // When we're mid-trick, activeSeats still has everyone who started with trumps this trick
  // Actually after someone plays last trump mid-trick they're still in the trick
  // Simplest: order = clockwise from leader among those who had trumps when trick began
  // We store that implicitly: seats that either already played or still have trumps or are in currentTrick
  return order
}

function nextActiveFrom(from: Seat, active: Seat[]): Seat | null {
  if (active.length === 0) return null
  let s = nextSeat(from)
  for (let i = 0; i < 4; i++) {
    if (active.includes(s)) return s
    s = nextSeat(s)
  }
  return active[0]
}

export function trickWinner(trick: TrickPlay[], trump: Suit): Seat {
  let best = trick[0]
  for (let i = 1; i < trick.length; i++) {
    if (trumpStrength(trick[i].card, trump) > trumpStrength(best.card, trump)) {
      best = trick[i]
    }
  }
  return best.seat
}

function finishHand(state: GameState): GameState {
  const bid = state.highBid!
  const bidder = state.bidder!
  const result = scoreHand({
    bid,
    bidder,
    pointsTaken: state.pointsTaken,
    scoresBefore: state.scores,
  })

  const winner = matchWinner(result.scoresAfter, result.bidderTeam, state.targetScore)

  if (winner !== null) {
    return {
      ...state,
      scores: result.scoresAfter,
      handResult: result,
      phase: 'game_over',
      message:
        winner === 0
          ? 'You & North win the match!'
          : 'East & West win the match!',
    }
  }

  return {
    ...state,
    scores: result.scoresAfter,
    handResult: result,
    phase: 'hand_result',
    message: result.made
      ? `Bid ${bid} made — took ${result.teamPointsTaken[result.bidderTeam]}`
      : `Set! Bid ${bid} failed (took ${result.teamPointsTaken[result.bidderTeam]})`,
  }
}

export function nextHand(state: GameState): GameState {
  if (state.phase !== 'hand_result') {
    throw new Error('No hand to continue from')
  }
  const newDealer = nextSeat(state.dealer)
  return dealHand(
    {
      ...state,
      seed: state.seed + 1,
      handResult: null,
    },
    newDealer,
  )
}

export function rematch(state: GameState): GameState {
  return startMatch(state, {
    seed: state.seed + 100,
    difficulties: [
      state.seats[1].difficulty ?? 'medium',
      state.seats[2].difficulty ?? 'medium',
      state.seats[3].difficulty ?? 'medium',
    ],
  })
}
