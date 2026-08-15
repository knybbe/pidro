import { useState } from 'react'
import {
  formatGameLogAsText,
  loadGameHistory,
  type GameHistoryRecord,
} from '../engine/history'
import { suitSymbol } from '../engine/rules'
import { useGameStore } from '../store/gameStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function HistoryModal({ open, onClose }: Props) {
  const [history, setHistory] = useState<GameHistoryRecord[]>(() => loadGameHistory())
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null)
  const [expandedRoundIdx, setExpandedRoundIdx] = useState<{ [gameId: string]: number | null }>({})
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const loadFromHistory = useGameStore((s) => s.loadGameFromHistory)
  const branchFromRound = useGameStore((s) => s.branchGameFromRound)
  const deleteFromHistory = useGameStore((s) => s.deleteGameFromHistory)

  if (!open) return null

  const handleCopyLog = async (record: GameHistoryRecord) => {
    try {
      const text = formatGameLogAsText(record)
      await navigator.clipboard.writeText(text)
      setCopyFeedback(record.id)
      setTimeout(() => setCopyFeedback(null), 2500)
    } catch (e) {
      console.error('Failed to copy match log:', e)
    }
  }

  const handleResume = (recordId: string) => {
    loadFromHistory(recordId)
    onClose()
  }

  const handleBranch = (recordId: string, roundIndex: number) => {
    branchFromRound(recordId, roundIndex)
    onClose()
  }

  const handleDelete = (recordId: string) => {
    deleteFromHistory(recordId)
    setHistory((prev) => prev.filter((g) => g.id !== recordId))
  }

  const toggleExpand = (gameId: string) => {
    setExpandedGameId((prev) => (prev === gameId ? null : gameId))
  }

  const toggleRoundExpand = (gameId: string, roundIdx: number) => {
    setExpandedRoundIdx((prev) => ({
      ...prev,
      [gameId]: prev[gameId] === roundIdx ? null : roundIdx,
    }))
  }

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal history-modal"
        role="dialog"
        aria-labelledby="history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="history-title">📜 Match History & Logs</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="modal-body history-modal-body">
          {history.length === 0 ? (
            <div className="history-empty">
              <p className="history-empty-icon">🎴</p>
              <p><strong>No saved matches found yet.</strong></p>
              <p className="hint">
                Every match you play is automatically logged here with full round-by-round replay data and debug logs.
              </p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((record) => {
                const isExpanded = expandedGameId === record.id
                const isHumanWinner = record.winnerTeam === 0
                const isFinished = record.status === 'finished'

                return (
                  <div key={record.id} className="history-card">
                    <div className="history-card-header">
                      <div className="history-card-meta">
                        <span className="history-card-date">
                          {formatDate(record.startedAt)}
                        </span>
                        <span className="history-badge mode-badge">
                          {record.gameMode}
                        </span>
                        <span
                          className={`history-badge status-badge ${
                            isFinished
                              ? isHumanWinner
                                ? 'status-won'
                                : 'status-lost'
                              : 'status-progress'
                          }`}
                        >
                          {isFinished
                            ? isHumanWinner
                              ? 'Won'
                              : 'Lost'
                            : 'In Progress'}
                        </span>
                      </div>

                      <div className="history-score-row">
                        <div className="history-team-score">
                          <span className="team-name">You & North:</span>
                          <span className="score-val">{record.finalScores[0]}</span>
                        </div>
                        <span className="score-divider">–</span>
                        <div className="history-team-score">
                          <span className="team-name">West & East:</span>
                          <span className="score-val">{record.finalScores[1]}</span>
                        </div>
                      </div>
                    </div>

                    <div className="history-card-actions">
                      {!isFinished && (
                        <button
                          type="button"
                          className="btn primary btn-sm"
                          onClick={() => handleResume(record.id)}
                        >
                          ▶ Resume
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => toggleExpand(record.id)}
                      >
                        {isExpanded ? 'Hide Rounds ▲' : `Rounds (${record.rounds.length}) ▼`}
                      </button>

                      <button
                        type="button"
                        className="btn secondary btn-sm copy-log-btn"
                        onClick={() => handleCopyLog(record)}
                        title="Copy full debug and replay log to clipboard"
                      >
                        {copyFeedback === record.id ? '✓ Log Copied!' : '📋 Copy Log'}
                      </button>

                      <button
                        type="button"
                        className="btn secondary btn-sm delete-btn"
                        onClick={() => handleDelete(record.id)}
                        title="Delete game from history"
                        aria-label="Delete game"
                      >
                        🗑
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="history-rounds-container">
                        <h4 className="history-rounds-title">Round History & Branch Replays</h4>
                        <p className="hint">
                          Select any round below to branch into a new game with current timestamp and test alternative plays!
                        </p>

                        <div className="history-rounds-list">
                          {record.rounds.map((round, rIdx) => {
                            const isRoundExpanded = expandedRoundIdx[record.id] === rIdx
                            const dealerName = record.seats[round.dealer]?.name ?? `Seat ${round.dealer}`
                            const bidderName =
                              round.bidWinner !== null
                                ? record.seats[round.bidWinner.seat]?.name ?? `Seat ${round.bidWinner.seat}`
                                : 'None'

                            return (
                              <div key={round.roundNumber} className="history-round-item">
                                <div className="history-round-summary">
                                  <div className="history-round-info">
                                    <span className="round-pill">R{round.roundNumber}</span>
                                    <span className="round-dealer">D: {dealerName}</span>
                                    {round.bidWinner && (
                                      <span className="round-contract">
                                        Bid: {bidderName} ({round.bidWinner.bid}
                                        {round.trump ? ` ${suitSymbol(round.trump)}` : ''})
                                      </span>
                                    )}
                                    {round.result && (
                                      <span
                                        className={`round-result-badge ${
                                          round.result.made ? 'made' : 'failed'
                                        }`}
                                      >
                                        {round.result.made ? 'Made' : 'Set'} (Pts: {round.result.teamPointsTaken[0]}-{round.result.teamPointsTaken[1]})
                                      </span>
                                    )}
                                  </div>

                                  <div className="history-round-actions">
                                    <button
                                      type="button"
                                      className="btn secondary btn-xs"
                                      onClick={() => handleBranch(record.id, rIdx)}
                                      title="Branch and replay from this round to test alternative decisions"
                                    >
                                      🔄 Replay Round {round.roundNumber}
                                    </button>

                                    {round.tricks.length > 0 && (
                                      <button
                                        type="button"
                                        className="btn secondary btn-xs"
                                        onClick={() => toggleRoundExpand(record.id, rIdx)}
                                      >
                                        {isRoundExpanded ? 'Tricks ▲' : `Tricks (${round.tricks.length}) ▼`}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isRoundExpanded && round.tricks.length > 0 && (
                                  <div className="history-tricks-list">
                                    {round.tricks.map((trick) => {
                                      const winnerName = record.seats[trick.winner]?.name ?? `Seat ${trick.winner}`
                                      return (
                                        <div key={trick.trickNumber} className="history-trick-row">
                                          <span className="trick-num">T{trick.trickNumber}:</span>
                                          <div className="trick-cards">
                                            {trick.plays.map((p, pIdx) => {
                                              const pName = record.seats[p.seat]?.name ?? `Seat ${p.seat}`
                                              return (
                                                <span key={pIdx} className="trick-card-play">
                                                  <span className="play-actor">{pName}:</span>
                                                  <span className="play-card">
                                                    {p.card.rank}{suitSymbol(p.card.suit)}
                                                  </span>
                                                </span>
                                              )
                                            })}
                                          </div>
                                          <span className="trick-winner">
                                            Won by {winnerName}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
