import type { Card } from '../engine'
import { suitColorClass, suitSymbol } from '../engine'

interface Props {
  card: Card
  selected?: boolean
  disabled?: boolean
  small?: boolean
  faceDown?: boolean
  /** Yellow purchase mark (stock refill) — hide once card is played/revealed */
  purchased?: boolean
  onClick?: () => void
}

export function CardView({
  card,
  selected,
  disabled,
  small,
  faceDown,
  purchased,
  onClick,
}: Props) {
  const mark = purchased ? (
    <span className="card-purchase-dot" aria-hidden title="From purchase" />
  ) : null

  if (faceDown) {
    return (
      <div
        className={`card face-down ${small ? 'card-sm' : ''} ${purchased ? 'has-purchase-dot' : ''}`}
        aria-hidden
      >
        {mark}
      </div>
    )
  }

  const color = suitColorClass(card.suit)
  const className = `card ${color} ${small ? 'card-sm' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${purchased ? 'has-purchase-dot' : ''}`
  const pip = suitSymbol(card.suit)

  // Rank top-left; large suit pip only in the center (no small corner suit)
  const face = (
    <>
      {mark}
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit-center" aria-hidden>
        {pip}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }}
        aria-label={`${card.rank} of ${card.suit}`}
      >
        {face}
      </button>
    )
  }

  return (
    <div className={className} aria-label={`${card.rank} of ${card.suit}`}>
      {face}
    </div>
  )
}
