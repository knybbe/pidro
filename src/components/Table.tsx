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
  continueAfterTrick,
  groupHand,
  legalBids,
  legalPlays,
  sortHand,
  suitName,
  suitSymbol,
  trumpsInHand,
  type Card,
  type HandHistoryEntry,
  type Phase,
  type Seat,
  type Suit,
} from '../engine'
import { useGameStore, type BidDelaySec } from '../store/gameStore'
import { CardView } from './CardView'

const BID_DELAYS: BidDelaySec[] = [0, 1, 2, 3]
/** Seat letters for score sheet (S W N E) */
const SEAT_LETTER = ['S', 'W', 'N', 'E'] as const

/** Columns: bidder+bid | pts Us Them | score Us Them */
function formatRoundCols(h: HandHistoryEntry): {
  bid: string
  pts: string
  score: string
} {
  return {
    bid: `${SEAT_LETTER[h.bidder]}${h.bid}`,
    pts: `${h.teamPointsTaken[0]} ${h.teamPointsTaken[1]}`,
    score: `${h.scoresAfter[0]} ${h.scoresAfter[1]}`,
  }
}

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

  /**
   * Visible hand only. Kokkola deals +4 after bidding into the engine hand,
   * but those stay hidden until trump is named (never show 13).
   * Original 9 are always the first cards; extras are appended after.
   */
  const visibleHumanHand =
    state.phase === 'bidding' || state.phase === 'choose_trump'
      ? state.hands[humanSeat].slice(0, 9)
      : state.hands[humanSeat]

  const handGroups = groupHand(visibleHumanHand, state.trump)
  const purchasedSet = new Set(state.purchasedIds)
  const choosingTrump =
    state.phase === 'choose_trump' && state.bidder === humanSeat

  // Cards playable now, or after continue (trick_pause → lead/play)
  const playableIds = (() => {
    if (choosingTrump) {
      // Trump only from the original 9 (Kokkola extras still hidden)
      return new Set(visibleHumanHand.map((c) => c.id))
    }
    if (state.phase === 'playing' && humanTurn) {
      return new Set(legalPlays(state, humanSeat).map((c) => c.id))
    }
    if (state.phase === 'trick_pause') {
      try {
        const next = continueAfterTrick(state)
        if (next.phase === 'playing' && next.currentSeat === humanSeat) {
          return new Set(legalPlays(next, humanSeat).map((c) => c.id))
        }
      } catch {
        /* ignore */
      }
    }
    return new Set<string>()
  })()

  /** Only trick pauses use click-anywhere / Space; hand/game end use the banner Deal button */
  const showContinue = state.phase === 'trick_pause'
  const showHandBanner =
    state.phase === 'hand_result' || state.phase === 'game_over'

  /** Seat bid pills only while bidding; log itself stays up all hand */
  const showSeatBids = state.phase === 'bidding'
  const inMatch = state.phase !== 'lobby'

  const [bidLogOpen, setBidLogOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const [compactUi, setCompactUi] = useState(false)

  // Click anywhere / Space / Enter to advance after a trick
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
  }, [showContinue, continuePlay])

  // Watchdog: while a bot should act, ensure a bot step is queued (no-op if already).
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
    const id = window.setInterval(() => kickBots(), 900)
    return () => window.clearInterval(id)
  }, [state.phase, state.currentSeat, state.bidder, kickBots])

  const onScreenContinue = (e: ReactMouseEvent) => {
    if (!showContinue) return
    const t = e.target as HTMLElement
    // Hand cards handle continue+play themselves; don't double-fire continue
    if (
      t.closest(
        'button, a, select, input, .south-bid-row, .felt-float, .felt-panel, .icon-btn, .delay-select, .card',
      )
    ) {
      return
    }
    continuePlay()
  }

  // Largest square that fits the host (fills the shorter side completely)
  const feltHostRef = useRef<HTMLDivElement>(null)
  const [feltSide, setFeltSide] = useState(0)
  const lastSideRef = useRef(0)
  /** Design reference side (px). UI scales smoothly with the green felt. */
  const FELT_REF = 720
  useLayoutEffect(() => {
    const el = feltHostRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const side = Math.max(0, Math.floor(Math.min(w, h)))
      if (Math.abs(side - lastSideRef.current) >= 2 || lastSideRef.current === 0) {
        lastSideRef.current = side
        setFeltSide(side)
      }
      const compact =
        window.innerWidth < 520 || window.innerHeight < 540
      setCompactUi(compact)
    }
    measure()
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const uiScale =
    feltSide > 0
      ? Math.max(0.3, Math.min(3.5, feltSide / FELT_REF))
      : 1

  /** All cards this seat has played this hand (stay on table, stacked). */
  const playedCardsBySeat = (seat: Seat): Card[] => {
    const cards: Card[] = []
    for (const trick of state.completedTricks) {
      for (const p of trick) {
        if (p.seat === seat) cards.push(p.card)
      }
    }
    // Mid-trick plays are not yet in completedTricks
    if (state.phase === 'playing') {
      for (const p of state.currentTrick) {
        if (p.seat === seat) cards.push(p.card)
      }
    }
    return cards
  }

  const legal = state.phase === 'bidding' && humanTurn ? legalBids(state) : []

  const infoLine =
    showHandBanner
      ? '\u00a0'
      : state.phase === 'playing' || state.phase === 'trick_pause'
        ? `${state.message} · Points Us ${state.pointsTaken[0]} · Them ${state.pointsTaken[1]}`
        : state.message ||
          (!humanTurn && !showContinue && !choosingTrump
            ? 'Waiting for robots…'
            : '')

  const lastHistory =
    state.handHistory.length > 0
      ? state.handHistory[state.handHistory.length - 1]
      : null

  return (
    <div
      className={`table-screen ${showContinue ? 'can-continue' : ''} ${compactUi ? 'compact-ui' : ''}`}
      style={
        feltSide > 0
          ? ({
              ['--felt-side' as string]: `${feltSide}px`,
              ['--ui-scale' as string]: String(uiScale),
            } as CSSProperties)
          : undefined
      }
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
          className={`felt ${compactUi ? 'felt-compact' : ''}`}
          style={
            feltSide > 0
              ? ({
                  width: feltSide,
                  height: feltSide,
                  ['--felt-side' as string]: `${feltSide}px`,
                  ['--ui-scale' as string]: String(uiScale),
                  // Primary card sizes (played / seat / hand / dump)
                  ['--play-cw' as string]: `${(3.85 * uiScale).toFixed(3)}rem`,
                  ['--play-ch' as string]: `${(5.4 * uiScale).toFixed(3)}rem`,
                  ['--seat-cw' as string]: `${(3.85 * uiScale).toFixed(3)}rem`,
                  ['--seat-ch' as string]: `${(5.4 * uiScale).toFixed(3)}rem`,
                  ['--hand-cw' as string]: `${(3.85 * uiScale).toFixed(3)}rem`,
                  ['--hand-ch' as string]: `${(5.4 * uiScale).toFixed(3)}rem`,
                  ['--dump-cw' as string]: `${(2.5 * uiScale).toFixed(3)}rem`,
                  ['--dump-ch' as string]: `${(3.5 * uiScale).toFixed(3)}rem`,
                } as CSSProperties)
              : undefined
          }
        >
          {/* Overlay toggles — absolute corners, never push table content */}
          {inMatch && (
            <>
              <div className="felt-float bid-float">
                <button
                  type="button"
                  className={`felt-panel-toggle ${bidLogOpen ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setBidLogOpen((o) => !o)
                  }}
                  aria-expanded={bidLogOpen}
                >
                  <span className="felt-panel-toggle-label">
                    {state.phase === 'bidding' ? 'Bidding' : 'Bids'}
                    {state.highBid != null ? ` · ${state.highBid}` : ''}
                  </span>
                  <span className="felt-panel-chevron" aria-hidden>
                    {bidLogOpen ? '▾' : '▸'}
                  </span>
                </button>
                {bidLogOpen && (
                  <div className="felt-panel bid-log-panel">
                    <ul className="bid-log-list">
                      {bidOrder(state.dealer).map((seat) => {
                        const entry = state.bids.find((b) => b.seat === seat)
                        const waiting =
                          state.phase === 'bidding' &&
                          state.currentSeat === seat &&
                          !entry
                        let text = '—'
                        let kind = 'pending'
                        if (entry) {
                          if (entry.bid === null) {
                            text = 'Pass'
                            kind = 'pass'
                          } else {
                            text = String(entry.bid)
                            kind =
                              state.bidder === seat &&
                              state.highBid === entry.bid
                                ? 'high'
                                : 'bid'
                          }
                        } else if (waiting) {
                          text = '…'
                          kind = 'turn'
                        } else if (state.bids.length === 0) {
                          text = '…'
                          kind = 'pending'
                        }
                        const short = seat === 0 ? 'You' : SEAT_LETTER[seat]
                        return (
                          <li key={seat} className={`bid-log-item ${kind}`}>
                            <span className="bid-log-name">{short}</span>
                            <span className="bid-log-value">{text}</span>
                          </li>
                        )
                      })}
                    </ul>
                    {state.phase === 'bidding' && state.highBid !== null && (
                      <p className="bid-log-hint">
                        Over {state.highBid} or pass
                      </p>
                    )}
                    {state.phase === 'bidding' && state.highBid === null && (
                      <p className="bid-log-hint">Min 6 · or pass</p>
                    )}
                  </div>
                )}
              </div>

              <div className="felt-float rounds-float">
                <button
                  type="button"
                  className={`felt-panel-toggle ${resultsOpen ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setResultsOpen((o) => !o)
                  }}
                  aria-expanded={resultsOpen}
                >
                  <span className="felt-panel-toggle-label">
                    Rounds
                    {state.handHistory.length > 0
                      ? ` · ${state.handHistory.length}`
                      : ''}
                  </span>
                  <span className="felt-panel-chevron" aria-hidden>
                    {resultsOpen ? '▾' : '▸'}
                  </span>
                </button>
                {resultsOpen && (
                  <div className="felt-panel results-panel-felt">
                    {state.handHistory.length === 0 ? (
                      <p className="results-empty">No rounds yet</p>
                    ) : (
                      <ul className="results-list">
                        {state.handHistory.map((h, i) => {
                          const cols = formatRoundCols(h)
                          return (
                            <li
                              key={i}
                              className={`results-row ${h.made ? 'made' : 'set'}`}
                            >
                              <span className="results-col bid">{cols.bid}</span>
                              <span className="results-sep" aria-hidden>
                                |
                              </span>
                              <span className="results-col pts">{cols.pts}</span>
                              <span className="results-sep" aria-hidden>
                                |
                              </span>
                              <span className="results-col score">
                                {cols.score}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

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
                playedCards={playedCardsBySeat(2)}
                coldRevealed={state.coldRevealed[2]}
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
                playedCards={playedCardsBySeat(1)}
                coldRevealed={state.coldRevealed[1]}
              />
            </div>

            <div className="grid-center">
              <div className="dump-diamond" aria-label="Discarded cards">
                <DumpPile
                  cards={state.dumpPiles[2]}
                  className="dump-n"
                  seatLabel="N"
                />
                <DumpPile
                  cards={state.dumpPiles[1]}
                  className="dump-w"
                  seatLabel="W"
                />
                <DumpPile
                  cards={state.dumpPiles[3]}
                  className="dump-e"
                  seatLabel="E"
                />
                <DumpPile
                  cards={state.dumpPiles[0]}
                  className="dump-s"
                  seatLabel="You"
                />
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
                playedCards={playedCardsBySeat(3)}
                coldRevealed={state.coldRevealed[3]}
              />
            </div>

            <div className="grid-south">
              {/* Fixed play fan & bid overlay (same height, 0 extra reserved flow height) */}
              <div className="south-play-gutter">
                <div
                  className="south-play-slot"
                  aria-hidden={playedCardsBySeat(0).length === 0}
                >
                  <PlayedStack
                    cards={playedCardsBySeat(0)}
                    position="south"
                  />
                </div>

                <div
                  className="south-bid-slot"
                  aria-hidden={
                    !(
                      (state.phase === 'bidding' && humanTurn) ||
                      (state.phase === 'bidding' &&
                        bidStatusFor(state, 0) &&
                        bidStatusFor(state, 0) !== '…') ||
                      choosingTrump
                    )
                  }
                >
                  {state.phase === 'bidding' && humanTurn ? (
                    <div
                      className="south-bid-row"
                      role="group"
                      aria-label="Your bid"
                    >
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
              </div>

              <div
                className={`hand-row on-felt ${choosingTrump ? 'hand-trump-pick' : ''}`}
                aria-label={
                  choosingTrump ? 'Tap a card to choose trump suit' : 'Your hand'
                }
              >
                <div className="hand-track">
                  {handGroups.map((group, gi) => (
                    <div key={gi} className="hand-suit-group">
                      {group.map((c) => {
                        if (choosingTrump) {
                          return (
                            <CardView
                              key={c.id}
                              card={c}
                              selected
                              purchased={purchasedSet.has(c.id)}
                              onClick={() => pickTrump(c.suit)}
                            />
                          )
                        }
                        const canPlay = playableIds.has(c.id)
                        const inPlayPhase =
                          state.phase === 'playing' ||
                          state.phase === 'trick_pause'
                        const dimmed = inPlayPhase && !canPlay
                        return (
                          <CardView
                            key={c.id}
                            card={c}
                            disabled={dimmed}
                            purchased={purchasedSet.has(c.id)}
                            onClick={
                              canPlay
                                ? () => play(c.id)
                                : showContinue
                                  ? () => continuePlay()
                                  : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Result Banner — direct child of .felt, topmost element always, 80% of board width & height */}
          {showHandBanner && state.handResult && lastHistory && (
            <div
              className={`round-banner ${state.phase === 'game_over' ? 'game-over' : 'hand-end'}`}
              role="dialog"
              aria-label={
                state.phase === 'game_over' ? 'Match over' : 'Hand result'
              }
              onClick={(e) => e.stopPropagation()}
            >
              {state.phase === 'game_over' ? (
                <>
                  <h2 className="round-banner-title">Match over</h2>
                  <p className="round-banner-sub">
                    {state.message ||
                      (state.scores[0] >= state.scores[1]
                        ? 'You & North win!'
                        : 'East & West win!')}
                  </p>
                  <p className="round-banner-sub">
                    Us {state.scores[0]} · Them {state.scores[1]}
                  </p>
                  <ul className="round-banner-rounds">
                    {state.handHistory.map((h, i) => {
                      const cols = formatRoundCols(h)
                      return (
                        <li
                          key={i}
                          className={`results-row ${h.made ? 'made' : 'set'}`}
                        >
                          <span className="results-col bid">{cols.bid}</span>
                          <span className="results-sep" aria-hidden>
                            |
                          </span>
                          <span className="results-col pts">{cols.pts}</span>
                          <span className="results-sep" aria-hidden>
                            |
                          </span>
                          <span className="results-col score">
                            {cols.score}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="round-banner-actions">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => continuePlay()}
                    >
                      Rematch
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => backToLobby()}
                    >
                      Lobby
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="round-banner-title">
                    {state.handResult.made ? 'Bid made' : 'Set!'}
                  </h2>
                  <p className="round-banner-sub">
                    {SEAT_LETTER[lastHistory.bidder]}
                    {lastHistory.bid}
                    {state.trump
                      ? ` · ${suitSymbol(state.trump)} ${suitName(state.trump)}`
                      : ''}
                  </p>
                  <div className="round-banner-stats">
                    <div className="round-stat">
                      <span className="round-stat-label">Points</span>
                      <span className="round-stat-value">
                        Us {state.handResult.teamPointsTaken[0]} · Them{' '}
                        {state.handResult.teamPointsTaken[1]}
                      </span>
                    </div>
                    <div className="round-stat">
                      <span className="round-stat-label">Score</span>
                      <span className="round-stat-value">
                        Us {fmtDelta(state.handResult.teamScoreDelta[0])} ·
                        Them {fmtDelta(state.handResult.teamScoreDelta[1])}
                      </span>
                    </div>
                    <div className="round-stat">
                      <span className="round-stat-label">Total</span>
                      <span className="round-stat-value">
                        Us {state.handResult.scoresAfter[0]} · Them{' '}
                        {state.handResult.scoresAfter[1]}
                      </span>
                    </div>
                  </div>
                  <div className="round-banner-actions">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => continuePlay()}
                    >
                      Deal
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
      </div>
    </div>
  )
}

/**
 * Dump pile layout: diamond-friendly fan.
 * ≤3: single column (50% vertical overlap).
 * 4+: rows of 2, then 3, then 2 with 50% H/V overlap so ranks stay readable.
 */
function dumpLayout(n: number): { col: number; row: number }[] {
  if (n <= 0) return []
  if (n <= 3) {
    return Array.from({ length: n }, (_, i) => ({ col: 0, row: i }))
  }
  // Rows: 2 + 3 + 2 (max 7 shown)
  const rows = [2, 3, 2]
  const pos: { col: number; row: number }[] = []
  let left = n
  let r = 0
  for (const width of rows) {
    if (left <= 0) break
    const take = Math.min(width, left)
    // Center shorter rows under the middle of a 3-wide row
    const offset = (3 - take) / 2
    for (let c = 0; c < take; c++) {
      pos.push({ col: offset + c, row: r })
    }
    left -= take
    r++
  }
  return pos
}

function DumpPile({
  cards,
  className,
  seatLabel,
}: {
  cards: Card[]
  className: string
  seatLabel: string
}) {
  // Cap visual cards so diamond stays compact
  const maxShown = 7
  const shown = cards.slice(0, maxShown)
  const extra = cards.length - shown.length
  const layout = dumpLayout(shown.length)
  const maxRow =
    layout.length === 0 ? 0 : layout.reduce((m, p) => Math.max(m, p.row), 0)
  const maxCol =
    layout.length === 0 ? 0 : layout.reduce((m, p) => Math.max(m, p.col), 0)
  // Unitless strings — never append "px" to custom props used in calc()
  const cols = shown.length <= 3 ? 1 : Math.max(1, Math.ceil(maxCol + 1))
  const rows = Math.max(1, maxRow + 1)

  return (
    <div
      className={`dump-pile ${className}`}
      aria-label={`${seatLabel}: ${cards.length} discarded cards`}
      title={
        cards.length > 0
          ? `${seatLabel} · ${cards.length} cards`
          : `${seatLabel} dump`
      }
    >
      <span className="dump-seat-tag">{seatLabel}</span>
      <div
        className={`dump-fan ${shown.length <= 3 ? 'dump-col' : 'dump-rows'}`}
        style={
          {
            ['--dump-cols' as string]: String(cols),
            ['--dump-rows' as string]: String(rows),
          } as CSSProperties
        }
      >
        {cards.length === 0 ? (
          <div className="dump-empty" />
        ) : (
          shown.map((c, i) => {
            const p = layout[i] ?? { col: 0, row: i }
            return (
              <div
                key={c.id}
                className="dump-card"
                style={
                  {
                    zIndex: i + 1,
                    ['--dc' as string]: String(p.col),
                    ['--dr' as string]: String(p.row),
                  } as CSSProperties
                }
              >
                <CardView card={c} small />
              </div>
            )
          })
        )}
      </div>
      {extra > 0 && <span className="dump-extra">+{extra}</span>}
    </div>
  )
}

/** Max trumps played per seat in a hand — fixed footprint so stacks don't jump */
const PLAYED_STACK_SLOTS = 6

/**
 * Played cards stay on the table.
 * N/S: L→R fan, 40% overlap (60% of prior card visible); latest on top (z).
 * E/W: vertical stack, 40% overlap (60% visible); first at top, latest at bottom.
 * Footprint always reserves PLAYED_STACK_SLOTS so layout stays put.
 */
function PlayedStack({
  cards,
  position,
}: {
  cards: Card[]
  position: 'north' | 'south' | 'west' | 'east'
}) {
  return (
    <div
      className={`played-stack ${position} ${cards.length === 0 ? 'empty' : ''}`}
      style={{ ['--n' as string]: PLAYED_STACK_SLOTS } as CSSProperties}
      aria-label={
        cards.length === 0
          ? undefined
          : `${cards.length} card${cards.length === 1 ? '' : 's'} played`
      }
    >
      {cards.map((c, i) => (
        <div
          key={`${c.id}-${i}`}
          className="played-stack-card"
          style={
            {
              // Latest card always on top of the pile
              zIndex: i + 1,
              ['--i' as string]: i,
            } as CSSProperties
          }
        >
          <CardView card={c} />
        </div>
      ))}
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
  playedCards,
  coldRevealed,
}: {
  label: string | null
  hand: Card[]
  phase: Phase
  trump: Suit | null
  bidStatus: string | null
  bidFresh: boolean
  active: boolean
  position: string
  playedCards: Card[]
  /** Face-up leftovers when play order would have reached this cold seat */
  coldRevealed: boolean
}) {
  // Bidding / trump pick: always 9 face-down (Kokkola +4 stay hidden until trump).
  // After discard: at most 6. Never show 13.
  // Leftover non-trumps turn face-up when coldRevealed (their would-be turn).
  const biddingLike = phase === 'bidding' || phase === 'choose_trump'
  const count = biddingLike ? 9 : hand.length
  const cold =
    coldRevealed &&
    !biddingLike &&
    trump != null &&
    hand.length > 0 &&
    trumpsInHand(hand, trump).length === 0
  const faceCards = cold ? sortHand(hand, trump) : null
  // Fan footprint: 9 pre-trump, 6 in play
  const fanSlots = biddingLike ? 9 : 6
  const n = cold ? faceCards!.length : count
  const renderN = cold ? faceCards!.length : Math.min(count, fanSlots)

  const deck = (
    <div className={`seat-deck ${position}`}>
      <div className="seat-name">{label}</div>
      <div
        className={`seat-cards fan ${position}${cold ? ' face-up' : ''}`}
        style={{ ['--n' as string]: fanSlots } as CSSProperties}
        aria-label={
          cold
            ? `${n} cards remaining (no trumps)`
            : `${count} cards`
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
          : Array.from({ length: renderN }).map((_, i) => {
              const c = hand[i]
              return (
                <div
                  key={c?.id ?? i}
                  className="seat-card-wrap"
                  style={
                    {
                      zIndex: i,
                      ['--i' as string]: i,
                    } as CSSProperties
                  }
                >
                  {c ? (
                    <CardView card={c} faceDown small />
                  ) : (
                    <div className="card face-down card-sm" aria-hidden />
                  )}
                </div>
              )
            })}
      </div>
    </div>
  )

  // Bid pill + played stack share one fixed gutter (overlay) so layout never jumps
  const playGutter = (
    <div className={`seat-play-gutter ${position}`}>
      <div
        className={`seat-callout-slot ${position}`}
        aria-hidden={!bidStatus}
      >
        {bidStatus ? (
          <div
            className={`seat-bid-callout ${position} ${bidFresh ? 'fresh' : ''} ${bidStatus === 'Pass' ? 'pass' : ''} ${bidStatus === '…' ? 'waiting' : ''}`}
          >
            {bidStatus}
          </div>
        ) : null}
      </div>
      <PlayedStack
        cards={playedCards}
        position={position as 'north' | 'south' | 'west' | 'east'}
      />
    </div>
  )

  // West: deck | gutter · East: gutter | deck · North: deck, gutter
  if (position === 'west') {
    return (
      <div className={`seat-slot west ${active ? 'turn' : ''}`}>
        {deck}
        {playGutter}
      </div>
    )
  }
  if (position === 'east') {
    return (
      <div className={`seat-slot east ${active ? 'turn' : ''}`}>
        {playGutter}
        {deck}
      </div>
    )
  }
  return (
    <div className={`seat-slot north ${active ? 'turn' : ''}`}>
      {deck}
      {playGutter}
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
  _state: ReturnType<typeof useGameStore.getState>['state'],
  _seat: Seat,
) {
  return null
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
