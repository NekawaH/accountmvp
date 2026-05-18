import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { grade, TestCase } from '@/lib/grader'
import { NextRequest, NextResponse } from 'next/server'

const MAX_CODE_LEN = 50_000

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { slug?: string; code?: string } | null
  if (!body?.slug || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'slug and code required' }, { status: 400 })
  }
  if (body.code.length > MAX_CODE_LEN) {
    return NextResponse.json({ error: 'Code too long' }, { status: 413 })
  }

  const problem = await prisma.problem.findUnique({
    where: { slug: body.slug },
    select: { id: true, testCases: true, maxSteps: true },
  })
  if (!problem) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

  const testCases = problem.testCases as unknown as TestCase[]
  const result = await grade(body.code, testCases, problem.maxSteps ?? 0)

  await prisma.submission.create({
    data: {
      userId: session.userId,
      problemId: problem.id,
      code: body.code,
      passed: result.passed,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
    },
  })

  return NextResponse.json({
    passed: result.passed,
    testsPassed: result.testsPassed,
    testsTotal: result.testsTotal,
    cases: result.cases.map((c, i) => ({
      index: i,
      passed: c.passed,
      timedOut: !!c.timedOut || !!c.stepLimitExceeded,
      error: c.error ?? null,
      // Do not echo actualStdout — it would reveal the hidden stdin (the
      // interpreter echoes every INPUT value to stdout).
    })),
  })
}
