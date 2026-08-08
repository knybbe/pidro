import { create } from 'zustand'
import { botAct } from '../ai'
import {
  chooseTrump,
  continueAfterTrick,
  createLobbyState,
  legalPlays,
  nextHand,
  placeBid,
  playCard,
  rematch,
  startMatch,
  type Difficulty,
  type GameState,
  type Seat,
  type Suit,
} from '../engine'

const PLAY_BOT_DELAY_MS = 450
const BID_DELAY_KEY = 'pidro-bid-delay-sec'

export type BidDelaySec = 0 | 1 | 2 | 3

function loadBidDelay(): BidDelaySec {
  try {
    const v = Number(localStorage.getItem(BID_DELAY_KEY))
    if (v >= 0 && v <= 3) return v as BidDelaySec
  } catch {
    /* ignore */
  }
  return 1
}

interface GameStore {
  state: GameState
  botTimer: ReturnType<typeof setTimeout> | null
  /** Monotonic id so stale timeouts never apply */
  botEpoch: number
  /** Seconds to wait before each robot bid (0–3). Default 1. */
  bidDelaySec: BidDelaySec
  setBidDelaySec: (sec: BidDelaySec) => void
  start: (difficulties: [Difficulty, Difficulty, Difficulty]) => void
  bid: (bid: number | null) => void
  pickTrump: (suit: Suit) => void
  play: (cardId: string) => void
  /** Advance after trick_pause, hand_result, or game_over */
  continuePlay: () => void
  doRematch: () => void
  backToLobby: () => void
  /** Advance bots while it is a bot seat's turn */
  kickBots: () => void
}

function applyHuman(
  get: () => GameStore,
  set: (
    partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
  ) => void,
  updater: (state: GameState) => GameState,
) {
  const next = updater(get().state)
  set({ state: next })
  queueMicrotask(() => get().kickBots())
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: createLobbyState(),
  botTimer: null,
  botEpoch: 0,
  bidDelaySec: loadBidDelay(),

  setBidDelaySec: (sec) => {
    set({ bidDelaySec: sec })
    try {
      localStorage.setItem(BID_DELAY_KEY, String(sec))
    } catch {
      /* ignore */
    }
  },

  start: (difficulties) => {
    clearBot(get, set)
    const state = startMatch(createLobbyState(), { difficulties })
    set({ state })
    queueMicrotask(() => get().kickBots())
  },

  bid: (bid) => {
    const { state } = get()
    if (state.phase !== 'bidding' || state.currentSeat === null) return
    if (state.seats[state.currentSeat].kind !== 'human') return
    applyHuman(get, set, (s) => placeBid(s, s.currentSeat as Seat, bid))
  },

  pickTrump: (suit) => {
    clearBot(get, set)
    const state = get().state
    if (state.phase !== 'choose_trump') return
    const seat = state.bidder
    if (seat === null) return
    if (state.seats[seat].kind !== 'human') return
    try {
      const next = chooseTrump(state, seat, suit)
      set({ state: next })
      queueMicrotask(() => get().kickBots())
    } catch (e) {
      console.error('pickTrump failed', e, { suit, phase: state.phase, seat })
    }
  },

  play: (cardId) => {
    const { state } = get()
    if (state.phase !== 'playing' || state.currentSeat === null) return
    if (state.seats[state.currentSeat].kind !== 'human') return
    try {
      applyHuman(get, set, (s) => playCard(s, s.currentSeat as Seat, cardId))
    } catch (e) {
      console.error('play failed', e)
    }
  },

  continuePlay: () => {
    clearBot(get, set)
    const { state } = get()
    if (state.phase === 'trick_pause') {
      set({ state: continueAfterTrick(state) })
      queueMicrotask(() => get().kickBots())
      return
    }
    if (state.phase === 'hand_result') {
      set({ state: nextHand(state) })
      queueMicrotask(() => get().kickBots())
      return
    }
    if (state.phase === 'game_over') {
      set({ state: rematch(state) })
      queueMicrotask(() => get().kickBots())
    }
  },

  doRematch: () => {
    clearBot(get, set)
    const state = rematch(get().state)
    set({ state })
    queueMicrotask(() => get().kickBots())
  },

  backToLobby: () => {
    clearBot(get, set)
    set({ state: createLobbyState() })
  },

  kickBots: () => {
    // Already a bot step queued — don't cancel it (avoids race with safety net)
    if (get().botTimer !== null) return

    const seat = actingSeat(get().state)
    if (seat === null || get().state.seats[seat].kind !== 'bot') return

    scheduleBotStep(get, set)
  },
}))

function actingSeat(state: GameState): Seat | null {
  if (state.phase === 'bidding' || state.phase === 'playing') {
    return state.currentSeat
  }
  if (state.phase === 'choose_trump') return state.bidder
  return null
}

function delayForPhase(phase: GameState['phase'], bidDelaySec: BidDelaySec): number {
  if (phase === 'bidding' || phase === 'choose_trump') {
    return bidDelaySec * 1000
  }
  return PLAY_BOT_DELAY_MS
}

function scheduleBotStep(
  get: () => GameStore,
  set: (
    partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
  ) => void,
) {
  const epoch = get().botEpoch + 1
  const { state, bidDelaySec } = get()
  const delay = delayForPhase(state.phase, bidDelaySec)

  const timer = setTimeout(() => {
    // Stale timeout from a cleared/superseded epoch
    if (get().botEpoch !== epoch) return
    set({ botTimer: null })
    runBotOnce(get, set)
  }, delay)

  set({ botTimer: timer, botEpoch: epoch })
}

function runBotOnce(
  get: () => GameStore,
  set: (
    partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
  ) => void,
) {
  const state = get().state
  const seat = actingSeat(state)
  if (seat === null) return
  if (state.seats[seat].kind !== 'bot') return

  let next = state
  try {
    const action = botAct(state, seat)
    if (action.type === 'bid') next = placeBid(state, seat, action.bid)
    else if (action.type === 'trump')
      next = chooseTrump(state, seat, action.suit)
    else if (action.type === 'play')
      next = playCard(state, seat, action.cardId)
  } catch (e) {
    console.error('Bot error', e, {
      phase: state.phase,
      seat,
      message: state.message,
    })
    next = recoverBot(state, seat)
    if (next === state) {
      // Could not recover — leave state; watchdog may retry
      return
    }
  }

  set({ state: next })

  // Chain: if still a bot's turn, queue the next step
  const again = actingSeat(get().state)
  if (again !== null && get().state.seats[again].kind === 'bot') {
    scheduleBotStep(get, set)
  }
}

/** Force a legal play, or pass the lead if this seat has nothing to play. */
function recoverBot(state: GameState, seat: Seat): GameState {
  if (state.phase === 'choose_trump' && state.bidder === seat) {
    try {
      const suit = state.hands[seat][0]?.suit ?? 'S'
      return chooseTrump(state, seat, suit)
    } catch {
      return state
    }
  }
  if (state.phase === 'bidding' && state.currentSeat === seat) {
    try {
      return placeBid(state, seat, null)
    } catch {
      try {
        return placeBid(state, seat, 6)
      } catch {
        return state
      }
    }
  }
  if (state.phase === 'playing' && state.currentSeat === seat) {
    const legal = legalPlays(state, seat)
    if (legal.length > 0) {
      try {
        return playCard(state, seat, legal[0].id)
      } catch {
        return state
      }
    }
  }
  return state
}

function clearBot(
  get: () => GameStore,
  set: (p: Partial<GameStore>) => void,
) {
  const t = get().botTimer
  if (t) clearTimeout(t)
  set({ botTimer: null, botEpoch: get().botEpoch + 1 })
}
