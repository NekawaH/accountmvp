import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const collabs = await prisma.workspaceCollaborator.findMany({
    where: { userId: session.userId },
    select: {
      workspace: {
        select: {
          id: true, name: true, createdAt: true, isPublic: true,
          user: { select: { username: true, avatarUrl: true } },
          collaborators: { select: { user: { select: { username: true, avatarUrl: true } } } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })

  return NextResponse.json(collabs.map(c => c.workspace))
}
