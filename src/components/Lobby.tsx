import type { BotConfig, Difficulty, RiskLevel } from '../engine'
import { useGameStore } from '../store/gameStore'

const LEVELS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Mid' },
  { key: 'hard', label: 'Hard' },
]
const RISKS: { key: RiskLevel; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Mid' },
  { key: 'high', label: 'High' },
]

export function Lobby({ onShowRules }: { onShowRules: () => void }) {
  const start = useGameStore((s) => s.start)
  const resume = useGameStore((s) => s.resume)
  const hasSavedMatch = useGameStore(
    (s) => Boolean(s.savedState && s.savedState.phase !== 'lobby'),
  )
  const mode = useGameStore((s) => s.gameMode)
  const setMode = useGameStore((s) => s.setGameMode)
  const botConfigs = useGameStore((s) => s.botConfigs)
  const setBotConfig = useGameStore((s) => s.setBotConfig)

  const west = botConfigs[0]
  const north = botConfigs[1]
  const east = botConfigs[2]

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
        <h2>Robot players</h2>
        <p className="hint">You sit South. Partner is North.</p>
        <div className="bot-configs-list">
          <BotConfigRow
            name="West"
            role="Opponent"
            config={west}
            onChange={(cfg) => setBotConfig(0, cfg)}
          />
          <BotConfigRow
            name="North"
            role="Partner"
            config={north}
            onChange={(cfg) => setBotConfig(1, cfg)}
          />
          <BotConfigRow
            name="East"
            role="Opponent"
            config={east}
            onChange={(cfg) => setBotConfig(2, cfg)}
          />
        </div>
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
        <div className="lobby-version">v0.8.43</div>
      </div>
    </div>
  )
}

function BotConfigRow({
  name,
  role,
  config,
  onChange,
}: {
  name: string
  role: string
  config: BotConfig
  onChange: (cfg: BotConfig) => void
}) {
  const diff = config.difficulty ?? 'medium'
  const risk = config.biddingRisk ?? 'medium'

  return (
    <div className="bot-config-card">
      <div className="bot-config-header">
        <span className="bot-name">{name}</span>
        <span className="bot-role">{role}</span>
      </div>
      <div className="bot-settings-grid">
        <div className="bot-setting-group">
          <span className="bot-setting-label">Skill</span>
          <div className="mini-pills" role="group" aria-label={`${name} skill`}>
            {LEVELS.map((lvl) => (
              <button
                key={lvl.key}
                type="button"
                className={`pill mini-pill ${diff === lvl.key ? 'active' : ''}`}
                onClick={() => onChange({ ...config, difficulty: lvl.key })}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bot-setting-group">
          <span className="bot-setting-label">Bidding Risk</span>
          <div className="mini-pills" role="group" aria-label={`${name} bidding risk`}>
            {RISKS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`pill mini-pill ${risk === r.key ? 'active' : ''}`}
                onClick={() => onChange({ ...config, biddingRisk: r.key })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
