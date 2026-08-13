import {
  canPass,
  legalBids,
  legalPlays,
  type Card,
  type Difficulty,
  type GameState,
  type RiskLevel,
  type Seat,
  type Suit,
  isLeftPedro,
  isRightPedro,
  isScoringTrump,
  isTrump,
  trumpStrength,
  cardPoints,
  trumpsInHand,
} from '../engine'

export type BotAction =
  | { type: 'bid'; bid: number | null }
  | { type: 'trump'; suit: Suit }
  | { type: 'play'; cardId: string }

export function botAct(state: GameState, seat: Seat): BotAction {
  const diff = state.seats[seat].difficulty ?? 'medium'
  if (state.phase === 'bidding' && state.currentSeat === seat) {
    return { type: 'bid', bid: chooseBid(state, seat, diff) }
  }
  if (state.phase === 'choose_trump' && state.bidder === seat) {
    return { type: 'trump', suit: chooseTrump(state, seat, diff) }
  }
  if (state.phase === 'playing' && state.currentSeat === seat) {
    return { type: 'play', cardId: choosePlay(state, seat, diff) }
  }
  throw new Error('Bot has no action')
}

function chooseBid(
  state: GameState,
  seat: Seat,
  diff: Difficulty,
): number | null {
  const legal = legalBids(state)
  const must = !canPass(state)
  if (legal.length === 0 && must) return 6
  if (legal.length === 0) return null

  const hand = state.hands[seat]
  const best = bestSuitStrength(hand)
  const risk: RiskLevel = state.seats[seat].biddingRisk ?? 'medium'

  const high = state.highBid // null if nobody has bid yet

  // Risk configuration:
  // - low: conservative, requires strong hands, avoids overcalls, max 10
  // - medium: balanced, standard calculation, max 12
  // - high: aggressive, low overcall penalty, competes for contract, max 14
  let overcallWeight = 0.85
  let minStrength = 5.8
  let maxBidCap = 12
  let targetOffset = 0

  if (risk === 'low') {
    overcallWeight = 1.3
    minStrength = 7.0
    maxBidCap = 10
    targetOffset = -0.5
  } else if (risk === 'high') {
    overcallWeight = 0.4
    minStrength = 4.8
    maxBidCap = 14
    targetOffset = 0.8
  }

  const overcallPenalty =
    high === null ? 0 : Math.max(0, high - 5) * overcallWeight

  if (diff === 'easy') {
    if (must) return legal[0]
    if (high !== null && risk !== 'high') return null
    if (best.strength >= minStrength && (Math.random() < 0.65 || risk === 'high')) {
      const want = Math.min(maxBidCap, Math.floor(best.strength + targetOffset))
      return pickLegalBid(Math.max(6, want), legal)
    }
    return null
  }

  if (diff === 'medium') {
    if (must) return legal[0]
    let target = Math.floor(best.strength - overcallPenalty + targetOffset)
    if (target < 6 || best.strength < minStrength) return null
    const margin = risk === 'high' ? 0.0 : risk === 'low' ? 2.5 : 1.2
    if (high !== null && best.strength < high + margin) return null
    if (high !== null && target <= high && risk === 'high') target = high + 1
    return pickLegalBid(Math.min(maxBidCap, target), legal)
  }

  // hard
  if (must) return legal[0]
  let target = Math.round(best.strength - overcallPenalty * 0.7 + targetOffset)
  if (target < 6 || best.strength < minStrength) return null
  const margin = risk === 'high' ? 0.0 : risk === 'low' ? 2.0 : 0.7
  if (high !== null && best.strength < high + margin) return null
  if (high !== null && target <= high && risk === 'high') target = high + 1
  return pickLegalBid(Math.min(maxBidCap, target), legal)
}

/**
 * Choose a legal bid <= want. Never returns a bid below the legal minimum
 * (so overcalls always go higher). Returns null -> pass.
 */
function pickLegalBid(want: number, legal: number[]): number | null {
  if (legal.length === 0) return null
  const ok = legal.filter((b) => b <= want)
  if (ok.length) return ok[ok.length - 1]
  // want is below the minimum legal overcall -> pass
  return null
}

function bestSuitStrength(hand: Card[]): { suit: Suit; strength: number } {
  const suits: Suit[] = ['S', 'H', 'D', 'C']
  let best: { suit: Suit; strength: number } = { suit: 'S', strength: -1 }
  for (const suit of suits) {
    const s = evaluateSuit(hand, suit)
    if (s > best.strength) best = { suit, strength: s }
  }
  return best
}

/** Heuristic expected points contribution for naming this trump */
export function evaluateSuit(hand: Card[], trump: Suit): number {
  let score = 0
  let trumpCount = 0
  for (const c of hand) {
    if (!isTrump(c, trump)) continue
    trumpCount++
    if (c.rank === 'A') score += 2.2
    else if (isRightPedro(c, trump) || isLeftPedro(c, trump)) score += 2.5
    else if (c.rank === 'J' || c.rank === '10' || c.rank === '2') score += 1.1
    else if (c.rank === 'K' || c.rank === 'Q') score += 0.7
    else score += 0.35
  }
  // Length bonus (partner may help; stock may add)
  score += Math.max(0, trumpCount - 2) * 0.45
  // Offsuit A can become length after refill — small bonus for voids
  const off = 9 - trumpCount
  if (off >= 5) score += 0.3
  return score
}

function chooseTrump(
  state: GameState,
  seat: Seat,
  _diff: Difficulty,
): Suit {
  return bestSuitStrength(state.hands[seat]).suit
}

function isPedro(card: Card, trump: Suit): boolean {
  return isRightPedro(card, trump) || isLeftPedro(card, trump)
}

/**
 * Smear points to partner when partner's trick win is secure.
 * Prioritizes 5-pt Pedros, then 10/Jack/2, then lowest cards.
 */
function bestSmear(sortedLowToHigh: Card[], trump: Suit): Card {
  // 1. Throw Pedro (5 points)
  const pedros = sortedLowToHigh.filter((c) => isPedro(c, trump))
  if (pedros.length > 0) return pedros[0]

  // 2. Throw other scoring cards (10, J, 2 - 1 point each)
  const scoring = sortedLowToHigh.filter(
    (c) => isScoringTrump(c, trump) && c.rank !== 'A',
  )
  if (scoring.length > 0) {
    return [...scoring].sort(
      (a, b) =>
        cardPoints(b, trump) - cardPoints(a, trump) ||
        trumpStrength(a, trump) - trumpStrength(b, trump),
    )[0]
  }

  // 3. If no scoring cards, throw lowest non-point card
  return sortedLowToHigh[0]
}

/** Lowest-strength card that is safe to lose (never throw a pedro if anything else exists). */
function bestDump(sortedLowToHigh: Card[], trump: Suit): Card {
  // Prefer 0-point non-pedros, then lowest point non-pedro, pedro only if sole option
  const nonPedro = sortedLowToHigh.filter((c) => !isPedro(c, trump))
  if (nonPedro.length) {
    const zero = nonPedro.find((c) => cardPoints(c, trump) === 0)
    if (zero) return zero
    // Must lose a point card — smallest points, then lowest strength
    return [...nonPedro].sort((a, b) => {
      const pd = cardPoints(a, trump) - cardPoints(b, trump)
      if (pd !== 0) return pd
      return trumpStrength(a, trump) - trumpStrength(b, trump)
    })[0]
  }
  // Only pedros left
  return sortedLowToHigh[0]
}

/** All trumps that have already been played in earlier tricks or current trick */
function playedTrumps(state: GameState, trump: Suit): Set<string> {
  const set = new Set<string>()
  for (const trick of state.completedTricks) {
    for (const p of trick) {
      if (isTrump(p.card, trump)) set.add(p.card.id)
    }
  }
  for (const p of state.currentTrick) {
    if (isTrump(p.card, trump)) set.add(p.card.id)
  }
  return set
}

/** Check if a trump card is the highest remaining trump that could still be in an opponent's hand */
function isBossTrump(card: Card, state: GameState, seat: Seat, trump: Suit): boolean {
  const cardStr = trumpStrength(card, trump)
  const fallen = playedTrumps(state, trump)
  const myHand = new Set(state.hands[seat].map((c) => c.id))

  const leftPedroSuit: Suit =
    trump === 'S' ? 'C' : trump === 'C' ? 'S' : trump === 'H' ? 'D' : 'H'

  const allTrumpCards: Card[] = [
    { rank: 'A', suit: trump, id: `${trump}-A` },
    { rank: 'K', suit: trump, id: `${trump}-K` },
    { rank: 'Q', suit: trump, id: `${trump}-Q` },
    { rank: 'J', suit: trump, id: `${trump}-J` },
    { rank: '10', suit: trump, id: `${trump}-10` },
    { rank: '9', suit: trump, id: `${trump}-9` },
    { rank: '8', suit: trump, id: `${trump}-8` },
    { rank: '7', suit: trump, id: `${trump}-7` },
    { rank: '6', suit: trump, id: `${trump}-6` },
    { rank: '5', suit: trump, id: `${trump}-5` },
    { rank: '5', suit: leftPedroSuit, id: `${leftPedroSuit}-5` },
    { rank: '4', suit: trump, id: `${trump}-4` },
    { rank: '3', suit: trump, id: `${trump}-3` },
    { rank: '2', suit: trump, id: `${trump}-2` },
  ]

  for (const t of allTrumpCards) {
    if (trumpStrength(t, trump) > cardStr) {
      if (!fallen.has(t.id) && !myHand.has(t.id)) {
        return false
      }
    }
  }
  return true
}

/** Cheapest card that currently beats `beating` (sorted low->high). */
function cheapestWinner(
  sortedLowToHigh: Card[],
  beating: Card,
  trump: Suit,
): Card | null {
  const winners = sortedLowToHigh.filter(
    (c) => trumpStrength(c, trump) > trumpStrength(beating, trump),
  )
  return winners[0] ?? null
}

function choosePlay(
  state: GameState,
  seat: Seat,
  diff: Difficulty,
): string {
  const legal = legalPlays(state, seat)
  if (legal.length === 0) throw new Error('No legal plays')
  const trump = state.trump!
  // Low -> high trump strength
  const sorted = [...legal].sort(
    (a, b) => trumpStrength(a, trump) - trumpStrength(b, trump),
  )

  if (sorted.length === 1) return sorted[0].id

  const trick = state.currentTrick
  const partner = ((seat + 2) % 4) as Seat

  // —— Lead ——
  if (trick.length === 0) {
    return chooseLead(sorted, state, seat, trump, diff).id
  }

  // Current winner on the table
  let winning = trick[0]
  for (const p of trick) {
    if (trumpStrength(p.card, trump) > trumpStrength(winning.card, trump)) {
      winning = p
    }
  }
  const partnerWinning = winning.seat === partner
  const pointsInTrick = trick.reduce(
    (sum, p) => sum + cardPoints(p.card, trump),
    0,
  )
  const pedroInTrick = trick.some((p) => isPedro(p.card, trump))
  const win = cheapestWinner(sorted, winning.card, trump)

  const played = new Set(trick.map((p) => p.seat))
  const othersLeft = state.activeSeats.filter(
    (s) => !played.has(s) && s !== seat,
  )
  const lastToPlay = othersLeft.length === 0
  const opponentsBehind = othersLeft.some((s) => s % 2 !== seat % 2)

  // —— Partner already winning ——
  if (partnerWinning) {
    const isAce = winning.card.rank === 'A' && isTrump(winning.card, trump)
    const isBoss = isBossTrump(winning.card, state, seat, trump)

    // Smear points (Pedros first!) if partner's win is secure:
    // - Partner played the Ace of trump
    // - Partner's card is boss (highest remaining trump)
    // - We are last to play in the trick
    // - No opponents remain behind us in this trick
    const partnerSafe = isAce || isBoss || lastToPlay || !opponentsBehind

    if (partnerSafe) {
      return bestSmear(sorted, trump).id
    }

    // Partner is winning but an opponent behind could beat it: safely dump non-pedro trash
    return bestDump(sorted, trump).id
  }

  // —— Opponent is winning ——
  const opponentBoss = isBossTrump(winning.card, state, seat, trump)

  // If opponent's card is boss (unbeatable) or we cannot beat it:
  // ALL player levels must recognize this and protect Pedros and value cards by dumping lowest trash!
  if (opponentBoss || !win) {
    return bestDump(sorted, trump).id
  }

  // —— We can beat opponent's winning card (win is non-null and opponent is not boss) ——
  // Never spend a pedro to win a worthless trick unless last to play or necessary — dump instead
  if (isPedro(win, trump) && pointsInTrick === 0 && !pedroInTrick) {
    const nonPedroWin = sorted.find(
      (c) =>
        !isPedro(c, trump) &&
        trumpStrength(c, trump) > trumpStrength(winning.card, trump),
    )
    if (nonPedroWin) return nonPedroWin.id
    if (!lastToPlay) return bestDump(sorted, trump).id
  }

  // Prefer a non-pedro winner when the cheapest winner is a pedro
  if (isPedro(win, trump)) {
    const nonPedroWin = sorted.find(
      (c) =>
        !isPedro(c, trump) &&
        trumpStrength(c, trump) > trumpStrength(winning.card, trump),
    )
    if (nonPedroWin) return nonPedroWin.id
  }

  // Take when points/pedro at stake, when last to play, or when winning cheaply
  const valuable = pedroInTrick || pointsInTrick >= 1
  const cheapNonPedro = !isPedro(win, trump) && cardPoints(win, trump) <= 1
  if (valuable || lastToPlay || cheapNonPedro || diff === 'hard') {
    return win.id
  }

  if (diff === 'easy' && Math.random() < 0.6) {
    return win.id
  }

  return bestDump(sorted, trump).id
}

function chooseLead(
  sortedLowToHigh: Card[],
  state: GameState,
  seat: Seat,
  trump: Suit,
  diff: Difficulty,
): Card {
  // 1. Boss trump (Ace, or King when Ace has fallen, etc.) across ALL player levels:
  // Pulls remaining trumps and gives partner a guaranteed opportunity to smear Pedro!
  const boss = sortedLowToHigh.find(
    (c) => !isPedro(c, trump) && isBossTrump(c, state, seat, trump),
  )
  if (boss) return boss

  // 2. On Hard: lead King if we have length to draw out opposing high cards
  if (diff === 'hard' && sortedLowToHigh.length >= 3) {
    const king = sortedLowToHigh.find((c) => c.rank === 'K')
    if (king) return king
  }

  // 3. Never lead a Pedro or value card into the dark if we have safe low trumps
  return bestDump(sortedLowToHigh, trump)
}

/** Expose for tests */
export function _testEval(hand: Card[], suit: Suit) {
  return evaluateSuit(hand, suit)
}

export function countTrumps(hand: Card[], trump: Suit) {
  return trumpsInHand(hand, trump).length
}
