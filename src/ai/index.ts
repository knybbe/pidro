import {
  canPass,
  legalBids,
  legalPlays,
  type Card,
  type Difficulty,
  type GameState,
  type Seat,
  type Suit,
  isLeftPedro,
  isRightPedro,
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

  const high = state.highBid // null if nobody has bid yet
  // Need this much "extra" strength to overcall an existing high bid
  const overcallPenalty = high === null ? 0 : Math.max(0, high - 5) * 0.85

  if (diff === 'easy') {
    if (must) return legal[0]
    // Often pass; occasional weak bid only if nothing is on the table yet
    if (high !== null) return null
    if (best.strength >= 5.5 && Math.random() < 0.4) {
      return pickLegalBid(6 + Math.floor(Math.random() * 2), legal)
    }
    return null
  }

  if (diff === 'medium') {
    if (must) return legal[0]
    const target = Math.floor(best.strength - overcallPenalty)
    if (target < 6) return null
    // Prefer pass rather than stretching past comfortable range
    if (high !== null && best.strength < high + 1.5) return null
    return pickLegalBid(Math.min(11, target), legal)
  }

  // hard
  if (must) return legal[0]
  const target = Math.round(best.strength - overcallPenalty * 0.6)
  if (target < 6) return null
  if (high !== null && best.strength < high + 0.8) return null
  return pickLegalBid(Math.min(12, target), legal)
}

/**
 * Choose a legal bid ≤ want. Never returns a bid below the legal minimum
 * (so overcalls always go higher). Returns null → pass.
 */
function pickLegalBid(want: number, legal: number[]): number | null {
  if (legal.length === 0) return null
  const ok = legal.filter((b) => b <= want)
  if (ok.length) return ok[ok.length - 1]
  // want is below the minimum legal overcall → pass
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

/** Cheapest card that currently beats `beating` (sorted low→high). */
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
  // Low → high trump strength
  const sorted = [...legal].sort(
    (a, b) => trumpStrength(a, trump) - trumpStrength(b, trump),
  )

  if (sorted.length === 1) return sorted[0].id

  const trick = state.currentTrick
  const partner = ((seat + 2) % 4) as Seat

  // —— Lead ——
  if (trick.length === 0) {
    return chooseLead(sorted, trump, diff).id
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

  // —— Partner already winning: never overtrump; dump junk ——
  // (Hard used to always "needWin" and climb over partner.)
  if (partnerWinning) {
    return bestDump(sorted, trump).id
  }

  // —— We can take the trick ——
  if (win) {
    // Never spend a pedro to win a worthless trick — dump instead
    if (isPedro(win, trump) && pointsInTrick === 0 && !pedroInTrick) {
      const nonPedroWin = sorted.find(
        (c) =>
          !isPedro(c, trump) &&
          trumpStrength(c, trump) > trumpStrength(winning.card, trump),
      )
      if (nonPedroWin) return nonPedroWin.id
      return bestDump(sorted, trump).id
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

    // Easy: take when points/pedro at stake or last; otherwise often dump
    if (diff === 'easy') {
      if (pedroInTrick || pointsInTrick >= 2 || lastToPlay) return win.id
      if (!isPedro(win, trump) && Math.random() < 0.55) return win.id
      return bestDump(sorted, trump).id
    }

    // Medium / hard: take valuable tricks, free wins, or when last to play
    const valuable = pedroInTrick || pointsInTrick >= 1
    const cheapNonPedro = !isPedro(win, trump) && cardPoints(win, trump) <= 1
    if (valuable || lastToPlay || cheapNonPedro || diff === 'hard') {
      return win.id
    }
    return bestDump(sorted, trump).id
  }

  // —— Cannot beat current winner: never gift a pedro or high points ——
  return bestDump(sorted, trump).id
}

function chooseLead(
  sortedLowToHigh: Card[],
  trump: Suit,
  diff: Difficulty,
): Card {
  // Easy: lead low non-point
  if (diff === 'easy') {
    return bestDump(sortedLowToHigh, trump)
  }
  const ace = sortedLowToHigh.find((c) => c.rank === 'A')
  if (ace) return ace
  if (diff === 'hard') {
    const king = sortedLowToHigh.find((c) => c.rank === 'K')
    if (king) return king
  }
  // Low non-point, never lead pedro if anything else exists
  return bestDump(sortedLowToHigh, trump)
}

/** Expose for tests */
export function _testEval(hand: Card[], suit: Suit) {
  return evaluateSuit(hand, suit)
}

export function countTrumps(hand: Card[], trump: Suit) {
  return trumpsInHand(hand, trump).length
}
