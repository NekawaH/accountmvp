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
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ws.userId === session.userId
  const isSelf = params.userId === session.userId
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.workspaceCollaborator.delete({
    where: { workspaceId_userId: { workspaceId: params.id, userId: params.userId } },
  })

  if (isSelf && !isOwner) {
    // Collaborator left voluntarily — notify the owner.
    await prisma.workspaceInvitation.create({
      data: {
        workspaceId: params.id,
        fromUserId: session.userId,
        toUserId: ws.userId,
        status: 'LEFT',
        seenByFrom: true,
      },
    })
  } else {
    // Owner removed the collaborator — notify the removed user.
    await prisma.workspaceInvitation.create({
      data: {
        workspaceId: params.id,
        fromUserId: session.userId,
        toUserId: params.userId,
        status: 'REMOVED',
        seenByFrom: true,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
