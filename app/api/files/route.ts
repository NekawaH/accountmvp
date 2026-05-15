import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

async function authorizeWorkspace(userId: string, workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return null
  if (ws.userId === userId) return ws
  const collab = await prisma.workspaceCollaborator.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return collab ? ws : null
}

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  // Allow unauthenticated read if workspace is public
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!ws.isPublic) {
    const session = await getSession()
    if (!session || session.userId !== ws.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const withContent = req.nextUrl.searchParams.get('withContent') === 'true'
  const files = await prisma.pseudoFile.findMany({
    where: { workspaceId },
    select: { id: true, name: true, updatedAt: true, ...(withContent ? { content: true } : {}) },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(files)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId, name, content } = await req.json()
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }
  if (!/^[\w\- ]+\.(psc|txt)$/.test(name)) {
    return NextResponse.json({ error: 'Name must end in .psc or .txt' }, { status: 400 })
  }

  const ws = await authorizeWorkspace(session.userId, workspaceId)
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await prisma.pseudoFile.upsert({
    where: { workspaceId_name: { workspaceId, name } },
    create: { workspaceId, name, content: content ?? '' },
    update: { content: content ?? '' },
  })
  return NextResponse.json(file)
}
