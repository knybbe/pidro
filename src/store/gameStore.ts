import { create } from 'zustand'
import { botAct } from '../ai'
import {
  chooseTrump,
  continueAfterTrick,
  createLobbyState,
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

const PLAY_BOT_DELAY_MS = 550
const BID_DELAY_KEY = 'pidro-bid-delay-sec'

export type BidDelaySec = 1 | 2 | 3 | 4 | 5

function loadBidDelay(): BidDelaySec {
  try {
    const v = Number(localStorage.getItem(BID_DELAY_KEY))
    if (v >= 1 && v <= 5) return v as BidDelaySec
  } catch {
    /* ignore */
  }
  return 2
}

interface GameStore {
  state: GameState
  botTimer: ReturnType<typeof setTimeout> | null
  /** Seconds to wait before each robot bid (1–5). Default 2. */
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
    const { state } = get()
    if (state.phase !== 'choose_trump' || state.bidder === null) return
    if (state.seats[state.bidder].kind !== 'human') return
    applyHuman(get, set, (s) => chooseTrump(s, s.bidder as Seat, suit))
  },

  play: (cardId) => {
    const { state } = get()
    if (state.phase !== 'playing' || state.currentSeat === null) return
    if (state.seats[state.currentSeat].kind !== 'human') return
    applyHuman(get, set, (s) => playCard(s, s.currentSeat as Seat, cardId))
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
    clearBot(get, set)
    const run = () => {
      const { state, bidDelaySec } = get()
      const seat = actingSeat(state)
      if (seat === null) return
      if (state.seats[seat].kind !== 'bot') return

      const phaseBefore = state.phase

      try {
        const action = botAct(state, seat)
        let next = state
        if (action.type === 'bid') next = placeBid(state, seat, action.bid)
        else if (action.type === 'trump')
          next = chooseTrump(state, seat, action.suit)
        else if (action.type === 'play')
          next = playCard(state, seat, action.cardId)
        set({ state: next })
      } catch (e) {
        console.error('Bot error', e)
        return
      }

      const again = actingSeat(get().state)
      if (again !== null && get().state.seats[again].kind === 'bot') {
        // After a bid, wait the full bid delay so each call is visible one-at-a-time
        const delay =
          phaseBefore === 'bidding' || get().state.phase === 'bidding'
            ? bidDelaySec * 1000
            : PLAY_BOT_DELAY_MS
        const timer = setTimeout(run, delay)
        set({ botTimer: timer })
      }
    }

    const seat = actingSeat(get().state)
    if (seat !== null && get().state.seats[seat].kind === 'bot') {
      const { state, bidDelaySec } = get()
      // First bot bid in a sequence also uses bid delay (pause before reveal)
      const delay =
        state.phase === 'bidding' ? bidDelaySec * 1000 : PLAY_BOT_DELAY_MS
      const timer = setTimeout(run, delay)
      set({ botTimer: timer })
    }
  },
}))

function actingSeat(state: GameState): Seat | null {
  if (state.phase === 'bidding' || state.phase === 'playing') {
    return state.currentSeat
  }
  if (state.phase === 'choose_trump') return state.bidder
  return null
}

function clearBot(
  get: () => GameStore,
  set: (p: Partial<GameStore>) => void,
) {
  const t = get().botTimer
  if (t) clearTimeout(t)
  set({ botTimer: null })
}
