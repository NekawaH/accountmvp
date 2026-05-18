import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pivot on Workspace (not WorkspaceCollaborator) so Prisma only has to load
  // the workspace + its user + its collaborators' users — one fewer relation
  // hop than fetching collaborator rows and joining back to workspace. The
  // `some` filter compiles to a subquery on WorkspaceCollaborator that uses
  // the (userId, joinedAt) index.
  const workspaces = await prisma.workspace.findMany({
    where: { collaborators: { some: { userId: session.userId } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, createdAt: true, isPublic: true,
      user: { select: { username: true, avatarUrl: true } },
      collaborators: { select: { user: { select: { username: true, avatarUrl: true } } } },
    },
  })

  return NextResponse.json(workspaces)
}
