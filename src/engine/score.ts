import type { HandResult, Seat, Team } from './types'
import { teamOf } from './types'
import { DEFAULT_TARGET } from './rules'

/**
 * Score a completed hand.
 * - Opponents always add points taken.
 * - Bidding team adds points taken if ≥ bid, else subtracts the bid.
 */
export function scoreHand(args: {
  bid: number
  bidder: Seat
  pointsTaken: [number, number]
  scoresBefore: [number, number]
}): HandResult {
  const bidderTeam = teamOf(args.bidder)
  const oppTeam = (1 - bidderTeam) as Team
  const bidPoints = args.pointsTaken[bidderTeam]
  const made = bidPoints >= args.bid

  const delta: [number, number] = [0, 0]
  delta[oppTeam] = args.pointsTaken[oppTeam]
  delta[bidderTeam] = made ? bidPoints : -args.bid

  const scoresAfter: [number, number] = [
    args.scoresBefore[0] + delta[0],
    args.scoresBefore[1] + delta[1],
  ]

  return {
    teamPointsTaken: [...args.pointsTaken] as [number, number],
    teamScoreDelta: delta,
    bid: args.bid,
    bidderTeam,
    made,
    scoresAfter,
  }
}

/**
 * Match over when a team has reached target.
 * If both reach on the same hand, bidding team wins.
 */
export function matchWinner(
  scores: [number, number],
  bidderTeam: Team,
  target: number = DEFAULT_TARGET,
): Team | null {
  const t0 = scores[0] >= target
  const t1 = scores[1] >= target
  if (!t0 && !t1) return null
  if (t0 && t1) return bidderTeam
  if (t0) return 0
  return 1
}
