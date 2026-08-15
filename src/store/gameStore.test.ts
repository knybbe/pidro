import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

// Simple in-memory localStorage mock for node test environment
const memoryStore = new Map<string, string>()

const localStorageMock: Storage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value)
  },
  removeItem: (key: string) => {
    memoryStore.delete(key)
  },
  clear: () => {
    memoryStore.clear()
  },
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
  get length() {
    return memoryStore.size
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('gameStore persistence and resume', () => {
  beforeEach(() => {
    localStorage.clear()
    useGameStore.getState().backToLobby()
  })

  it('saves match state to localStorage when a new match is started', () => {
    const store = useGameStore.getState()
    expect(store.state.phase).toBe('lobby')

    store.start(['medium', 'medium', 'medium'], 'classic')

    const currentPhase = useGameStore.getState().state.phase
    expect(currentPhase).not.toBe('lobby')

    const saved = localStorage.getItem('pidro-saved-game-state')
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed.phase).toBe(currentPhase)
  })

  it('allows resuming an ongoing match from the lobby', () => {
    const store = useGameStore.getState()
    store.start(['medium', 'medium', 'medium'], 'classic')
    const ongoingState = useGameStore.getState().state

    // Go back to lobby (simulating user exiting to menu)
    store.backToLobby()
    expect(useGameStore.getState().state.phase).toBe('lobby')
    expect(useGameStore.getState().savedState).not.toBeNull()

    // Resume match from lobby
    useGameStore.getState().resume()
    expect(useGameStore.getState().state.phase).toBe(ongoingState.phase)
    expect(useGameStore.getState().state.dealer).toBe(ongoingState.dealer)
  })

  it('persists and updates game mode in localStorage and store', () => {
    const store = useGameStore.getState()
    expect(store.gameMode).toBe('classic')

    store.setGameMode('kokkola')
    expect(useGameStore.getState().gameMode).toBe('kokkola')
    expect(localStorage.getItem('pidro-game-mode')).toBe('kokkola')

    // Returning to lobby preserves the chosen gameMode
    store.backToLobby()
    expect(useGameStore.getState().gameMode).toBe('kokkola')
    expect(useGameStore.getState().state.gameMode).toBe('kokkola')
  })

  it('persists and updates individual player bot modes in localStorage and store', () => {
    const store = useGameStore.getState()
    expect(store.botConfigs).toEqual([
      { difficulty: 'medium', biddingRisk: 'medium' },
      { difficulty: 'medium', biddingRisk: 'medium' },
      { difficulty: 'medium', biddingRisk: 'medium' },
    ])

    // Update West (index 0) to hard / high risk
    store.setBotConfig(0, { difficulty: 'hard', biddingRisk: 'high' })
    // Update North (index 1) to easy / low risk
    store.setBotConfig(1, { difficulty: 'easy', biddingRisk: 'low' })

    const updated = useGameStore.getState().botConfigs
    expect(updated[0]).toEqual({ difficulty: 'hard', biddingRisk: 'high' })
    expect(updated[1]).toEqual({ difficulty: 'easy', biddingRisk: 'low' })
    expect(updated[2]).toEqual({ difficulty: 'medium', biddingRisk: 'medium' })

    const saved = localStorage.getItem('pidro-bot-configs')
    expect(saved).not.toBeNull()
    expect(JSON.parse(saved!)).toEqual(updated)
  })

  it('preserves chosen bot configs and gameMode when starting a match', () => {
    const store = useGameStore.getState()
    store.setGameMode('kokkola')
    store.setBotConfig(0, { difficulty: 'hard', biddingRisk: 'high' })
    store.setBotConfig(1, { difficulty: 'hard', biddingRisk: 'low' })
    store.setBotConfig(2, { difficulty: 'easy', biddingRisk: 'high' })

    // Start match using the remembered settings
    store.start()

    const matchState = useGameStore.getState().state
    expect(matchState.gameMode).toBe('kokkola')
    expect(matchState.seats[1]).toMatchObject({
      difficulty: 'hard',
      biddingRisk: 'high',
      name: 'West',
    })
    expect(matchState.seats[2]).toMatchObject({
      difficulty: 'hard',
      biddingRisk: 'low',
      name: 'North',
    })
    expect(matchState.seats[3]).toMatchObject({
      difficulty: 'easy',
      biddingRisk: 'high',
      name: 'East',
    })

    // Exiting back to lobby retains settings
    useGameStore.getState().backToLobby()
    expect(useGameStore.getState().gameMode).toBe('kokkola')
    expect(useGameStore.getState().botConfigs[0]).toEqual({
      difficulty: 'hard',
      biddingRisk: 'high',
    })
  })
})

