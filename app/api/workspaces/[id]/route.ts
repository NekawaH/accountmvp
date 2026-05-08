import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

async function getWorkspace(userId: string, workspaceId: string) {
  return prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ws = await getWorkspace(session.userId, params.id)
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(ws)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ws = await getWorkspace(session.userId, params.id)
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.workspace.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
