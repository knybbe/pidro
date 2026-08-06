import { describe, expect, it } from 'vitest'
import { makeCard } from './deck'
import {
  canPass,
  chooseTrump,
  createLobbyState,
  dealHand,
  legalBids,
  legalPlays,
  nextHand,
  placeBid,
  playCard,
  startMatch,
  trickWinner,
} from './game'
import {
  cardPoints,
  isLeftPedro,
  isTrump,
  leftPedroSuit,
  POINTS_IN_PACK,
  sortHand,
  trumpStrength,
} from './rules'
import { matchWinner, scoreHand } from './score'
import type { Suit } from './types'

describe('rules', () => {
  it('left pedro is opposite same-color 5', () => {
    expect(leftPedroSuit('H')).toBe('D')
    expect(leftPedroSuit('D')).toBe('H')
    expect(leftPedroSuit('S')).toBe('C')
    expect(leftPedroSuit('C')).toBe('S')
  })

  it('left pedro counts as trump', () => {
    const left = makeCard('D', '5')
    expect(isLeftPedro(left, 'H')).toBe(true)
    expect(isTrump(left, 'H')).toBe(true)
    expect(isTrump(makeCard('C', '5'), 'H')).toBe(false)
  })

  it('trump ranking: right 5 beats left 5 beats 4', () => {
    const trump: Suit = 'S'
    const right = makeCard('S', '5')
    const left = makeCard('C', '5')
    const four = makeCard('S', '4')
    expect(trumpStrength(right, trump)).toBeGreaterThan(
      trumpStrength(left, trump),
    )
    expect(trumpStrength(left, trump)).toBeGreaterThan(
      trumpStrength(four, trump),
    )
  })

  it('point cards total 14', () => {
    const trump: Suit = 'H'
    const cards = [
      makeCard('H', 'A'),
      makeCard('H', 'J'),
      makeCard('H', '10'),
      makeCard('H', '5'),
      makeCard('D', '5'),
      makeCard('H', '2'),
    ]
    const total = cards.reduce((s, c) => s + cardPoints(c, trump), 0)
    expect(total).toBe(POINTS_IN_PACK)
  })

  it('sortHand: suits ♠♥♣♦ and high→low within suit', () => {
    const hand = [
      makeCard('C', '2'),
      makeCard('S', '3'),
      makeCard('H', 'A'),
      makeCard('S', 'K'),
      makeCard('D', '10'),
      makeCard('H', '5'),
    ]
    const sorted = sortHand(hand, null).map((c) => c.id)
    expect(sorted).toEqual(['S-K', 'S-3', 'H-A', 'H-5', 'C-2', 'D-10'])
  })
})

describe('scoring', () => {
  it('made bid scores points taken; opponents always score', () => {
    const r = scoreHand({
      bid: 7,
      bidder: 0,
      pointsTaken: [8, 6],
      scoresBefore: [10, 10],
    })
    expect(r.made).toBe(true)
    expect(r.teamScoreDelta).toEqual([8, 6])
    expect(r.scoresAfter).toEqual([18, 16])
  })

  it('set subtracts bid from bidding team', () => {
    const r = scoreHand({
      bid: 8,
      bidder: 1,
      pointsTaken: [9, 5],
      scoresBefore: [20, 20],
    })
    // bidder team 1 took 5 < 8 → -8; team 0 gets 9
    expect(r.made).toBe(false)
    expect(r.teamScoreDelta).toEqual([9, -8])
    expect(r.scoresAfter).toEqual([29, 12])
  })

  it('both over 62 → bidding team wins', () => {
    expect(matchWinner([65, 63], 1, 62)).toBe(1)
    expect(matchWinner([65, 63], 0, 62)).toBe(0)
    expect(matchWinner([62, 50], 1, 62)).toBe(0)
    expect(matchWinner([50, 50], 0, 62)).toBe(null)
  })
})

describe('bidding', () => {
  it('forced dealer bid 6 when all pass', () => {
    let s = startMatch(createLobbyState(42), { seed: 42 })
    // seats: current is left of dealer 0 → seat 1
    expect(s.currentSeat).toBe(1)
    s = placeBid(s, 1, null)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    expect(s.currentSeat).toBe(0)
    expect(canPass(s)).toBe(false)
    expect(legalBids(s)).toEqual([6])
    s = placeBid(s, 0, 6)
    expect(s.phase).toBe('choose_trump')
    expect(s.bidder).toBe(0)
    expect(s.highBid).toBe(6)
  })

  it('must overcall previous bid', () => {
    let s = startMatch(createLobbyState(1), { seed: 1 })
    s = placeBid(s, 1, 7)
    expect(legalBids(s)[0]).toBe(8)
    expect(legalBids(s)).not.toContain(7)
    expect(legalBids(s)).not.toContain(6)
    expect(() => placeBid(s, 2, 7)).toThrow()
    expect(() => placeBid(s, 2, 6)).toThrow()
    s = placeBid(s, 2, null) // pass ok
    expect(s.bids[s.bids.length - 1]).toEqual({ seat: 2, bid: null })
    s = placeBid(s, 3, 9)
    expect(s.highBid).toBe(9)
    expect(s.bidder).toBe(3)
  })

  it('records each seat bid or pass', () => {
    let s = startMatch(createLobbyState(2), { seed: 2 })
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, 8)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    expect(s.bids).toEqual([
      { seat: 1, bid: 6 },
      { seat: 2, bid: 8 },
      { seat: 3, bid: null },
      { seat: 0, bid: null },
    ])
    expect(s.highBid).toBe(8)
    expect(s.bidder).toBe(2)
  })
})

describe('play', () => {
  it('trick winner is highest trump', () => {
    const trump: Suit = 'H'
    const winner = trickWinner(
      [
        { seat: 0, card: makeCard('H', '9') },
        { seat: 1, card: makeCard('D', '5') }, // left pedro
        { seat: 2, card: makeCard('H', 'K') },
      ],
      trump,
    )
    expect(winner).toBe(2)
  })

  it('full hand advances to hand_result or continues', () => {
    let s = startMatch(createLobbyState(99), { seed: 99 })
    // Bid high and play out with scripted bots simplified: force bid + trump + play all
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    expect(s.phase).toBe('choose_trump')
    s = chooseTrump(s, 1, 'S')
    expect(s.phase).toBe('playing')
    expect(s.trump).toBe('S')

    // Play until hand ends (safety cap)
    let guard = 0
    while (s.phase === 'playing' && guard++ < 200) {
      const seat = s.currentSeat!
      const legal = legalPlays(s, seat)
      expect(legal.length).toBeGreaterThan(0)
      s = playCard(s, seat, legal[0].id)
    }
    expect(['hand_result', 'game_over']).toContain(s.phase)
    expect(s.handResult).not.toBeNull()
    // Points taken (excluding double-count of low) should be sensible
    const taken =
      s.handResult!.teamPointsTaken[0] + s.handResult!.teamPointsTaken[1]
    expect(taken).toBeGreaterThanOrEqual(0)
    expect(taken).toBeLessThanOrEqual(14)
  })

  it('nextHand rotates dealer', () => {
    let s = startMatch(createLobbyState(7), { seed: 7 })
    const d0 = s.dealer
    // fast-forward one hand
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    s = chooseTrump(s, 1, 'H')
    let guard = 0
    while (s.phase === 'playing' && guard++ < 200) {
      const seat = s.currentSeat!
      s = playCard(s, seat, legalPlays(s, seat)[0].id)
    }
    if (s.phase === 'hand_result') {
      s = nextHand(s)
      expect(s.dealer).toBe(((d0 + 1) % 4) as 0 | 1 | 2 | 3)
      expect(s.phase).toBe('bidding')
    }
  })
})

describe('deal', () => {
  it('deals 9 cards each and 16 stock', () => {
    const s = dealHand(createLobbyState(5), 0)
    expect(s.hands.every((h) => h.length === 9)).toBe(true)
    expect(s.stock.length).toBe(16)
  })
})
