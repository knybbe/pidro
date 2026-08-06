import type { Card, Rank, Seat, Suit } from './types'

export const MIN_BID = 6
export const MAX_BID = 14
export const HAND_SIZE_AFTER_DISCARD = 6
export const DEAL_SIZE = 9
export const DEFAULT_TARGET = 62
export const POINTS_IN_PACK = 14

const RED: Suit[] = ['H', 'D']
const BLACK: Suit[] = ['S', 'C']

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D'
}

export function sameColor(a: Suit, b: Suit): boolean {
  return isRed(a) === isRed(b)
}

/** The off-suit (left) pedro suit for a given trump */
export function leftPedroSuit(trump: Suit): Suit {
  if (trump === 'H') return 'D'
  if (trump === 'D') return 'H'
  if (trump === 'S') return 'C'
  return 'S'
}

export function isLeftPedro(card: Card, trump: Suit): boolean {
  return card.rank === '5' && card.suit === leftPedroSuit(trump)
}

export function isRightPedro(card: Card, trump: Suit): boolean {
  return card.rank === '5' && card.suit === trump
}

export function isTrump(card: Card, trump: Suit): boolean {
  return card.suit === trump || isLeftPedro(card, trump)
}

/**
 * Trump rank high→low: A K Q J 10 9 8 7 6 right5 left5 4 3 2
 * Higher number = stronger card.
 */
export function trumpStrength(card: Card, trump: Suit): number {
  if (!isTrump(card, trump)) return -1
  if (isLeftPedro(card, trump)) return 3
  const map: Record<Rank, number> = {
    '2': 0,
    '3': 1,
    '4': 2,
    '5': 4, // right pedro
    '6': 5,
    '7': 6,
    '8': 7,
    '9': 8,
    '10': 9,
    J: 10,
    Q: 11,
    K: 12,
    A: 13,
  }
  return map[card.rank]
}

/** Point value of a card when trump is known (0 if not a scoring trump) */
export function cardPoints(card: Card, trump: Suit): number {
  if (!isTrump(card, trump)) return 0
  if (card.rank === 'A') return 1
  if (card.rank === 'J') return 1
  if (card.rank === '10') return 1
  if (card.rank === '2') return 1
  if (card.rank === '5') return 5 // both pedros
  return 0
}

export function isScoringTrump(card: Card, trump: Suit): boolean {
  return cardPoints(card, trump) > 0
}

export function sortTrumps(cards: Card[], trump: Suit): Card[] {
  return [...cards].sort(
    (a, b) => trumpStrength(b, trump) - trumpStrength(a, trump),
  )
}

/** Suit display order: spades, clubs, hearts, diamonds */
export const SUIT_ORDER: Suit[] = ['S', 'C', 'H', 'D']

const SUIT_ORDER_INDEX: Record<Suit, number> = {
  S: 0,
  C: 1,
  H: 2,
  D: 3,
}

/** Natural rank high → low (A high … 2 low), used for non-trump display order */
const RANK_HIGH_TO_LOW: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
}

/**
 * Sort hand for display:
 * - If trump is known: all trumps first (high→low, left pedro in rank), then
 *   remaining suits in ♠ ♣ ♥ ♦ order, each high→low.
 * - If no trump: suits ♠ ♣ ♥ ♦, each high→low.
 */
export function sortHand(cards: Card[], trump: Suit | null): Card[] {
  return [...cards].sort((a, b) => {
    if (trump) {
      const aT = isTrump(a, trump)
      const bT = isTrump(b, trump)
      if (aT && bT) return trumpStrength(b, trump) - trumpStrength(a, trump)
      if (aT !== bT) return aT ? -1 : 1
    }
    const suitDiff = SUIT_ORDER_INDEX[a.suit] - SUIT_ORDER_INDEX[b.suit]
    if (suitDiff !== 0) return suitDiff
    return RANK_HIGH_TO_LOW[b.rank] - RANK_HIGH_TO_LOW[a.rank]
  })
}

/** Display group key for a card (trumps share one group when trump is set). */
export function handGroupKey(card: Card, trump: Suit | null): string {
  if (trump && isTrump(card, trump)) return `T:${trump}`
  return card.suit
}

/**
 * Sort then split into suit/trump groups for spaced hand layout.
 * Order: trumps (if any), then ♠ ♣ ♥ ♦.
 */
export function groupHand(cards: Card[], trump: Suit | null): Card[][] {
  const sorted = sortHand(cards, trump)
  const groups: Card[][] = []
  let currentKey: string | null = null
  let bucket: Card[] = []
  for (const c of sorted) {
    const key = handGroupKey(c, trump)
    if (currentKey === null) {
      currentKey = key
      bucket = [c]
    } else if (key === currentKey) {
      bucket.push(c)
    } else {
      groups.push(bucket)
      currentKey = key
      bucket = [c]
    }
  }
  if (bucket.length) groups.push(bucket)
  return groups
}

export function trumpsInHand(hand: Card[], trump: Suit): Card[] {
  return hand.filter((c) => isTrump(c, trump))
}

export function nonTrumpsInHand(hand: Card[], trump: Suit): Card[] {
  return hand.filter((c) => !isTrump(c, trump))
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat
}

export function suitSymbol(suit: Suit): string {
  const m: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
  return m[suit]
}

export function suitName(suit: Suit): string {
  const m: Record<Suit, string> = {
    S: 'Spades',
    H: 'Hearts',
    D: 'Diamonds',
    C: 'Clubs',
  }
  return m[suit]
}

export function suitColorClass(suit: Suit): 'red' | 'black' {
  return isRed(suit) ? 'red' : 'black'
}

export { RED, BLACK }
