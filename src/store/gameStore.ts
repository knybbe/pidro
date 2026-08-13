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
  type BotConfig,
  type Difficulty,
  type GameMode,
  type GameState,
  type RiskLevel,
  type Seat,
  type Suit,
} from '../engine'

const PLAY_BOT_DELAY_MS = 450
const BID_DELAY_KEY = 'pidro-bid-delay-sec'
const GAME_STATE_KEY = 'pidro-saved-game-state'

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

function loadSavedState(): GameState | null {
  try {
    const raw = localStorage.getItem(GAME_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.phase &&
      parsed.phase !== 'lobby' &&
      Array.isArray(parsed.seats)
    ) {
      return parsed
    }
  } catch {
    /* ignore invalid stored state */
  }
  return null
}

function saveSavedState(state: GameState | null): void {
  try {
    if (!state || state.phase === 'lobby') {
      localStorage.removeItem(GAME_STATE_KEY)
    } else {
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state))
    }
  } catch {
    /* ignore storage quota/incognito errors */
  }
}

interface GameStore {
  state: GameState
  savedState: GameState | null
  botTimer: ReturnType<typeof setTimeout> | null
  /** Monotonic id so stale timeouts never apply */
  botEpoch: number
  /** Seconds to wait before each robot bid (0–3). Default 1. */
  bidDelaySec: BidDelaySec
  setBidDelaySec: (sec: BidDelaySec) => void
  start: (
    bots:
      | [BotConfig, BotConfig, BotConfig]
      | [Difficulty, Difficulty, Difficulty],
    gameMode?: GameMode,
    biddingRisk?: RiskLevel,
  ) => void
  resume: () => void
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
  set({ state: next, savedState: next })
  saveSavedState(next)
  queueMicrotask(() => get().kickBots())
}

const initialSaved = loadSavedState()

export const useGameStore = create<GameStore>((set, get) => ({
  state: initialSaved || createLobbyState(),
  savedState: initialSaved,
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

  start: (bots, gameMode = 'classic', biddingRisk = 'medium') => {
    clearBot(get, set)
    const state = startMatch(
      createLobbyState(undefined, undefined, gameMode),
      {
        bots,
        biddingRisk,
        gameMode,
      },
    )
    set({ state, savedState: state })
    saveSavedState(state)
    queueMicrotask(() => get().kickBots())
  },

  resume: () => {
    const saved = loadSavedState() || get().savedState
    if (saved && saved.phase !== 'lobby') {
      clearBot(get, set)
      set({ state: saved, savedState: saved })
      saveSavedState(saved)
      queueMicrotask(() => get().kickBots())
    }
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
      set({ state: next, savedState: next })
      saveSavedState(next)
      queueMicrotask(() => get().kickBots())
    } catch (e) {
      console.error('pickTrump failed', e, { suit, phase: state.phase, seat })
    }
  },

  play: (cardId) => {
    clearBot(get, set)
    let state = get().state

    // Clicking a card during trick pause: advance the table, then play if legal
    if (state.phase === 'trick_pause') {
      try {
        state = continueAfterTrick(state)
        set({ state, savedState: state })
        saveSavedState(state)
      } catch (e) {
        console.error('continue before play failed', e)
        return
      }
    }

    if (state.phase !== 'playing' || state.currentSeat === null) {
      queueMicrotask(() => get().kickBots())
      return
    }
    if (state.seats[state.currentSeat].kind !== 'human') {
      queueMicrotask(() => get().kickBots())
      return
    }
    try {
      const next = playCard(state, state.currentSeat as Seat, cardId)
      set({ state: next, savedState: next })
      saveSavedState(next)
      queueMicrotask(() => get().kickBots())
    } catch (e) {
      // Card not legal after continue (e.g. not our lead) — leave advanced state
      console.error('play failed', e)
      queueMicrotask(() => get().kickBots())
    }
  },

  continuePlay: () => {
    clearBot(get, set)
    const { state } = get()
    try {
      if (state.phase === 'trick_pause') {
        const next = continueAfterTrick(state)
        set({ state: next, savedState: next })
        saveSavedState(next)
        queueMicrotask(() => get().kickBots())
        return
      }
      if (state.phase === 'hand_result') {
        const next = nextHand(state)
        set({ state: next, savedState: next })
        saveSavedState(next)
        queueMicrotask(() => get().kickBots())
        return
      }
      if (state.phase === 'game_over') {
        const next = rematch(state)
        set({ state: next, savedState: next })
        saveSavedState(next)
        queueMicrotask(() => get().kickBots())
      }
    } catch (e) {
      console.error('continuePlay failed', e)
    }
  },

  doRematch: () => {
    clearBot(get, set)
    const state = rematch(get().state)
    set({ state, savedState: state })
    saveSavedState(state)
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

if (initialSaved && initialSaved.phase !== 'lobby') {
  queueMicrotask(() => {
    useGameStore.getState().kickBots()
  })
}

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

  set({ state: next, savedState: next })
  saveSavedState(next)

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
