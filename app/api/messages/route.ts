import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [received, sent] = await Promise.all([
    prisma.workspaceInvitation.findMany({
      where: { toUserId: session.userId },
      include: {
        workspace: { select: { id: true, name: true } },
        from: { select: { username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workspaceInvitation.findMany({
      where: { fromUserId: session.userId, status: { in: ['ACCEPTED', 'DECLINED'] } },
      include: {
        workspace: { select: { id: true, name: true } },
        to: { select: { username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Mark unseen responses as seen now that the sender is viewing them
  const unseenIds = sent.filter(i => !i.seenByFrom).map(i => i.id)
  if (unseenIds.length > 0) {
    await prisma.workspaceInvitation.updateMany({
      where: { id: { in: unseenIds } },
      data: { seenByFrom: true },
    })
  }

  return NextResponse.json({ received, sent })
}
