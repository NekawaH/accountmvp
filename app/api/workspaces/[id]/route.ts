import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

async function getOwnedWorkspace(userId: string, workspaceId: string) {
  return prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  // Allow public workspace to be fetched without auth
  const ws = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { username: true, avatarUrl: true } },
      collaborators: { select: { userId: true, user: { select: { username: true, avatarUrl: true } } } },
    },
  })
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ws.isPublic) {
    if (!session || session.userId !== ws.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }
  return NextResponse.json(ws)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ws = await getOwnedWorkspace(session.userId, params.id)
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { isPublic } = await req.json()
  const updated = await prisma.workspace.update({
    where: { id: params.id },
    data: { isPublic: Boolean(isPublic) },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ws = await getOwnedWorkspace(session.userId, params.id)
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.workspace.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
