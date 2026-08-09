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
})
