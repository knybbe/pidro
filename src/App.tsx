import { useState } from 'react'
import { Lobby } from './components/Lobby'
import { RulesModal } from './components/RulesModal'
import { Table } from './components/Table'
import { useGameStore } from './store/gameStore'

export default function App() {
  const phase = useGameStore((s) => s.state.phase)
  const [rulesOpen, setRulesOpen] = useState(false)

  return (
    <div className="app">
      {phase === 'lobby' ? (
        <Lobby onShowRules={() => setRulesOpen(true)} />
      ) : (
        <Table onShowRules={() => setRulesOpen(true)} />
      )}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}
