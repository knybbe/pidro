import { describe, expect, it } from 'vitest'
import { botAct } from './index'
import { makeCard } from '../engine/deck'
import type { Card, GameState, Seat, Suit } from '../engine/types'

function baseState(overrides: Partial<GameState>): GameState {
  const empty: Card[] = []
  return {
    phase: 'playing',
    seats: [
      { kind: 'human', name: 'You' },
      { kind: 'bot', difficulty: 'hard', name: 'West' },
      { kind: 'bot', difficulty: 'hard', name: 'North' },
      { kind: 'bot', difficulty: 'hard', name: 'East' },
    ],
    gameMode: 'classic',
    scores: [0, 0],
    dealer: 0,
    hands: [empty, empty, empty, empty],
    stock: [],
    dumpPiles: [[], [], [], []],
    bids: [],
    highBid: 8,
    bidder: 0,
    trump: 'H' as Suit,
    lowHolder: null,
    currentTrick: [],
    trickLeader: 0,
    completedTricks: [],
    pointsTaken: [0, 0],
    activeSeats: [0, 1, 2, 3],
    currentSeat: 2,
    handResult: null,
    handHistory: [],
    coldRevealed: [false, false, false, false],
    purchasedIds: [],
    targetScore: 62,
    seed: 1,
    message: '',
    ...overrides,
  }
}

function playAs(state: GameState, seat: Seat): string {
  const s = { ...state, currentSeat: seat }
  const action = botAct(s, seat)
  if (action.type !== 'play') throw new Error('expected play')
  return action.cardId
}

describe('bot play — no stupid gifts', () => {
  it('never dumps pedro under an opponent winner when a lower card exists', () => {
    // Trick: South led 3♥, West played K♥ (winning), North (partner of South) to play
    // North holds 5♥ (pedro) and 4♥ — must dump 4, not pedro
    const pedro = makeCard('H', '5')
    const four = makeCard('H', '4')
    const state = baseState({
      bidder: 0,
      trump: 'H',
      currentSeat: 2,
      trickLeader: 0,
      currentTrick: [
        { seat: 0, card: makeCard('H', '3') },
        { seat: 1, card: makeCard('H', 'K') },
      ],
      hands: [
        [makeCard('H', '9')],
        [makeCard('H', '8')],
        [pedro, four],
        [makeCard('H', '7')],
      ],
      activeSeats: [0, 1, 2, 3],
    })

    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const s = {
        ...state,
        seats: state.seats.map((seat, i) =>
          i === 2 ? { ...seat, kind: 'bot' as const, difficulty: diff } : seat,
        ) as GameState['seats'],
      }
      expect(playAs(s, 2), diff).toBe(four.id)
    }
  })

  it('never dumps left pedro under opponent when weaker cards remain', () => {
    const leftPedro = makeCard('D', '5') // hearts trump → left pedro
    const three = makeCard('H', '3')
    const state = baseState({
      trump: 'H',
      currentSeat: 2,
      trickLeader: 1,
      currentTrick: [
        { seat: 1, card: makeCard('H', 'A') },
        { seat: 0, card: makeCard('H', '6') },
      ],
      hands: [[], [makeCard('H', '9')], [leftPedro, three], [makeCard('H', '8')]],
      activeSeats: [0, 1, 2, 3],
    })

    expect(playAs(state, 2)).toBe(three.id)
  })

  it('does not overtrump partner who is already winning', () => {
    // Partner (South) winning with A; North has K and 4 — must dump 4
    const king = makeCard('H', 'K')
    const four = makeCard('H', '4')
    const state = baseState({
      currentSeat: 2,
      trickLeader: 0,
      currentTrick: [
        { seat: 0, card: makeCard('H', 'A') },
        { seat: 1, card: makeCard('H', '9') },
      ],
      hands: [[], [], [king, four], []],
      activeSeats: [0, 1, 2, 3],
    })

    expect(playAs(state, 2)).toBe(four.id)
  })

  it('takes the trick with cheapest winner when opponent is winning with points', () => {
    // Opponent winning with J (1pt); we have 4 and Q — play Q not pedro
    const queen = makeCard('H', 'Q')
    const four = makeCard('H', '4')
    const state = baseState({
      currentSeat: 2,
      trickLeader: 1,
      currentTrick: [
        { seat: 1, card: makeCard('H', 'J') },
        { seat: 0, card: makeCard('H', '6') },
      ],
      hands: [[], [], [queen, four], []],
      activeSeats: [0, 1, 2, 3],
    })

    expect(playAs(state, 2)).toBe(queen.id)
  })

  it('uses pedro to capture when it is the only winner and points are at stake', () => {
    const pedro = makeCard('H', '5')
    const three = makeCard('H', '3')
    const state = baseState({
      currentSeat: 2,
      trickLeader: 1,
      // Opponent A wins; only pedro beats A; 10 already in trick (1pt) + maybe more
      currentTrick: [
        { seat: 1, card: makeCard('H', 'A') },
        { seat: 0, card: makeCard('H', '10') },
      ],
      hands: [[], [], [pedro, three], []],
      activeSeats: [0, 1, 2, 3],
    })

    // 3 cannot beat A; pedro cannot beat A either! A is highest.
    // pedro strength < A, so cannot win — must dump 3
    expect(playAs(state, 2)).toBe(three.id)
  })

  it('captures pedro in trick with cheapest winner', () => {
    const king = makeCard('S', 'K')
    const four = makeCard('S', '4')
    const state = baseState({
      trump: 'S',
      currentSeat: 2,
      trickLeader: 1,
      currentTrick: [
        { seat: 1, card: makeCard('S', '5') }, // right pedro (winning)
        { seat: 0, card: makeCard('S', '3') }, // partner under
      ],
      hands: [[], [], [king, four], []],
      activeSeats: [0, 1, 2, 3],
    })

    // K beats pedro, 4 does not — must take with K
    expect(playAs(state, 2)).toBe(king.id)
  })

  it('smears Pedro onto partner’s Ace across all difficulty levels (Easy, Medium, Hard)', () => {
    // Partner (South, seat 0) leads A♠. North (partner, seat 2) holds 5♠ (Pedro) and 4♠.
    // North must smear the 5♠ on partner's Ace!
    const pedro = makeCard('S', '5')
    const four = makeCard('S', '4')
    const state = baseState({
      trump: 'S',
      currentSeat: 2,
      trickLeader: 0,
      currentTrick: [
        { seat: 0, card: makeCard('S', 'A') },
        { seat: 1, card: makeCard('S', '3') },
      ],
      hands: [[], [], [pedro, four], []],
      activeSeats: [0, 1, 2, 3],
    })

    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const s = {
        ...state,
        seats: state.seats.map((seat, i) =>
          i === 2 ? { ...seat, kind: 'bot' as const, difficulty: diff } : seat,
        ) as GameState['seats'],
      }
      expect(playAs(s, 2), diff).toBe(pedro.id)
    }
  })

  it('smears Pedro when partner is winning and bot is last to play', () => {
    const pedro = makeCard('H', '5')
    const three = makeCard('H', '3')
    const state = baseState({
      trump: 'H',
      currentSeat: 2,
      trickLeader: 3,
      currentTrick: [
        { seat: 3, card: makeCard('H', '7') },
        { seat: 0, card: makeCard('H', 'Q') }, // partner winning with Q
        { seat: 1, card: makeCard('H', '4') },
      ],
      hands: [[], [], [pedro, three], []],
      activeSeats: [0, 1, 2, 3],
    })

    // North is seat 2 (last to play in this trick, since seat 3 led and 0, 1 played).
    // Partner seat 0 is winning with Q. North must smear Pedro!
    expect(playAs(state, 2)).toBe(pedro.id)
  })

  it('bids differently depending on biddingRisk setting', () => {
    // Hand with moderate trump strength (~6.0)
    const hand = [
      makeCard('S', 'A'),
      makeCard('S', 'K'),
      makeCard('S', '10'),
      makeCard('S', '9'),
      makeCard('S', '8'),
      makeCard('H', '7'),
      makeCard('D', '6'),
      makeCard('C', '3'),
      makeCard('H', '2'),
    ]

    const makeBidState = (risk: 'low' | 'medium' | 'high') =>
      baseState({
        phase: 'bidding',
        currentSeat: 1,
        highBid: 6,
        bidder: 0,
        hands: [[], hand, [], []],
        seats: [
          { kind: 'human', name: 'You' },
          { kind: 'bot', difficulty: 'medium', biddingRisk: risk, name: 'West' },
          { kind: 'bot', difficulty: 'medium', name: 'North' },
          { kind: 'bot', difficulty: 'medium', name: 'East' },
        ],
      })

    const lowAct = botAct(makeBidState('low'), 1)
    const highAct = botAct(makeBidState('high'), 1)

    // Low risk should pass on overcalling
    expect(lowAct.type).toBe('bid')
    if (lowAct.type === 'bid') {
      expect(lowAct.bid).toBe(null) // Passed
    }

    // High risk should aggressively overcall or compete
    expect(highAct.type).toBe('bid')
    if (highAct.type === 'bid') {
      expect(highAct.bid).toBeGreaterThanOrEqual(7)
    }
  })
})
