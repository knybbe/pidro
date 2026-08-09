import { describe, expect, it } from 'vitest'
import { makeCard } from './deck'
import {
  canPass,
  chooseTrump,
  continueAfterTrick,
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
  trumpsInHand,
  trumpStrength,
} from './rules'
import { matchWinner, scoreHand } from './score'
import type { Seat, Suit } from './types'
import { teamOf } from './types'

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

  it('sortHand: suits ♠♣♥♦ and high→low within suit', () => {
    const hand = [
      makeCard('C', '2'),
      makeCard('S', '3'),
      makeCard('H', 'A'),
      makeCard('S', 'K'),
      makeCard('D', '10'),
      makeCard('H', '5'),
    ]
    const sorted = sortHand(hand, null).map((c) => c.id)
    expect(sorted).toEqual(['S-K', 'S-3', 'C-2', 'H-A', 'H-5', 'D-10'])
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
  it('last player with trumps still plays them out one by one', () => {
    // Only seat 0 has trumps left; others empty. Seat 0 must lead each solo trick.
    let s = startMatch(createLobbyState(1), { seed: 1 })
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    s = chooseTrump(s, 1, 'H')
    // Force solo endgame: only human has trumps
    const trump = 'H' as Suit
    const solo = [
      makeCard('H', 'A'),
      makeCard('H', 'K'),
      makeCard('H', 'Q'),
    ]
    const hands = [
      solo,
      [makeCard('S', '9')],
      [makeCard('D', '9')],
      [makeCard('C', '9')],
    ] as typeof s.hands
    s = {
      ...s,
      trump,
      hands,
      activeSeats: [0],
      coldRevealed: [false, false, false, false],
      currentSeat: 0,
      trickLeader: 0,
      currentTrick: [],
      completedTricks: [],
      phase: 'playing',
    }
    // Play first solo card — must not end the hand yet
    s = playCard(s, 0, solo[0].id)
    expect(s.phase).toBe('trick_pause')
    expect(trumpsInHand(s.hands[0], trump).length).toBe(2)
    s = continueAfterTrick(s)
    expect(s.phase).toBe('playing')
    expect(s.currentSeat).toBe(0)
    // Remaining two cards also play out
    s = playCard(s, 0, s.hands[0].find((c) => c.rank === 'K')!.id)
    expect(s.phase).toBe('trick_pause')
    s = continueAfterTrick(s)
    s = playCard(s, 0, s.hands[0][0].id)
    expect(['trick_pause', 'hand_result', 'game_over']).toContain(s.phase)
  })

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

  it('defender with a singleton trump must play it on the opening trick', () => {
    let s = startMatch(createLobbyState(42), { seed: 42 })
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    expect(s.bidder).toBe(1)
    s = chooseTrump(s, 1, 'S')
    expect(s.phase).toBe('playing')
    expect(s.trump).toBe('S')

    // Force a defending seat (0, same team as 2) to hold exactly one trump
    const def: Seat = 0
    expect(teamOf(def)).not.toBe(teamOf(s.bidder!))
    const keepTrump = makeCard('S', '8')
    const hands = s.hands.map((h) => [...h]) as typeof s.hands
    hands[def] = [keepTrump, makeCard('H', '9'), makeCard('D', '9')]
    s = {
      ...s,
      hands,
      activeSeats: ([0, 1, 2, 3] as Seat[]).filter(
        (seat) => trumpsInHand(hands[seat], 'S').length > 0,
      ),
      currentTrick: [],
      completedTricks: [],
      currentSeat: def,
      trickLeader: s.bidder,
    }

    const legal = legalPlays(s, def)
    expect(legal).toHaveLength(1)
    expect(legal[0].id).toBe(keepTrump.id)
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

    // Play until hand ends (safety cap); auto-continue after each trick pause
    let guard = 0
    while (
      (s.phase === 'playing' || s.phase === 'trick_pause') &&
      guard++ < 400
    ) {
      if (s.phase === 'trick_pause') {
        expect(s.currentTrick.length).toBeGreaterThan(0)
        s = continueAfterTrick(s)
        continue
      }
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

  it('human bidder can choose trump by suit', () => {
    let s = startMatch(createLobbyState(3), { seed: 3 })
    // Force seat 0 (dealer) to win: others pass, dealer forced or bids
    // seats bid order left of dealer: if dealer=0, order 1,2,3,0
    s = placeBid(s, 1, null)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, 6)
    expect(s.phase).toBe('choose_trump')
    expect(s.bidder).toBe(0)
    const suit = s.hands[0][0].suit
    s = chooseTrump(s, 0, suit)
    expect(s.phase).toBe('playing')
    expect(s.trump).toBe(suit)
    expect(s.dumpPiles).toBeDefined()
    expect(s.dumpPiles.length).toBe(4)
  })

  it('pauses after each completed trick until continue', () => {
    let s = startMatch(createLobbyState(11), { seed: 11 })
    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)
    s = chooseTrump(s, 1, 'H')
    let guard = 0
    while (s.phase === 'playing' && guard++ < 40) {
      const seat = s.currentSeat!
      s = playCard(s, seat, legalPlays(s, seat)[0].id)
    }
    if (s.phase === 'trick_pause') {
      const n = s.currentTrick.length
      expect(n).toBeGreaterThan(0)
      s = continueAfterTrick(s)
      expect(s.phase).toBe('playing')
      expect(s.currentTrick).toEqual([])
      expect(s.currentSeat).not.toBeNull()
    }
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
    while (
      (s.phase === 'playing' || s.phase === 'trick_pause') &&
      guard++ < 400
    ) {
      if (s.phase === 'trick_pause') {
        s = continueAfterTrick(s)
        continue
      }
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

describe('Kokkola mode', () => {
  it('deals +4 after bidding then chooses trump without stock refill', () => {
    let s = startMatch(createLobbyState(21, undefined, 'kokkola'), {
      seed: 21,
      gameMode: 'kokkola',
    })
    expect(s.gameMode).toBe('kokkola')
    expect(s.hands.every((h) => h.length === 9)).toBe(true)
    expect(s.stock.length).toBe(16)

    s = placeBid(s, 1, 6)
    s = placeBid(s, 2, null)
    s = placeBid(s, 3, null)
    s = placeBid(s, 0, null)

    expect(s.phase).toBe('choose_trump')
    expect(s.hands.every((h) => h.length === 13)).toBe(true)
    expect(s.stock.length).toBe(0)

    s = chooseTrump(s, 1, 'H')
    expect(s.phase).toBe('playing')
    expect(s.trump).toBe('H')
    // No purchase refill in Kokkola
    expect(s.purchasedIds).toEqual([])
    // Everyone has at most 6 (trumps only)
    for (const h of s.hands) {
      expect(h.length).toBeLessThanOrEqual(6)
    }
    // Dumps received non-trumps
    const dumpTotal = s.dumpPiles.reduce((n, p) => n + p.length, 0)
    expect(dumpTotal).toBeGreaterThan(0)
  })
})
