import { describe, expect, it } from 'vitest'
import {
  chooseTrump,
  continueAfterTrick,
  createLobbyState,
  legalPlays,
  placeBid,
  playCard,
  startMatch,
} from './game'
import { trumpsInHand } from './rules'

describe('stuck detection', () => {
  it('never leaves a seat with empty legalPlays during play', () => {
    const failures: unknown[] = []
    for (let seed = 1; seed <= 400; seed++) {
      let s = startMatch(createLobbyState(seed), { seed })
      try {
        while (s.phase === 'bidding') {
          const seat = s.currentSeat!
          if (seat === 0) s = placeBid(s, 0, s.highBid === null ? 6 : null)
          else
            s = placeBid(
              s,
              seat,
              s.highBid === null && seat === 1 ? 6 : null,
            )
        }
        if (s.phase === 'choose_trump') {
          const suit = s.hands[s.bidder!][0]?.suit ?? 'S'
          s = chooseTrump(s, s.bidder!, suit)
        }
        let guard = 0
        while (
          (s.phase === 'playing' || s.phase === 'trick_pause') &&
          guard++ < 400
        ) {
          if (s.phase === 'trick_pause') {
            s = continueAfterTrick(s)
            continue
          }
          const seat = s.currentSeat
          if (seat === null) {
            failures.push({ seed, msg: 'null seat', phase: s.phase })
            break
          }
          const legal = legalPlays(s, seat)
          if (legal.length === 0) {
            failures.push({
              seed,
              seat,
              active: [...s.activeSeats],
              leader: s.trickLeader,
              trick: s.currentTrick.map((p) => p.seat),
              trump: s.trump,
              trumpCounts: s.hands.map((h) =>
                trumpsInHand(h, s.trump!).length,
              ),
              message: s.message,
            })
            break
          }
          s = playCard(s, seat, legal[0].id)
        }
      } catch (e) {
        failures.push({
          seed,
          error: String(e),
          phase: s.phase,
          seat: s.currentSeat,
          trick: s.currentTrick.map((p) => p.seat),
          active: [...s.activeSeats],
        })
      }
    }
    if (failures.length) {
      console.error(JSON.stringify(failures.slice(0, 5), null, 2))
    }
    expect(failures).toEqual([])
  })
})
