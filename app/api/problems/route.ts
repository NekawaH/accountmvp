import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  const problems = await prisma.problem.findMany({
    orderBy: [{ difficulty: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, slug: true, title: true, difficulty: true, createdAt: true,
      _count: { select: { submissions: true } },
    },
  })

  let solvedSlugs = new Set<string>()
  if (session) {
    const solved = await prisma.submission.findMany({
      where: { userId: session.userId, passed: true },
      select: { problem: { select: { slug: true } } },
      distinct: ['problemId'],
    })
    solvedSlugs = new Set(solved.map(s => s.problem.slug))
  }

  return NextResponse.json(
    problems.map(p => ({ ...p, solved: solvedSlugs.has(p.slug) }))
  )
}
