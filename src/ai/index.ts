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

function choosePlay(
  state: GameState,
  seat: Seat,
  diff: Difficulty,
): string {
  const legal = legalPlays(state, seat)
  if (legal.length === 0) throw new Error('No legal plays')
  const trump = state.trump!
  const sorted = [...legal].sort(
    (a, b) => trumpStrength(a, trump) - trumpStrength(b, trump),
  )

  if (diff === 'easy') {
    // Prefer dumping low non-points
    const nonPoints = sorted.filter((c) => cardPoints(c, trump) === 0)
    const pool = nonPoints.length ? nonPoints : sorted
    return pool[Math.floor(Math.random() * pool.length)].id
  }

  const trick = state.currentTrick
  const partner = ((seat + 2) % 4) as Seat

  if (trick.length === 0) {
    // Lead: high if we have A/K, else low non-point, else lowest
    const ace = sorted.find((c) => c.rank === 'A')
    if (ace) return ace.id
    const king = sorted.find((c) => c.rank === 'K')
    if (king && diff === 'hard') return king.id
    const lowNon = sorted.find((c) => cardPoints(c, trump) === 0)
    return (lowNon ?? sorted[0]).id
  }

  // Find current winning play
  let winning = trick[0]
  for (const p of trick) {
    if (trumpStrength(p.card, trump) > trumpStrength(winning.card, trump)) {
      winning = p
    }
  }
  const partnerWinning = winning.seat === partner
  const pointsInTrick = trick.reduce(
    (sum, p) =>
      sum +
      (p.card.rank === '2' ? 0 : cardPoints(p.card, trump)),
    0,
  )
  const hasPedro =
    trick.some((p) => isRightPedro(p.card, trump) || isLeftPedro(p.card, trump))

  if (partnerWinning && !hasPedro && pointsInTrick <= 1) {
    // Dump lowest non-point (medium/hard already left easy path above)
    const dump = sorted.find((c) => cardPoints(c, trump) === 0) ?? sorted[0]
    return dump.id
  }

  // Try to win if points or pedro at stake, or partner not winning
  const needWin = !partnerWinning || hasPedro || pointsInTrick >= 2 || diff === 'hard'
  if (needWin) {
    const winners = sorted.filter(
      (c) => trumpStrength(c, trump) > trumpStrength(winning.card, trump),
    )
    if (winners.length) {
      // Win as cheaply as possible
      if (hasPedro || pointsInTrick >= 5) {
        // ensure win, maybe high if last to play
        return winners[0].id
      }
      return winners[0].id
    }
  }

  // Cannot win or don't need to — dump lowest, avoid giving points if possible
  const dump = sorted.find((c) => cardPoints(c, trump) === 0) ?? sorted[0]
  // If we must lose a point card, lose smallest
  if (cardPoints(dump, trump) > 0 && sorted.length > 1) {
    const pts = sorted.filter((c) => cardPoints(c, trump) > 0)
    pts.sort((a, b) => cardPoints(a, trump) - cardPoints(b, trump))
    // Prefer not dumping pedro
    const nonPedro = pts.find(
      (c) => !isRightPedro(c, trump) && !isLeftPedro(c, trump),
    )
    return (nonPedro ?? dump).id
  }
  return dump.id
}

/** Expose for tests */
export function _testEval(hand: Card[], suit: Suit) {
  return evaluateSuit(hand, suit)
}

export function countTrumps(hand: Card[], trump: Suit) {
  return trumpsInHand(hand, trump).length
}
