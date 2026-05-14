import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invitations = await prisma.workspaceInvitation.findMany({
    where: { toUserId: session.userId, status: 'PENDING' },
    include: {
      workspace: { select: { id: true, name: true } },
      from: { select: { username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(invitations)
}
