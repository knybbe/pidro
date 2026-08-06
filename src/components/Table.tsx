import type { CSSProperties } from 'react'
import {
  canPass,
  legalBids,
  legalPlays,
  sortHand,
  suitName,
  suitSymbol,
  type Seat,
  type Suit,
} from '../engine'
import { useGameStore } from '../store/gameStore'
import { CardView } from './CardView'

const SUITS: Suit[] = ['S', 'H', 'C', 'D'] // spades, hearts, clubs, diamonds

export function Table({ onShowRules }: { onShowRules: () => void }) {
  const state = useGameStore((s) => s.state)
  const bid = useGameStore((s) => s.bid)
  const pickTrump = useGameStore((s) => s.pickTrump)
  const play = useGameStore((s) => s.play)
  const continueNextHand = useGameStore((s) => s.continueNextHand)
  const doRematch = useGameStore((s) => s.doRematch)
  const backToLobby = useGameStore((s) => s.backToLobby)

  const humanSeat: Seat = 0
  const humanTurn =
    (state.phase === 'bidding' && state.currentSeat === humanSeat) ||
    (state.phase === 'choose_trump' && state.bidder === humanSeat) ||
    (state.phase === 'playing' && state.currentSeat === humanSeat)

  const hand = sortHand(state.hands[humanSeat], state.trump)

  const playable =
    state.phase === 'playing' && humanTurn
      ? new Set(legalPlays(state, humanSeat).map((c) => c.id))
      : new Set<string>()

  return (
    <div className="table-screen">
      <header className="top-bar">
        <button type="button" className="icon-btn" onClick={backToLobby} aria-label="Lobby">
          ←
        </button>
        <div className="scores">
          <div className={`score-chip ${teamLead(state.scores, 0)}`}>
            <span>Us</span>
            <strong>{state.scores[0]}</strong>
          </div>
          <div className="score-target">/{state.targetScore}</div>
          <div className={`score-chip ${teamLead(state.scores, 1)}`}>
            <span>Them</span>
            <strong>{state.scores[1]}</strong>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onShowRules} aria-label="Rules">
          ?
        </button>
      </header>

      <div className="felt">
        <SeatSlot
          label={seatLabel(state, 2)}
          count={state.hands[2].length}
          bidStatus={bidStatusFor(state, 2)}
          active={isActive(state, 2)}
          position="north"
        />
        <div className="felt-mid">
          <SeatSlot
            label={seatLabel(state, 1)}
            count={state.hands[1].length}
            bidStatus={bidStatusFor(state, 1)}
            active={isActive(state, 1)}
            position="west"
          />
          <div className="center-stage">
            <div className="meta-row">
              {state.trump && (
                <span
                  className={`trump-badge ${
                    state.trump === 'H' || state.trump === 'D' ? 'red' : 'black'
                  }`}
                >
                  Trump {suitSymbol(state.trump)} {suitName(state.trump)}
                </span>
              )}
              {state.highBid !== null && state.bidder !== null && (
                <span className="bid-badge">
                  High bid {state.highBid} · {state.seats[state.bidder].name}
                </span>
              )}
            </div>

            {(state.phase === 'bidding' ||
              state.phase === 'choose_trump' ||
              (state.bids.length > 0 && state.phase === 'playing')) && (
              <div className="bid-log" aria-live="polite">
                <div className="bid-log-title">
                  {state.phase === 'bidding' ? 'Bidding' : 'Bids this hand'}
                </div>
                <ul className="bid-log-list">
                  {bidOrder(state.dealer).map((seat) => {
                    const entry = state.bids.find((b) => b.seat === seat)
                    const waiting =
                      state.phase === 'bidding' &&
                      state.currentSeat === seat &&
                      !entry
                    let text = '…'
                    let kind = 'pending'
                    if (entry) {
                      if (entry.bid === null) {
                        text = 'Pass'
                        kind = 'pass'
                      } else {
                        text = String(entry.bid)
                        kind =
                          state.bidder === seat && state.highBid === entry.bid
                            ? 'high'
                            : 'bid'
                      }
                    } else if (waiting) {
                      text = '…'
                      kind = 'turn'
                    }
                    return (
                      <li key={seat} className={`bid-log-item ${kind}`}>
                        <span className="bid-log-name">
                          {state.seats[seat].name}
                          {seat === 0 ? ' (you)' : ''}
                        </span>
                        <span className="bid-log-value">{text}</span>
                      </li>
                    )
                  })}
                </ul>
                {state.phase === 'bidding' && state.highBid !== null && (
                  <p className="bid-log-hint">
                    Must bid higher than {state.highBid}, or pass
                  </p>
                )}
                {state.phase === 'bidding' && state.highBid === null && (
                  <p className="bid-log-hint">Min bid 6 · or pass</p>
                )}
              </div>
            )}

            {state.phase !== 'bidding' && (
              <div className="trick-area" aria-live="polite">
                {state.currentTrick.length === 0 && state.phase === 'playing' && (
                  <span className="trick-empty">Trick</span>
                )}
                {state.currentTrick.map((p) => (
                  <div key={p.card.id} className={`trick-card seat-${p.seat}`}>
                    <CardView card={p.card} small />
                  </div>
                ))}
              </div>
            )}
            <p className="status-msg">{state.message}</p>
            {state.phase === 'playing' && (
              <p className="points-live">
                Points this hand — Us {state.pointsTaken[0]} · Them{' '}
                {state.pointsTaken[1]}
              </p>
            )}
          </div>
          <SeatSlot
            label={seatLabel(state, 3)}
            count={state.hands[3].length}
            bidStatus={bidStatusFor(state, 3)}
            active={isActive(state, 3)}
            position="east"
          />
        </div>
        <div className="you-label">
          You · South
          {bidStatusFor(state, 0) && (
            <span className="you-bid"> · {bidStatusFor(state, 0)}</span>
          )}
        </div>
      </div>

      <div className="action-dock">
        {state.phase === 'bidding' && humanTurn && (
          <div className="bid-panel">
            {canPass(state) && (
              <button type="button" className="btn ghost" onClick={() => bid(null)}>
                Pass
              </button>
            )}
            <div className="bid-grid">
              {legalBids(state).map((b) => (
                <button
                  key={b}
                  type="button"
                  className="btn bid-btn"
                  onClick={() => bid(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.phase === 'choose_trump' && humanTurn && (
          <div className="trump-panel">
            <p>Choose trump</p>
            <div className="trump-grid">
              {SUITS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn trump-btn ${s === 'H' || s === 'D' ? 'red' : 'black'}`}
                  onClick={() => pickTrump(s)}
                >
                  {suitSymbol(s)}
                  <span>{suitName(s)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(state.phase === 'hand_result' || state.phase === 'game_over') &&
          state.handResult && (
            <div className="result-panel">
              <p className="result-title">
                {state.phase === 'game_over' ? 'Match over' : 'Hand over'}
              </p>
              <p>
                {state.handResult.made ? 'Bid made' : 'Set!'} · delta Us{' '}
                {fmtDelta(state.handResult.teamScoreDelta[0])} · Them{' '}
                {fmtDelta(state.handResult.teamScoreDelta[1])}
              </p>
              <p>
                Taken: Us {state.handResult.teamPointsTaken[0]} · Them{' '}
                {state.handResult.teamPointsTaken[1]}
              </p>
              <div className="result-actions">
                {state.phase === 'hand_result' ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={continueNextHand}
                  >
                    Next hand
                  </button>
                ) : (
                  <button type="button" className="btn primary" onClick={doRematch}>
                    Rematch
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={backToLobby}>
                  Lobby
                </button>
              </div>
            </div>
          )}

        <div
          className={`hand-row ${state.phase === 'bidding' || state.phase === 'choose_trump' ? 'hand-preview' : ''}`}
          aria-label="Your hand"
        >
          {hand.map((c) => {
            const canPlay =
              state.phase === 'playing' && playable.has(c.id)
            // Only grey out unplayable cards during play — keep full white contrast while bidding
            const dimmed = state.phase === 'playing' && !playable.has(c.id)
            return (
              <CardView
                key={c.id}
                card={c}
                disabled={dimmed}
                onClick={canPlay ? () => play(c.id) : undefined}
              />
            )
          })}
          {hand.length === 0 && state.phase !== 'lobby' && (
            <span className="hand-empty">No cards</span>
          )}
        </div>
        {!humanTurn &&
          state.phase !== 'hand_result' &&
          state.phase !== 'game_over' && (
            <p className="waiting">Waiting for robots…</p>
          )}
      </div>
    </div>
  )
}

function SeatSlot({
  label,
  count,
  bidStatus,
  active,
  position,
}: {
  label: string
  count: number
  bidStatus: string | null
  active: boolean
  position: string
}) {
  const fan = position === 'north' || position === 'south'
  // Show every card as a back; cap visual density so 9 cards still fit
  const n = Math.min(count, 9)

  return (
    <div className={`seat-slot ${position} ${active ? 'turn' : ''}`}>
      <div className="seat-name">{label}</div>
      {bidStatus && (
        <div
          className={`seat-bid ${bidStatus === 'Pass' ? 'pass' : ''} ${bidStatus === '…' ? 'waiting' : ''}`}
        >
          {bidStatus}
        </div>
      )}
      <div
        className={`seat-cards ${fan ? 'fan' : 'stack'} ${position}`}
        aria-label={`${count} cards`}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className="card-back"
            style={
              {
                zIndex: i,
                ['--i' as string]: i,
                ['--n' as string]: n,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}

/** Bidding order: left of dealer first, then clockwise (dealer last). */
function bidOrder(dealer: Seat): Seat[] {
  const order: Seat[] = []
  let s = ((dealer + 1) % 4) as Seat
  for (let i = 0; i < 4; i++) {
    order.push(s)
    s = ((s + 1) % 4) as Seat
  }
  return order
}

function bidStatusFor(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
): string | null {
  if (
    state.phase !== 'bidding' &&
    state.phase !== 'choose_trump' &&
    !(state.bids.length && state.phase === 'playing')
  ) {
    return null
  }
  const entry = state.bids.find((b) => b.seat === seat)
  if (entry) return entry.bid === null ? 'Pass' : String(entry.bid)
  if (state.phase === 'bidding' && state.currentSeat === seat) return '…'
  if (state.phase === 'bidding') return null
  return null
}

function seatLabel(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
) {
  const d = state.seats[seat].difficulty
  const turn =
    state.currentSeat === seat ||
    (state.phase === 'choose_trump' && state.bidder === seat)
  return `${state.seats[seat].name}${d ? ` · ${d}` : ''}${turn ? ' ●' : ''}`
}

function isActive(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
) {
  return (
    state.currentSeat === seat ||
    (state.phase === 'choose_trump' && state.bidder === seat)
  )
}

function teamLead(scores: [number, number], team: 0 | 1) {
  if (scores[0] === scores[1]) return ''
  return scores[team] > scores[1 - team] ? 'leading' : ''
}

function fmtDelta(n: number) {
  return n > 0 ? `+${n}` : `${n}`
}
