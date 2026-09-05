import { useEffect, useState } from 'react'
import { HistoryModal } from './components/HistoryModal'
import { InfoModal } from './components/InfoModal'
import { Lobby } from './components/Lobby'
import { RulesModal } from './components/RulesModal'
import { Table } from './components/Table'
import {
  initFolderSync,
  syncGameHistoryFromFolder,
} from './engine/history'
import { useVersionCheck } from './hooks/useVersionCheck'
import { useGameStore } from './store/gameStore'

export default function App() {
  const phase = useGameStore((s) => s.state.phase)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const { status: versionStatus } = useVersionCheck()

  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      await initFolderSync()
      if (cancelled) return
      await syncGameHistoryFromFolder()
    }
    void sync()

    const onFocus = () => {
      void syncGameHistoryFromFolder()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void syncGameHistoryFromFolder()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <div className="app">
      {phase === 'lobby' ? (
        <Lobby
          onShowRules={() => setRulesOpen(true)}
          onShowInfo={() => setInfoOpen(true)}
          onShowHistory={() => setHistoryOpen(true)}
          versionStatus={versionStatus}
        />
      ) : (
        <Table
          onShowRules={() => setRulesOpen(true)}
          versionStatus={versionStatus}
        />
      )}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  )
}
