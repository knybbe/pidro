import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  canPass,
  groupHand,
  legalBids,
  legalPlays,
  sortHand,
  suitName,
  suitSymbol,
  trumpsInHand,
  type Card,
  type Phase,
  type Seat,
  type Suit,
} from '../engine'
import { useGameStore, type BidDelaySec } from '../store/gameStore'
import { CardView } from './CardView'

const BID_DELAYS: BidDelaySec[] = [0, 1, 2, 3]

export function Table({ onShowRules }: { onShowRules: () => void }) {
  const state = useGameStore((s) => s.state)
  const bid = useGameStore((s) => s.bid)
  const play = useGameStore((s) => s.play)
  const pickTrump = useGameStore((s) => s.pickTrump)
  const continuePlay = useGameStore((s) => s.continuePlay)
  const backToLobby = useGameStore((s) => s.backToLobby)
  const bidDelaySec = useGameStore((s) => s.bidDelaySec)
  const setBidDelaySec = useGameStore((s) => s.setBidDelaySec)

  const humanSeat: Seat = 0
  const humanTurn =
    (state.phase === 'bidding' && state.currentSeat === humanSeat) ||
    (state.phase === 'choose_trump' && state.bidder === humanSeat) ||
    (state.phase === 'playing' && state.currentSeat === humanSeat)

  const handGroups = groupHand(state.hands[humanSeat], state.trump)
  const choosingTrump =
    state.phase === 'choose_trump' && state.bidder === humanSeat

  const playableIds =
    state.phase === 'playing' && humanTurn
      ? new Set(legalPlays(state, humanSeat).map((c) => c.id))
      : choosingTrump
        ? new Set(state.hands[humanSeat].map((c) => c.id))
        : new Set<string>()

  const showContinue =
    state.phase === 'trick_pause' ||
    state.phase === 'hand_result' ||
    state.phase === 'game_over'

  /** Bid log stays through trump pick; seat Pass/number pills only while bidding */
  const showBidLog =
    state.phase === 'bidding' || state.phase === 'choose_trump'
  const showSeatBids = state.phase === 'bidding'

  // Click anywhere / Space / Enter to advance (no Continue button)
  useEffect(() => {
    if (!showContinue) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        continuePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showContinue, continuePlay, state.phase, state.completedTricks.length])

  // Watchdog: while a bot should act, keep kicking until a timer is running.
  // Does not cancel an in-flight timer (kickBots is a no-op if one is queued).
  const kickBots = useGameStore((s) => s.kickBots)
  useEffect(() => {
    if (
      state.phase !== 'playing' &&
      state.phase !== 'bidding' &&
      state.phase !== 'choose_trump'
    ) {
      return
    }
    const seat =
      state.phase === 'choose_trump' ? state.bidder : state.currentSeat
    if (seat === null) return
    if (state.seats[seat].kind !== 'bot') return

    kickBots()
    const id = window.setInterval(() => kickBots(), 700)
    return () => window.clearInterval(id)
  }, [
    state.phase,
    state.currentSeat,
    state.bidder,
    state.currentTrick.length,
    state.bids.length,
    kickBots,
  ])

  const onScreenContinue = (e: ReactMouseEvent) => {
    if (!showContinue) return
    // Don't steal clicks from interactive controls
    const t = e.target as HTMLElement
    if (
      t.closest(
        'button, a, select, input, .hand-row, .south-bid-row, .bid-log, .icon-btn, .delay-select',
      )
    ) {
      return
    }
    continuePlay()
  }

  // Largest square that fits the host (fills the shorter side completely)
  const feltHostRef = useRef<HTMLDivElement>(null)
  const [feltSide, setFeltSide] = useState(0)
  useLayoutEffect(() => {
    const el = feltHostRef.current
    if (!el) return
    const measure = () => {
      // client* ignores transforms/subpixel jitter; floor keeps square crisp
      const w = el.clientWidth
      const h = el.clientHeight
      const side = Math.max(0, Math.floor(Math.min(w, h)))
      setFeltSide(side)
    }
    measure()
    const ro = new ResizeObserver(() => {
      // rAF batches with layout so we measure after flex settles
      requestAnimationFrame(measure)
    })
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const displayTrick =
    state.currentTrick.length > 0
      ? state.currentTrick
      : state.completedTricks.length > 0 &&
          (state.phase === 'hand_result' ||
            state.phase === 'game_over' ||
            state.phase === 'trick_pause')
        ? state.completedTricks[state.completedTricks.length - 1]
        : state.currentTrick

  const playedBySeat = (seat: Seat): Card | null => {
    const p = displayTrick.find((t) => t.seat === seat)
    return p ? p.card : null
  }

  const legal = state.phase === 'bidding' && humanTurn ? legalBids(state) : []

  const infoLine =
    state.handResult &&
    (state.phase === 'hand_result' || state.phase === 'game_over')
      ? `${state.phase === 'game_over' ? 'Match over · ' : ''}${
          state.handResult.made ? 'Bid made' : 'Set!'
        } · Us ${fmtDelta(state.handResult.teamScoreDelta[0])} · Them ${fmtDelta(state.handResult.teamScoreDelta[1])}`
      : state.phase === 'playing' ||
          state.phase === 'trick_pause' ||
          state.phase === 'hand_result' ||
          state.phase === 'game_over'
        ? `${state.message}${
            state.phase === 'playing' ||
            state.phase === 'trick_pause' ||
            state.phase === 'hand_result' ||
            state.phase === 'game_over'
              ? ` · Points Us ${state.pointsTaken[0]} · Them ${state.pointsTaken[1]}`
              : ''
          }`
        : state.message ||
          (!humanTurn && !showContinue && !choosingTrump
            ? 'Waiting for robots…'
            : '')

  return (
    <div
      className={`table-screen ${showContinue ? 'can-continue' : ''}`}
      onClick={onScreenContinue}
    >
      <header className="top-bar">
        <button
          type="button"
          className="icon-btn"
          onClick={backToLobby}
          aria-label="Lobby"
        >
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
        <div className="top-bar-right">
          <select
            className="delay-select"
            value={bidDelaySec}
            onChange={(e) =>
              setBidDelaySec(Number(e.target.value) as BidDelaySec)
            }
            aria-label="Bid delay in seconds"
            title="Bid delay"
          >
            {BID_DELAYS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={onShowRules}
            aria-label="Rules"
          >
            ?
          </button>
        </div>
      </header>

      <div className="felt-host" ref={feltHostRef}>
        <div
          className="felt"
          style={
            feltSide > 0
              ? ({
                  width: feltSide,
                  height: feltSide,
                  ['--felt-side' as string]: `${feltSide}px`,
                } as CSSProperties)
              : undefined
          }
        >
          {/* Reserved corner slot — keeps layout stable when bid log toggles */}
          <div className="bid-log-slot" aria-live="polite">
            {showBidLog && (
              <div className="bid-log bid-log-corner">
                <div className="bid-log-title">
                  {state.phase === 'bidding' ? 'Bidding' : 'Bids'}
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
          </div>

          {/* 3×3 table grid: seats + center; south zone spans full width */}
          <div className="table-grid">
            <div className="grid-north">
              <SeatSlot
                label={seatLabel(state, 2)}
                hand={state.hands[2]}
                phase={state.phase}
                trump={state.trump}
                bidStatus={showSeatBids ? bidStatusFor(state, 2) : null}
                bidFresh={isLatestBid(state, 2)}
                active={isActive(state, 2)}
                position="north"
                playedCard={playedBySeat(2)}
              />
            </div>

            <div className="grid-west">
              <SeatSlot
                label={seatLabel(state, 1)}
                hand={state.hands[1]}
                phase={state.phase}
                trump={state.trump}
                bidStatus={showSeatBids ? bidStatusFor(state, 1) : null}
                bidFresh={isLatestBid(state, 1)}
                active={isActive(state, 1)}
                position="west"
                playedCard={playedBySeat(1)}
              />
            </div>

            <div className="grid-center">
              {state.trump && state.phase !== 'bidding' && (
                <div className="trump-pill">
                  <span
                    className={`trump-badge ${
                      state.trump === 'H' || state.trump === 'D' ? 'red' : 'black'
                    }`}
                  >
                    {suitSymbol(state.trump)} {suitName(state.trump)}
                  </span>
                </div>
              )}
              <div className="dump-grid" aria-label="Discarded cards">
                <DumpPile cards={state.dumpPiles[2]} className="dump-n" />
                <DumpPile cards={state.dumpPiles[3]} className="dump-e" />
                <DumpPile cards={state.dumpPiles[1]} className="dump-w" />
                <DumpPile cards={state.dumpPiles[0]} className="dump-s" />
              </div>
            </div>

            <div className="grid-east">
              <SeatSlot
                label={seatLabel(state, 3)}
                hand={state.hands[3]}
                phase={state.phase}
                trump={state.trump}
                bidStatus={showSeatBids ? bidStatusFor(state, 3) : null}
                bidFresh={isLatestBid(state, 3)}
                active={isActive(state, 3)}
                position="east"
                playedCard={playedBySeat(3)}
              />
            </div>

            <div className="grid-south">
              {/* Bid chips / trump hint — above the play slot so play stays near You */}
              <div className="south-bid-slot">
                {state.phase === 'bidding' && humanTurn ? (
                  <div className="south-bid-row" role="group" aria-label="Your bid">
                    {canPass(state) && (
                      <button
                        type="button"
                        className="south-bid-chip pass"
                        onClick={() => bid(null)}
                      >
                        Pass
                      </button>
                    )}
                    {legal.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="south-bid-chip"
                        onClick={() => bid(b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                ) : state.phase === 'bidding' &&
                  bidStatusFor(state, 0) &&
                  bidStatusFor(state, 0) !== '…' ? (
                  <div
                    className={`seat-bid-callout south ${isLatestBid(state, 0) ? 'fresh' : ''} ${bidStatusFor(state, 0) === 'Pass' ? 'pass' : ''}`}
                  >
                    {bidStatusFor(state, 0)}
                  </div>
                ) : choosingTrump ? (
                  <p className="trump-hint">Tap a card to set trump</p>
                ) : null}
              </div>

              {/* Always reserved height so playing a card doesn't shift the table */}
              <div className="south-play-slot" aria-hidden={!playedBySeat(0)}>
                {playedBySeat(0) ? (
                  <div className="played-next-to south">
                    <CardView card={playedBySeat(0)!} />
                  </div>
                ) : null}
              </div>

              {/* You + hand = south “deck”; played card sits just above (like N/W/E) */}
              <div className="you-label">You</div>

              <div
                className={`hand-row on-felt ${choosingTrump ? 'hand-trump-pick' : ''}`}
                aria-label={
                  choosingTrump ? 'Tap a card to choose trump suit' : 'Your hand'
                }
              >
                {handGroups.map((group, gi) => (
                  <div key={gi} className="hand-suit-group">
                    {group.map((c) => {
                      if (choosingTrump) {
                        return (
                          <CardView
                            key={c.id}
                            card={c}
                            selected
                            onClick={() => pickTrump(c.suit)}
                          />
                        )
                      }
                      const canPlay =
                        state.phase === 'playing' && playableIds.has(c.id)
                      const dimmed =
                        state.phase === 'playing' && !playableIds.has(c.id)
                      return (
                        <CardView
                          key={c.id}
                          card={c}
                          disabled={dimmed}
                          onClick={canPlay ? () => play(c.id) : undefined}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status under the green felt */}
      <div className="info-bar" aria-live="polite">
        <p className="info-bar-text">
          {infoLine ||
            (showContinue
              ? 'Click anywhere or press Space / Enter to continue'
              : '\u00a0')}
        </p>
        {state.phase === 'game_over' && (
          <button type="button" className="btn ghost info-lobby" onClick={backToLobby}>
            Lobby
          </button>
        )}
      </div>
    </div>
  )
}

function DumpPile({
  cards,
  className,
}: {
  cards: Card[]
  className: string
}) {
  // Cap visual stack so center piles stay compact
  const shown = cards.slice(0, 5)
  const extra = cards.length - shown.length
  return (
    <div
      className={`dump-pile ${className}`}
      aria-label={`${cards.length} discarded cards`}
      title={cards.length > 0 ? `${cards.length} cards` : undefined}
    >
      <div className="dump-fan">
        {cards.length === 0 ? (
          <div className="dump-empty" />
        ) : (
          shown.map((c, i) => (
            <div
              key={c.id}
              className="dump-card"
              style={
                {
                  zIndex: i,
                  ['--i' as string]: i,
                  ['--n' as string]: shown.length,
                } as CSSProperties
              }
            >
              <CardView card={c} small />
            </div>
          ))
        )}
      </div>
      {extra > 0 && <span className="dump-extra">+{extra}</span>}
    </div>
  )
}

function SeatSlot({
  label,
  hand,
  phase,
  trump,
  bidStatus,
  bidFresh,
  active,
  position,
  playedCard,
}: {
  label: string
  hand: Card[]
  phase: Phase
  trump: Suit | null
  bidStatus: string | null
  bidFresh: boolean
  active: boolean
  position: string
  playedCard: Card | null
}) {
  // Bidding / trump pick: always 9 face-down. Play: remaining hand.
  // When a seat has no trumps left, any leftover non-trumps turn face-up.
  const biddingLike = phase === 'bidding' || phase === 'choose_trump'
  const count = biddingLike ? Math.max(hand.length, 9) : hand.length
  const cold =
    !biddingLike &&
    trump != null &&
    hand.length > 0 &&
    trumpsInHand(hand, trump).length === 0
  const faceCards = cold ? sortHand(hand, trump) : null
  const n = cold ? faceCards!.length : count

  const deck = (
    <div className={`seat-deck ${position}`}>
      <div className="seat-name">{label}</div>
      <div
        className={`seat-cards fan ${position}${cold ? ' face-up' : ''}`}
        style={{ ['--n' as string]: Math.max(n, 1) } as CSSProperties}
        aria-label={
          cold
            ? `${n} cards remaining (no trumps)`
            : `${n} cards`
        }
      >
        {cold && faceCards
          ? faceCards.map((c, i) => (
              <div
                key={c.id}
                className="seat-card-wrap"
                style={
                  {
                    zIndex: i,
                    ['--i' as string]: i,
                  } as CSSProperties
                }
              >
                <CardView card={c} small />
              </div>
            ))
          : Array.from({ length: n }).map((_, i) => (
              <div
                key={i}
                className="card-back"
                style={
                  {
                    zIndex: i,
                    ['--i' as string]: i,
                  } as CSSProperties
                }
              />
            ))}
      </div>
      {bidStatus && (
        <div
          className={`seat-bid-callout ${position} ${bidFresh ? 'fresh' : ''} ${bidStatus === 'Pass' ? 'pass' : ''} ${bidStatus === '…' ? 'waiting' : ''}`}
        >
          {bidStatus}
        </div>
      )}
    </div>
  )

  const played = (
    <div className={`played-next-to ${position}`}>
      {playedCard ? <CardView card={playedCard} /> : null}
    </div>
  )

  // West: deck | played · East: played | deck · North: deck above played
  if (position === 'west') {
    return (
      <div className={`seat-slot west ${active ? 'turn' : ''}`}>
        {deck}
        {played}
      </div>
    )
  }
  if (position === 'east') {
    return (
      <div className={`seat-slot east ${active ? 'turn' : ''}`}>
        {played}
        {deck}
      </div>
    )
  }
  return (
    <div className={`seat-slot north ${active ? 'turn' : ''}`}>
      {deck}
      {played}
    </div>
  )
}

function bidOrder(dealer: Seat): Seat[] {
  const order: Seat[] = []
  let s = ((dealer + 1) % 4) as Seat
  for (let i = 0; i < 4; i++) {
    order.push(s)
    s = ((s + 1) % 4) as Seat
  }
  return order
}

function isLatestBid(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
): boolean {
  if (state.bids.length === 0) return false
  return state.bids[state.bids.length - 1].seat === seat
}

function bidStatusFor(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
): string | null {
  if (state.phase !== 'bidding' && state.phase !== 'choose_trump') return null
  const entry = state.bids.find((b) => b.seat === seat)
  if (entry) return entry.bid === null ? 'Pass' : String(entry.bid)
  if (state.phase === 'bidding' && state.currentSeat === seat) return '…'
  return null
}

function seatLabel(
  state: ReturnType<typeof useGameStore.getState>['state'],
  seat: Seat,
) {
  const turn =
    state.currentSeat === seat ||
    (state.phase === 'choose_trump' && state.bidder === seat)
  const seatCfg = state.seats[seat]
  let name: string
  if (seatCfg.kind === 'human') {
    name = 'You'
  } else {
    const d = seatCfg.difficulty ?? 'medium'
    name = d.charAt(0).toUpperCase() + d.slice(1)
  }
  return `${name}${turn ? ' ●' : ''}`
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
