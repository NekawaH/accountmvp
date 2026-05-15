import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ count: 0 })

  const [pendingReceived, unseenResponses] = await Promise.all([
    prisma.workspaceInvitation.count({
      where: { toUserId: session.userId, status: 'PENDING' },
    }),
    prisma.workspaceInvitation.count({
      where: { fromUserId: session.userId, status: { in: ['ACCEPTED', 'DECLINED'] }, seenByFrom: false },
    }),
  ])

  return NextResponse.json({ count: pendingReceived + unseenResponses })
}
