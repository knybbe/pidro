import { describe, expect, it } from 'vitest'
import {
  chooseTrump,
  continueAfterTrick,
  createLobbyState,
  legalPlays,
  nextHand,
  placeBid,
  playCard,
  startMatch,
} from './game'
import { botAct } from '../ai'
import { trumpsInHand } from './rules'

describe('full match simulation and stuck detection', () => {
  it('simulates 500 full hands with botAct without errors or stuck states', () => {
    const failures: unknown[] = []
    for (let seed = 1; seed <= 2000; seed++) {
      const mode = seed % 2 === 0 ? 'classic' : 'kokkola'
      let s = startMatch(createLobbyState(seed, undefined, mode), { seed, gameMode: mode })
      try {
        let handGuard = 0
        while (s.phase !== 'game_over' && handGuard++ < 30) {
          while (s.phase === 'bidding') {
            const seat = s.currentSeat!
            const act = botAct(s, seat)
            if (act.type === 'bid') s = placeBid(s, seat, act.bid)
            else s = placeBid(s, seat, null)
          }
          if (s.phase === 'choose_trump') {
            const bidder = s.bidder!
            const act = botAct(s, bidder)
            if (act.type === 'trump') s = chooseTrump(s, bidder, act.suit)
            else s = chooseTrump(s, bidder, 'S')
          }
          let trickGuard = 0
          while (
            (s.phase === 'playing' || s.phase === 'trick_pause') &&
            trickGuard++ < 200
          ) {
            if (s.phase === 'trick_pause') {
              s = continueAfterTrick(s)
              continue
            }
            const seat = s.currentSeat
            if (seat === null) {
              failures.push({ seed, msg: 'null currentSeat', phase: s.phase })
              break
            }
            const legal = legalPlays(s, seat)
            if (legal.length === 0) {
              failures.push({
                seed,
                seat,
                active: [...s.activeSeats],
                leader: s.trickLeader,
                trump: s.trump,
                trumpCounts: s.hands.map((h) => trumpsInHand(h, s.trump!).length),
              })
              break
            }
            // Mix botAct and random play
            if (seed % 3 === 0) {
              const pick = legal[Math.floor(Math.random() * legal.length)]
              s = playCard(s, seat, pick.id)
            } else {
              const act = botAct(s, seat)
              if (act.type === 'play') s = playCard(s, seat, act.cardId)
              else s = playCard(s, seat, legal[0].id)
            }
          }

          if (s.phase === 'hand_result') {
            // Verify points taken add up to 14
            const totalPts = s.pointsTaken[0] + s.pointsTaken[1]
            if (totalPts !== 14) {
              failures.push({ seed, msg: `Points sum is ${totalPts}, expected 14 (got [${s.pointsTaken[0]}, ${s.pointsTaken[1]}])`, hand: s.handHistory.length })
            }
            s = nextHand(s)
          }
        }
      } catch (e) {
        failures.push({
          seed,
          error: String(e),
          phase: s.phase,
          seat: s.currentSeat,
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
