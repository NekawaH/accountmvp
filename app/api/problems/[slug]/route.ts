import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// Returns problem details. Test inputs (stdin) are exposed so the client can
// run them locally for preview, but expected outputs are NOT — those stay
// server-side so users must actually pass to be credited.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const problem = await prisma.problem.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, slug: true, title: true, statement: true, difficulty: true,
      testCases: true, createdAt: true,
    },
  })
  if (!problem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cases = (problem.testCases as any[]).map((tc, i) => ({
    index: i,
    stdin: tc.stdin ?? '',
    // expectedStdout intentionally omitted
  }))

  return NextResponse.json({
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    difficulty: problem.difficulty,
    testCases: cases,
  })
}
