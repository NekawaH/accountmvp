import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// Public leaderboard. Score = sum of difficulty across distinct problems
// the user has at least one passing submission for. Tie-break: earliest
// final-solve time (the time of the user's most recent first-pass), ascending.
export async function GET() {
  // Pull all passing submissions, then aggregate in JS — keeps the SQL simple
  // and handles the "first-pass per (user, problem)" semantics cleanly.
  const passes = await prisma.submission.findMany({
    where: { passed: true },
    orderBy: { createdAt: 'asc' },
    select: {
      userId: true,
      problemId: true,
      createdAt: true,
      problem: { select: { difficulty: true } },
      user: { select: { username: true, avatarUrl: true } },
    },
  })

  // (userId, problemId) -> first passing submission
  type Agg = {
    userId: string
    username: string
    avatarUrl: string
    points: number
    solvedCount: number
    lastSolveAt: Date
    seen: Set<string>
  }
  const byUser = new Map<string, Agg>()

  for (const s of passes) {
    let u = byUser.get(s.userId)
    if (!u) {
      u = {
        userId: s.userId,
        username: s.user.username,
        avatarUrl: s.user.avatarUrl,
        points: 0,
        solvedCount: 0,
        lastSolveAt: s.createdAt,
        seen: new Set(),
      }
      byUser.set(s.userId, u)
    }
    if (u.seen.has(s.problemId)) continue
    u.seen.add(s.problemId)
    u.points += s.problem.difficulty
    u.solvedCount += 1
    if (s.createdAt > u.lastSolveAt) u.lastSolveAt = s.createdAt
  }

  const rows = Array.from(byUser.values())
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return a.lastSolveAt.getTime() - b.lastSolveAt.getTime()
    })
    .map((u, i) => ({
      rank: i + 1,
      username: u.username,
      avatarUrl: u.avatarUrl,
      points: u.points,
      solvedCount: u.solvedCount,
      lastSolveAt: u.lastSolveAt,
    }))

  return NextResponse.json(rows)
}
