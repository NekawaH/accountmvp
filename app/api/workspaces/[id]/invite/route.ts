import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: params.id } })
  if (!ws || ws.userId !== session.userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ws.isPublic) return NextResponse.json({ error: 'Workspace must be public to invite collaborators' }, { status: 400 })

  const { username } = await req.json()
  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 })

  const target = await prisma.user.findUnique({ where: { username } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.id === session.userId) return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })

  const alreadyCollab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId: params.id, userId: target.id } },
  })
  if (alreadyCollab) return NextResponse.json({ error: 'User is already a collaborator' }, { status: 409 })

  const invitation = await prisma.workspaceInvitation.upsert({
    where: { workspaceId_toUserId: { workspaceId: params.id, toUserId: target.id } },
    create: { workspaceId: params.id, fromUserId: session.userId, toUserId: target.id },
    update: { status: 'PENDING', fromUserId: session.userId },
  })

  return NextResponse.json(invitation, { status: 201 })
}
