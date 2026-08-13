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
})
