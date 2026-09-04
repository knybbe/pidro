import { describe, expect, it } from 'vitest'
import { compareUpdatedAt, mergeByUpdatedAt } from './merge'

describe('mergeByUpdatedAt', () => {
  it('keeps newer record per id (last-write-wins)', () => {
    const local = [
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', v: 'local-old' },
      { id: 'b', updatedAt: '2026-01-02T00:00:00.000Z', v: 'local-b' },
    ]
    const remote = [
      { id: 'a', updatedAt: '2026-01-03T00:00:00.000Z', v: 'remote-new' },
      { id: 'c', updatedAt: '2026-01-01T12:00:00.000Z', v: 'remote-c' },
    ]
    const merged = mergeByUpdatedAt(local, remote, 50)
    expect(merged.map((g) => g.id)).toEqual(['a', 'b', 'c'])
    expect(merged.find((g) => g.id === 'a')?.v).toBe('remote-new')
    expect(merged.find((g) => g.id === 'b')?.v).toBe('local-b')
  })

  it('does not wipe newer local data with older remote', () => {
    const local = [{ id: 'a', updatedAt: '2026-06-01T00:00:00.000Z', score: 62 }]
    const remote = [{ id: 'a', updatedAt: '2026-05-01T00:00:00.000Z', score: 10 }]
    const merged = mergeByUpdatedAt(local, remote, 50)
    expect(merged).toHaveLength(1)
    expect(merged[0].score).toBe(62)
  })

  it('trims to maxCount newest-first', () => {
    const local = [
      { id: '1', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', updatedAt: '2026-01-03T00:00:00.000Z' },
      { id: '3', updatedAt: '2026-01-02T00:00:00.000Z' },
    ]
    const merged = mergeByUpdatedAt(local, [], 2)
    expect(merged.map((g) => g.id)).toEqual(['2', '3'])
  })

  it('compareUpdatedAt orders ISO timestamps', () => {
    expect(compareUpdatedAt('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBeGreaterThan(0)
    expect(compareUpdatedAt('bad', '2026-01-01T00:00:00.000Z')).toBeLessThan(0)
  })
})
