import { useState } from 'react'
import type { Difficulty, GameMode } from '../engine'
import { useGameStore } from '../store/gameStore'

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

export function Lobby({ onShowRules }: { onShowRules: () => void }) {
  const start = useGameStore((s) => s.start)
  const resume = useGameStore((s) => s.resume)
  const hasSavedMatch = useGameStore(
    (s) => Boolean(s.savedState && s.savedState.phase !== 'lobby')
  )
  const [west, setWest] = useState<Difficulty>('medium')
  const [north, setNorth] = useState<Difficulty>('medium')
  const [east, setEast] = useState<Difficulty>('medium')
  const [mode, setMode] = useState<GameMode>('classic')

  return (
    <div className="lobby">
      <header className="lobby-hero">
        <div className="lobby-badge">Finnish Pidro</div>
        <h1>Pidro</h1>
        <p className="lobby-sub">
          Bid · trump · take the points
        </p>
      </header>

      <section className="panel">
        <h2>Game mode</h2>
        <p className="hint">
          Classic: refill after trump. Kokkola: +4 cards each after bidding.
        </p>
        <div className="diff-pills mode-pills" role="group" aria-label="Game mode">
          <button
            type="button"
            className={`pill ${mode === 'classic' ? 'active' : ''}`}
            onClick={() => setMode('classic')}
          >
            Classic
          </button>
          <button
            type="button"
            className={`pill ${mode === 'kokkola' ? 'active' : ''}`}
            onClick={() => setMode('kokkola')}
          >
            Kokkola
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Robot opponents</h2>
        <p className="hint">You sit South. Partner is North.</p>
        <DifficultyRow label="West (opponent)" value={west} onChange={setWest} />
        <DifficultyRow label="North (partner)" value={north} onChange={setNorth} />
        <DifficultyRow label="East (opponent)" value={east} onChange={setEast} />
      </section>

      <div className="lobby-actions">
        {hasSavedMatch && (
          <button
            type="button"
            className="btn primary resume-btn"
            onClick={resume}
          >
            Resume match
          </button>
        )}
        <button
          type="button"
          className={hasSavedMatch ? 'btn secondary' : 'btn primary'}
          onClick={() => start([west, north, east], mode)}
        >
          {hasSavedMatch ? 'New match' : 'Deal'}
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
