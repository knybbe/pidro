/** Finnish Pidro — pure types */

export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank =
  | 'A'
  | 'K'
  | 'Q'
  | 'J'
  | '10'
  | '9'
  | '8'
  | '7'
  | '6'
  | '5'
  | '4'
  | '3'
  | '2'

export interface Card {
  suit: Suit
  rank: Rank
  /** Stable id e.g. "H-A" */
  id: string
}

export type Seat = 0 | 1 | 2 | 3

/** Seat labels for UI (South = human by default) */
export const SEAT_NAMES = ['South', 'West', 'North', 'East'] as const

/** Partnerships: 0-2 (S-N) vs 1-3 (W-E) */
export type Team = 0 | 1

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Phase =
  | 'lobby'
  | 'bidding'
  | 'choose_trump'
  | 'discard_refill'
  | 'playing'
  /** Trick finished; cards stay up until player continues */
  | 'trick_pause'
  | 'hand_result'
  | 'game_over'

export interface BidEntry {
  seat: Seat
  /** null = pass */
  bid: number | null
}

export interface TrickPlay {
  seat: Seat
  card: Card
}

export interface SeatConfig {
  kind: 'human' | 'bot'
  difficulty?: Difficulty
  name: string
}

export interface HandResult {
  teamPointsTaken: [number, number]
  teamScoreDelta: [number, number]
  bid: number
  bidderTeam: Team
  made: boolean
  scoresAfter: [number, number]
}

export interface GameState {
  phase: Phase
  seats: [SeatConfig, SeatConfig, SeatConfig, SeatConfig]
  /** Cumulative match scores for team 0 (S-N) and team 1 (W-E) */
  scores: [number, number]
  dealer: Seat
  hands: [Card[], Card[], Card[], Card[]]
  /** Cards still in the stock (undealt / remaining after deal) */
  stock: Card[]
  /**
   * Per-seat dump piles (face-up in UI): non-trumps discarded after trump is
   * named, plus tricks collected after Continue (added to the winner).
   */
  dumpPiles: [Card[], Card[], Card[], Card[]]
  bids: BidEntry[]
  highBid: number | null
  bidder: Seat | null
  trump: Suit | null
  /** Who holds trump 2 at start of play (scores "low") — set after discard */
  lowHolder: Seat | null
  currentTrick: TrickPlay[]
  trickLeader: Seat | null
  /** Completed tricks this hand */
  completedTricks: TrickPlay[][]
  /** Point cards won by each team this hand (excluding low until scored) */
  pointsTaken: [number, number]
  /** Seats still active (have trumps) */
  activeSeats: Seat[]
  currentSeat: Seat | null
  handResult: HandResult | null
  targetScore: number
  /** RNG seed for reproducibility */
  seed: number
  message: string
}
