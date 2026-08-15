import { useState } from 'react'
import { HistoryModal } from './components/HistoryModal'
import { InfoModal } from './components/InfoModal'
import { Lobby } from './components/Lobby'
import { RulesModal } from './components/RulesModal'
import { Table } from './components/Table'
import { useGameStore } from './store/gameStore'

export default function App() {
  const phase = useGameStore((s) => s.state.phase)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="app">
      {phase === 'lobby' ? (
        <Lobby
          onShowRules={() => setRulesOpen(true)}
          onShowInfo={() => setInfoOpen(true)}
          onShowHistory={() => setHistoryOpen(true)}
        />
      ) : (
        <Table onShowRules={() => setRulesOpen(true)} />
      )}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  )
}
