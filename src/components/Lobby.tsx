import { useState } from 'react'
import type { Difficulty } from '../engine'
import { useGameStore } from '../store/gameStore'

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

export function Lobby({ onShowRules }: { onShowRules: () => void }) {
  const start = useGameStore((s) => s.start)
  const [west, setWest] = useState<Difficulty>('medium')
  const [north, setNorth] = useState<Difficulty>('medium')
  const [east, setEast] = useState<Difficulty>('medium')

  return (
    <div className="lobby">
      <header className="lobby-hero">
        <div className="lobby-badge">Finnish Pidro</div>
        <h1>Pidro</h1>
        <p className="lobby-sub">
          Partnership trick-taking · bid · trump · take the points
        </p>
      </header>

      <section className="panel">
        <h2>Robot opponents</h2>
        <p className="hint">You sit South. Partner is North.</p>
        <DifficultyRow label="West (opponent)" value={west} onChange={setWest} />
        <DifficultyRow label="North (partner)" value={north} onChange={setNorth} />
        <DifficultyRow label="East (opponent)" value={east} onChange={setEast} />
      </section>

      <div className="lobby-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => start([west, north, east])}
        >
          Deal
        </button>
        <button type="button" className="btn ghost" onClick={onShowRules}>
          How to play
        </button>
      </div>
    </div>
  )
}

function DifficultyRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: Difficulty
  onChange: (d: Difficulty) => void
}) {
  return (
    <div className="diff-row">
      <span className="diff-label">{label}</span>
      <div className="diff-pills" role="group" aria-label={label}>
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`pill ${value === lvl ? 'active' : ''}`}
            onClick={() => onChange(lvl)}
          >
            {lvl}
          </button>
        ))}
      </div>
    </div>
  )
}
