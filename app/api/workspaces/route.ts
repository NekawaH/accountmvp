import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true },
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

  const workspace = await prisma.workspace.create({
    data: { userId: session.userId, name: name.trim() },
  })
  // Seed with main.psc
  await prisma.pseudoFile.create({
    data: { workspaceId: workspace.id, name: 'main.psc', content: '' },
  })
  return NextResponse.json(workspace, { status: 201 })
}
