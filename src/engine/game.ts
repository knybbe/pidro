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
  BotConfig,
  Card,
  Difficulty,
  GameMode,
  GameState,
  RiskLevel,
  Seat,
  SeatConfig,
  Suit,
  TrickPlay,
} from './types'
import { teamOf } from './types'

export type { BotConfig, GameMode, RiskLevel }

function emptyHands(): [Card[], Card[], Card[], Card[]] {
  return [[], [], [], []]
}

function emptyDumps(): [Card[], Card[], Card[], Card[]] {
  return [[], [], [], []]
}

/** Grammar for human vs bot labels in status text */
function actorPhrase(name: string, verb: 'wins' | 'won' | 'bids' | 'passes' | 'leads' | 'plays'): string {
  if (name === 'You') {
    const map: Record<typeof verb, string> = {
      wins: 'You win',
      won: 'You won',
      bids: 'You bid',
      passes: 'You pass',
      leads: 'You lead',
      plays: 'You play',
    }
    return map[verb]
  }
  const map: Record<typeof verb, string> = {
    wins: `${name} wins`,
    won: `${name} won`,
    bids: `${name} bids`,
    passes: `${name} passes`,
    leads: `${name} leads`,
    plays: `${name} plays`,
  }
  return map[verb]
}

export function defaultSeats(
  bots:
    | [BotConfig, BotConfig, BotConfig]
    | [Difficulty, Difficulty, Difficulty] = [
    { difficulty: 'medium', biddingRisk: 'medium' },
    { difficulty: 'medium', biddingRisk: 'medium' },
    { difficulty: 'medium', biddingRisk: 'medium' },
  ],
  defaultRisk: RiskLevel = 'medium',
): [SeatConfig, SeatConfig, SeatConfig, SeatConfig] {
  const parseBot = (
    b: BotConfig | Difficulty,
  ): { difficulty: Difficulty; biddingRisk: RiskLevel } => {
    if (typeof b === 'string') return { difficulty: b, biddingRisk: defaultRisk }
    return {
      difficulty: b.difficulty ?? 'medium',
      biddingRisk: b.biddingRisk ?? defaultRisk,
    }
  }

  const w = parseBot(bots[0])
  const n = parseBot(bots[1])
  const e = parseBot(bots[2])

  // 0 South human, 1 West bot, 2 North bot, 3 East bot
  return [
    { kind: 'human', name: 'You' },
    { kind: 'bot', difficulty: w.difficulty, biddingRisk: w.biddingRisk, name: 'West' },
    { kind: 'bot', difficulty: n.difficulty, biddingRisk: n.biddingRisk, name: 'North' },
    { kind: 'bot', difficulty: e.difficulty, biddingRisk: e.biddingRisk, name: 'East' },
  ]
}

export function createLobbyState(
  seed = Date.now(),
  seats = defaultSeats(),
  gameMode: GameMode = 'classic',
): GameState {
  return {
    phase: 'lobby',
    seats,
    gameMode,
    scores: [0, 0],
    dealer: 0,
    hands: emptyHands(),
    stock: [],
    dumpPiles: emptyDumps(),
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
    coldRevealed: [false, false, false, false],
    purchasedIds: [],
    currentSeat: null,
    handResult: null,
    handHistory: [],
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
    bots?:
      | [BotConfig, BotConfig, BotConfig]
      | [Difficulty, Difficulty, Difficulty]
    biddingRisk?: RiskLevel
    gameMode?: GameMode
  },
): GameState {
  const bots = options?.bots ?? options?.difficulties
  const seats = bots
    ? defaultSeats(bots, options?.biddingRisk ?? 'medium')
    : state.seats
  const seed = options?.seed ?? Date.now()
  const gameMode = options?.gameMode ?? state.gameMode ?? 'classic'
  let next = createLobbyState(seed, seats, gameMode)
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
    dumpPiles: emptyDumps(),
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
    coldRevealed: [false, false, false, false],
    purchasedIds: [],
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
    let next: GameState = {
      ...state,
      bids,
      highBid: finalBid,
      bidder: finalBidder,
      phase: 'choose_trump',
      currentSeat: finalBidder,
      message: `${actorPhrase(state.seats[finalBidder].name, 'won')} the bid at ${finalBid} — choose trump`,
    }
    // Kokkola: +4 each after bidding (in engine only; UI keeps showing 9 until trump)
    if (state.gameMode === 'kokkola') {
      next = dealExtraCards(next, 4)
      next = {
        ...next,
        message: `${actorPhrase(state.seats[finalBidder].name, 'won')} the bid at ${finalBid} — choose trump`,
      }
    }
    return next
  }

  return {
    ...state,
    bids,
    highBid,
    bidder,
    currentSeat: nextSeat(seat),
    message:
      bid === null
        ? actorPhrase(state.seats[seat].name, 'passes')
        : `${actorPhrase(state.seats[seat].name, 'bids')} ${bid}`,
  }
}

export function chooseTrump(state: GameState, seat: Seat, trump: Suit): GameState {
  if (state.phase !== 'choose_trump') {
    throw new Error(`Not allowed to choose trump (phase=${state.phase})`)
  }
  if (state.bidder !== seat) {
    throw new Error(
      `Not allowed to choose trump (bidder=${state.bidder}, seat=${seat})`,
    )
  }
  const next: GameState = {
    ...state,
    trump,
    message: `Trump is ${trump}`,
  }
  return performDiscardAndRefill(next)
}

/**
 * Deal `count` extra cards to each seat (left of dealer first).
 * Used by Kokkola mode after bidding.
 */
export function dealExtraCards(state: GameState, count: number): GameState {
  const hands = state.hands.map((h) => [...h]) as [
    Card[],
    Card[],
    Card[],
    Card[],
  ]
  let stock = [...state.stock]
  let s = nextSeat(state.dealer)
  for (let p = 0; p < 4; p++) {
    for (let i = 0; i < count && stock.length > 0; i++) {
      hands[s].push(stock.shift()!)
    }
    s = nextSeat(s)
  }
  return { ...state, hands, stock }
}

/**
 * Discard non-trumps, refill non-dealers to 6, dealer robs stock to 6.
 * Kokkola: no stock refill (extra cards already dealt after bidding).
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
  const dumpPiles = emptyDumps()

  // Track cards drawn from stock (purchase / refill) for UI markers
  const purchasedIds: string[] = []

  if (state.gameMode === 'kokkola') {
    // Kokkola mode: each player has 9 cards after bidding (+4 cards dealt).
    // All players discard down to 6 cards (keeping trumps, then non-trumps up to 6 total).
    // All 4 players start the round with 6 cards in their hand!
    for (let s = 0; s < 4; s++) {
      const res = discardDownToSix(hands[s], trump)
      hands[s] = res.keep
      dumpPiles[s].push(...res.discarded)
    }
    stock = []
  } else {
    // Classic mode:
    // 1. Each player keeps only trumps; non-trumps go to that player's dump pile
    for (let s = 0; s < 4; s++) {
      const nonTrumps = hands[s].filter((c) => !isTrump(c, trump))
      dumpPiles[s].push(...nonTrumps)
      let trumps = trumpsInHand(hands[s], trump)
      if (trumps.length > HAND_SIZE_AFTER_DISCARD) {
        const scoring = trumps.filter((c) => isScoringTrump(c, trump))
        const nonScoring = trumps
          .filter((c) => !isScoringTrump(c, trump))
          .sort((a, b) => trumpStrength(a, trump) - trumpStrength(b, trump))
        const dropCount = trumps.length - HAND_SIZE_AFTER_DISCARD
        const dropped = nonScoring.slice(0, dropCount)
        dumpPiles[s].push(...dropped)
        const keepNon = nonScoring.slice(dropCount)
        trumps = [...scoring, ...keepNon]
      }
      hands[s] = trumps
    }

    // 2. Non-dealers refill from stock (order: left of dealer first)
    let s = nextSeat(state.dealer)
    for (let i = 0; i < 3; i++) {
      while (hands[s].length < HAND_SIZE_AFTER_DISCARD && stock.length > 0) {
        const drawn = stock.shift()!
        hands[s].push(drawn)
        purchasedIds.push(drawn.id)
      }
      s = nextSeat(s)
    }

    // 3. Dealer takes remaining stock and discards to 6
    const dealer = state.dealer
    const dealerStock = [...stock]
    hands[dealer] = [...hands[dealer], ...dealerStock]
    stock = []
    const dealerResult = discardDownToSix(hands[dealer], trump)
    hands[dealer] = dealerResult.keep
    dumpPiles[dealer].push(...dealerResult.discarded)
    const keptIds = new Set(dealerResult.keep.map((c) => c.id))
    for (const c of dealerStock) {
      if (keptIds.has(c.id)) purchasedIds.push(c.id)
    }
  }

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

  // Points taken start at 0 and are credited as tricks are won
  const pointsTaken: [number, number] = [0, 0]

  const bidder = state.bidder!
  const partner = ((bidder + 2) % 4) as Seat
  // Bidder normally leads. But if bidder's partner has only 1 card,
  // partner leads the first trick of the round instead of bidder!
  let leader: Seat | null = bidder
  if (activeSeats.includes(partner) && hands[partner].length === 1) {
    leader = partner
  } else if (!activeSeats.includes(bidder)) {
    leader = nextActiveFrom(bidder, activeSeats)
  }
  if (leader === null && activeSeats.length > 0) {
    leader = activeSeats[0]
  }

  // No one has trumps — hand is over before play starts (extremely rare)
  if (leader === null || activeSeats.length === 0) {
    return finishHand({
      ...state,
      hands,
      stock,
      dumpPiles,
      lowHolder,
      pointsTaken,
      activeSeats: [],
      phase: 'playing',
      currentSeat: null,
      trickLeader: null,
      currentTrick: [],
      completedTricks: [],
      message: 'No trumps in play',
    })
  }

  // Seats that never had trumps after discard: reveal when play order first reaches them
  const coldRevealed = ([0, 1, 2, 3] as Seat[]).map(() => false) as [
    boolean,
    boolean,
    boolean,
    boolean,
  ]

  return {
    ...state,
    hands,
    stock,
    dumpPiles,
    lowHolder,
    pointsTaken,
    activeSeats,
    coldRevealed,
    purchasedIds,
    phase: 'playing',
    currentSeat: leader,
    trickLeader: leader,
    currentTrick: [],
    completedTricks: [],
    message: `Play — ${actorPhrase(state.seats[leader].name, 'leads')}`,
  }
}

/**
 * Mark cold seats face-up when clockwise play order would have reached them
 * (between `from` exclusive and `to` inclusive, or just `to` if same).
 */
function revealColdAlongPath(
  from: Seat,
  to: Seat | null,
  hands: GameState['hands'],
  trump: Suit,
  coldRevealed: [boolean, boolean, boolean, boolean],
  includeTo: boolean,
): [boolean, boolean, boolean, boolean] {
  const next = [...coldRevealed] as [boolean, boolean, boolean, boolean]
  if (to === null) return next
  let s = nextSeat(from)
  for (let i = 0; i < 4; i++) {
    if (s === to) {
      if (includeTo && trumpsInHand(hands[s], trump).length === 0) {
        next[s] = true
      }
      break
    }
    if (trumpsInHand(hands[s], trump).length === 0) {
      next[s] = true
    }
    s = nextSeat(s)
  }
  return next
}

/** Drop purchase markers for cards no longer hidden in a seat's hand. */
function prunePurchased(
  purchasedIds: string[],
  hands: GameState['hands'],
  coldRevealed: [boolean, boolean, boolean, boolean],
  trump: Suit | null,
): string[] {
  const stillHidden = new Set<string>()
  for (let seat = 0; seat < 4; seat++) {
    // Face-up cold hands are "displayed" — clear purchase marks for those cards
    if (coldRevealed[seat as Seat] && trump) {
      continue
    }
    for (const c of hands[seat as Seat]) {
      stillHidden.add(c.id)
    }
  }
  return purchasedIds.filter((id) => stillHidden.has(id))
}

function discardDownToSix(
  hand: Card[],
  trump: Suit,
): { keep: Card[]; discarded: Card[] } {
  if (hand.length <= HAND_SIZE_AFTER_DISCARD) {
    return { keep: hand, discarded: [] }
  }
  // Keep all scoring trumps (5-pt Pedros prioritized), then highest non-scoring trumps, then anything
  const scoring = hand
    .filter((c) => isScoringTrump(c, trump))
    .sort((a, b) => cardPoints(b, trump) - cardPoints(a, trump))
  const nonScoringTrumps = hand
    .filter((c) => isTrump(c, trump) && !isScoringTrump(c, trump))
    .sort((a, b) => trumpStrength(b, trump) - trumpStrength(a, trump))
  const nonTrumps = hand.filter((c) => !isTrump(c, trump))
  const keep: Card[] = [...scoring]
  for (const c of nonScoringTrumps) {
    if (keep.length >= HAND_SIZE_AFTER_DISCARD) break
    keep.push(c)
  }
  for (const c of nonTrumps) {
    if (keep.length >= HAND_SIZE_AFTER_DISCARD) break
    keep.push(c)
  }
  const finalKeep = keep.slice(0, HAND_SIZE_AFTER_DISCARD)
  const keepIds = new Set(finalKeep.map((c) => c.id))
  const discarded = hand.filter((c) => !keepIds.has(c.id))
  return { keep: finalKeep, discarded }
}

export function legalPlays(state: GameState, seat: Seat): Card[] {
  if (state.phase !== 'playing' || state.trump === null) return []
  // Allow the current actor even if activeSeats got out of sync (recovery).
  if (!state.activeSeats.includes(seat) && state.currentSeat !== seat) return []
  const trumps = trumpsInHand(state.hands[seat], state.trump)
  if (trumps.length === 0) return []

  // Pidro: only trumps are played. A singleton is always the only legal card.
  // Defenders (opponents of the bidder) with exactly one trump must play it
  // on the opening trick — they cannot "save" it for later.
  if (
    isOpeningTrick(state) &&
    isOpponentOfBidder(state, seat) &&
    trumps.length === 1
  ) {
    return trumps
  }

  return trumps
}

/** True while the first trick of the hand is still being played. */
function isOpeningTrick(state: GameState): boolean {
  return state.completedTricks.length === 0
}

/** Seat is on the defending side (not bidder, not bidder's partner). */
function isOpponentOfBidder(state: GameState, seat: Seat): boolean {
  if (state.bidder === null) return false
  return teamOf(seat) !== teamOf(state.bidder)
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
  // Use updated hands so anyone who is now out of trumps is skipped.
  const seatsInTrick = seatsForTrick(
    { ...state, hands, currentTrick },
    state.trickLeader ?? seat,
  )
  const playedSeats = new Set(currentTrick.map((p) => p.seat))
  const remaining = seatsInTrick.filter(
    (s) =>
      !playedSeats.has(s) && trumpsInHand(hands[s], trump).length > 0,
  )

  // Purchase marks drop when card is played
  let purchasedIds = state.purchasedIds.filter((id) => id !== cardId)

  if (remaining.length > 0) {
    const nextSeatToPlay = remaining[0]
    // Reveal cold hands when play order would reach them (between us and next)
    let coldRevealed = revealColdAlongPath(
      seat,
      nextSeatToPlay,
      hands,
      trump,
      state.coldRevealed,
      false,
    )
    purchasedIds = prunePurchased(purchasedIds, hands, coldRevealed, trump)
    return {
      ...state,
      hands,
      currentTrick,
      currentSeat: nextSeatToPlay,
      coldRevealed,
      purchasedIds,
      message: `${actorPhrase(state.seats[seat].name, 'plays')} ${card.rank}${card.suit}`,
    }
  }

  // Trick complete
  const winner = trickWinner(currentTrick, trump)
  let pointsTaken = [...state.pointsTaken] as [number, number]
  for (const p of currentTrick) {
    const pts = cardPoints(p.card, trump)
    if (pts > 0) {
      if (p.card.rank === '2') {
        // In Pidro, the 2 of trump (Low) always scores for the team that played it
        pointsTaken[teamOf(p.seat)] += pts
      } else {
        pointsTaken[teamOf(winner)] += pts
      }
    }
  }

  const completedTricks = [...state.completedTricks, currentTrick]

  // Update active seats (have trumps left)
  let activeSeats = ([0, 1, 2, 3] as Seat[]).filter(
    (s) => trumpsInHand(hands[s], trump).length > 0,
  )

  // If winner has no trumps left, lead will pass to next active clockwise when continuing
  let nextLeader: Seat | null = winner
  if (!activeSeats.includes(winner)) {
    nextLeader = nextActiveFrom(winner, activeSeats)
  }

  // Do not reveal any cold hands during trick pause; keep current coldRevealed
  purchasedIds = prunePurchased(purchasedIds, hands, state.coldRevealed, trump)

  // Pause so every completed trick (including the final trick) stays visible until Continue
  return {
    ...state,
    hands,
    currentTrick,
    completedTricks,
    pointsTaken,
    activeSeats,
    coldRevealed: state.coldRevealed,
    trickLeader: nextLeader,
    purchasedIds,
    currentSeat: null,
    phase: 'trick_pause',
    message: `${actorPhrase(state.seats[winner].name, 'wins')} the trick`,
  }
}

/** After Continue on a finished trick: clear table and start next lead (or finish hand). */
export function continueAfterTrick(state: GameState): GameState {
  if (state.phase !== 'trick_pause') {
    throw new Error('Not waiting on a trick')
  }
  const trump = state.trump!
  const winner = trickWinner(state.currentTrick, trump)
  const dumpPiles = state.dumpPiles

  // Check if hand is finished after this trick:
  const active = state.activeSeats.filter(
    (s) => trumpsInHand(state.hands[s], trump).length > 0,
  )
  const handOver =
    active.length === 0 ||
    ([0, 1, 2, 3] as Seat[]).every(
      (s) => trumpsInHand(state.hands[s], trump).length === 0,
    )

  if (handOver) {
    const allCold = ([0, 1, 2, 3] as Seat[]).map(
      (s) =>
        state.coldRevealed[s] || trumpsInHand(state.hands[s], trump).length === 0,
    ) as [boolean, boolean, boolean, boolean]
    return finishHand({
      ...state,
      dumpPiles,
      currentTrick: [],
      activeSeats: [],
      coldRevealed: allCold,
      purchasedIds: [],
      currentSeat: null,
      trickLeader: null,
    })
  }

  // Next trick leader: winner leads if they still have trumps.
  // Otherwise, turn passes clockwise; reveal cold players only as play order steps past them.
  let leader: Seat = winner
  let coldRevealed = [...state.coldRevealed] as [boolean, boolean, boolean, boolean]
  if (trumpsInHand(state.hands[winner], trump).length === 0) {
    // Winner was supposed to lead but has no trumps -> reveal winner face-up now
    coldRevealed[winner] = true
    let s = nextSeat(winner)
    while (trumpsInHand(state.hands[s], trump).length === 0) {
      // Each passed seat reveals as turn order steps past them
      coldRevealed[s] = true
      s = nextSeat(s)
    }
    leader = s
  }

  const purchasedIds = prunePurchased(
    state.purchasedIds,
    state.hands,
    coldRevealed,
    trump,
  )

  return {
    ...state,
    phase: 'playing',
    dumpPiles,
    currentTrick: [],
    currentSeat: leader,
    trickLeader: leader,
    activeSeats: active,
    coldRevealed,
    purchasedIds,
    message: actorPhrase(state.seats[leader].name, 'leads'),
  }
}

/**
 * Clockwise order of seats that belong in this trick, starting at leader.
 * Include anyone who already played, is marked active, or still holds trumps.
 * (Mid-trick, a seat may have just spent their last trump — they stay via currentTrick.)
 */
function seatsForTrick(state: GameState, leader: Seat): Seat[] {
  const trump = state.trump
  const inTrick = new Set<Seat>()

  for (const p of state.currentTrick) inTrick.add(p.seat)
  for (const s of state.activeSeats) inTrick.add(s)

  if (trump) {
    for (let i = 0; i < 4; i++) {
      const s = i as Seat
      if (trumpsInHand(state.hands[s], trump).length > 0) inTrick.add(s)
    }
  }

  // Leader always heads the order when present
  inTrick.add(leader)

  const order: Seat[] = []
  let s = leader
  for (let i = 0; i < 4; i++) {
    if (inTrick.has(s)) order.push(s)
    s = nextSeat(s)
  }
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

  const historyEntry = {
    bidder,
    bid,
    made: result.made,
    teamPointsTaken: result.teamPointsTaken,
    teamScoreDelta: result.teamScoreDelta,
    scoresAfter: result.scoresAfter,
  }
  const handHistory = [...state.handHistory, historyEntry]

  if (winner !== null) {
    return {
      ...state,
      scores: result.scoresAfter,
      handResult: result,
      handHistory,
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
    handHistory,
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
    gameMode: state.gameMode,
    difficulties: [
      state.seats[1].difficulty ?? 'medium',
      state.seats[2].difficulty ?? 'medium',
      state.seats[3].difficulty ?? 'medium',
    ],
  })
}
