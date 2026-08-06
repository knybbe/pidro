import type { Card } from '../engine'
import { suitColorClass, suitSymbol } from '../engine'

interface Props {
  card: Card
  selected?: boolean
  disabled?: boolean
  small?: boolean
  faceDown?: boolean
  onClick?: () => void
}

export function CardView({
  card,
  selected,
  disabled,
  small,
  faceDown,
  onClick,
}: Props) {
  if (faceDown) {
    return (
      <div className={`card face-down ${small ? 'card-sm' : ''}`} aria-hidden />
    )
  }

  const color = suitColorClass(card.suit)
  const className = `card ${color} ${small ? 'card-sm' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={`${card.rank} of ${card.suit}`}
      >
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol(card.suit)}</span>
      </button>
    )
  }

  return (
    <div className={className} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
    </div>
  )
}
