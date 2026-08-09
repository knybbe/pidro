interface Props {
  open: boolean
  onClose: () => void
}

export function RulesModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="rules-title">How to play Pidro</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p>
            <strong>Pidro</strong> is a 4-player partnership game (you + North vs
            West + East). First team to <strong>62</strong> points wins.
          </p>
          <h3>Points (14 per hand)</h3>
          <ul>
            <li>Ace, Jack, Ten, Two of trump — 1 each</li>
            <li>Right 5 (trump 5) — 5</li>
            <li>Left 5 (same-color 5) — 5 · also a trump</li>
          </ul>
          <h3>Bidding</h3>
          <p>
            One round, 6–14. Highest bid names trump. If everyone else passes,
            the dealer must bid 6.
          </p>
          <h3>Discard</h3>
          <p>
            Keep trumps only; hands are filled to 6 cards. The dealer takes the
            rest of the pack and discards down to 6.
          </p>
          <h3>Modes</h3>
          <p>
            <strong>Classic</strong> — 9 cards, bid, name trump, discard
            non-trumps, refill from stock to 6 (dealer robs the rest).
          </p>
          <p>
            <strong>Kokkola</strong> — same 9-card deal and bidding; four more
            cards are dealt after bidding but stay face-down until trump is
            named. Then dump non-trumps (no stock refill).
          </p>
          <h3>Play</h3>
          <p>
            <strong>Only trumps are played.</strong> Highest trump wins the
            trick. When you run out of trumps you sit out; leftover cards turn
            face-up when play would next reach you. The last player with trumps
            still plays them out. Yellow dots on your hand mark cards taken in
            the Classic refill after trump is named. The Two’s point goes to
            whoever held it after the discard.
          </p>
          <h3>Scoring</h3>
          <p>
            Make your bid → score the points you took. Fail → subtract the bid.
            Defenders always score the points they took. If both teams hit 62 on
            the same hand, the bidding team wins.
          </p>
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}
