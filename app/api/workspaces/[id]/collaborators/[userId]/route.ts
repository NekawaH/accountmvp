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

  // Create a removal notice for the removed user (upsert in case a prior invitation record exists)
  await prisma.workspaceInvitation.upsert({
    where: { workspaceId_toUserId: { workspaceId: params.id, toUserId: params.userId } },
    update: { status: 'REMOVED', fromUserId: session.userId, seenByFrom: true },
    create: {
      workspaceId: params.id,
      fromUserId: session.userId,
      toUserId: params.userId,
      status: 'REMOVED',
      seenByFrom: true,
    },
  })

  return NextResponse.json({ ok: true })
}
