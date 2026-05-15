import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: params.id } })
  if (!ws || ws.userId !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.workspaceCollaborator.delete({
    where: { workspaceId_userId: { workspaceId: params.id, userId: params.userId } },
  })

  await prisma.workspaceInvitation.create({
    data: {
      workspaceId: params.id,
      fromUserId: session.userId,
      toUserId: params.userId,
      status: 'REMOVED',
      seenByFrom: true,
    },
  })

  return NextResponse.json({ ok: true })
}
