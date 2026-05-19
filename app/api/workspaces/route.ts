import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { recordVersion } from '@/lib/fileVersions'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, createdAt: true, isPublic: true,
      collaborators: { select: { user: { select: { username: true, avatarUrl: true } } } },
    },
  })
  return NextResponse.json(workspaces)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const workspace = await prisma.$transaction(async tx => {
    const ws = await tx.workspace.create({
      data: { userId: session.userId, name: name.trim() },
    })
    // Seed with main.psc + initial version
    const seeded = await tx.pseudoFile.create({
      data: { workspaceId: ws.id, name: 'main.psc', content: '' },
    })
    await recordVersion(seeded.id, '', session.userId, null, tx)
    return ws
  })
  return NextResponse.json(workspace, { status: 201 })
}
