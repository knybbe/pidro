import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHistorySaveError,
  clearLocalHistory,
  getHistorySaveError,
  readLocalHistory,
  writeLocalHistory,
} from './localStore'
import type { GameHistoryRecord } from '../history'
import { createLobbyState, startMatch } from '../game'
import { createNewGameRecord } from '../history'

const storageMock: Record<string, string> = {}
let quotaFail = false

globalThis.localStorage = {
  getItem: (key: string) => storageMock[key] ?? null,
  setItem: (key: string, value: string) => {
    if (quotaFail) {
      const err = new Error('QuotaExceededError')
      err.name = 'QuotaExceededError'
      throw err
    }
    storageMock[key] = value
  },
  removeItem: (key: string) => {
    delete storageMock[key]
  },
  clear: () => {
    for (const k of Object.keys(storageMock)) delete storageMock[k]
  },
  length: 0,
  key: () => null,
}

function makeRecord(seed: number, status: 'in_progress' | 'finished' = 'finished'): GameHistoryRecord {
  const state = startMatch(createLobbyState(seed), { seed, gameMode: 'classic' })
  const rec = createNewGameRecord(state, new Date(`2026-01-${String((seed % 28) + 1).padStart(2, '0')}T00:00:00.000Z`))
  // createNewGameRecord already wrote via upsert — clear and return mutable copy
  clearLocalHistory()
  return { ...rec, status, updatedAt: rec.updatedAt }
}

describe('localStore history persistence', () => {
  beforeEach(() => {
    quotaFail = false
    clearLocalHistory()
    clearHistorySaveError()
    for (const k of Object.keys(storageMock)) delete storageMock[k]
  })

  it('writes and reads compacted history', () => {
    const rec = makeRecord(42)
    const saved = writeLocalHistory([rec], 50)
    expect(saved).toHaveLength(1)
    expect(readLocalHistory()[0].id).toBe(rec.id)
    expect(readLocalHistory()[0].latestStateSnapshot.message).toBe('')
  })

  it('surfaces QuotaExceededError when all retry attempts fail', () => {
    const rec = makeRecord(7)
    quotaFail = true
    writeLocalHistory([rec], 50)
    const err = getHistorySaveError()
    expect(err).not.toBeNull()
    expect(err?.quotaExceeded).toBe(true)
    expect(err?.message).toMatch(/storage is full/i)
  })

  it('clears save error after a successful write', () => {
    const rec = makeRecord(9)
    quotaFail = true
    writeLocalHistory([rec], 50)
    expect(getHistorySaveError()).not.toBeNull()
    quotaFail = false
    writeLocalHistory([rec], 50)
    expect(getHistorySaveError()).toBeNull()
  })
})
