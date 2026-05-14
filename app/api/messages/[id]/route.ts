import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invitation = await prisma.workspaceInvitation.findUnique({ where: { id: params.id } })
  if (!invitation || invitation.toUserId !== session.userId || invitation.status !== 'PENDING') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { action } = await req.json()
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 })
  }

  await prisma.workspaceInvitation.update({
    where: { id: params.id },
    data: { status: action === 'accept' ? 'ACCEPTED' : 'DECLINED' },
  })

  if (action === 'accept') {
    await prisma.workspaceCollaborator.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.userId } },
      create: { workspaceId: invitation.workspaceId, userId: session.userId },
      update: {},
    })
  }

  return NextResponse.json({ ok: true })
}
